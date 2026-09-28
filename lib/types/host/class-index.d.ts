/** One built index. */
export interface ClassIndex {
    readonly version: string;
    readonly home: string;
    readonly builtAt: string;
    readonly totalJars: number;
    readonly totalClasses: number;
    /** Fully-qualified class name → path relative to `home`. */
    readonly index: Record<string, string>;
}
/** Progress one build reports, so a long run can say what it is doing. */
export interface BuildProgress {
    readonly jars: number;
    readonly classes: number;
    readonly current: string;
}
/** Where indexes live, under the operator's DSH data directory. */
export declare function classIndexDir(): string;
/** The file one version's index is stored in. */
export declare function classIndexPath(version: string): string;
/**
 * List the class names one jar declares.
 *
 * @param jar - absolute path to the jar.
 * @returns fully-qualified class names, or an empty list when the file is not a
 * readable zip (a corrupt or truncated jar is skipped rather than failing the run).
 */
export declare function classNamesOf(jar: string): Promise<readonly string[]>;
/**
 * Walk a home directory and index every class it holds.
 *
 * @param home - the NCC or BIP home directory to scan.
 * @param version - the label this index is stored under.
 * @param onProgress - called every so often, for a run that reports where it is.
 * @returns the index, ready to write.
 */
export declare function buildClassIndex(home: string, version: string, onProgress?: (progress: BuildProgress) => void): Promise<ClassIndex>;
/**
 * Write an index where {@link classIndexPath} will look for it.
 * @param built - the index to store.
 * @returns the absolute path written.
 */
export declare function writeClassIndex(built: ClassIndex): Promise<string>;
/**
 * Read one stored index.
 * @param version - the label it was stored under.
 * @returns the index, or undefined when none is stored.
 */
export declare function readClassIndex(version: string): Promise<ClassIndex | undefined>;
/** One stored index, as a listing reports it. */
export interface StoredIndex {
    readonly version: string;
    readonly home: string;
    readonly builtAt: string;
    readonly totalJars: number;
    readonly totalClasses: number;
    readonly bytes: number;
}
/**
 * Every index stored, newest first.
 *
 * Listed by reading each file's header fields rather than parsing it whole: a
 * listing should stay cheap even when several indexes of tens of megabytes each
 * are sitting there.
 *
 * @returns the stored indexes.
 */
export declare function listClassIndexes(): Promise<readonly StoredIndex[]>;
/** One class a search matched. */
export interface ClassHit {
    readonly className: string;
    readonly jar: string;
}
/**
 * Search one index by class name.
 *
 * Ranked so a caller asking for `PaybillLinkImpl` sees the class whose simple name
 * is exactly that before every class that merely contains it — the common case is a
 * name copied out of a stack trace, and the fully-qualified name is what is missing.
 *
 * @param index - the index to search.
 * @param term - a simple class name, a fully-qualified one, or a fragment.
 * @param limit - how many hits to return at most.
 * @returns the matches, strongest first.
 */
export declare function searchClassIndex(index: ClassIndex, term: string, limit: number): readonly ClassHit[];
