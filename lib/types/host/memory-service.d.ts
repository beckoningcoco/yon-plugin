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
import { type YonMemorySession } from './memory-session.ts';
import { type MemorySweepReport } from './memory-sweep.ts';
import type { YonProjectsService } from './service.ts';
/**
 * What the design calls the soft limit for one body, in characters.
 *
 * Re-exported from `memory-doc.ts`, where the rest of a memory's shape rules live; the
 * sweep needs the same number and cannot import it from here without a cycle.
 */
export { BODY_SOFT_MAX } from './memory-doc.ts';
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
    /**
     * How many memories one project holds.
     *
     * The count is what the four neighbouring tool families print at the end of an answer
     * (`datasource_query`, `ncc_meta_find`, `bip_meta_find`, `wiki_lookup`), and it is read
     * from the index alone for the same reason `recent` is: those tools are called far more
     * often than they are useful, and opening files to count them would make the plugin's
     * fastest answers slower.
     */
    count(projectId: string): Promise<number>;
    /**
     * 「本次会话现在在哪个项目上」—— see `memory-session.ts` for why this travels with the
     * service rather than as a fifth argument through every `register` call.
     */
    readonly sessions: YonMemorySession;
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
    /**
     * Delete one memory outright.
     *
     * The panel's operation, not the model's — there is no `memory_delete` tool. A
     * memory is what somebody found out about a project, and a model that can quietly
     * remove what an earlier session concluded is a model whose notes stop being
     * evidence of anything.
     */
    remove(id: string): Promise<string>;
    /**
     * 体检整个库，或者顺手把索引重建一遍。
     *
     * 它是只读的，除了 `repair`：那一项重写 `index.json`（那是派生缓存），不碰任何
     * `.md`。体检不修改任何记忆——修是 `memory_update`、面板删除与重建索引三件事。
     *
     * @param options.project - 只看这一个项目（id / 名字 / code）。索引漂移是整个库的事，
     *   它永远都报。
     */
    sweep(options?: {
        readonly repair?: boolean;
        readonly project?: string;
    }): Promise<MemorySweepReport>;
}
/**
 * Open the service over a store and the project registry.
 * @param store - the memory bank.
 * @param projects - the operator's projects, for resolving and naming.
 * @returns the service.
 */
export declare function createYonMemoryService(store: MemoryStore, projects: YonProjectsService): YonMemoryService;
