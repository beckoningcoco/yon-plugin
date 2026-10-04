/**
 * The registered Homes: what the panel edits and the tools read.
 *
 * The service owns the read-modify-write cycle over the store, because every
 * mutation here is one: set a default and the previous default has to be cleared,
 * remove the default and something else has to become it, save and the version has
 * to be checked against the others. The store serialises its own writes, but two
 * mutations that each read first would still both act on the state before either
 * wrote, so the whole cycle is queued here as well.
 *
 * It also owns the one rule that spans two files: **a version names one Home per
 * product line.** The skills-side mirror keys entries by version, so two Homes
 * claiming `2111` would take turns overwriting each other's `path`. Refusing the
 * second registration says so at the moment the operator can still fix it.
 *
 * That rule is also why a name is not an input: `(product, version)` already
 * identifies a row, so `homeLabelOf` spells it out for people and nothing asks the
 * operator to invent a second identity for the same thing.
 *
 * Paths in and out are the operator's; ids are the model's. `ncc_home_find` and
 * `ncc_home_read` take an id and never a path, so a prompt-injected instruction
 * cannot aim them at a directory nobody registered.
 */
import { listClassIndexes } from "./class-index.js";
import { listMetaIndexes } from "./meta-index.js";
import { clampFindLimit, findIn, HomeError, readIn } from "./home-files.js";
import { mirrorHomes, resolveMirrorPath } from "./home-mirror.js";
import { isDir, probeHome } from "./home-probe.js";
import { homeLabelOf, } from "../shared/types.js";
/** A short, readable id built from what the entry is. */
function slugOf(text) {
    return text
        .trim()
        .replace(/[\\/]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9_\u4e00-\u9fa5-]/g, '')
        .slice(0, 40);
}
/**
 * An id no other Home holds.
 *
 * `<产品线>-<版本>`, which is exactly the identity the clash rule below enforces —
 * so the id the model passes to `ncc_home_find` reads as the thing it names
 * (`ncc-2111`, `bip-v5`). Derived rather than counted; a collision is broken by a
 * number rather than by a timestamp, so the second one stays typeable.
 *
 * Lowercased, so the id has one spelling regardless of how the version is written:
 * BIP's versions are upper-case in the table (`V5`) and NCC's are digits, and an id
 * is a value somebody retypes — `bip-v5` and `bip-V5` being two different ids for
 * one registration is a trap with no upside. The version itself is untouched.
 */
function uniqueId(homes, product, version) {
    const base = [product, slugOf(version)].filter(part => part !== '').join('-').toLowerCase() || 'home';
    const taken = new Set(homes.map(home => home.id));
    if (!taken.has(base))
        return base;
    for (let suffix = 2; suffix < 1000; suffix += 1) {
        if (!taken.has(`${base}-${suffix}`))
            return `${base}-${suffix}`;
    }
    return `${base}-${Date.now()}`;
}
/**
 * A registration's path as it is stored: forward slashes, no trailing separator.
 *
 * Both separators are accepted because people paste from Explorer; the stored form
 * is one spelling so the document reads the same on either platform.
 */
function normalisePath(input) {
    return input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}
/**
 * One stored Home as the panel and the model read it.
 *
 * The two index lists are passed in rather than read here, because reading them is the
 * expensive part: the metadata index has to be parsed to be summarised, and doing that
 * once per row would parse the same 8.33 MB document once per row.
 *
 * @param home - the registration.
 * @param indexes - every stored class index.
 * @param metaIndexes - every stored metadata index.
 * @returns the row both halves read.
 */
