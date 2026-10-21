/**
 * Answering questions from the knowledge base: which vaults exist, which page
 * answers a term, and what that page says.
 *
 * The work this saves is specific. A model about to write SQL against a YonBIP
 * database has to name a physical table and its columns, and it must not invent
 * either. The knowledge base already holds that mapping for thousands of
 * entities — `物理表`, `domain/服务域`, and a field table per page — but only if
 * something can find the page from a term the model actually has. That term is
 * usually not the URI: it is a Chinese display name, a table name seen in an
 * error message, or an English class name from a stack trace. {@link
 * YonWikiService.lookup} accepts any of them and reports how it matched, so the
 * model can tell an exact hit from a guess.
 *
 * Every answer carries the page's `status` and `last_verified` date. A vault is
 * hand-edited and long-lived, so some of what it holds is verified against a
 * running system and some is only extracted from a document; a lookup that
 * returned both without saying which would be quietly misleading.
 *
 * Indexes are cached in memory per vault for the life of one service instance,
 * and rebuilt only on request — see `wiki-index.ts` for why staleness is the
 * operator's decision rather than something detected behind their back.
 *
 * ## The two calls that write
 *
 * {@link YonWikiService.saveVault} and {@link YonWikiService.removeVault} are the
 * only things here that change the registration, and what they change is this
 * panel's own document — the list of which directories count as knowledge bases.
 * They are on this interface rather than in a module of their own because the store
 * is already here and the HTTP face takes one service per surface. Neither writes a
 * page and neither deletes anything inside a vault, so registering and unregistering
 * cannot damage the operator's repository. One qualification, because the difference
 * matters: a save answers with the same view `list()` builds, so on a directory that
 * already *is* a vault the answer materialises the derived `wiki/.yon-index.json`
 * exactly the way a read does. Page writes are a different act with a different gate,
 * and they live in `wiki-write.ts`.
 */
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildWikiIndex, ensureWikiIndex, entityDirOf, isVault, unindexedDirsOf, wikiIndexPath, writeWikiIndex, } from "./wiki-index.js";
import { assessPage, buildGraph, gapsOf, relationsOf, summaryOf, } from "./wiki-graph.js";
import { createWikiUsageLog, } from "./wiki-usage.js";
/** What a knowledge base call can fail with. */
export class WikiError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'WikiError';
    }
}
/** One frontmatter value, undecorated; undefined when the key is absent. */
function frontmatterValue(text, key) {
    const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (head === null)
        return undefined;
    const line = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, 'm').exec(head[1] ?? '');
    const value = line?.[1]?.trim().replace(/^["']|["']$/g, '');
    return value === undefined || value === '' ? undefined : value;
}
/**
 * Which kind of page a vault-relative path holds, judged by its directory.
 *
 * Both spellings are live: the NCC vault was initialised with `wiki/实体` and
 * friends, while later pages follow the English `wiki/topics` / `wiki/sources`.
 * A path outside those four is read as a plain page with no kind rather than
 * refused — reading a file the operator pointed at is not a claim about what it is.
 */
function proseKindOf(rel) {
    const parts = rel.split('/');
    const dir = parts[0] === 'wiki' ? parts[1] : parts[0];
    if (dir === 'topics' || dir === '模块')
        return 'topic';
    if (dir === 'sources' || dir === '来源')
        return 'source';
    return undefined;
}
/** Read one required argument as a non-empty string. */
function asTerm(value, argument) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new WikiError('invalid-input', `${argument} 必须是非空字符串`);
    }
    return value.trim();
}
/**
 * A vault root as it is stored: forward slashes, no trailing separator.
 *
 * Both separators are accepted because people paste from Explorer and the host's
 * folder chooser returns whichever the platform uses; the stored form is one
 * spelling so the document reads the same on either platform, and so a vault
 * cannot be registered twice under two spellings of one directory.
 * @param input - the path as it arrived.
 * @returns the stored form.
 */
function normaliseRoot(input) {
    return input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}
/** A short, readable id built from the directory the vault would live in. */
function slugOf(text) {
    return text
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}
/**
 * An id no other vault holds, derived from the directory's own name.
 *
 * Nothing else about a vault is stable enough to name it by: the label is
 * whatever the operator calls it and changes, the page count changes, and the
 * path is the one fact that has to be unique anyway. A directory named entirely
 * in Chinese slugs to nothing, so there is a fallback rather than an empty id —
 * `WikiVault.id` is documented as matching `/^[a-zA-Z0-9_-]+$/` and is used as a
 * record key.
 * @param vaults - the registrations already stored.
 * @param root - the normalised root being registered.
 * @returns an unused id.
 */
