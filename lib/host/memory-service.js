/**
 * The project memory: the bank the model writes and the panel reads.
 *
 * The service owns the read-modify-write cycle over the store's **two** documents
 * — `index.json` and the markdown file — for the reason `iteration-service.ts:5-9`
 * gives, and one more that is specific to this shape. A record and its file have to
 * move together: adding a file without its record loses the memory from every recall,
 * and adding a record without its file makes a memory that `memory_read` cannot open.
 * Neither half is atomic on its own, so the whole cycle is queued here.
 *
 * ## The order the two writes happen in is not arbitrary
 *
 * **File first, index second.** If the process dies between them the bank is left
 * with a file no recall can see — recoverable, and `memory_sweep` reports it. The
 * other order leaves an index pointing at a file that is not there, which is worse:
 * every recall would offer a title whose body cannot be read, and the natural repair
 * (delete the record) is exactly what loses the memory. So the write that can be
 * re-derived from the other one goes last.
 *
 * ## Two rules that make the bank worth reading
 *
 * **Nothing is written into an index that cannot be read.** If `index.json` does not
 * parse, every mutation refuses and says so. Reading it as empty and writing one
 * record back would replace the operator's whole bank with a single new memory, which
 * is the worst outcome available here. `list()` still answers: it reports the error
 * rather than throwing, because a reader that cannot see the file should at least be
 * told why.
 *
 * **A model's repeat is not a second memory.** `create(..., { dedupe: true })` refuses
 * to file a memory whose `(project, title)` already exists. The model hits the same
 * pitfall twice in a session and files it twice, and a bank with twenty copies of one
 * note is a bank nobody reads. The match is exact and normalised — deliberately dumb,
 * for `iteration-service.ts:22-27`'s reason: a fuzzy one would need a threshold nobody
 * could justify, and a wrong "same thing" here silently drops a real finding. Dedupe
 * is off for the panel, which knows why it is filing two similar notes.
 */
import { MEMORY_TYPES, } from "../shared/types.js";
import { isSafeId, recordOfDoc } from "./memory-store.js";
import { asRef, locate } from "./tools.js";
/** Longest title accepted, in characters. A title is what gets injected — see the soft limit below. */
const TITLE_MAX = 120;
/**
 * What the design calls the soft limit for one body, in characters.
 *
 * Soft means soft: a body over this is **written anyway** and reported, and
 * `memory_sweep` lists it. Refusing it would be worse than the length it prevents —
 * an experience worth keeping often needs a table name, a SQL fragment and the error
 * text in one place, and a hard refusal teaches the model to split one memory into
 * three, which is the duplication the soft limit exists to avoid.
 */
export const BODY_SOFT_MAX = 200;
/** A body past this is not a memory, it is a document, and belongs in the wiki or an entry. */
const BODY_MAX = 4000;
/** Longest `source` accepted. It is a pointer to where to look, not the evidence itself. */
const SOURCE_MAX = 500;
/** One tag, and how many a memory may carry. */
const TAG_MAX = 40;
const TAGS_MAX = 12;
/** How many records a keyword search will open files for before it stops looking. */
const RECALL_SCAN_MAX = 500;
/** Why a memory operation could not be carried out. */
export class MemoryError extends Error {
    code;
    constructor(
    /** `invalid-input` answers 400, `not-found` answers 404. */
    code, message) {
        super(message);
        this.code = code;
        this.name = 'MemoryError';
    }
}
/** The key two titles are compared by when asking "is this the same memory?". */
function normalizeTitle(title) {
    return title.trim().replace(/\s+/g, ' ').toLowerCase();
}
/** One free-text member, trimmed and bounded. */
function requireText(value, field, max, required) {
    if (value === undefined || value === null) {
        if (required)
            throw new MemoryError('invalid-input', `${field} 不能为空`);
        return '';
    }
    if (typeof value !== 'string') {
        throw new MemoryError('invalid-input', `${field} 要是一段文字`);
    }
    const text = value.trim();
    if (required && text === '')
        throw new MemoryError('invalid-input', `${field} 不能为空`);
    if (text.length > max) {
        throw new MemoryError('invalid-input', `${field} 太长了（${text.length} 字，上限 ${max}）：记忆是一条一条看的。`);
    }
    return text;
}
/** One enum member, or a refusal naming what was allowed. */
function requireMember(value, allowed, field) {
    if (typeof value === 'string' && allowed.includes(value))
        return value;
    throw new MemoryError('invalid-input', `${field} 只能是 ${allowed.join(' / ')}；收到的是「${String(value)}」`);
}
/** One tag list, trimmed, bounded and de-duplicated. */
function requireTags(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value))
        throw new MemoryError('invalid-input', 'tags 要是一个字符串数组');
    const tags = [];
    for (const entry of value) {
        const tag = requireText(entry, 'tags 里的一项', TAG_MAX, true);
        // A repeat is not a second tag; keeping both would show the same tag twice in
        // every recall line without saying anything more.
        if (!tags.includes(tag))
            tags.push(tag);
    }
    if (tags.length > TAGS_MAX) {
        throw new MemoryError('invalid-input', `tags 最多 ${TAGS_MAX} 个；收到 ${tags.length} 个。`);
    }
    return tags;
}
/**
 * An id no other memory holds, shaped `mem-<date>-<time>-<random>`.
 *
 * The stamp is **local** time, unlike every other timestamp in this package: an id is
 * read by a person scanning a directory, and `mem-20261005-141230-a1b2` is meant to be
 * recognisable at a glance as "the afternoon of the 5th". The four random characters
 * are the part that makes it an id: two memories filed in the same second — which is
 * exactly what a model retrying its own call produces — would otherwise collide, and a
 * colliding id makes one of them un-readable and un-deletable.
 */
