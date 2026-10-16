/** One registered Arthas, as the document stores it. */
export interface StoredArthas {
    readonly id: string;
    /** Directory holding `arthas-boot.jar` (or the boot jar itself). */
    readonly path: string;
    /** Version string as reported by the jar, empty until probed. */
    readonly version: string;
    /** JDK used to launch it; empty means "borrow the target Home's ufjdk". */
    readonly jdk: string;
    readonly isDefault: boolean;
    /** True when this plugin downloaded it; false when the operator pointed at one. */
    readonly managed: boolean;
}
/** The document on disk. Every field is optional: it is hand-editable. */
export interface ArthasConfig {
    readonly arthas?: readonly StoredArthas[];
}
/** One read of the document, with the reason it came back empty when it did. */
export interface ArthasStoreRead {
    readonly path: string;
    readonly arthas: readonly StoredArthas[];
    /** False when the document does not exist yet — "nothing registered". */
    readonly exists: boolean;
    /** Set only when the document exists and could not be used as written. */
    readonly error?: string;
}
/** The document, as the rest of the host uses it. */
export interface ArthasStore {
    readonly path: string;
    read(): Promise<ArthasStoreRead>;
    write(entries: readonly StoredArthas[]): Promise<void>;
}
/** Where the registrations live. */
export declare function defaultArthasStorePath(): string;
/** Where a managed download unpacks to. */
export declare function defaultArthasDistDir(): string;
/** Where captured objects and observation records are written. */
export declare function defaultArthasWorkDir(): string;
/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export declare function createArthasStore(path?: string): ArthasStore;