async function viewOf(home, indexes, metaIndexes) {
    const index = indexes.find(entry => entry.version === home.version);
    const meta = metaIndexes.find(entry => entry.version === home.version);
    // A stored profile describes the last probe, not the directory as it is now, so
    // the cheap check decides whether the row is live and the profile decides
    // whether it ever looked like a Home.
    const ready = await isDir(home.path) && home.profile?.shape !== 'not-found';
    return {
        id: home.id,
        // Computed here rather than stored, so every reader — the panel, the tools, the
        // model — sees the same name, and a hand-edited `version` cannot leave the
        // surface showing a name that describes a version the row no longer has.
        label: homeLabelOf(home.product, home.version),
        path: home.path,
        product: home.product,
        version: home.version,
        isDefault: home.isDefault,
        ready,
        ...home.profile === undefined ? {} : { profile: home.profile },
        ...index === undefined
            ? {}
            : { index: { builtAt: index.builtAt, totalClasses: index.totalClasses, bytes: index.bytes } },
        ...meta === undefined
            ? {}
            : { meta: { builtAt: meta.builtAt, counts: meta.counts, bytes: meta.bytes } },
    };
}
/**
 * Open the service over a store.
 * @param store - the registration document.
 * @param skillsRoot - the skills tree the mirror writes into; defaults to the
 *   operator's own. The same seam `mirrorHomes` has, and for the same reason: the
 *   operator's home directory is not a fixture a case can assert against, and a
 *   test that had to write it to exercise `save` would be editing the toolchain it
 *   is checking.
 * @returns the service and its disposer.
 */