function uniqueId(records, now) {
    const pad = (value) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
        + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const taken = new Set(records.map(record => record.id));
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const random = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
        const candidate = `mem-${stamp}-${random}`;
        if (!taken.has(candidate))
            return candidate;
    }
    return `mem-${stamp}-${records.length.toString(36)}`;
}
/** The model-facing slice of a memory: the index row, with its project named. */
function summaryOf(record, projectName) {
    return {
        id: record.id,
        projectId: record.projectId,
        projectName,
        type: record.type,
        title: record.title,
        tags: record.tags,
        source: record.source,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
/** One document as the rest of the host reads it. */
function viewOf(doc, projectName) {
    return {
        id: doc.id,
        projectId: doc.projectId,
        projectName,
        type: doc.type,
        title: doc.title,
        tags: doc.tags,
        source: doc.source,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        body: doc.body,
    };
}
/**
 * Newest first, with the index's own order as the tie-break.
 *
 * Ordered by `createdAt`, not `updatedAt`: injecting the five most recently *written*
 * memories is the point, and ordering by the last change would let a correction to an
 * old memory push a fresh pitfall off the end of the list — the one that a session
 * most needs to see.
 */
function newestFirst(records) {
    return records
        .map((record, index) => ({ record, index }))
        .sort((a, b) => a.record.createdAt === b.record.createdAt
        ? a.index - b.index
        : (a.record.createdAt < b.record.createdAt ? 1 : -1))
        .map(entry => entry.record);
}
/** The first line or so of a body, for a recall line. */
function snippetOf(body) {
    const flat = body.replace(/\s+/g, ' ').trim();
    return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}
/**
 * Open the service over a store and the project registry.
 * @param store - the memory bank.
 * @param projects - the operator's projects, for resolving and naming.
 * @returns the service.
 */
export function createYonMemoryService(store, projects) {
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    /**
     * Read the index, refusing to act on a document that is unreadable.
     *
     * Mutations go through here, never through `store.readIndex()` directly: writing one
     * record on top of an index that could not be read would delete the operator's bank.
     */
    const readAll = async () => {
        const read = await store.readIndex();
        if (read.error !== undefined)
            throw new MemoryError('invalid-input', read.error);
        return read.records;
    };
    /** Project id → name, for every read that has to name one. */
    const nameLookup = () => {
        const byId = new Map();
        for (const project of projects.list({ includeArchived: true })) {
            byId.set(project.projectId, project.name);
        }
        // A memory whose project is gone still reads: it falls back to the id rather than
        // disappearing, because "this belongs to a project that no longer exists" is a
        // fact the sweep and the operator both need to see, not a reason to hide it.
        return (projectId) => byId.get(projectId) ?? projectId;
    };
    /** Resolve a project reference the way every other family does. */
    const projectOf = (ref) => locate(projects, asRef(ref));
    const service = {
        root: store.root,
        indexPath: store.indexPath,
        async list(query = {}) {
            const read = await store.readIndex();
            if (read.error !== undefined) {
                return { rows: [], path: store.indexPath, error: read.error };
            }
            const nameOf = nameLookup();
            const projectId = query.project === undefined ? undefined : projectOf(query.project).projectId;
            const needle = query.query?.trim().toLowerCase() ?? '';
            const candidates = newestFirst(read.records)
                .filter(record => (projectId === undefined || record.projectId === projectId)
                && (query.type === undefined || record.type === query.type)
                && (query.tag === undefined || record.tags.includes(query.tag)))
                .slice(0, RECALL_SCAN_MAX);
            // A listing reads the bodies. It has to: the snippet the model decides on cannot
            // come from the index, and the words a later session remembers are usually in the
            // body rather than the title. The injection path deliberately does not come
            // through here — `recent()` reads the index and nothing else — so the plugin's
            // fastest tools stay fast, and recall, which happens a few times a session, pays
            // for opening a handful of files.
            const rows = [];
            for (const record of candidates) {
                const entry = await store.readEntry(record.id);
                const doc = entry.doc;
                // A record whose file is missing or unparseable is skipped rather than served
                // from the index alone: the index is a cache, and answering from a stale one
                // would offer a memory whose text no longer exists. `memory_sweep` reports them.
                if (doc === undefined)
                    continue;
                if (needle !== '') {
                    const haystack = [doc.title, doc.tags.join(' '), doc.source, doc.body]
                        .join('\n').toLowerCase();
                    if (!haystack.includes(needle))
                        continue;
                }
                rows.push({ ...summaryOf(record, nameOf(record.projectId)), snippet: snippetOf(doc.body) });
            }
            const limit = query.limit === undefined ? rows.length : Math.max(1, Math.floor(query.limit));
            return { rows: rows.slice(0, limit), path: store.indexPath };
        },
        async recent(projectId, limit) {
            const read = await store.readIndex();
            // The injection is best-effort by design: a broken index must not turn
            // `project_read` into an error. The count it would have reported is simply absent.
            if (read.error !== undefined)
                return [];
            const nameOf = nameLookup();
            return newestFirst(read.records)
                .filter(record => record.projectId === projectId)
                .slice(0, Math.max(0, limit))
                .map(record => summaryOf(record, nameOf(record.projectId)));
        },
        async create(input, options = {}) {
            return await inLine(async () => {
                const records = await readAll();
                const project = projectOf(input.project);
                const title = requireText(input.title, 'title', TITLE_MAX, true);
                const body = requireText(input.body, 'body', BODY_MAX, true);
                const source = requireText(input.source, 'source', SOURCE_MAX, true);
                const type = input.type === undefined ? 'lesson' : requireMember(input.type, MEMORY_TYPES, 'type');
                const tags = requireTags(input.tags);
                if (options.dedupe === true) {
                    const twin = records.find(record => record.projectId === project.projectId && normalizeTitle(record.title) === normalizeTitle(title));
                    // The existing memory comes back rather than an error, so the caller can say
                    // 「这条已经记过了」 with the id in hand instead of filing a second copy.
                    if (twin !== undefined) {
                        const entry = await store.readEntry(twin.id);
                        if (entry.doc !== undefined) {
                            return { memory: viewOf(entry.doc, project.name), created: false };
                        }
                    }
                }
                const now = new Date();
                const stamp = now.toISOString();
                const doc = {
                    id: uniqueId(records, now),
                    projectId: project.projectId,
                    type,
                    title,
                    tags,
                    source,
                    createdAt: stamp,
                    updatedAt: stamp,
                    body,
                };
                // File first, index second — see the module comment for what each ordering
                // leaves behind when the second write never happens.
                await store.writeEntry(doc);
                await store.writeIndex([...records, recordOfDoc(doc)]);
                return { memory: viewOf(doc, project.name), created: true };
            });
        },
        async update(id, patch) {
            return await inLine(async () => {
                if (!isSafeId(id))
                    throw new MemoryError('not-found', `记忆库里没有这一条：${id}`);
                const records = await readAll();
                const record = records.find(candidate => candidate.id === id);
                if (record === undefined)
                    throw new MemoryError('not-found', `记忆库里没有这一条：${id}`);
                // The file is the truth, not the record: a hand edit to the markdown is
                // supposed to survive, and reading the index here would silently revert it.
                const entry = await store.readEntry(id);
                if (entry.error !== undefined)
                    throw new MemoryError('invalid-input', entry.error);
                if (entry.doc === undefined) {
                    throw new MemoryError('not-found', `记忆库里没有这一条：${id}（索引里有记录，但文件不在）`);
                }
                const current = entry.doc;
                const next = {
                    ...current,
                    title: patch.title === undefined
                        ? current.title
                        : requireText(patch.title, 'title', TITLE_MAX, true),
                    body: patch.body === undefined
                        ? current.body
                        : requireText(patch.body, 'body', BODY_MAX, true),
                    source: patch.source === undefined
                        ? current.source
                        : requireText(patch.source, 'source', SOURCE_MAX, true),
                    type: patch.type === undefined
                        ? current.type
                        : requireMember(patch.type, MEMORY_TYPES, 'type'),
                    tags: patch.tags === undefined ? current.tags : requireTags(patch.tags),
                };
                const changed = next.title !== current.title
                    || next.body !== current.body
                    || next.source !== current.source
                    || next.type !== current.type
                    || next.tags.join('\u0000') !== current.tags.join('\u0000');
                // A call that changes nothing writes nothing, and says so by moving no
                // timestamp — `requirement_update` sets the same precedent.
                if (!changed)
                    return viewOf(current, nameLookup()(current.projectId));
                const stamped = { ...next, updatedAt: new Date().toISOString() };
                await store.writeEntry(stamped);
                await store.writeIndex(records.map(candidate => candidate.id === id ? recordOfDoc(stamped) : candidate));
                return viewOf(stamped, nameLookup()(stamped.projectId));
            });
        },
        async read(id) {
            if (!isSafeId(id))
                throw new MemoryError('not-found', `记忆库里没有这一条：${id}`);
            const entry = await store.readEntry(id);
            if (entry.error !== undefined)
                throw new MemoryError('invalid-input', entry.error);
            if (entry.doc === undefined)
                throw new MemoryError('not-found', `记忆库里没有这一条：${id}`);
            return viewOf(entry.doc, nameLookup()(entry.doc.projectId));
        },
    };
    return service;
}
