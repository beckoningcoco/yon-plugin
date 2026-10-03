/** Every tool-independent part of this module is pure; only the loader touches disk. */
/**
 * The shipped snapshots, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works for
 * the compiled plugin and for a spec running against the sources — the same seam
 * `KNOWLEDGE_ROOT` uses.
 *
 * Deliberately **not** under `resources/knowledge/`. That tree is the corpus the
 * `knowledge_*` tools walk, and the walk takes every `.json` it finds (measured: 424
 * documents, 6.16 MB). These eight payloads are 3.53 MB of that — 1.9% of the documents
 * and 56% of the bytes — so leaving them there made a bare metadata dump answer as often
 * as a written page for any query naming a BIP column. They are data with a reader now
 * (`bip_meta_*`), not knowledge, so they live in their own directory.
 */
export declare const BIP_META_ROOT: string;
/** What a call can fail with. */
export declare class BipMetaError extends Error {
    readonly code: 'invalid-input' | 'not-found' | 'unavailable';
    constructor(code: 'invalid-input' | 'not-found' | 'unavailable', message: string);
}
/** One column: the physical field, its Java property, and what the payload says about it. */
export interface BipColumn {
    /** The Java property name (`certificateVersion`) — what a service or a VO uses. */
    readonly property: string;
    /** The physical column (`certificate_version`) — what SQL uses. */
    readonly column: string;
    /** The Chinese label, or `''` when the payload gave none. */
    readonly label: string;
    /** `Long` / `String` / …, or the referenced entity's URI for a reference column. */
    readonly type: string;
    readonly length: number;
    readonly precise: number;
    readonly isKey: boolean;
    readonly isCode: boolean;
    readonly isRequired: boolean;
    /** True only when the payload says `nullable="false"`; an absent flag claims nothing. */
    readonly notNull: boolean;
    /** The enumeration's *name* (`aa_boolean`); its values are not in the payload. */
    readonly enumName: string;
    /** The entity a reference column points at, when it points at one. */
    readonly refUri: string;
    readonly defaultValue: string;
}
/** One sub-table, taken from the parent's own attribute list. */
export interface BipChild {
    readonly property: string;
    readonly label: string;
    /** The child entity's URI. */
    readonly uri: string;
    /** The child's table, resolved from the corpus; `''` when the child is not in it. */
    readonly tableName: string;
}
/** One business entity, as a snapshot describes it. */
export interface BipEntity {
    /** The declared name (`PurInRecord`). */
    readonly name: string;
    /** The entity URI (`st.purinrecord.PurInRecord`) — the key `wiki_lookup` also accepts. */
    readonly uri: string;
    readonly label: string;
    readonly tableName: string;
    /** The service domain (`ustock`) — BIP's counterpart to a module. */
    readonly domain: string;
    readonly tenant: string;
    /** When the platform built this metadata, as the payload reports it. */
    readonly builtAt: string;
    /** The snapshot file it came from, for provenance. */
    readonly source: string;
    readonly columns: readonly BipColumn[];
    readonly children: readonly BipChild[];
}
/** Everything the shipped snapshots describe. */
export interface BipCorpus {
    readonly entities: readonly BipEntity[];
    /** The tenant the snapshots came from, or `''` when they disagree. */
    readonly tenant: string;
    /**
     * Payloads in the directory that were not entity models — a failed capture reports
     * `Does not exist in DB` with no `data.data`, and is skipped structurally rather than
     * by filename so one that is re-added cannot pollute an answer.
     */
    readonly skipped: readonly string[];
}
/**
 * The shipped BIP metadata, parsed on first use and kept after.
 *
 * @param root - the directory the snapshots live in; defaults to the shipped one,
 *   overridden only by a test that needs its own fixtures.
 * @returns the corpus.
 */
export declare function loadBipMetadata(root?: string): Promise<BipCorpus>;
/**
 * Drop the cached corpus.
 *
 * Only a test needs this: the corpus is a read of files that ship with the package, so
 * nothing in a running plugin can invalidate it.
 */
export declare function clearBipMetadataCache(): void;
/**
 * Find entities by any of the names they go by.
 *
 * The ranking is the NCC finder's, for the same reason: an exact declared name is a
 * better answer than a substring, and mixing the two returns the near-misses first. The
 * tiers are name, table, then the URI's last segment (BIP's second spelling of a name,
 * where NCC has the defining file's basename), then the Chinese label.
 *
 * @param corpus - what to search.
 * @param term - an entity name, a table, a URI (whole or in part), or a Chinese label.
 * @param limit - how many to return at most.
 * @returns the matches, strongest first.
 */
export declare function findBipEntities(corpus: BipCorpus, term: string, limit: number): readonly BipEntity[];
/** One entity with the columns that matched a field query. */
export interface BipFieldHit {
    readonly entity: BipEntity;
    readonly columns: readonly BipColumn[];
}
/**
 * Find entities that have a column going by a name, a property, a label, or a fragment.
 *
 * Both spellings are matched because both are asked about: `certificate_version` is what
 * SQL needs and `certificateVersion` is what a service needs, and they are the same
 * column. An exact hit sorts above a partial one, per entity.
 *
 * @param corpus - what to search.
 * @param term - a column, a property, a Chinese label, or a fragment of one.
 * @param limit - how many entities to return at most.
 * @returns the matching entities with the columns that matched, strongest first.
 */
export declare function findBipColumns(corpus: BipCorpus, term: string, limit: number): readonly BipFieldHit[];
/** One enumeration name, and the columns that use it. */
export interface BipEnumHit {
    readonly name: string;
    readonly refs: readonly {
        readonly entity: BipEntity;
        readonly column: BipColumn;
    }[];
}
/**
 * Find enumerations by name, returning the columns that use them.
 *
 * The payloads name an enumeration without carrying its values, so this answers "which
 * columns are of this enum" and not "what does `1` mean here". The second question is
 * the one to ask the platform, and the answering text says so rather than leaving the
 * caller to infer it from an empty value list.
 *
 * @param corpus - what to search.
 * @param term - an enumeration name, or a fragment of one.
 * @param limit - how many enumerations to return at most.
 * @returns the matching enumerations with their referrers, exact names first.
 */
export declare function findBipEnums(corpus: BipCorpus, term: string, limit: number): readonly BipEnumHit[];
/**
 * One entity, by name, table or URI, or nothing.
 *
 * Ambiguity is reported rather than resolved: a term matching two entities is a term the
 * caller has to narrow, and picking one would be a guess that reads as an answer.
 *
 * @param corpus - what to search.
 * @param term - an entity name, a table, or a URI.
 * @returns the entity, or nothing.
 */
export declare function bipEntityOf(corpus: BipCorpus, term: string): BipEntity | undefined;
/**
 * Every entity whose name, table or URI matches, for the "which one did you mean" answer.
 *
 * @param corpus - what to search.
 * @param term - the term as given.
 * @param limit - how many to report at most.
 * @returns the candidates.
 */
export declare function bipCandidates(corpus: BipCorpus, term: string, limit: number): readonly BipEntity[];
/** How many hits a query returns when the caller does not say. */
export declare const DEFAULT_BIP_LIMIT = 20;
/** The largest limit a caller may ask for. */
export declare const MAX_BIP_LIMIT = 100;
/** Clamp a requested limit into range, defaulting when it is not a number. */
export declare function clampBipLimit(raw: unknown): number;
