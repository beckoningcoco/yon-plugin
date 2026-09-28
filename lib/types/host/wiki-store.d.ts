import { type WikiVault } from './wiki-index.ts';
/** The whole stored document. */
export interface WikiConfig {
    readonly vaults?: readonly WikiVault[];
}
/** The store plus the path it settled on. */
export interface WikiStore {
    /** Absolute path of the document this store reads and writes. */
    readonly path: string;
    /**
     * Read the document, seeding it from the guessed vaults on a first run.
     * @returns the parsed document; `vaults` is always present.
     */
    read(): Promise<{
        readonly vaults: readonly WikiVault[];
        readonly seeded: boolean;
    }>;
    /**
     * Replace the document, atomically.
     * @param vaults - the whole list to store.
     */
    write(vaults: readonly WikiVault[]): Promise<void>;
}
/** The default document location, under the operator's DSH data directory. */
export declare function defaultWikiStorePath(): string;
/**
 * Build the store over one path.
 * @param path - where the document lives; defaults to {@link defaultWikiStorePath}.
 * @returns the store.
 */
export declare function createWikiStore(path?: string): WikiStore;
