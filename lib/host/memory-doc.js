/**
 * The text layer of one memory entry: its frontmatter, its body, and nothing else.
 *
 * Pure on purpose, for `requirement-doc.ts`'s reason: both the store (which moves
 * bytes) and the service (which decides what may be written) depend on the same
 * rules, so the rules live in one place instead of being spelled twice and drifting.
 *
 * ## What the file looks like
 *
 *     ---
 *     id: mem-20261005-141230-a1b2
 *     project: d16df4e7-6c76-4bde-8f9b-bd4e2517f6a2
 *     type: pitfall
 *     title: 达梦下按时间范围查询必须走索引
 *     tags: [达梦, 性能]
 *     source: 实测于 2026-10-05 会话，datasource_query 对 68.11.100.7
 *     created: 2026-10-05T06:12:30.000Z
 *     updated: 2026-10-05T06:12:30.000Z
 *     ---
 *
 *     现象、结论、怎么绕。
 *
 * Three things about that shape are deliberate:
 *
 * - **frontmatter keys are English and the surface is ASCII.** Same call as
 *   `requirement-doc.ts:28-32`: this is read and written by code, and a half-width /
 *   full-width colon ambiguity in a parser that has to be certain is not worth the
 *   Chinese labels. `type` and `tags` are only ever compared against the values in
 *   `MEMORY_TYPES`.
 * - **no status field, and no author field.** A memory states what is true now, so a
 *   wrong one is corrected or deleted rather than labelled. Both fields were in the
 *   first draft of `docs/yon-memory-design.md` and both were removed deliberately —
 *   see that document's §3 for the argument.
 * - **`tags` is written in brackets and read leniently.** The file is hand-readable,
 *   so a person who writes `tags: 达梦, 性能` gets their two tags rather than one
 *   tag with a comma in it.
 */
import { MEMORY_TYPES } from "../shared/types.js";
/** The frontmatter keys, in the order {@link serializeMemory} writes them. */
const KEYS = ['id', 'project', 'type', 'title', 'tags', 'source', 'created', 'updated'];
/** Marks the start and the end of the frontmatter block. */
const FENCE = '---';
/** One frontmatter value, or undefined when the key is absent. */
function fieldOf(fields, key) {
    return fields.get(key) ?? '';
}
/** One of `MEMORY_TYPES`, or the fallback for a value this build does not know. */
function typeOf(raw) {
    return MEMORY_TYPES.find(known => known === raw) ?? 'lesson';
}
/**
 * Read one `tags` value.
 *
 * Brackets are stripped when present — that is what {@link serializeMemory} writes —
 * and either comma is accepted, because a hand edit produces the full-width one on a
 * Chinese keyboard without the editor noticing. Empty entries are dropped so that a
 * trailing comma does not become a tag called "".
 */
function tagsOf(raw) {
    const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
    return inner
        .split(/[,，]/)
        .map(tag => tag.trim())
        .filter(tag => tag !== '');
}
/** Collapse anything that would break a one-line frontmatter value. */
function oneLine(value) {
    return value.replace(/\s+/g, ' ').trim();
}
/**
 * Parse one memory file.
 *
 * @param text - the file's whole content.
 * @returns the document, or undefined when the file does not carry the shape above.
 *   Undefined is the honest answer for a file that was truncated or hand-edited
 *   into something else: the caller reports it as unreadable rather than inventing a
 *   title out of the wreckage.
 */
export function parseMemory(text) {
    // Stripped by code point rather than by a pattern, for `iteration-store.ts:172-174`'s
    // reason: the BOM is invisible in the source and in a diff.
    const whole = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const lines = whole.split(/\r?\n/);
    if (lines[0]?.trim() !== FENCE)
        return undefined;
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
    if (end < 0)
        return undefined;
    const fields = new Map();
    for (const line of lines.slice(1, end)) {
        const at = line.indexOf(':');
        if (at <= 0)
            continue;
        const key = line.slice(0, at).trim();
        // Only the first colon separates, so a title like `达梦：必须带时间范围` survives
        // a round trip. First writer wins: a duplicate key is a hand-edit mistake, and
        // taking the later one would make the file's own beginning a lie.
        if (!fields.has(key))
            fields.set(key, line.slice(at + 1).trim());
    }
    const id = fieldOf(fields, 'id');
    const title = fieldOf(fields, 'title');
    // The two fields a memory cannot exist without: an id-less one cannot be edited
    // or deleted, and a title-less one is a note with nothing to recall it by.
    if (id === '' || title === '')
        return undefined;
    return {
        id,
        projectId: fieldOf(fields, 'project'),
        type: typeOf(fieldOf(fields, 'type')),
        title,
        tags: tagsOf(fieldOf(fields, 'tags')),
        source: fieldOf(fields, 'source'),
        createdAt: fieldOf(fields, 'created'),
        updatedAt: fieldOf(fields, 'updated'),
        body: lines.slice(end + 1).join('\n').trim(),
    };
}
/**
 * Write one memory file.
 *
 * The inverse of {@link parseMemory} for every document that function returns:
 * `parseMemory(serializeMemory(doc))` gives back the same fields. `tags` is the one
 * place the round trip is lossy in the other direction — `tags: a, b` reads as two
 * tags and is written back as `[a, b]` — which is the intended repair.
 */
export function serializeMemory(doc) {
    const lines = [
        FENCE,
        `id: ${oneLine(doc.id)}`,
        `project: ${oneLine(doc.projectId)}`,
        `type: ${doc.type}`,
        `title: ${oneLine(doc.title)}`,
        `tags: [${doc.tags.map(oneLine).join(', ')}]`,
        `source: ${oneLine(doc.source)}`,
        `created: ${oneLine(doc.createdAt)}`,
        `updated: ${oneLine(doc.updatedAt)}`,
        FENCE,
        '',
    ];
    const body = doc.body.trim();
    if (body !== '')
        lines.push(body, '');
    // Exactly one trailing newline. A file that ends without one is a file that ends
    // mid-line, and git says so on every diff.
    return `${lines.join('\n').trimEnd()}\n`;
}
/** The frontmatter key order, for the parser's own spec to assert against. */
export const MEMORY_FRONTMATTER_KEYS = KEYS;