function uniqueId(vaults, root) {
    const base = slugOf(root.split('/').filter(part => part !== '').pop() ?? '') || 'vault';
    const taken = new Set(vaults.map(vault => vault.id));
    if (!taken.has(base))
        return base;
    for (let suffix = 2; suffix < 1000; suffix += 1) {
        if (!taken.has(`${base}-${suffix}`))
            return `${base}-${suffix}`;
    }
    return `${base}-${Date.now()}`;
}
/**
 * How a page matches a term, or undefined when it does not.
 *
 * Exact hits are tried across every identity a page carries before any substring
 * is considered, so that a query for `voucher.order.Order` prefers the page whose
 * URI is exactly that over one merely containing it.
 *
 * @param page - the page to test.
 * @param needle - the term, already lower-cased and trimmed.
 * @returns the strongest match, or undefined.
 */
function matchOf(page, needle) {
    const uri = page.uri?.toLowerCase();
    const table = page.table?.toLowerCase();
    const name = page.name.toLowerCase();
    const id = page.page.toLowerCase();
    if (uri === needle)
        return 'uri';
    if (table === needle)
        return 'table';
    if (id === needle)
        return 'page';
    if (name === needle)
        return 'name';
    if (uri?.includes(needle) === true || table?.includes(needle) === true)
        return 'contains';
    if (name.includes(needle) || id.includes(needle))
        return 'contains';
    return undefined;
}
/** How strongly a match ranks; lower sorts first. */
const MATCH_RANK = {
    uri: 0, table: 1, page: 2, name: 3, tag: 4, heading: 5, contains: 6, summary: 7, body: 8,
};
/**
 * The strongest way a term names a topic or source page.
 *
 * A prose page has no URI and no table, so the two exact-match ranks above have no
 * counterpart here. What it does have is a name, its tags, its `##` headings (which
 * are the chapters a digested document was cut into), and its lead paragraph —
 * checked in that order, because a hit on a heading is a hit on the subject and a
 * hit on the summary can be a passing mention.
 * @param page - the prose page to test.
 * @param needle - the term, lower-cased and trimmed.
 * @returns the strongest match, or undefined.
 */
function proseMatchOf(page, needle) {
    const id = page.page.toLowerCase();
    const name = page.name.toLowerCase();
    if (id === needle)
        return 'page';
    if (name === needle)
        return 'name';
    if (page.tags?.some(tag => tag.toLowerCase() === needle) === true)
        return 'tag';
    if (page.headings?.some(heading => heading.toLowerCase().includes(needle)) === true)
        return 'heading';
    if (name.includes(needle) || id.includes(needle))
        return 'contains';
    if (page.summary?.toLowerCase().includes(needle) === true)
        return 'summary';
    // Full text last: a topic body mentions its neighbours constantly, so a body
    // hit is the weakest evidence that this is the page somebody wanted.
    if (page.body?.toLowerCase().includes(needle) === true)
        return 'body';
    return undefined;
}
/**
 * How many relation targets a page read lists per kind.
 *
 * Enough to show the shape of a page's neighbourhood, few enough that a hub does
 * not flood the answer with names. The total is reported alongside, so nothing is
 * hidden by the cap — only shortened.
 */
const RELATION_SAMPLE = 8;
/** The levels in the order the panel lists them, strongest first. */
const LEVEL_ORDER = ['query-ready', 'locatable', 'concept'];
/** Turn a page and a match into a hit. */
function toHit(vault, page, matchedBy, graph) {
    const verdict = assessPage(page, graph);
    return {
        vault: vault.id,
        vaultLabel: vault.label,
        page: page.page,
        uri: page.uri,
        name: page.name,
        ...(page.table === undefined ? {} : { table: page.table }),
        ...(page.domain === undefined ? {} : { domain: page.domain }),
        ...(page.app === undefined ? {} : { app: page.app }),
        ...(page.version === undefined ? {} : { version: page.version }),
        ...(page.status === undefined ? {} : { status: page.status }),
        ...(page.verified === undefined ? {} : { verified: page.verified }),
        level: verdict.level,
        ...(verdict.fieldCount === undefined ? {} : { fieldCount: verdict.fieldCount }),
        matchedBy,
        kind: 'entity',
    };
}
/** Turn a topic or source page and a match into a hit. */
function toProseHit(vault, page, matchedBy) {
    return {
        vault: vault.id,
        vaultLabel: vault.label,
        page: page.page,
        uri: null,
        name: page.name,
        ...(page.version === undefined ? {} : { version: page.version }),
        ...(page.status === undefined ? {} : { status: page.status }),
        // A prose page has no table, so it can never be query-ready or locatable:
        // `concept` is the level that says "read it for what it explains".
        level: 'concept',
        matchedBy,
        kind: page.kind,
        path: page.file,
    };
}
/**
 * Reduce one page's relations to what a page read can carry.
 *
 * Each kind keeps only a sample, because the interesting number is usually the
 * total: a page referenced by 2380 others is a hub, and listing 2380 names would
 * bury that fact rather than state it.
 *
 * @param relations - the full relation set.
 * @param sample - how many targets to keep per kind.
 * @returns the grouped view.
 */
