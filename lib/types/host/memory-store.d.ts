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
import { type MemoryType } from '../shared/types.ts';
import { type MemoryDoc } from './memory-doc.ts';
/** One row of `index.json`: everything a recall needs without opening a file. */
export interface MemoryRecord {
    readonly id: string;
    readonly projectId: string;
    readonly type: MemoryType;
    readonly title: string;
    readonly tags: readonly string[];
    readonly source: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    /** The markdown file, relative to the root. Kept here so a layout change is a data change. */
    readonly file: string;
}
/** What one read of `index.json` found. */
export interface MemoryIndexRead {
    readonly path: string;
    readonly records: readonly MemoryRecord[];
    /** False when the document does not exist yet — "nothing recorded". */
    readonly exists: boolean;
    /** Rows dropped because they were not usable. Never fatal, but never silent either. */
    readonly skipped: number;
    /**
     * Set when the file is there but cannot be used. Mutations must refuse to write
     * while this is set — see `memory-service.ts`. An empty index and an unreadable one
     * look identical otherwise, and one of them is about to be overwritten with a
     * single-record index.
     */
    readonly error?: string;
}
/** What one read of a memory file found. */
export interface MemoryEntryRead {
    readonly id: string;
    readonly path: string;
    readonly exists: boolean;
    /** Set when the file is there but does not parse. `doc` stays undefined. */
    readonly error?: string;
    readonly doc?: MemoryDoc;
}
/** The store half of the memory bank. */
export interface MemoryStore {
    readonly root: string;
    readonly indexPath: string;
    readIndex(): Promise<MemoryIndexRead>;
    writeIndex(records: readonly MemoryRecord[]): Promise<void>;
    /** Only call with an id that passed {@link isSafeId}. */
    entryPath(id: string): string;
    readEntry(id: string): Promise<MemoryEntryRead>;
    writeEntry(doc: MemoryDoc): Promise<void>;
    /**
     * Delete one memory's file. A missing file is not an error: the caller is removing
     * a record, and the record is what it checks first.
     */
    removeEntry(id: string): Promise<void>;
}
/** `~/.dsh/yon-panel/memory/`, beside `iteration.json` and `requirements/`. */
export declare function defaultMemoryRoot(): string;
/**
 * Whether an id may be turned into a path.
 *
 * Ids are host-generated (`mem-<date>-<time>-<random>`), so this only ever rejects
 * two things: a value the model made up, and a hand-edit gone wrong. Both come back
 * as "no such memory" rather than as a path, which is what the service does with a
 * false here. The shape is `requirement-store.ts:189-191`'s, deliberately identical:
 * one rule for "may this be a file name" is one rule to get right.
 */
export declare function isSafeId(id: string): boolean;
/** The index row one document contributes. */
export declare function recordOfDoc(doc: MemoryDoc): MemoryRecord;
/**
 * Open the memory bank.
 * @param root - the directory to read and write; defaults to the operator's own.
 * @returns the store, bound to that one root.
 */
export declare function createMemoryStore(root?: string): MemoryStore;
