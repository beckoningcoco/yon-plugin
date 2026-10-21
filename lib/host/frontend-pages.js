/**
 * The page index over one registered front-end project: one walk that answers
 * "which pages does this project have", stored so the panel does not re-walk the
 * tree on every open.
 *
 * ## One walk, not two
 *
 * The probe's counts and this index must agree — a pane that says "252 个页面
 * 节点" while the tree under it lists 251 is a bug report waiting to happen. So
 * the walk lives here and `frontend-probe.ts` calls it for its numbers; there is
 * no second traversal that could drift.
 *
 * ## What counts as a page
 *
 * A four-level `index.js` under `src/` is not always a page: the same wildcard
 * also matches component folders and refer implementations (measured: 1 349
 * four-level entries against 462 `list`/`card`/`main` builds on NCC2005). The
 * kinds that count are {@link PAGE_KINDS}, shared with the probe.
 *
 * ## Storage
 *
 * One JSON document per registration id under `~/.dsh/yon-panel/frontend_index/`.
 * The document carries the root it was built from: a registration whose path was
 * edited has an index describing a directory that is no longer there, and
 * `readIndex` reports that rather than serving stale pages.
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/**
 * The fourth-level directory names that are page builds.
 *
 * Shared with the probe so the two cannot disagree about what a page is. A page
 * kind that ships later is the one thing this rule cannot see; the index says
 * which kinds it found instead of pretending the total is all of them.
 */
export const PAGE_KINDS = new Set([
    'list', 'card', 'main', 'list2', 'card2',
    'linklist', 'linkcard', 'approvecard', 'approve_card',
    'advancesearch_list', 'advsearch', 'nowvcard', 'bxcard', 'zfcard',
    'acccard', 'acclist', 'transfer', 'page',
]);
/** Directory entries one walk visits before it stops. */
const WALK_CAP = 200_000;
/** How deep the walk goes. */
const WALK_DEPTH = 16;
/** The part count of `src/{领域}/{模块}/{节点}/{页面类型}/index.js`. */
const PAGE_PARTS = 6;
/** The directories whose contents are not this project's source. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'ufjdk', 'arthas-output']);
/** Where the index documents live. */
export function frontendIndexDir() {
    return join(homedir(), '.dsh', 'yon-panel', 'frontend_index');
}
/**
 * One registration's index document.
 * @param id - the registration id (`fe-ncc-1909`).
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 * @returns the absolute path.
 */
export function frontendIndexPath(id, dir = frontendIndexDir()) {
    const safe = id.replace(/[\\/:*?"<>|]/g, '-');
    return join(dir, `${safe}.json`);
}
/**
 * Walk a project and collect its page nodes.
 *
 * @param root - the project root, as registered.
 * @returns file and size totals, the page nodes, and the per-domain breakdown.
 */
export async function scanProject(root) {
    let files = 0;
    let bytes = 0;
    let pages = 0;
    let visited = 0;
    let capped = false;
    const pageTypes = new Set();
    /** domain → pages and bytes, for the probe's breakdown. */
    const domains = new Map();
    /** `domain/module/node` → the node, whether or not an entry was found yet. */
    const nodes = new Map();
    const walk = async (dir, rel, depth) => {
        if (capped || depth > WALK_DEPTH)
            return;
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (capped)
                return;
            visited += 1;
            if (visited > WALK_CAP) {
                capped = true;
                return;
            }
            const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
            if (entry.isDirectory()) {
                // Hidden directories are not business source — `.git`, `.npm-cache`,
                // `.idea` — and skipping them keeps the count about the project.
                if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.'))
                    continue;
                await walk(join(dir, entry.name), childRel, depth + 1);
                continue;
            }
            if (!entry.isFile())
                continue;
            const size = await stat(join(dir, entry.name)).then(info => info.size).catch(() => 0);
            files += 1;
            bytes += size;
            const parts = childRel.split('/');
            if (parts[0] !== 'src' || parts.length < 2)
                continue;
            const domain = parts[1] ?? '';
            const bucket = domains.get(domain) ?? { pages: 0, bytes: 0 };
            bucket.bytes += size;
            domains.set(domain, bucket);
            if (parts.length < 5)
                continue;
            const key = parts.slice(1, 4).join('/');
            const node = nodes.get(key) ?? {
                domain,
                module: parts[2] ?? '',
                node: parts[3] ?? '',
                dir: parts.slice(0, 4).join('/'),
                entries: [],
                files: 0,
                bytes: 0,
            };
            node.files += 1;
            node.bytes += size;
            nodes.set(key, node);
            if (parts.length === PAGE_PARTS && parts[PAGE_PARTS - 1] === 'index.js') {
                const kind = parts[PAGE_PARTS - 2] ?? '';
                if (!PAGE_KINDS.has(kind))
                    continue;
                pages += 1;
                pageTypes.add(kind);
                node.entries.push({ kind, rel: childRel, bytes: size });
                bucket.pages += 1;
            }
        }
    };
    await walk(root, '', 0);
    const pageNodes = [...nodes.values()]
        .filter(node => node.entries.length > 0)
        .map(node => ({
        domain: node.domain,
        module: node.module,
        node: node.node,
        dir: node.dir,
        entries: node.entries.sort((left, right) => left.kind.localeCompare(right.kind)),
        files: node.files,
        bytes: node.bytes,
    }))
        .sort((left, right) => left.domain.localeCompare(right.domain)
        || left.module.localeCompare(right.module)
        || left.node.localeCompare(right.node));
    return {
        files,
        bytes,
        nodes: pageNodes.length,
        pages,
        pageTypes: [...pageTypes].sort(),
        domains: [...domains.entries()]
            .map(([name, bucket]) => ({ name, ...bucket }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        pageNodes,
        capped,
    };
}
/**
 * Read one registration's page index.
 * @param id - the registration id.
 * @param root - the registration's current path, to detect a moved one.
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 * @returns the index, or why there is none.
 */
export async function readPageIndex(id, root, dir) {
    const path = frontendIndexPath(id, dir);
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (text === undefined)
        return { path, stale: false };
    try {
        const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        const index = JSON.parse(body);
        if (!Array.isArray(index.nodes))
            return { path, stale: false, error: `${path} 不是页面索引。` };
        return { path, index, stale: index.root !== root };
    }
    catch {
        return { path, stale: false, error: `无法解析 ${path}：它不是合法的 JSON。` };
    }
}
/**
 * Write one registration's page index.
 * @param id - the registration id.
 * @param index - the document.
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 */
export async function writePageIndex(id, index, dir) {
    const path = frontendIndexPath(id, dir);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(index)}\n`, 'utf8');
    await rename(temporary, path);
}
/**
 * Drop one registration's page index.
 * @param id - the registration id.
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 * @returns whether a document was there.
 */
export async function removePageIndex(id, dir) {
    const path = frontendIndexPath(id, dir);
    const info = await stat(path).catch(() => undefined);
    if (info === undefined)
        return false;
    await rm(path, { force: true });
    return true;
}
