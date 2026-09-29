/**
 * What a vault's pages say about each other, and what each page is worth to
 * someone who has to write SQL against the system it describes.
 *
 * ## Why this is derived rather than written
 *
 * The vault looked like 5374 islands until the pages were read for what they
 * actually contain. It holds no Obsidian `[[links]]` to speak of — 20 pages out
 * of 5374 — but it states relationships constantly, in tables: `关联属性` names a
 * 目标实体 per field, `子表` names child URIs, `继承接口` names interfaces,
 * `Reference Fields` and `Child Tables` do the same in the English style. Read
 * those, and 93.5% of pages point somewhere and 79% are pointed at.
 *
 * The lesson is worth keeping: "no links" was a property of the measurement, not
 * of the vault. Nothing here writes links back into pages. A derived graph can be
 * recomputed when the reader improves; 5374 rewritten pages cannot be un-rewritten.
 *
 * ## Why the assessment is a level and not a score
 *
 * A single number would be false precision and, worse, unactionable: the reader
 * of a 73 cannot tell what to do next. It would also be wrong for half its
 * audience, because the weights depend on the question — someone writing SQL
 * needs a column list and does not care about `业务场景`; someone reading a
 * requirement needs the opposite. So a page is placed in one of three levels that
 * each name a capability, and carries the list of what it lacks to reach the next.
 */
import type { WikiIndex, WikiPage, WikiRef, WikiRefKind } from './wiki-index.ts';
/** One reference arriving at a page. */
export interface WikiIncoming {
    /** Page name the reference comes from. */
    readonly from: string;
    readonly kind: WikiRefKind;
}
/** One hole in the vault: an entity its pages cite and none of them covers. */
export interface WikiGap {
    readonly uri: string;
    /** How many references name it. */
    readonly cited: number;
    /** A few of the pages citing it, for judging whether the hole matters. */
    readonly citedBy: readonly string[];
}
/** An entity that pages cite and no page covers. */
export interface WikiMissing {
    /** How many references name it. */
    readonly cited: number;
    /**
     * A few of the pages citing it.
     *
     * A sample, and a small one: its job is to let a reader judge whether the hole
     * matters — cited by `销售订单元数据` is a different problem from cited by five
     * enum pages nobody queries.
     */
    readonly citedBy: readonly string[];
}
/**
 * A vault's reference graph.
 *
 * Built once per index and held beside it, because every question this module
 * answers — the relations of a page, the level of a page, the holes in the vault
 * — is a lookup in one of these four maps.
 */
export interface WikiGraph {
    /** Page name → the entities it points at. */
    readonly out: ReadonlyMap<string, readonly WikiRef[]>;
    /** Page name → the pages pointing at it. */
    readonly incoming: ReadonlyMap<string, readonly WikiIncoming[]>;
    /** Entity URI → the page that covers it. */
    readonly byUri: ReadonlyMap<string, string>;
    /**
     * Referenced URI → how often and by whom, counting only URIs no page covers.
     *
     * This is the vault's own to-do list. It is not a guess about what would be
     * nice to have: it is what the pages that already exist keep needing and cannot
     * find. `ucfbase.ucfbaseItf.IYTenant` alone is cited 1566 times by pages that
     * have no page to link to.
     */
    readonly missing: ReadonlyMap<string, WikiMissing>;
    /** Total edges that resolved to a page. */
    readonly resolvedEdges: number;
    /** Total edges that named an entity no page covers. */
    readonly danglingEdges: number;
}
/**
 * Derive the reference graph from a built index.
 *
 * @param index - the vault's index, with references already parsed per page.
 * @returns the graph, ready to answer relation and gap questions.
 */
export declare function buildGraph(index: WikiIndex): WikiGraph;
/**
 * What a page can be used for, strongest first.
 *
 * - `query-ready` — names a physical table and lists its fields, so it can answer
 *   both "which table" and "which column".
 * - `locatable` — names the table but not its columns: it can tell you where to
 *   look, and you still have to look.
 * - `concept` — names no table at all; it is a VO, an enum, or an interface.
 */
export type WikiLevel = 'query-ready' | 'locatable' | 'concept';
/** One page, judged for what it is worth to the task in front of the model. */
export interface WikiAssessment {
    readonly level: WikiLevel;
    /** Physical table, when the page names one. */
    readonly table?: string;
    /** Fields the page claims to list, when it claims a number. */
    readonly fieldCount?: number;
    /** How many entities this page points at. */
    readonly refs: number;
    /** How many pages point at this one. */
    readonly incoming: number;
    /**
     * What this page does not carry, phrased as the next thing to do.
     *
     * Empty for a page that can answer both halves of a SQL question.
     */
    readonly lacks: readonly string[];
}
/**
 * Judge one page.
 *
 * The level comes from the two facts a SQL writer needs in order — the table and
 * the columns — and never from a weighted sum, so the same page gets the same
 * verdict whoever is asking.
 *
 * @param page - the page as the index holds it.
 * @param graph - the graph, for the page's reference counts.
 * @returns the level and what is missing.
 */
export declare function assessPage(page: WikiPage, graph: WikiGraph): WikiAssessment;
/** One page's relations, split into the ones it states and the ones it receives. */
export interface WikiRelations {
    /**
     * Entities this page points at, grouped by what the reference means.
     *
     * Every reference the page states is here, including ones no page covers. That
     * is deliberate: a page naming 45 child tables is telling you it has 45 child
     * tables whether or not the vault documents them, and dropping the undocumented
     * ones would understate the schema. The count that cannot be followed is
     * reported separately instead of by omission.
     */
    readonly outgoing: ReadonlyMap<WikiRefKind, readonly string[]>;
    /** Pages pointing at this one, grouped the same way. */
    readonly incoming: ReadonlyMap<WikiRefKind, readonly string[]>;
    /** Of the outgoing references, the ones no page in the vault covers. */
    readonly unresolved: {
        readonly total: number;
        readonly sample: readonly string[];
    };
}
/**
 * Collect one page's relations, both directions.
 *
 * Both directions matter and for different reasons: the outgoing edges are what
 * the model can read next without searching again, and the incoming edges answer
 * "what else is built on this entity" — which is the question a lookup cannot
 * answer at all, because it only ever searches by name.
 *
 * @param page - the page name.
 * @param graph - the graph to read.
 * @returns the relations, each side grouped by kind and sorted.
 */
export declare function relationsOf(page: string, graph: WikiGraph): WikiRelations;
/**
 * The vault's largest holes: entities the pages keep naming and no page covers.
 *
 * @param graph - the graph to read.
 * @param limit - how many to return.
 * @returns the holes, most-cited first.
 */
export declare function gapsOf(graph: WikiGraph, limit: number): readonly WikiGap[];
/** The vault's own tally, for a report line. */
export interface WikiGraphSummary {
    readonly pages: number;
    readonly withOutgoing: number;
    readonly withIncoming: number;
    readonly isolated: number;
    readonly resolvedEdges: number;
    readonly danglingEdges: number;
    readonly missingEntities: number;
}
/**
 * Count what the graph holds.
 * @param index - the vault's index.
 * @param graph - its graph.
 * @returns the tallies a report quotes.
 */
export declare function summaryOf(index: WikiIndex, graph: WikiGraph): WikiGraphSummary;
