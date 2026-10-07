/**
 * The disk layer of the requirement ledger: the root, the per-entry directory, the
 * `entry.md` files, and the `index.json` that lists them.
 *
 * Shaped after `iteration-store.ts` on purpose — same constructor-takes-a-path
 * seam, same queue-then-write-atomically discipline, same habit of reporting a
 * broken document as a field rather than throwing. The differences are the ones
 * the requirement ledger forced:
 *
 * - **an entry is a directory, not a value.** `entry.md` plus the three folders the
 *   operator and the model fill in (`user/`, `generated/`, `patches/`). Creating an
 *   entry is therefore creating a tree, and the tree has to exist before the first
 *   attachment lands in it.
 * - **two documents, one of them a list.** `index.json` is the directory card: id,
 *   owning project, path, creation time — and nothing else. Names and statuses live
 *   in `entry.md`'s frontmatter, so there is exactly one place to change them. The
 *   cost is that listing reads every `entry.md`; the store pays it in `readEntry`
 *   and the service decides how often to ask.
 * - **ids become paths.** Unlike an iteration row, a requirement id is looked up by
 *   the model, so a hostile or mangled id would otherwise walk out of the root.
 *   {@link isSafeId} is the gate, and callers must pass it before {@link
 *   RequirementStore.entryPath}.
 * - **attachments are bytes, not text.** `writeArtifact` takes a string because the
 *   model only ever writes text into `generated/` and `patches/`; the operator's own
 *   files in `user/` arrive as bytes, may be 40 MB, and may not be text at all. So
 *   the byte-level operations take and return `Buffer`, and reads are capped at the
 *   head of the file rather than slurping it — a listing must never be able to pull
 *   half a gigabyte into memory just because someone dropped a video in there.
 *
 * The default root is `~/.dsh/yon-panel/requirements/`, beside `iteration.json`,
 * for the reason that file gives: this is the directory that survives reinstalling
 * the plugin, which matters a great deal more for a requirement's whole written
 * history than it does for one iteration report.
 */
import { type RequirementDir } from '../shared/types.ts';
import { type RequirementEntryDoc } from './requirement-doc.ts';
/** The three folders every entry carries. */
export declare const REQUIREMENT_SUBDIRS: readonly RequirementDir[];
/**
 * The two folders the model may write into.
 *
 * `user/` is deliberately absent. It is where the operator's own material lands,
 * and that boundary only holds if the model cannot put a file there — a directory
 * the model can write is a directory where "the operator gave us this" stops being
 * true. Importing an operator's file is the panel's job, and it is the only path
 * that was ever meant to reach `user/`.
 *
 * Derived from {@link RequirementDir} rather than spelled out again, so adding a
 * fourth folder cannot leave this gate quietly widened or narrowed.
 */