export function createYonHomesService(store, skillsRoot) {
    let queue = Promise.resolve();
    let disposed = false;
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    /** Why the last mirror did not happen, for the panel to show. */
    let mirrorWarning;
    /** Read the registrations, refusing to act on a document that is unreadable. */
    const readAll = async () => {
        const read = await store.read();
        if (read.error !== undefined)
            throw new HomeError('invalid-input', read.error);
        return read.homes;
    };
    const requireHome = async (id) => {
        const homes = await readAll();
        const found = homes.find(home => home.id === id);
        if (found !== undefined)
            return found;
        const known = homes.map(home => home.id).join('、');
        throw new HomeError('not-found', `没有登记这个 Home：${id}。先调 ncc_home_list 拿 id。已登记：${known === '' ? '（还没有）' : known}`);
    };
    /** Write the panel's registrations for one product back to the skills tree. */
    const mirror = async (homes, products) => {
        mirrorWarning = undefined;
        for (const product of products) {
            const result = await mirrorHomes(product, homes.filter(home => home.product === product), skillsRoot);
            if (result.warning !== undefined)
                mirrorWarning = result.warning;
        }
    };
    const view = async (home) => viewOf(home, await listClassIndexes(), await listMetaIndexes());
    const service = {
        storePath: store.path,
        async list() {
            const read = await store.read();
            const indexes = await listClassIndexes();
            const metaIndexes = await listMetaIndexes();
            const homes = await Promise.all(read.homes.map(home => viewOf(home, indexes, metaIndexes)));
            const products = [...new Set(read.homes.map(home => home.product))];
            return {
                homes,
                configPath: store.path,
                complete: read.error === undefined,
                ...read.error === undefined ? {} : { error: read.error },
                // Wrapped rather than passed directly: `map` would hand the mapping
                // function's second argument — the index — to the resolver, whose second
                // argument is the skills root. Naming this service's root there keeps the
                // path the panel shows identical to the file `mirror` actually writes —
                // including the legacy-directory preference, which is why this goes through
                // `resolveMirrorPath` and not `mirrorPathOf`: an installed tree that still
                // carries the old directory name is written there, and a panel that showed
                // the new name would be pointing at a file nobody wrote.
                ...products.length === 0
                    ? {}
                    : {
                        mirrorPath: (await Promise.all(products.map(product => resolveMirrorPath(product, skillsRoot)))).join('  ·  '),
                    },
                ...mirrorWarning === undefined ? {} : { mirrorWarning },
            };
        },
        async save(input, id) {
            return await inLine(async () => {
                const homes = await readAll();
                const root = normalisePath(input.path);
                const version = input.version.trim();
                const product = input.product === 'bip' ? 'bip' : 'ncc';
                if (root === '')
                    throw new HomeError('invalid-input', '路径不能为空');
                if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(root)) {
                    throw new HomeError('invalid-input', `路径要写完整，从盘符或 / 开始（例如 E:/NCProject/NCC/jixieyuan/home）；收到的是「${input.path}」`);
                }
                if (version === '') {
                    throw new HomeError('invalid-input', '版本不能为空：技能侧的类索引是按版本存的，没有版本就没有索引可对应。');
                }
                const existing = id === undefined ? undefined : homes.find(home => home.id === id);
                if (id !== undefined && existing === undefined)
                    throw new HomeError('not-found', `没有登记这个 Home：${id}`);
                const clash = homes.find(home => home.version === version && home.product === product && home.id !== existing?.id);
                if (clash !== undefined) {
                    throw new HomeError('invalid-input', `版本 ${version} 已经由「${homeLabelOf(clash.product, clash.version)}」登记过了。同一个产品线下一个版本只能对应一个 Home，`
                        + '否则技能侧那份名单里两者会互相覆盖；请换一个版本号，或先删掉那一条。');
                }
                const isDefault = input.isDefault ?? existing?.isDefault ?? homes.length === 0;
                const profile = await probeHome(root);
                const updated = {
                    id: existing?.id ?? uniqueId(homes, product, version),
                    path: root,
                    product,
                    version,
                    isDefault,
                    profile,
                };
                // Rebuilt in place rather than appended-then-sorted: editing an entry must
                // not move it in the list, because the operator is looking at that list.
                const next = homes.map(home => home.id === updated.id ? updated : { ...home, isDefault: isDefault ? false : home.isDefault });
                if (existing === undefined)
                    next.push(updated);
                await store.write(next);
                await mirror(next, [product]);
                return await viewOf(updated, await listClassIndexes(), await listMetaIndexes());
            });
        },
        async remove(id) {
            await inLine(async () => {
                const homes = await readAll();
                const found = homes.find(home => home.id === id);
                if (found === undefined)
                    throw new HomeError('not-found', `没有登记这个 Home：${id}`);
                const next = homes.filter(home => home.id !== id);
                // A list with no default has no answer for "which version" — the class
                // search falls back to the newest index, which is exactly the guess the
                // registration exists to replace. So the first survivor takes over.
                const promoted = found.isDefault && next.length > 0
                    ? next.map((home, position) => position === 0 ? { ...home, isDefault: true } : home)
                    : next;
                await store.write(promoted);
                // Mirrored on every removal, because a removal is one of the two things
                // that changes the skills-side file: `mirrorHomes` withdraws a version the
                // panel registered, and the promotion above may have moved
                // `default_version`. The write is idempotent when neither happened.
                await mirror(promoted, [found.product]);
            });
        },
        async setDefault(id) {
            return await inLine(async () => {
                const homes = await readAll();
                const found = homes.find(home => home.id === id);
                if (found === undefined)
                    throw new HomeError('not-found', `没有登记这个 Home：${id}`);
                const next = homes.map(home => ({ ...home, isDefault: home.id === id }));
                await store.write(next);
                await mirror(next, [found.product]);
                return await viewOf({ ...found, isDefault: true }, await listClassIndexes(), await listMetaIndexes());
            });
        },
        async probe(id) {
            return await inLine(async () => {
                const homes = await readAll();
                const found = homes.find(home => home.id === id);
                if (found === undefined)
                    throw new HomeError('not-found', `没有登记这个 Home：${id}`);
                const probed = { ...found, profile: await probeHome(found.path) };
                await store.write(homes.map(home => home.id === id ? probed : home));
                return await viewOf(probed, await listClassIndexes(), await listMetaIndexes());
            });
        },
        async find(id, query) {
            const home = await requireHome(id);
            return await findIn(home.path, {
                limit: clampFindLimit(query.limit),
                ...query.name === undefined ? {} : { name: query.name },
                ...query.ext === undefined ? {} : { ext: query.ext },
                ...query.under === undefined ? {} : { under: query.under },
            });
        },
        async read(id, requested, options) {
            return await readIn((await requireHome(id)).path, requested, options);
        },
        async defaultVersion() {
            if (disposed)
                return undefined;
            const read = await store.read();
            const chosen = read.homes.find(home => home.isDefault) ?? read.homes[0];
            const version = chosen?.version ?? '';
            return version === '' ? undefined : version;
        },
    };
    return {
        service,
        dispose() {
            disposed = true;
        },
    };
}
export { HomeError };
