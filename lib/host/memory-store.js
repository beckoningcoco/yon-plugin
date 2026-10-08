/**
 * The disk layer of the project memory: one index document, one markdown file per
 * memory, both under `~/.dsh/yon-panel/memory/`.
 *
 * Shaped after `requirement-store.ts` — same constructor-takes-a-path seam, same
 * `isSafeId` gate before an id becomes a path, same habit of reporting a broken
 * document as a field rather than throwing — with two departures that the memory
 * bank forced:
 *
 * ## 1. The index is a *derived* cache, not a directory card
 *
 * `requirement-store.ts:14-18` keeps `index.json` as a card (id, project, path,
 * createdAt) and pays for it by reading every `entry.md` on a listing. That trade is
 * right there and wrong here, because of how a memory is *read*: the recall path
 * injects titles into tool results, and `docs/yon-memory-design.md` §6 requires that
 * to touch `index.json` only — a listing that opened five files before every
 * `project_read` return would make the plugin's fastest tools slower to say one line.
 *
 * So a record here carries everything a recall needs (title, type, tags, source,
 * timestamps). The cost is duplication: the same facts exist in the file and in the
 * index, and a hand edit to one of them can leave them disagreeing.
 *
 * **Which side wins when they disagree is therefore decided in advance: the file
 * does.** `readEntry` never consults the index, `memory_read` never consults it, and
 * a record whose file is missing or unparseable is reported as broken rather than
 * served as if it were whole. The index may lag; it never becomes the truth. Rebuilding
 * it from the files is `memory_sweep`'s job (P2, `docs/yon-memory-design.md` §9).
 *
 * ## 2. A record is rejected on two fields, and only two
 *
 * id and title. An id-less record cannot be addressed, and a title-less one is a
 * memory with nothing to recall it by. Everything else falls back rather than
 * rejecting, for `iteration-store.ts:110-117`'s reason: this file is hand-editable,
 * and losing the whole record because one enum value was misspelled would lose the
 * memory along with it.
 *
 * ## Never seeded
 *
 * There is no example record and no default. A memory bank whose first entry is
 * fabricated teaches its reader to distrust the whole file.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { MEMORY_TYPES } from "../shared/types.js";
import { parseMemory, serializeMemory } from "./memory-doc.js";
/** `~/.dsh/yon-panel/memory/`, beside `iteration.json` and `requirements/`. */
export function defaultMemoryRoot() {
    return join(homedir(), '.dsh', 'yon-panel', 'memory');
}
/**
 * Whether an id may be turned into a path.
 *
 * Ids are host-generated (`mem-<date>-<time>-<random>`), so this only ever rejects
 * two things: a value the model made up, and a hand-edit gone wrong. Both come back
 * as "no such memory" rather than as a path, which is what the service does with a
 * false here. The shape is `requirement-store.ts:189-191`'s, deliberately identical:
 * one rule for "may this be a file name" is one rule to get right.
 */
export function isSafeId(id) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}
/** One member read as a string, defaulting to the empty string. */
function textOf(value) {
    return typeof value === 'string' ? value : '';
}
/** One member read as a declared member of `allowed`, or `fallback`. */
function oneOf(value, allowed, fallback) {
    return typeof value === 'string' && allowed.includes(value)
        ? value
        : fallback;
}
/** One member read as a list of non-empty strings. */
function tagsOfTag(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map(entry => textOf(entry).trim())
        .filter(entry => entry !== '');
}
/** A message out of an unknown thrown value, for the error field. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Read one index row, or reject it.
 *
 * @param value - one element of the parsed array.
 * @returns the record, or undefined when it cannot be addressed at all.
 */
