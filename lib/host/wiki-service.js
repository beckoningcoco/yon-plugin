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
 */
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildWikiIndex, ensureWikiIndex, entityDirOf, wikiIndexPath, writeWikiIndex, } from "./wiki-index.js";
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
/** Read one required argument as a non-empty string. */
function asTerm(value, argument) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new WikiError('invalid-input', `${argument} 必须是非空字符串`);
    }
    return value.trim();
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
    uri: 0, table: 1, page: 2, name: 3, contains: 4,
};
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
    return {
        async list() {
            const all = await vaults();
            return Promise.all(all.map(async (vault) => {
                const ready = entityDirOf(vault.path) !== undefined;
                if (!ready)
                    return { ...vault, pages: 0, ready: false };
                const index = await indexFor(vault);
                return { ...vault, pages: index.entities.length, indexedAt: index.builtAt, ready: true };
            }));
        },
        async lookup(term, vaultId) {
            const asked = asTerm(term, 'term');
            const needle = asked.toLowerCase();
            const selected = await select(vaultId);
            const hits = [];
            let scanned = 0;
            let age = '';
            for (const vault of selected) {
                const index = await indexFor(vault);
                const graph = await graphFor(vault);
                scanned += index.entities.length;
                if (age === '' || index.builtAt > age)
                    age = index.builtAt;
                for (const page of index.entities) {
                    const matched = matchOf(page, needle);
                    if (matched !== undefined)
                        hits.push(toHit(vault, page, matched, graph));
                }
            }
            hits.sort((a, b) => {
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
            return { term: asked, hits, indexAge: age, scanned };
        },
        async read(page, vaultId) {
            const wanted = asTerm(page, 'page').replace(/\.md$/, '');
            const selected = await select(vaultId);
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
                    ...(found.version === undefined ? {} : { version: found.version }),
                    ...(found.status === undefined ? {} : { status: found.status }),
                    ...(found.verified === undefined ? {} : { verified: found.verified }),
                    assessment: assessPage(found, graph),
                    relations: toRelationView(relationsOf(found.page, graph), RELATION_SAMPLE),
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
            throw new WikiError('not-found', `没有名为「${wanted}」的页面。先用 wiki_lookup 按表名或中文名找到确切的页面名。`);
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
                    const m = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(line.trim());
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
            // `log.md` is append-only, so the newest lines are at the end. Reversing gives
            // newest-first without parsing timestamps the format does not carry — a line
            // knows its day, not its minute.
            return entries.reverse().slice(0, wanted);
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
            throw new WikiError('not-found', `没有名为「${wanted}」的页面。先用搜索按表名或中文名找到确切的页面名。`);
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
                indexes.delete(vault.path);
                graphs.delete(vault.path);
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
