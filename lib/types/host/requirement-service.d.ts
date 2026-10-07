/**
 * The requirement ledger's rules: what a create has to check first, what a change
 * has to leave behind, and what a reader gets to see.
 *
 * Four rules carry most of the design, and each one is a thing a naive version
 * gets wrong:
 *
 * 1. **Nothing is written into a document that cannot be read.** Every mutation
 *    reads `index.json` first and refuses if it did not come back cleanly. A
 *    corrupt index is otherwise indistinguishable from an empty one, so the
 *    mutation would write a one-entry index over the operator's whole ledger.
 *    (`iteration-service.ts` states the same rule for the same reason.)
 * 2. **Appending never interrupts; changing does.** `annotate` adds a note and
 *    stops there. `update` changes a fact, so the fact it replaced is struck
 *    through in a note the operator can read back, and the frontmatter is
 *    rewritten without ceremony. An update that changes nothing appends nothing —
 *    see `update` for why that is not merely an optimisation.
 * 3. **A name is not permission to overwrite.** `create` with `dedupe` returns the
 *    entry it collided with and writes nothing. Who asks the user is the caller's
 *    business: the tools turn that answer into an explicit acknowledgement, and the
 *    panel never turns dedupe on at all, because a person typing a second
 *    similar-sounding name knows what they meant.
 * 4. **The model cannot delete.** One status (`dropped`) is the model's; removing a
 *    directory is `store.removeEntry`, reachable only from the panel.
 * 5. **An attachment is not a fact about the entry.** Listing, reading, importing and
 *    deleting files never touch `entry.md`. Appending a trace line for every upload
 *    would turn the operator's own material into noise in the one place the entry's
 *    history is supposed to be readable, and the folders already carry the record:
 *    what is in `user/` is what was given, what is in `generated/` is what was made.
 *    It also means the file operations are outside the `queue` for reads and inside
 *    it for writes, exactly like every other operation here.
 *
 * The clock is injected and never read from the caller. `IterationRowView.at` sets
 * the precedent: the session's own sense of time is not a trustworthy input, and
 * notes are stamped by the host for the same reason.
 */
