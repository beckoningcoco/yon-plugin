/** One entity as the index stores it: identity plus the flattened field names. */
export interface StoredEntity {
    readonly name: string;
    /** The file's basename without extension — the other spelling of the name. */
    readonly filename: string;
    readonly displayName: string;
    readonly tableName: string;
    readonly fullClassName: string;
    readonly module: string;
    /** Path relative to the Home, with forward slashes. */
    readonly file: string;
    readonly primary: boolean;
    /** `名字|中文名`, or just `名字` for a field the file gave no label. */
    readonly fields: readonly string[];
}
/** One enumeration as the index stores it. */
export interface StoredEnum {
    readonly name: string;
    readonly displayName: string;
    readonly fullClassName: string;
    readonly module: string;
    readonly file: string;
    /** `[value, label]`, in the order the file lists them. */
    readonly items: readonly (readonly [string, string])[];
}
/** How much of the tree an index covers. */
export interface MetaCounts {
    readonly files: number;
    readonly entities: number;
    readonly enums: number;
    readonly fields: number;
    readonly enumItems: number;
}
/** A whole built index, as stored on disk. */
export interface MetaIndex {
    readonly version: string;
    readonly builtAt: string;
    /** Every Home whose files went into this index; more than one after an incremental merge. */
    readonly sourceHomes: readonly string[];
    readonly counts: MetaCounts;
    /** L0: Home-relative path → `mtimeMs:size`. */
    readonly fingerprint: Record<string, string>;
    readonly entities: readonly StoredEntity[];
    readonly enums: readonly StoredEnum[];
}
/** Progress one build reports, so a long run can say where it is. */
export interface MetaBuildProgress {
    readonly files: number;
    readonly parsed: number;
    readonly total: number;
    readonly current: string;
}
/** What a freshness check concluded. */
export interface MetaFreshness {
    /** `fresh` — the fingerprints agree; `stale` — they do not; `unknown` — nothing built. */
    readonly state: 'fresh' | 'stale' | 'unknown';
    readonly changed: number;
    readonly added: number;
    readonly removed: number;
}
/** Where indexes live, beside the class indexes. */
export declare function metaIndexDir(): string;
/**
 * The file one version's metadata index is stored in.
 *
 * @param version - the label it is stored under.
 * @param dir - the directory to store in; defaults to the operator's own. The same
 *   seam `mirrorHomes`'s `skillsRoot` and `createYonHomesService`'s are: a case that
 *   had to write the operator's `~/.dsh` to exercise storage would be editing the
 *   installation it is checking.
 * @returns the absolute path.
 */
export declare function metaIndexPath(version: string, dir?: string): string;
/** One `.bmf` the walk found. */
interface FoundFile {
    readonly abs: string;
    readonly rel: string;
    readonly module: string;
    readonly filename: string;
}
/**
 * Walk the authoritative metadatatree: `modules/ * /METADATA`, recursively.
 *
 * Only that tree, and that is a measured decision rather than a shortcut. Of the 3,819
 * `.bmf` files under a whole Home, 3,600 are here and they are **96.5% of the bytes**;
 * the 219 outside hold 8.8 MB of odds and ends. Walking the whole Home instead costs
 * 30–42 s against 163 ms, and the 3.5% it adds is not metadata the index is asked about.
 *
 * Recursion is required: `psndoc.bmf` lives at
 * `modules/uapbd/METADATA/metadata/bbd/psninfo/psndoc.bmf`, two levels below `METADATA`.
 *
 * @param home - absolute Home path.
 * @returns every `.bmf` found, with the module and basename already worked out.
 */
export declare function findBmfFiles(home: string): Promise<readonly FoundFile[]>;
/**
 * The `mtime:size` fingerprint of every file found.
 *
 * `mtimeMs` and size together, rather than a content hash: hashing 244.2 MB would cost
 * seconds on every status check, and the question being asked is only "did anything
 * change since the build". A file that changed without its mtime or size moving is not
 * a case this is asked to catch.
 *
 * @param files - what the walk found.
 * @returns Home-relative path → fingerprint string.
 */
export declare function fingerprintOf(files: readonly FoundFile[]): Promise<Record<string, string>>;
/**
 * Build an index over one Home, reusing what an earlier build already parsed.
 *
 * Incremental is an optimisation, not a premise: a full rebuild is ~3.3 s (measured:
 * 163 ms to walk, 3,131 ms to parse 244.2 MB at 78 MB/s), so the panel's rebuild button
 * could plausibly always do the whole thing. What incremental buys is the version-keyed
 * reuse below.
 *
 * @param home - absolute Home path.
 * @param version - the label to store the index under.
 * @param previous - the index already stored, when there is one.
 * @param onProgress - called every {@link PROGRESS_EVERY} files.
 * @returns the index, ready to write.
 */
