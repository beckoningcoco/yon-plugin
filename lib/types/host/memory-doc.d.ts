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
import { type MemoryType } from '../shared/types.ts';
/** One entry, as the file holds it. */
export interface MemoryDoc {
    readonly id: string;
    /** The owning project's id. Required: a memory with no project has nowhere to be recalled from. */
    readonly projectId: string;
    readonly type: MemoryType;
    readonly title: string;
    readonly tags: readonly string[];
    /**
     * Where this came from — the session, the measurement, the source file.
     *
     * Not a confidence label. It is what a later reader follows when they need to
     * decide whether the claim still holds, which is the only defence left once the
     * status labels are gone (`docs/yon-memory-design.md` §9).
     */
    readonly source: string;
    /** ISO timestamp. */
    readonly createdAt: string;
    /** ISO timestamp; moves forward on every write. */
    readonly updatedAt: string;
    readonly body: string;
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
export declare function parseMemory(text: string): MemoryDoc | undefined;
/**
 * Write one memory file.
 *
 * The inverse of {@link parseMemory} for every document that function returns:
 * `parseMemory(serializeMemory(doc))` gives back the same fields. `tags` is the one
 * place the round trip is lossy in the other direction — `tags: a, b` reads as two
 * tags and is written back as `[a, b]` — which is the intended repair.
 */
export declare function serializeMemory(doc: MemoryDoc): string;
/** The frontmatter key order, for the parser's own spec to assert against. */
export declare const MEMORY_FRONTMATTER_KEYS: readonly ["id", "project", "type", "title", "tags", "source", "created", "updated"];
/**
 * What the design calls the soft limit for one body, in characters.
 *
 * Soft means soft: a body over this is **written anyway** and reported, and `memory_sweep`
 * lists it. Refusing it would be worse than the length it prevents — an experience worth
 * keeping often needs a table name, a SQL fragment and the error text in one place, and a
 * hard refusal teaches the model to split one memory into three, which is the duplication
 * the limit exists to avoid.
 *
 * It lives here rather than in `memory-service.ts` because three places need the same
 * number — the write that reports it, the tool that mentions it, and the sweep that lists
 * it — and a constant imported by the service cannot be imported *by* something the
 * service imports.
 */
export declare const BODY_SOFT_MAX = 200;