export type RequirementArtifactKind = Exclude<RequirementDir, 'user'>;
/** One row of `index.json`: the directory card and nothing more. */
export interface RequirementRecord {
    readonly id: string;
    /** The owning project's id. Changing projects edits this line; the folder stays. */
    readonly projectId: string;
    /** `entry.md`, relative to the root. Kept in the card so a future layout change is a data change. */
    readonly file: string;
    readonly createdAt: string;
}
/** What one read of `index.json` found. */
export interface RequirementIndexRead {
    readonly path: string;
    readonly records: readonly RequirementRecord[];
    readonly exists: boolean;
    /** Rows dropped because they were not usable. Never fatal, but never silent either. */
    readonly skipped: number;
    /**
     * Set when the file is there but cannot be used. Mutations must refuse to write
     * while this is set — see `requirement-service.ts`. An empty list and an
     * unreadable list look identical otherwise, and one of them is about to be
     * overwritten with a one-entry index.
     */
    readonly error?: string;
}
/** What one read of an entry found. */
export interface RequirementEntryRead {
    readonly id: string;
    readonly path: string;
    readonly exists: boolean;
    /** Set when the file is there but does not parse. `doc` stays undefined. */
    readonly error?: string;
    readonly doc?: RequirementEntryDoc;
}
/** One file inside an entry, as the filesystem reported it. */
export interface RequirementFileStat {
    readonly name: string;
    readonly bytes: number;
    /** ISO 8601, from `mtime`. */
    readonly modifiedAt: string;
}
/** The head of one file, plus the size of the whole thing it was cut from. */
export interface RequirementFileHead extends RequirementFileStat {
    readonly data: Buffer;
}
/** The store half of the requirement ledger. */
export interface RequirementStore {
    readonly root: string;
    readonly indexPath: string;
    readIndex(): Promise<RequirementIndexRead>;
    writeIndex(records: readonly RequirementRecord[]): Promise<void>;
    /** Only call with an id that passed {@link isSafeId}. */
    entryPath(id: string): string;
    dirPath(id: string): string;
    readEntry(id: string): Promise<RequirementEntryRead>;
    writeEntry(id: string, doc: RequirementEntryDoc): Promise<void>;
    /** Make the entry's own directory and its three folders. */
    createEntryDir(id: string): Promise<void>;
    /**
     * Files directly under one of the entry's three folders, sorted by name, with size
     * and mtime. A missing folder is empty, not an error — an entry created before
     * this batch has no `user/` until something is put there.
     *
     * Sub-directories are skipped rather than listed: nothing in this ledger creates
     * them, so one that appears was made by hand, and a name that cannot be read or
     * deleted through the panel should not be offered as if it could.
     */
    statFiles(id: string, dir: RequirementDir): Promise<readonly RequirementFileStat[]>;
    /** Only call with an id that passed {@link isSafeId} and a name that passed {@link isSafeArtifactName}. */
    filePath(id: string, dir: RequirementDir, name: string): string;
    /**
     * The first `maxBytes` of one file, or undefined when there is no such file.
     *
     * Reads the head rather than the whole thing on purpose: the point of a cap is to
     * not pay for the bytes past it, and `readFile` would pay for all of them. The
     * returned `bytes` is the size of the *whole* file, not of the head — the caller
     * has to be able to say "this is the first N of M" without a second stat.
     */
    readFileHead(id: string, dir: RequirementDir, name: string, maxBytes: number): Promise<RequirementFileHead | undefined>;
    /** Write raw bytes into one of the three folders, creating it. Overwrites. */
    writeFileBytes(id: string, dir: RequirementDir, name: string, bytes: Buffer): Promise<{
        readonly path: string;
        readonly bytes: number;
    }>;
    /** Delete one file. A missing file rejects, and the caller decides what that means. */
    removeFile(id: string, dir: RequirementDir, name: string): Promise<void>;
    /** Only call with an id that passed {@link isSafeId} and a name that passed {@link isSafeArtifactName}. */
    artifactPath(id: string, kind: RequirementArtifactKind, name: string): string;
    /** Write one text file into `generated/` or `patches/`, creating the folder. */
    writeArtifact(id: string, kind: RequirementArtifactKind, name: string, content: string): Promise<{
        readonly path: string;
        readonly bytes: number;
    }>;
    /** Remove an entry outright. Human-only path — the model archives instead. */
    removeEntry(id: string): Promise<void>;
}
/** `~/.dsh/yon-panel/requirements/`, beside `iteration.json`. */
export declare function defaultRequirementRoot(): string;
/**
 * Whether an id may be turned into a path.
 *
 * Ids are host-generated (`rq-<date>-<random>`), so this only ever rejects two
 * things: a value the model made up, and a hand-edit gone wrong. Both should come
 * back as "no such entry" rather than as a path, which is what the service does
 * with a false here.
 */
export declare function isSafeId(id: string): boolean;
/** Longest file name an entry accepts, in characters. */
export declare const MAX_ARTIFACT_NAME = 120;
/**
 * Whether a name may become a file inside an entry.
 *
 * Rejects separators (a name is one file, not a path), the two dot names, the
 * characters Windows forbids, and a leading or trailing dot or space — Windows
 * strips those on write, and a name that changes on the way to disk is a name that
 * cannot be read back or deleted afterwards. This is a guard on the *name*, not on
 * the caller: the tool refuses an unsafe name with a message the model can act on,
 * and this is what stops a crafted one from escaping the entry directory.
 */
export declare function isSafeArtifactName(name: string): boolean;
export declare function createRequirementStore(root?: string): RequirementStore;
