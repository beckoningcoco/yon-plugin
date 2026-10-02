import type { HomeProduct, HomeProfileView } from '../shared/types.ts';
/**
 * One registered Home as the document stores it.
 *
 * No name: a Home is called `<产品线><版本>` (`homeLabelOf`), so storing one would be
 * a second copy of two fields that are already here — and the copy is the one that
 * can go stale when the document is edited by hand.
 */
export interface StoredHome {
    readonly id: string;
    readonly path: string;
    readonly product: HomeProduct;
    readonly version: string;
    readonly isDefault: boolean;
    /** Last probe of this path; absent until the entry has been probed once. */
    readonly profile?: HomeProfileView;
}
/** The document on disk. Every field is optional: it is hand-editable. */
export interface HomeConfig {
    readonly homes?: readonly StoredHome[];
}
/** One read of the document, with the reason it came back empty when it did. */
export interface HomeStoreRead {
    readonly path: string;
    readonly homes: readonly StoredHome[];
    /** False when the document does not exist yet — "nothing registered". */
    readonly exists: boolean;
    /** Set only when the document exists and could not be used as written. */
    readonly error?: string;
}
/** The document, as the rest of the host uses it. */
export interface HomeStore {
    readonly path: string;
    read(): Promise<HomeStoreRead>;
    write(homes: readonly StoredHome[]): Promise<void>;
}
/** Where the registrations live. */
export declare function defaultHomeStorePath(): string;
/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export declare function createHomeStore(path?: string): HomeStore;
