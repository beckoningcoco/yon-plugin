import { type IterationKind, type IterationSeverity, type IterationStatus } from '../shared/types.ts';
/**
 * One row as the document stores it.
 *
 * Same fields as {@link IterationRowView} and declared separately on purpose: this
 * shape may gain a field for the store's own reasons without the contract both
 * halves share moving. `home-store.ts:44` makes the same split.
 */
export interface IterationRow {
    readonly id: string;
    readonly at: string;
    readonly kind: IterationKind;
    readonly severity: IterationSeverity;
    readonly scene: string;
    readonly symptom: string;
    readonly suggestion: string;
    readonly target: string;
    readonly context: string;
    readonly status: IterationStatus;
}
/** The document on disk. Every field is optional: it is hand-editable. */
export interface IterationConfig {
    readonly rows?: readonly IterationRow[];
}
/** One read of the document, with the reason it came back short when it did. */
export interface IterationStoreRead {
    readonly path: string;
    readonly rows: readonly IterationRow[];
    /** False when the document does not exist yet — "nothing recorded". */
    readonly exists: boolean;
    /** How many stored rows could not be read back. Dropped, not fatal. */
    readonly skipped: number;
    /** Set only when the document exists and could not be used as written. */
    readonly error?: string;
}
/** The document, as the rest of the host uses it. */
export interface IterationStore {
    readonly path: string;
    read(): Promise<IterationStoreRead>;
    write(rows: readonly IterationRow[]): Promise<void>;
}
/** Where the ledger lives. */
export declare function defaultIterationStorePath(): string;
/**
 * Open the ledger document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export declare function createIterationStore(path?: string): IterationStore;
