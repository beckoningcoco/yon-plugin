/**
 * Where the operator's front-end source projects are registered.
 *
 * The shape is `home-store.ts`'s, deliberately: a JSON document under
 * `~/.dsh/yon-panel/`, a read/write pair, one promise chain for the writes, and a
 * tmp-then-rename so a crash mid-write cannot leave half a registration behind.
 * The two documents describe the same kind of thing — a machine path the operator
 * pointed at — and reading them the same way is what keeps the panel's two
 * surfaces recognisable as one family.
 *
 * ## The one deliberate difference
 *
 * A Home is identified by `(product, version)` and nothing else, because two
 * installations of one version are interchangeable for what a Home is used for.
 * A front-end project is too, for the same reason: the model asks "NCC2005 的
 * 前端源码在哪" and gets the one directory the operator chose to represent it.
 * So there is no name here either, and no customer field — the registration is
 * the path, the product line and the version.
 *
 * ## Paths
 *
 * Both separators are accepted on input and the forward-slash form is stored, so
 * the document reads the same on either platform and stays diffable. Containment
 * decisions are made with `node:path` in `home-files.ts`, never here.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** Where the registrations live. */
export function defaultFrontendStorePath() {
    return join(homedir(), '.dsh', 'yon-panel', 'frontend_config.json');
}
/**
 * Read one entry, or reject it.
 *
 * A bad entry is skipped rather than failing the whole document: the operator
 * hand-edits this file, and losing every registration because one line lost its
 * quoting is a worse outcome than losing that line. `home-store.ts` makes the
 * same call for the same reason.
 *
 * `product` is the one field not defaulted: `'ncc'` is the only line this build
 * writes, and a row claiming `'bip'` would be a registration whose probe rules
 * this code does not implement. Reading it as NCC would be silently answering a
 * question about the wrong product line, so it is dropped instead.
 */
function asFrontend(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const entry = value;
    const id = entry.id;
    const root = entry.path;
    if (typeof id !== 'string' || id === '')
        return undefined;
    if (typeof root !== 'string' || root === '')
        return undefined;
    if (entry.product !== 'ncc')
        return undefined;
    const profile = entry.profile !== null && typeof entry.profile === 'object' && !Array.isArray(entry.profile)
        ? entry.profile
        : undefined;
    return {
        id,
        path: root,
        product: 'ncc',
        version: typeof entry.version === 'string' ? entry.version : '',
        isDefault: entry.isDefault === true,
        ...profile === undefined ? {} : { profile },
    };
}
/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export function createFrontendStore(path = defaultFrontendStorePath()) {
    // Writes only. Reads do not need the chain — they mutate nothing — and the
    // service keeps its own line for the read-modify-write cycles, which is where
    // a lost update could actually happen.
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    const writeNow = async (frontends) => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, `${JSON.stringify({ frontends }, null, 2)}\n`, 'utf8');
        await rename(temporary, path);
    };
    return {
        path,
        async read() {
            // The read and the parse are separate failures: ENOENT means "nothing
            // registered yet", anything else means the document is there but unusable.
            const text = await readFile(path, 'utf8').catch(() => undefined);
            if (text === undefined)
                return { path, frontends: [], exists: false };
            try {
                // Stripped by code point rather than by a pattern: the escape sequence for
                // this character is invisible in the source, and an editor that drops it
                // would leave behind a rule matching the four letters F-E-F-F.
                const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
                const parsed = JSON.parse(body);
                const raw = Array.isArray(parsed.frontends) ? parsed.frontends : [];
                const frontends = raw.map(asFrontend).filter((row) => row !== undefined);
                return { path, frontends, exists: true };
            }
            catch {
                return {
                    path,
                    frontends: [],
                    exists: true,
                    error: `无法解析 ${path}：它不是合法的 JSON。请修正该文件，或在面板里删除后重建。`,
                };
            }
        },
        write(frontends) {
            // The array is copied before it is queued: `write()` may be called with an
            // array the caller goes on to mutate, and the chain would then serialise a
            // value that changed while it waited.
            const snapshot = [...frontends];
            return inLine(() => writeNow(snapshot));
        },
    };
}