import { type CreateRequirementInput, type RequirementCreated, type RequirementFile, type RequirementFileImport, type RequirementFileList, type RequirementFileRead, type RequirementListPayload, type RequirementStatus, type RequirementView } from '../shared/types.ts';
import { type RequirementArtifactKind, type RequirementStore } from './requirement-store.ts';
/** How a caller's mistake comes back. Mapped to 400 / 404 by the HTTP layer. */
export type RequirementErrorCode = 'invalid-input' | 'not-found';
export declare class RequirementError extends Error {
    readonly code: RequirementErrorCode;
    constructor(code: RequirementErrorCode, message: string);
}
/** What one artifact write did: enough to report it, and to find the file afterwards. */
export interface RequirementArtifactWrite {
    readonly id: string;
    /** The entry's name, so the caller can report it without a second read. */
    readonly entry: string;
    readonly kind: RequirementArtifactKind;
    /** `<id>/<kind>/<name>`, root-relative — the same shape the index card uses for `file`. */
    readonly file: string;
    readonly path: string;
    readonly bytes: number;
}
export interface RequirementQuery {
    readonly projectId?: string;
    readonly status?: RequirementStatus;
}
export interface RequirementReadOptions {
    /**
     * Ask for the human's copy: the whole text as written (`raw`), and the same text
     * split into the entry's own paragraph (`prose`) and the notes (`notes`).
     *
     * Off by default because all three are the *reader's* view, not the worker's: they
     * carry the struck-through claims back in, and a model that asks for the current
     * text would be reading retracted statements as if they still held.
     */
    readonly history?: boolean;
}
export interface RequirementCreateOptions {
    /**
     * Refuse to create a second entry with the same name in the same project.
     *
     * Off by default, and the default is the panel's behaviour — see rule 3 in the
     * file header. The tools turn it on, because a model creating a duplicate is
     * usually the model having lost track rather than a deliberate act.
     */
    readonly dedupe?: boolean;
    /**
     * The id of the entry this create was already acknowledged to duplicate. Only
     * meaningful together with `dedupe`.
     *
     * The check still runs with this set, and it is the reason this is an id rather
     * than a flag: the create proceeds only when the entry that *actually* conflicts
     * is the one named here. A stale acknowledgement — the model answering about an
     * entry that has since been renamed, or naming one that never was the twin —
     * comes back as `created: false` with the real conflict, instead of quietly
     * ordering a second entry the operator was never shown. Asserting equality
     * rather than mere presence is the same discipline `previewWrite` applies to the
     * project it is about to change.
     */
    readonly acknowledged?: string;
}
export interface RequirementDeps {
    /** Injected so tests do not depend on the wall clock. */
    readonly now?: () => Date;
}
export interface YonRequirementsService {
    readonly root: string;
    readonly indexPath: string;
    list(query?: RequirementQuery): Promise<RequirementListPayload>;
    read(ref: string, options?: RequirementReadOptions): Promise<RequirementView>;
    create(input: CreateRequirementInput, options?: RequirementCreateOptions): Promise<RequirementCreated>;
    annotate(ref: string, text: string): Promise<RequirementView>;
    update(ref: string, patch: {
        readonly name?: string;
        readonly status?: RequirementStatus;
    }): Promise<RequirementView>;
    /** Set `dropped` and record why. The model's only way to retire an entry. */
    archive(ref: string, reason?: string): Promise<RequirementView>;
    /**
     * Delete an entry outright: its directory, its files, and its row.
     *
     * The model has no tool for this — `archive` is the model's way to retire an
     * entry — so the only caller is the panel, behind a second confirmation. It
     * returns the name it removed so the caller can say what is gone.
     */
    remove(ref: string): Promise<{
        readonly id: string;
        readonly name: string;
        readonly path: string;
    }>;
    /**
     * Write one text file into an entry's `generated/` or `patches/`.
     *
     * Resolution lives here rather than in the tool for the reason `resolve` exists
     * at all: turning a ref into an id is this service's question, and a caller that
     * answered it itself would be a second implementation of the cross-project
     * ambiguity rule — the one place where guessing writes into the wrong record.
     */
    artifactWrite(ref: string, kind: RequirementArtifactKind, name: string, content: string): Promise<RequirementArtifactWrite>;
    /**
     * Every attachment of an entry, folder by folder.
     * @param only - when given, just that one folder.
     */
    fileList(ref: string, only?: string): Promise<RequirementFileList>;
    /**
     * Read one attachment as text, or say why it cannot be read as text.
     *
     * Never throws for "it is a PDF" or "it is a binary": an answer with an empty
     * `text` and a `note` is what the panel draws and what the model reports, and a
     * refusal shaped like an error would make both of them special-case the same three
     * situations. The only errors are "no such entry" and "no such file".
     */
    fileRead(ref: string, dir: string, name: string): Promise<RequirementFileRead>;
    /**
     * Put an operator's file into one of the entry's folders.
     *
     * This is the *only* path into `user/`, and it is deliberately not reachable from
     * any model tool — see `artifactWrite`, which is the model's side of the same
     * boundary. A name that is already taken is kept by adding `-2` rather than by
     * overwriting: the folder is the operator's own material, and losing a file they
     * handed over is the one outcome nothing here may produce silently.
     */
    importFile(ref: string, dir: string, name: string, bytes: Buffer): Promise<RequirementFileImport>;
    /** Delete one attachment. Human-only, like `remove` — the model has no tool for it. */
    removeFile(ref: string, dir: string, name: string): Promise<{
        readonly id: string;
        readonly entry: string;
        readonly file: RequirementFile;
    }>;
}
export declare function createYonRequirementsService(store: RequirementStore, deps?: RequirementDeps): YonRequirementsService;
