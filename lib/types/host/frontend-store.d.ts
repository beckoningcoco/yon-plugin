import type { FrontendProduct, FrontendProfileView } from '../shared/types.ts';
/**
 * One registered project as the document stores it.
 *
 * No name: a project is called `<产品线><版本>` (`frontendLabelOf`), so storing one
 * would be a second copy of two fields that are already here — and the copy is the
 * one that can go stale when the document is edited by hand.
 */
export interface StoredFrontend {
    readonly id: string;
    readonly path: string;
    readonly product: FrontendProduct;
    readonly version: string;
    readonly isDefault: boolean;
    /** Last probe of this path; absent until the entry has been probed once. */
    readonly profile?: FrontendProfileView;
}
/** The document on disk. Every field is optional: it is hand-editable. */
export interface FrontendConfig {
    readonly frontends?: readonly StoredFrontend[];
}
/** One read of the document, with the reason it came back empty when it did. */
export interface FrontendStoreRead {
    readonly path: string;
    readonly frontends: readonly StoredFrontend[];
    /** False when the document does not exist yet — "nothing registered". */
    readonly exists: boolean;
    /** Set only when the document exists and could not be used as written. */
    readonly error?: string;
}
/** The document, as the rest of the host uses it. */
export interface FrontendStore {
    readonly path: string;
    read(): Promise<FrontendStoreRead>;
    write(frontends: readonly StoredFrontend[]): Promise<void>;
}
/** Where the registrations live. */
export declare function defaultFrontendStorePath(): string;
/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export declare function createFrontendStore(path?: string): FrontendStore;
