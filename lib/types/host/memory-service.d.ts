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
import { type MemoryCreated, type MemoryListPayload, type MemorySummary, type MemoryType, type MemoryView, type SaveMemoryInput, type UpdateMemoryInput } from '../shared/types.ts';
import { type MemoryStore } from './memory-store.ts';
import type { YonProjectsService } from './service.ts';
/**
 * What the design calls the soft limit for one body, in characters.
 *
 * Soft means soft: a body over this is **written anyway** and reported, and
 * `memory_sweep` lists it. Refusing it would be worse than the length it prevents —
 * an experience worth keeping often needs a table name, a SQL fragment and the error
 * text in one place, and a hard refusal teaches the model to split one memory into
 * three, which is the duplication the soft limit exists to avoid.
 */
export declare const BODY_SOFT_MAX = 200;
/** Why a memory operation could not be carried out. */
export declare class MemoryError extends Error {
    /** `invalid-input` answers 400, `not-found` answers 404. */
    readonly code: 'invalid-input' | 'not-found';
    constructor(
    /** `invalid-input` answers 400, `not-found` answers 404. */
    code: 'invalid-input' | 'not-found', message: string);
}
/** What `list` may be narrowed to. */
export interface MemoryQuery {
    /** A project id, name or code. */
    readonly project?: string;
    readonly type?: MemoryType;
    readonly tag?: string;
    /** Free text, matched against title, tags, source and body. */
    readonly query?: string;
    readonly limit?: number;
}
/**
 * The slice of this service the project tools need.
 *
 * Declared here rather than imported by `tools.ts`, which would close a cycle
 * (`tools.ts` → `memory-service.ts` → `tools.ts` for `locate`). Same trade the
 * plugin makes for the prompt registry and the tool registry itself: the narrow
 * shape is what the caller actually uses, and it keeps the arrow pointing one way.
 */
export interface YonMemoryHints {
    /** The newest memories of one project, for the injection `docs/yon-memory-design.md` §6 describes. */
    recent(projectId: string, limit: number): Promise<readonly MemorySummary[]>;
}
/** The bank, as the tools, the routes and the panel use it. */
export interface YonMemoryService extends YonMemoryHints {
    /** The directory the memories live in, for the panel to name. */
    readonly root: string;
    readonly indexPath: string;
    list(query?: MemoryQuery): Promise<MemoryListPayload>;
    create(input: SaveMemoryInput, options?: {
        readonly dedupe?: boolean;
    }): Promise<MemoryCreated>;
    update(id: string, patch: UpdateMemoryInput): Promise<MemoryView>;
    read(id: string): Promise<MemoryView>;
}
/**
 * Open the service over a store and the project registry.
 * @param store - the memory bank.
 * @param projects - the operator's projects, for resolving and naming.
 * @returns the service.
 */
export declare function createYonMemoryService(store: MemoryStore, projects: YonProjectsService): YonMemoryService;