export declare function buildMetaIndex(home: string, version: string, previous?: MetaIndex, onProgress?: (progress: MetaBuildProgress) => void): Promise<MetaIndex>;
/**
 * Write an index where {@link metaIndexPath} will look for it.
 * @param built - the index to store.
 * @param dir - the directory to store in; defaults to the operator's own.
 * @returns the absolute path written.
 */
export declare function writeMetaIndex(built: MetaIndex, dir?: string): Promise<string>;
/**
 * Read one stored index.
 * @param version - the label it was stored under.
 * @param dir - the directory to read from; defaults to the operator's own.
 * @returns the index, or undefined when none is stored or it cannot be read.
 */
export declare function readMetaIndex(version: string, dir?: string): Promise<MetaIndex | undefined>;
/** One stored index, as a listing reports it. */
export interface StoredMetaIndex {
    readonly version: string;
    readonly builtAt: string;
    readonly counts: MetaCounts;
    readonly bytes: number;
}
/**
 * Every metadata index stored, newest first.
 *
 * Read whole rather than by header — unlike the class index, whose entries are hundreds
 * of thousands of lines, this one's summary is small next to the arrays.
 *
 * @param dir - the directory to list; defaults to the operator's own.
 * @returns the stored indexes.
 */
export declare function listMetaIndexes(dir?: string): Promise<readonly StoredMetaIndex[]>;
/**
 * Compare a stored fingerprint against the directory as it is now.
 *
 * Costs a walk plus a stat per file — measured at 0.61 s on the reference Home — which
 * is why it is a status check the panel and the tools run, and not something on the
 * path of every query.
 *
 * @param home - the Home to check.
 * @param stored - the index's fingerprint.
 * @returns what changed.
 */
export declare function checkFreshness(home: string, stored: Record<string, string>): Promise<MetaFreshness>;
/**
 * Find entities by any of the names they go by.
 *
 * Four tiers, strongest first, because the tiers are not equally good answers:
 *
 * 1. **The declared name matches exactly.** `psndoc` finds the entity called `psndoc`.
 * 2. **The file's basename matches exactly.** The other spelling of the same thing —
 *    `expensetype.bmf` declares `name="ExpenseType"` — so both have to work.
 * 3. **Either name contains the term.**
 * 4. **The table, the VO class, or the label contains it.**
 *
 * Measured on the reference Home, tiers 1 and 2 are not interchangeable: querying
 * `psndoc` matches one file's basename and twelve entities across three files, because a
 * multi-entity file gives every one of its entities the same basename. Ranking the
 * declared name first is what keeps the answer to that query legible; ranking them
 * together returns the ten entities that are *not* called `psndoc` before the two that
 * are.
 *
 * @param index - the index to search.
 * @param term - what to look for.
 * @param limit - how many to return at most.
 * @returns the matches, strongest first, in a stable order.
 */
export declare function findEntities(index: MetaIndex, term: string, limit: number): readonly StoredEntity[];
/**
 * Find entities that have a field going by a name, a label, or either one's fragment.
 *
 * The reverse direction, and the one the index exists for: the answer is not a field,
 * it is the list of entities that own one. Scanned in memory rather than served from a
 * stored inverted table — 217,140 pairs scan in milliseconds, and an inverted table
 * would be a second thing to keep in step with the first.
 *
 * @param index - the index to search.
 * @param term - a field name, a Chinese label, or a fragment of either.
 * @param limit - how many entities to return at most.
 * @returns the matching entities with the fields that matched, strongest first.
 */
export declare function findFields(index: MetaIndex, term: string, limit: number): readonly {
    readonly entity: StoredEntity;
    readonly fields: readonly string[];
}[];
/**
 * Find enumerations by name, label, or one of their values.
 *
 * @param index - the index to search.
 * @param term - an enumeration name, or a value or label inside one.
 * @param limit - how many to return at most.
 * @returns the matching enumerations, strongest first.
 */
export declare function findEnums(index: MetaIndex, term: string, limit: number): readonly StoredEnum[];
/**
 * The query kinds the tools accept, as a closed set.
 *
 * Closed on purpose: the tool description tells the model these are the only three, and
 * a name that is not one of them has to be refused rather than quietly treated as a
 * substring search over everything.
 */
export declare const META_QUERY_KINDS: readonly ["entity", "field", "enum"];
/** One of {@link META_QUERY_KINDS}. */
export type MetaQueryKind = (typeof META_QUERY_KINDS)[number];
/** Read one of the query kinds, refusing anything else. */
export declare function asQueryKind(raw: unknown): MetaQueryKind;
/** How many hits a query returns when the caller does not say. */
export declare const DEFAULT_QUERY_LIMIT = 20;
/** The largest limit a caller may ask for. */
export declare const MAX_QUERY_LIMIT = 100;
/** Clamp a requested limit into range, defaulting when it is not a number. */
export declare function clampQueryLimit(raw: unknown): number;
/** The basename of a stored file path, for a display that has no room for the path. */
export declare function shortFile(rel: string): string;
export {};
