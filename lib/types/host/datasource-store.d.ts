/** One environment branch of a stored connection, as the file holds it. */
export interface StoredEnvironment {
    readonly host?: unknown;
    readonly port?: unknown;
    readonly service_name?: unknown;
    readonly users?: unknown;
    readonly [key: string]: unknown;
}
/** One stored connection group: a database type plus one branch per environment. */
export interface StoredConnection {
    readonly type?: unknown;
    /** The project this connection belongs to; a member only this plugin reads. */
    readonly projectId?: unknown;
    readonly [key: string]: unknown;
}
/** The whole stored document. */
export interface StoredConfig {
    readonly projects?: Record<string, StoredConnection>;
}
/** One read of the store, successful or not. */
export interface StoreRead {
    /** Absolute path the answer came from. */
    readonly path: string;
    /** The parsed document; empty when nothing could be read. */
    readonly config: StoredConfig;
    /** False when the file is absent AND could not be seeded from anywhere. */
    readonly exists: boolean;
    /**
     * Where a first run copied its starting contents from, when it did. Reported
     * so the surface can say so once, instead of the operator wondering why an
     * empty install already lists connections.
     */
    readonly seededFrom?: string;
    /** Why a file that exists could not be read, when it could not. */
    readonly error?: string;
}
/** The store plus the path it settled on. */
export interface DataSourceStore {
    /** Absolute path of the document this store reads and writes. */
    readonly path: string;
    /**
     * Read the document, seeding it from the legacy location on a first run.
     * @returns the parsed document and how the read went.
     */
    read(): Promise<StoreRead>;
    /**
     * Replace the document, atomically.
     * @param config - the whole document to store.
     */
    write(config: StoredConfig): Promise<void>;
}
/** The default document location, under the operator's DSH data directory. */
export declare function defaultStorePath(): string;
/**
 * Build the store over one path.
 * @param path - where the document lives; defaults to {@link defaultStorePath}.
 * @returns the store.
 */
export declare function createDataSourceStore(path?: string): DataSourceStore;
