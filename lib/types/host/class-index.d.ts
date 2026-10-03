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
/** The file one version's index is stored in, under a directory of the caller's choosing. */
export declare function classIndexPathIn(dir: string, version: string): string;
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
 * Whether a path segment is a bundled JDK rather than platform code.
 *
 * Exported so `home-probe.ts` skips the same tree this indexer does. Two copies of
 * this list would drift, and the drift would show up as a Home reporting a jar
 * count that disagrees with the index built from it.
 */
export declare function isJdk(root: string): boolean;
/**
 * Walk a home directory and index every class it holds.
 *
 * Two kinds of find end up in one table. A jar is read through its central directory
 * (only names, nothing decompressed); a loose `.class` or `.java` contributes its own
 * file. The jar wins wherever both know a class, and the loose file is kept only when
 * no jar claims it — see the merge note below for why that order is the safe one.
 *
 * @param home - the NCC or BIP home directory to scan.
 * @param version - the label this index is stored under.
 * @param onProgress - called every so often, for a run that reports where it is.
 * @returns the index, ready to write.
 */
export declare function buildClassIndex(home: string, version: string, onProgress?: (progress: BuildProgress) => void): Promise<ClassIndex>;
/**
 * Write an index where {@link classIndexPath} will look for it.
 *
 * The key order of `JSON.stringify(built)` is load-bearing — see {@link summaryOf}, which
 * reads the front of this file and stops at `"index":`. `built` is built by
 * `buildClassIndex`, whose object literal puts the five summary fields first, and the
 * `index` table last. Reordering them would not break anything visibly; it would make the
 * cheap listing silently parse every file whole.
 *
 * @param built - the index to store.
 * @param dir - the directory to write into; defaults to the operator's own. The same
 *   seam the stores have, so a case can write and list without touching that directory.
 * @returns the absolute path written.
 */
export declare function writeClassIndex(built: ClassIndex, dir?: string): Promise<string>;
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
/** The summary fields of a stored index, as they sit at the front of its file. */
export type IndexSummary = Pick<ClassIndex, 'version' | 'home' | 'builtAt' | 'totalJars' | 'totalClasses'>;
/**
 * The summary a stored index carries at the front of its file, without reading the table.
 *
 * {@link writeClassIndex} serialises `{version, home, builtAt, totalJars, totalClasses,
 * index}`, so everything before the `index` key — the one holding hundreds of thousands
 * of entries — is the entire summary. Cutting the head there and closing the object
 * parses the summary without touching the table. Measured on a synthesised index of the
 * size the reference Home produces (43.2 MB, 642,426 entries): **1 ms, against 372 ms**
 * for reading and parsing the whole document. That is the difference between a status
 * endpoint a panel can poll and one it cannot.
 *
 * `undefined` when the head does not carry a summary — a file this module did not write,
 * or one whose `index` key lies beyond {@link HEAD_BYTES} — and the caller reads the
 * whole document instead. Returning nothing rather than guessing is what keeps the
 * fallback honest: a listing never reports figures it did not read.
 *
 * @param full - absolute path to the index file.
 * @returns the summary, or undefined when the head does not hold one.
 */
export declare function summaryOf(full: string): Promise<IndexSummary | undefined>;
/**
 * Every index stored, newest first.
 *
 * Listed from each file's head rather than by parsing it whole: a listing has to stay
 * cheap when several indexes of tens of megabytes each are sitting there, and one of
 * them is the summary a status call reads once per panel selection. A file the head
 * cannot summarise is read in full instead — the listing is then slower for that one
 * file, and never wrong.
 *
 * @param dir - the directory to list; defaults to the operator's own. Injected for the
 *   same reason {@link writeClassIndex} takes one: a case can otherwise only exercise
 *   this against whatever happens to be in the operator's data directory.
 * @returns the stored indexes.
 */
export declare function listClassIndexes(dir?: string): Promise<readonly StoredIndex[]>;
/**
 * Drop one stored index.
 *
 * The file is a derived artefact — the same build reproduces it from the installation —
 * so this is not a destructive operation the way removing a registration is. It exists
 * because an index that nobody wants cannot otherwise be got rid of: an index stored
 * under a version label the operator no longer recognises is still what a search with no
 * `version` falls back to, and nothing in the panel could reach it.
 *
 * Only this plugin's own directory is touched. An index the skills' own
 * `build_index.py` wrote lives under `~/.claude/skills/`, and is left alone.
 *
 * @param version - the label the index is stored under.
 * @returns true when a file was removed.
 */
export declare function removeClassIndex(version: string): Promise<boolean>;
/** One class a search matched. */
export interface ClassHit {
    readonly className: string;
    /**
     * Where the class was found, relative to the indexed home.
     *
     * Usually a `.jar`. A module shipped with no jar at all keeps its classes loose on
     * disk, and there this is the `.java` or `.class` file itself — which is why this
     * is not called `jar` any more: a caller told "jar" would hand a source file to
     * `cfr`.
     */
    readonly path: string;
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