function toRelationView(relations, sample) {
    const group = (source) => [...source]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([kind, targets]) => ({ kind, total: targets.length, sample: targets.slice(0, sample) }));
    return {
        outgoing: group(relations.outgoing),
        incoming: group(relations.incoming),
        unresolved: relations.unresolved,
    };
}
/**
 * Build the knowledge base service over one store.
 * @param store - where the vault list lives.
 * @param usage - where queries are logged; the default log when omitted.
 * @returns the service.
 */
export function createYonWikiService(store, usage = createWikiUsageLog()) {
    /** Indexes already read or built, keyed by vault path. */
    const indexes = new Map();
    /**
     * Reference graphs, keyed the same way.
     *
     * Kept beside the index rather than inside it: a graph is a pure function of an
     * index, so it costs nothing to drop when the index is replaced. Storing it
     * would mean two things to invalidate instead of one.
     */
    const graphs = new Map();
    /**
     * The vaults, freshly read.
     *
     * Read per call rather than cached: the list is one small file, and the
     * operator editing it in the panel should take effect on the next question
     * rather than on the next restart.
     */
    const vaults = async () => (await store.read()).vaults;
    /**
     * Serialises the read-modify-write rounds of the two registration calls.
     *
     * The store already serialises its own writes, which is a different thing: two
     * rounds interleaved would each read the list before the other wrote, and the
     * second write would drop the first one's vault — silently, since both would
     * report success. `home-service` holds the same queue for the same reason.
     */
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    /**
     * The registrations, refusing to write over a document that could not be read.
     *
     * `store.read()` answers an unreadable document with an empty list, which is the
     * right answer to "what is registered" and the wrong one to "what should I write
     * back" — the second would replace a list somebody can repair with the single
     * vault being added.
     */
    const readable = async () => {
        const read = await store.read();
        if (read.error !== undefined)
            throw new WikiError('invalid-input', read.error);
        return read.vaults;
    };
    /** Drop one path's cached index and graph. Memory only — the files stay. */
    const forget = (vaultPath) => {
        indexes.delete(vaultPath);
        graphs.delete(vaultPath);
    };
    /** One vault by id, or every vault when no id is given. */
    const select = async (vaultId) => {
        const all = await vaults();
        if (all.length === 0) {
            throw new WikiError('not-configured', '还没有登记任何知识库。请在 Yon 面板的「知识库」里添加 Obsidian vault 路径。');
        }
        if (vaultId === undefined)
            return all;
        const wanted = all.filter(vault => vault.id === vaultId);
        if (wanted.length === 0) {
            throw new WikiError('not-found', `没有 id 为「${vaultId}」的知识库。已登记：${all.map(v => v.id).join(', ')}`);
        }
        return wanted;
    };
    /** One vault's index, from the cache, disk, or a fresh build. */
    const indexFor = async (vault, refresh = false) => {
        if (!refresh) {
            const cached = indexes.get(vault.path);
            if (cached !== undefined)
                return cached;
        }
        if (entityDirOf(vault.path) === undefined) {
            throw new WikiError('not-found', `知识库「${vault.label}」的目录结构无法识别：${vault.path}`);
        }
        const index = refresh ? await buildWikiIndex(vault.path) : await ensureWikiIndex(vault.path);
        indexes.set(vault.path, index);
        graphs.delete(vault.path);
        return index;
    };
    /** One vault's reference graph, derived from whatever index is current. */
    const graphFor = async (vault) => {
        await indexFor(vault);
        const cached = graphs.get(vault.path);
        if (cached !== undefined)
            return cached;
        const built = buildGraph(await indexFor(vault));
        graphs.set(vault.path, built);
        return built;
    };
    /**
     * One vault as both halves read it: the registration plus what is behind it.
     *
     * Shared by the list and by the two registration calls, so that a vault the
     * panel has just saved is described by the same code as one it read from the
     * document — a save answering with a hand-built view would be a second
     * definition of "ready" waiting to drift from this one.
     * @param vault - the registration.
     * @returns the view.
     */
    const viewOf = async (vault) => {
        const ready = entityDirOf(vault.path) !== undefined;
        if (!ready)
            return { ...vault, pages: 0, ready: false };
        const index = await indexFor(vault);
        // Read from the index, not by re-walking the directories: one rebuild now
        // covers all three kinds, so the three numbers on the card describe the same
        // snapshot. (Before version 3 the prose directories were counted separately,
        // which is why a stale index could show a count the search could not reach.)
        let topicPages = 0;
        let sourcePages = 0;
        for (const page of index.prose) {
            if (page.kind === 'topic')
                topicPages += 1;
            else
                sourcePages += 1;
        }
        return {
            ...vault,
            pages: index.entities.length,
            topicPages,
            sourcePages,
            indexedAt: index.builtAt,
            ready: true,
        };
    };
    /**
     * Read one markdown file by its path relative to the vault root.
     *
     * The entity index cannot name a topic or source page, so a path is the only
     * handle a caller has on one. Three guards keep that from becoming arbitrary
     * disk access: the resolved path must stay inside the vault, must be a regular
     * `.md` file, and must be under the size a page body can reasonably reach.
     * @param vault - the vault to resolve against.
     * @param asked - vault-relative path, either separator.
     * @returns the page, or undefined when nothing is there.
     */
    const readPageByPath = async (vault, asked) => {
        const root = path.resolve(vault.path);
        const full = path.resolve(root, asked);
        const rel = path.relative(root, full).split(path.sep).join('/');
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel))
            return undefined;
        if (!rel.toLowerCase().endsWith('.md')) {
            throw new WikiError('invalid-input', `只能按路径读 .md 页面，收到「${asked}」。`);
        }
        const info = await stat(full).catch(() => undefined);
        if (info === undefined || !info.isFile())
            return undefined;
        if (info.size > 4 * 1024 * 1024) {
            throw new WikiError('invalid-input', `这一页有 ${Math.round(info.size / 1024)} KB，超过 4 MB 上限，请先用编辑器打开。`);
        }
        const text = await readFile(full, 'utf8').catch(() => undefined);
        if (text === undefined)
            throw new WikiError('not-found', `页面文件读不到：${full}`);
        const kind = proseKindOf(rel);
        const version = frontmatterValue(text, 'platform_version');
        const status = frontmatterValue(text, 'status');
        return {
            vault: vault.id,
            vaultLabel: vault.label,
            page: path.basename(rel, '.md'),
            uri: null,
            ...(kind === undefined ? {} : { kind }),
            path: rel,
            ...(version === undefined ? {} : { version }),
            ...(status === undefined ? {} : { status }),
            text,
        };
    };
    return {
        async list() {
            return Promise.all((await vaults()).map(viewOf));
        },
        async saveVault(input, id) {
            return await inLine(async () => {
                const stored = await readable();
                const root = normaliseRoot(input.path);
                const label = input.label.trim();
                if (root === '')
                    throw new WikiError('invalid-input', '路径不能为空');
                if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(root)) {
                    throw new WikiError('invalid-input', `路径要写完整，从盘符或 / 开始（例如 D:/yon-bip-obsidian/yon-bip-obsidian）；收到的是「${input.path}」`);
                }
                if (label === '')
                    throw new WikiError('invalid-input', '名称不能为空：列表里那一行就是它。');
                const existing = id === undefined ? undefined : stored.find(vault => vault.id === id);
                if (id !== undefined && existing === undefined) {
                    throw new WikiError('not-found', `没有登记这个知识库：${id}。已登记：${stored.map(v => v.id).join(', ')}`);
                }
                // One directory, one registration. Two rows over one vault would be two
                // indexes of the same pages, and a lookup against both would return every
                // hit twice under two different vault names.
                const clash = stored.find(vault => vault.path === root && vault.id !== existing?.id);
                if (clash !== undefined) {
                    throw new WikiError('invalid-input', `这个目录已经登记过了：「${clash.label}」（${clash.id}）。一个目录只需要登记一次。`);
                }
                const updated = { id: existing?.id ?? uniqueId(stored, root), label, path: root };
                // Rebuilt in place rather than appended-then-sorted: editing a row must not
                // move it in the list, because the operator is looking at that list.
                const next = existing === undefined
                    ? [...stored, updated]
                    : stored.map(vault => (vault.id === updated.id ? updated : vault));
                await store.write(next);
                // The caches are keyed by path, and a save can move one: an index left behind
                // under the old root would be handed straight back if that directory were ever
                // registered again, describing a vault nobody had looked at since.
                if (existing !== undefined && existing.path !== updated.path)
                    forget(existing.path);
                // Reported rather than refused: a directory the operator picked and named is a
                // real registration even when it is not yet a vault, and the row says 路径不可用
                // until it is. What matters is that the answer does not claim it is ready.
                return await viewOf(updated);
            });
        },
        async removeVault(id) {
            await inLine(async () => {
                const stored = await readable();
                const found = stored.find(vault => vault.id === id);
                if (found === undefined) {
                    throw new WikiError('not-found', `没有登记这个知识库：${id}。已登记：${stored.map(v => v.id).join(', ') || '（还没有）'}`);
                }
                await store.write(stored.filter(vault => vault.id !== id));
                // Nothing is deleted from the vault itself — not the pages, not the index
                // cache it carries. Only the cache held in memory here goes, so that
                // re-registering the same directory cannot answer from an index built
                // before it was unlisted.
                forget(found.path);
            });
        },
        async lookup(term, vaultId, kind = 'all') {
            const asked = asTerm(term, 'term');
            const needle = asked.toLowerCase();
            const selected = await select(vaultId);
            const hits = [];
            const unindexed = [];
            let scanned = 0;
            let scannedProse = 0;
            let age = '';
            for (const vault of selected) {
                const index = await indexFor(vault);
                const graph = await graphFor(vault);
                scanned += index.entities.length;
                scannedProse += index.prose.length;
                unindexed.push(...await unindexedDirsOf(vault));
                if (age === '' || index.builtAt > age)
                    age = index.builtAt;
                if (kind === 'all' || kind === 'entity') {
                    for (const page of index.entities) {
                        const matched = matchOf(page, needle);
                        if (matched !== undefined)
                            hits.push(toHit(vault, page, matched, graph));
                    }
                }
                if (kind === 'entity')
                    continue;
                for (const page of index.prose) {
                    if (kind === 'topic' && page.kind !== 'topic')
                        continue;
                    if (kind === 'source' && page.kind !== 'source')
                        continue;
                    const matched = proseMatchOf(page, needle);
                    if (matched === undefined)
                        continue;
                    // In the mixed mode a source page competes with thousands of other source
                    // pages (the BIP vault holds 7637, mostly API snapshots). Only a hit on
                    // the page itself earns a line there; the heading and summary ranks are
                    // kept for an explicit `kind=source`, where the caller asked for breadth.
                    // Topic pages are not damped: a hit on a chapter's name is a hit on the
                    // subject, which is what someone searching a digested manual wants.
                    if (kind === 'all' && page.kind === 'source'
                        && matched !== 'page' && matched !== 'name' && matched !== 'tag')
                        continue;
                    hits.push(toProseHit(vault, page, matched));
                }
            }
            // A hit on the lead or the body is a mention, not the subject. Three of them
            // is enough to catch "the term is somewhere in this page"; more buries the
            // pages that are actually about it. Only in the mixed mode — an explicit
            // `kind=topic` asks for breadth and gets every hit.
            if (kind === 'all') {
                const weak = hits
                    .filter(hit => hit.matchedBy === 'summary' || hit.matchedBy === 'body')
                    .sort((a, b) => MATCH_RANK[a.matchedBy] - MATCH_RANK[b.matchedBy]
                    || a.page.localeCompare(b.page, 'zh'));
                for (const extra of weak.slice(3))
                    hits.splice(hits.indexOf(extra), 1);
            }
            hits.sort((a, b) => {
                // Entity pages first: a caller that asked by a name expects the page that
                // can answer with a table to be the one on top.
                const byKind = (a.kind === 'entity' ? 0 : 1) - (b.kind === 'entity' ? 0 : 1);
                if (byKind !== 0)
                    return byKind;
                const byMatch = MATCH_RANK[a.matchedBy] - MATCH_RANK[b.matchedBy];
                return byMatch !== 0 ? byMatch : a.page.localeCompare(b.page, 'zh');
            });
            await usage.record({
                tool: 'wiki_lookup',
                term: asked,
                hits: hits.length,
                ...(vaultId === undefined ? {} : { vault: vaultId }),
                ...(hits[0] === undefined ? {} : { top: hits[0].page }),
            });
            return { term: asked, hits, indexAge: age, scanned, scannedProse, unindexed };
        },
        async read(page, vaultId) {
            const asked = asTerm(page, 'page');
            const wanted = asked.replace(/\.md$/, '');
            // A path is how a topic or source page is reached: those live outside the
            // entity index, and asking for one by bare name would answer "no such page"
            // while the file sits right there. Decided from the input rather than by a
            // failed lookup, so a page that happens to be in both places still reads
            // the entity one when asked by name.
            const byPath = /[\\/]/.test(asked);
            const selected = await select(vaultId);
            if (byPath) {
                for (const vault of selected) {
                    const content = await readPageByPath(vault, asked);
                    if (content === undefined)
                        continue;
                    await usage.record({
                        tool: 'wiki_read',
                        term: asked,
                        hits: 1,
                        ...(vaultId === undefined ? {} : { vault: vaultId }),
                        top: content.page,
                    });
                    return content;
                }
                throw new WikiError('not-found', `知识库里没有这个文件：「${asked}」。路径要相对知识库根目录，并带 .md，例如 wiki/topics/页名.md。`);
            }
            for (const vault of selected) {
                const index = await indexFor(vault);
                const found = index.entities.find(entry => entry.page === wanted);
                if (found === undefined)
                    continue;
                const graph = await graphFor(vault);
                const full = path.join(vault.path, found.file);
                const text = await readFile(full, 'utf8').catch(() => undefined);
                if (text === undefined) {
                    throw new WikiError('not-found', `页面文件读不到：${full}`);
                }
                await usage.record({
                    tool: 'wiki_read',
                    term: wanted,
                    hits: 1,
                    ...(vaultId === undefined ? {} : { vault: vaultId }),
                    top: found.page,
                });
                return {
                    vault: vault.id,
                    vaultLabel: vault.label,
                    page: found.page,
                    uri: found.uri,
                    kind: 'entity',
                    ...(found.version === undefined ? {} : { version: found.version }),
                    ...(found.status === undefined ? {} : { status: found.status }),
                    ...(found.verified === undefined ? {} : { verified: found.verified }),
                    assessment: assessPage(found, graph),
                    relations: toRelationView(relationsOf(found.page, graph), RELATION_SAMPLE),
                    text,
                };
            }
            // A prose page by its bare name, now that the index holds them. Checked
            // after the entity pages so a name that exists in both places still reads
            // the one that can answer with a table.
            for (const vault of selected) {
                const index = await indexFor(vault);
                const found = index.prose.find(entry => entry.page === wanted);
                if (found === undefined)
                    continue;
                const full = path.join(vault.path, found.file);
                const text = await readFile(full, 'utf8').catch(() => undefined);
                if (text === undefined) {
                    throw new WikiError('not-found', `页面文件读不到：${full}`);
                }
                await usage.record({
                    tool: 'wiki_read',
                    term: wanted,
                    hits: 1,
                    ...(vaultId === undefined ? {} : { vault: vaultId }),
                    top: found.page,
                });
                return {
                    vault: vault.id,
                    vaultLabel: vault.label,
                    page: found.page,
                    uri: null,
                    kind: found.kind,
                    path: found.file,
                    ...(found.version === undefined ? {} : { version: found.version }),
                    ...(found.status === undefined ? {} : { status: found.status }),
                    text,
                };
            }
            // A miss is the entry worth keeping. This is a caller who wanted a page and
            // the vault did not have one — evidence no static measure of the vault can
            // produce, because it is about demand rather than supply.
            await usage.record({
                tool: 'wiki_read',
                term: wanted,
                hits: 0,
                ...(vaultId === undefined ? {} : { vault: vaultId }),
            });
            // 「没有名为 X 的页面」 is the same confident wrong conclusion `lookup` guards
            // against, one step later. Both halves have been searched by now, so this is
            // a real absence — but the path still goes in the answer, because a page
            // filed under a name slightly different from the one asked for is common
            // enough that the way in is worth repeating.
            const outside = (await Promise.all(selected.map(vault => unindexedDirsOf(vault)))).flat();
            throw new WikiError('not-found', [
                `没有名为「${wanted}」的实体页或主题页。实体页按表名或中文名用 wiki_lookup 找；`
                    + `主题页也可以按库内路径读，例如 wiki/topics/${wanted}.md。`,
                ...(outside.length === 0 ? [] : [
                    '索引之外还有这些目录：'
                        + outside.map(entry => `${entry.dir} —— ${entry.pages} 页`).join('；'),
                ]),
            ].join('\n'));
        },
        async proseList(term, vaultId, kind, limit) {
            const asked = (term ?? '').trim();
            const needle = asked.toLowerCase();
            const wanted = limit === undefined ? 200 : Math.min(Math.max(Math.floor(limit), 1), 2000);
            const selected = await select(vaultId);
            const hits = [];
            for (const vault of selected) {
                const index = await indexFor(vault);
                for (const page of index.prose) {
                    if (kind !== undefined && page.kind !== kind)
                        continue;
                    if (needle !== '' && proseMatchOf(page, needle) === undefined)
                        continue;
                    hits.push({ ...page, vault: vault.id });
                }
            }
            // Topics before sources, then newest first by the `updated` the page states;
            // pages without one keep the index's name order. A source page is the index of
            // one document rather than a subject, so it reads as a preface: putting it on
            // top only because its name starts with `[` buries the topic the list exists
            // to show. The panel is a browsing list, not a ranking.
            hits.sort((a, b) => {
                const byKind = (a.kind === 'topic' ? 0 : 1) - (b.kind === 'topic' ? 0 : 1);
                if (byKind !== 0)
                    return byKind;
                const left = a.updated ?? '';
                const right = b.updated ?? '';
                return left === right ? a.page.localeCompare(b.page, 'zh') : left < right ? 1 : -1;
            });
            return { term: asked, count: hits.length, hits: hits.slice(0, wanted) };
        },
        async rebuild(vaultId) {
            const selected = await select(vaultId);
            for (const vault of selected) {
                const index = await indexFor(vault, true);
                // A rebuilt index is written back, or the next process would read the
                // very file this call was meant to replace.
                await writeWikiIndex(index);
                indexes.set(vault.path, index);
                graphs.delete(vault.path);
            }
            return this.list();
        },
        async recent(vaultId, limit) {
            const selected = await select(vaultId);
            const wanted = limit === undefined ? 20 : Math.min(Math.max(Math.floor(limit), 1), 200);
            const entries = [];
            for (const vault of selected) {
                const log = await readFile(path.join(vault.path, 'log.md'), 'utf8').catch(() => undefined);
                if (log === undefined)
                    continue;
                for (const line of log.split(/\r?\n/)) {
                    // Two shapes carry a date, and both are in live use: a hand-kept log runs
                    // `## 2026-06-17 ingest | 标题` down from its title, while `recordWrite`
                    // appends the same date-first line as a list item. Reading only the second
                    // made this answer "nothing was ever written here" over a log.md holding
                    // twenty-odd entries.
                    const m = /^(?:#{2,4}|-)\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(line.trim());
                    if (m === null)
                        continue;
                    entries.push({
                        date: m[1] ?? '',
                        text: (m[2] ?? '').trim(),
                        vault: vault.id,
                        vaultLabel: vault.label,
                    });
                }
            }
            // Newest first by the date an entry carries, not by where it sits in the file.
            // Position says nothing here — the two writers disagree about direction, one
            // prepending and one appending — so reversing the file returned the *oldest*
            // entries as "recent". The sort is stable, so entries sharing a day keep the
            // order they were read in.
            return entries
                .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
                .slice(0, wanted);
        },
        async gaps(vaultId, limit) {
            const selected = await select(vaultId);
            const wanted = limit === undefined ? 15 : Math.min(Math.max(Math.floor(limit), 1), 500);
            const reports = [];
            const folded = await usage.summary(wanted);
            for (const vault of selected) {
                const index = await indexFor(vault);
                const graph = await graphFor(vault);
                reports.push({
                    vault: vault.id,
                    vaultLabel: vault.label,
                    summary: summaryOf(index, graph),
                    gaps: gapsOf(graph, wanted),
                    misses: folded.misses,
                    asked: folded.total,
                });
            }
            return reports;
        },
        async health(vaultId, gapLimit) {
            const selected = await select(vaultId);
            const wanted = gapLimit === undefined ? 20 : Math.min(Math.max(Math.floor(gapLimit), 1), 200);
            // Folded once and shared by every vault's report: the log is not partitioned
            // by vault — one question can span them all — so folding it per vault would
            // repeat identical work and invite the copies to disagree.
            const activity = await usage.summary(wanted);
            const reports = [];
            for (const vault of selected) {
                const index = await indexFor(vault);
                const graph = await graphFor(vault);
                const tally = new Map();
                for (const page of index.entities) {
                    const level = assessPage(page, graph).level;
                    tally.set(level, (tally.get(level) ?? 0) + 1);
                }
                const levels = LEVEL_ORDER.map(level => ({ level, pages: tally.get(level) ?? 0 }));
                const tallies = summaryOf(index, graph);
                // Reported because a rebuild of this vault takes seconds, and an operator
                // waiting on it deserves to know what it is writing.
                const bytes = await stat(wikiIndexPath(vault.path)).then(info => info.size).catch(() => undefined);
                reports.push({
                    vault: vault.id,
                    vaultLabel: vault.label,
                    pages: index.entities.length,
                    topicPages: index.prose.filter(page => page.kind === 'topic').length,
                    sourcePages: index.prose.filter(page => page.kind === 'source').length,
                    unindexed: await unindexedDirsOf(vault),
                    indexedAt: index.builtAt,
                    ...(bytes === undefined ? {} : { indexBytes: bytes }),
                    graph: tallies,
                    levels,
                    gaps: gapsOf(graph, wanted),
                    usage: activity,
                });
            }
            return reports;
        },
        async card(page, vaultId) {
            const wanted = asTerm(page, 'page').replace(/\.md$/, '');
            const selected = await select(vaultId);
            for (const vault of selected) {
                const index = await indexFor(vault);
                const found = index.entities.find(entry => entry.page === wanted);
                if (found === undefined)
                    continue;
                const graph = await graphFor(vault);
                const verdict = assessPage(found, graph);
                const relations = toRelationView(relationsOf(found.page, graph), RELATION_SAMPLE);
                await usage.record({
                    tool: 'wiki_card',
                    term: wanted,
                    hits: 1,
                    ...(vaultId === undefined ? {} : { vault: vaultId }),
                    top: found.page,
                });
                return {
                    vault: vault.id,
                    vaultLabel: vault.label,
                    page: found.page,
                    uri: found.uri,
                    name: found.name,
                    ...(found.table === undefined ? {} : { table: found.table }),
                    ...(found.app === undefined ? {} : { app: found.app }),
                    ...(found.version === undefined ? {} : { version: found.version }),
                    ...(found.status === undefined ? {} : { status: found.status }),
                    level: verdict.level,
                    ...(verdict.fieldCount === undefined ? {} : { fieldCount: verdict.fieldCount }),
                    lacks: verdict.lacks,
                    refs: verdict.refs,
                    incoming: verdict.incoming,
                    outgoing: relations.outgoing,
                    incomingGroups: relations.incoming,
                    unresolved: relations.unresolved,
                };
            }
            // A topic or source page by its name. A card for one carries no table and no
            // edges, so it says what it is and where to read it instead of pretending to
            // grade a capability it does not have.
            for (const vault of selected) {
                const index = await indexFor(vault);
                const found = index.prose.find(entry => entry.page === wanted);
                if (found === undefined)
                    continue;
                await usage.record({
                    tool: 'wiki_card',
                    term: wanted,
                    hits: 1,
                    ...(vaultId === undefined ? {} : { vault: vaultId }),
                    top: found.page,
                });
                return {
                    vault: vault.id,
                    vaultLabel: vault.label,
                    page: found.page,
                    uri: null,
                    name: found.name,
                    kind: found.kind,
                    path: found.file,
                    ...(found.version === undefined ? {} : { version: found.version }),
                    ...(found.status === undefined ? {} : { status: found.status }),
                    ...(found.summary === undefined ? {} : { summary: found.summary }),
                    level: 'concept',
                    lacks: [
                        found.kind === 'topic'
                            ? '主题页：没有表名与字段，不能据此写 SQL'
                            : '来源页：是一份素材的索引，没有表名与字段',
                    ],
                    refs: 0,
                    incoming: 0,
                    outgoing: [],
                    incomingGroups: [],
                    unresolved: { total: 0, sample: [] },
                };
            }
            throw new WikiError('not-found', `没有名为「${wanted}」的实体页或主题页。先用搜索按表名、中文名或页面名找到确切的页面名。`);
        },
        async citers(uri, vaultId) {
            const wanted = asTerm(uri, 'uri');
            const selected = await select(vaultId);
            const pages = [];
            for (const vault of selected) {
                const index = await indexFor(vault);
                for (const page of index.entities) {
                    if ((page.refs ?? []).some(ref => ref.uri === wanted))
                        pages.push(page.page);
                }
            }
            return pages.sort((a, b) => a.localeCompare(b, 'zh'));
        },
        async invalidate(vaultId) {
            const selected = await select(vaultId);
            for (const vault of selected) {
                // The registered half of the pair above, which also drops the file: this is
                // the one caller that means it (a page was written, so the cached index is
                // known to be behind).
                forget(vault.path);
                await rm(wikiIndexPath(vault.path), { force: true }).catch(() => undefined);
            }
        },
        dispose() {
            indexes.clear();
            graphs.clear();
        },
    };
}
/** The index path a vault would cache to, for the panel and for diagnostics. */
export function wikiIndexLocation(vault) {
    return wikiIndexPath(vault.path);
}