function recordOf(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const entry = value;
    const id = textOf(entry.id).trim();
    const title = textOf(entry.title).trim();
    if (id === '' || !isSafeId(id) || title === '')
        return undefined;
    return {
        id,
        projectId: textOf(entry.projectId).trim(),
        type: oneOf(entry.type, MEMORY_TYPES, 'lesson'),
        title,
        tags: tagsOfTag(entry.tags),
        source: textOf(entry.source),
        createdAt: textOf(entry.createdAt),
        updatedAt: textOf(entry.updatedAt),
        // Derived from the id, never read back from the row: a hand-edited `file` would
        // otherwise be the one field that decides where a memory is read from, which is
        // how a record starts naming a file it does not own. The field stays in the
        // document so that a future layout change is a data change.
        file: `${id}.md`,
    };
}
/** The index row one document contributes. */
export function recordOfDoc(doc) {
    return {
        id: doc.id,
        projectId: doc.projectId,
        type: doc.type,
        title: doc.title,
        tags: doc.tags,
        source: doc.source,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        file: `${doc.id}.md`,
    };
}
/**
 * Open the memory bank.
 * @param root - the directory to read and write; defaults to the operator's own.
 * @returns the store, bound to that one root.
 */
export function createMemoryStore(root = defaultMemoryRoot()) {
    const indexPath = join(root, 'index.json');
    // One chain for the whole store, as `requirement-store.ts:217-228`: reads never
    // queue, and every write goes through here so a burst of `memory_write` calls
    // cannot interleave two read-modify-write cycles. The service keeps its own chain
    // as well, because the cycle spans the store's two documents.
    let inLine = Promise.resolve();
    const queue = (work) => {
        const next = inLine.then(work, work);
        inLine = next.then(() => undefined, () => undefined);
        return next;
    };
    const entryPath = (id) => join(root, `${id}.md`);
    const writeAtomically = async (path, text) => {
        await mkdir(dirname(path), { recursive: true });
        // A sibling temporary then a rename, so a reader never sees a half-written file
        // and an interrupted write leaves nothing where the document was.
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, text, 'utf8');
        await rename(temporary, path);
    };
    return {
        root,
        indexPath,
        async readIndex() {
            let text;
            try {
                text = await readFile(indexPath, 'utf8');
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    return { path: indexPath, records: [], exists: false, skipped: 0 };
                }
                return {
                    path: indexPath,
                    records: [],
                    exists: true,
                    skipped: 0,
                    error: `无法读取记忆索引 ${indexPath}：${messageOf(error)}`,
                };
            }
            let parsed;
            try {
                parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
            }
            catch {
                return {
                    path: indexPath,
                    records: [],
                    exists: true,
                    skipped: 0,
                    error: `无法解析 ${indexPath}：它不是合法的 JSON。修好它或删掉它再试——在这一刻写下去会把里面还认得出来的记录覆盖掉。`,
                };
            }
            if (!Array.isArray(parsed)) {
                return {
                    path: indexPath,
                    records: [],
                    exists: true,
                    skipped: 0,
                    error: `无法使用 ${indexPath}：它应该是一个数组。`,
                };
            }
            const records = [];
            const seen = new Set();
            let skipped = 0;
            for (const row of parsed) {
                const record = recordOf(row);
                // A repeated id is a hand-edit mistake; keeping the later one would show the
                // same memory twice in every recall.
                if (record === undefined || seen.has(record.id)) {
                    skipped += 1;
                    continue;
                }
                seen.add(record.id);
                records.push(record);
            }
            return { path: indexPath, records, exists: true, skipped };
        },
        writeIndex(records) {
            // Snapshotted before it is queued, for `iteration-store.ts:191-194`'s reason:
            // the caller may go on to mutate the array, and the chain would then serialise
            // a value that changed while it waited.
            const snapshot = records.map(record => ({ ...record, tags: [...record.tags] }));
            return queue(() => writeAtomically(indexPath, `${JSON.stringify(snapshot, null, 2)}\n`));
        },
        entryPath,
        async readEntry(id) {
            const path = entryPath(id);
            let text;
            try {
                text = await readFile(path, 'utf8');
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    return { id, path, exists: false };
                }
                return { id, path, exists: true, error: `无法读取 ${path}：${messageOf(error)}` };
            }
            const doc = parseMemory(text);
            if (doc === undefined) {
                return {
                    id,
                    path,
                    exists: true,
                    error: `无法解析 ${path}：它不是一条记忆（frontmatter 里至少要有 id 与 title）。`,
                };
            }
            return { id, path, exists: true, doc };
        },
        writeEntry(doc) {
            return queue(() => writeAtomically(entryPath(doc.id), serializeMemory(doc)));
        },
    };
}
