import { type WikiRefKind, type WikiVault } from './wiki-index.ts';
import { type WikiAssessment, type WikiGap, type WikiGraphSummary, type WikiLevel } from './wiki-graph.ts';
import type { WikiStore } from './wiki-store.ts';
import { type WikiUsageLog, type WikiUsageMiss } from './wiki-usage.ts';
import type { SaveVaultInput, WikiLogEntry, WikiVaultView } from '../shared/types.ts';
import type { WikiCardView, WikiHealthReport, WikiUnindexedDir } from '../shared/types.ts';
/** What a knowledge base call can fail with. */
export declare class WikiError extends Error {
    readonly code: 'not-found' | 'invalid-input' | 'not-configured';
    constructor(code: 'not-found' | 'invalid-input' | 'not-configured', message: string);
}
/** How a term matched a page, strongest first. */
export type WikiMatch = 'uri' | 'table' | 'page' | 'name' | 'contains';
/** One page a lookup matched. */
export interface WikiHit {
    /** Vault id the page belongs to. */
    readonly vault: string;
    /** Human label of that vault. */
    readonly vaultLabel: string;
    readonly page: string;
    readonly uri: string | null;
    readonly name: string;
    readonly table?: string;
    readonly domain?: string;
    readonly app?: string;
    readonly version?: string;
    readonly status?: string;
    readonly verified?: string;
    /**
     * What the page can answer, so a hit list sorts itself by usefulness.
     *
     * Carried on every hit rather than only on a full read: a lookup for 销售订单
     * returns 49 pages, and the one that lists columns is worth opening first.
     */
    readonly level: WikiLevel;
    /** Fields the page claims to list, when it claims a number. */
    readonly fieldCount?: number;
    readonly matchedBy: WikiMatch;
}
/** One kind of relation, with a sample of its targets and how many there are. */
export interface WikiRelationGroup {
    readonly kind: WikiRefKind;
    /** How many targets of this kind there are in total. */
    readonly total: number;
    /**
     * The first few targets, sorted.
     *
     * A sample rather than all of them on purpose: `YhtTenant` is referenced by
     * 2380 pages, and a caller that wants the full list wants a graph tool, not a
     * page read.
     */
    readonly sample: readonly string[];
}
/** A page's relations, both directions, capped to something readable. */
export interface WikiRelationView {
    /** Entities this page points at. */
    readonly outgoing: readonly WikiRelationGroup[];
    /** Pages pointing at this one. */
    readonly incoming: readonly WikiRelationGroup[];
    /**
     * Of the outgoing references, the ones no page in the vault covers.
     *
     * A count plus a sample, because the number is the interesting part and the
     * names only need to be illustrative: a page citing 300 undocumented entities
     * should say so rather than print 300 lines.
     */
    readonly unresolved: {
        readonly total: number;
        readonly sample: readonly string[];
    };
}
/** The answer to one lookup. */
export interface WikiLookupResult {
    /** The term as it was asked. */
    readonly term: string;
    readonly hits: readonly WikiHit[];
    /** When the index behind this answer was built. */
    readonly indexAge: string;
    /** How many pages were searched — entity pages, which is all a search can read. */
    readonly scanned: number;
    /**
     * Pages in the searched vaults that no search can reach.
     *
     * Carried on every answer, not only the empty ones: a term that missed is
     * exactly when a caller needs to know the vault holds pages this tool cannot
     * see, and a term that hit still benefits from knowing the corpus is wider.
     */
    readonly unindexed: readonly WikiUnindexedDir[];
}
/** One page's full text, with the facts worth reading before the body. */
export interface WikiPageContent {
    readonly vault: string;
    readonly vaultLabel: string;
    readonly page: string;
    readonly uri: string | null;
    readonly version?: string;
    readonly status?: string;
    readonly verified?: string;
    /** What this page can answer, and what it lacks to answer more. */
    readonly assessment: WikiAssessment;
    /**
     * Where this page leads, and what leads here.
     *
     * Returned with the page rather than behind a separate tool because the moment
     * a caller wants it is the moment it has finished reading: the next question is
     * almost always "what else is built on this".
     */
    readonly relations: WikiRelationView;
    readonly text: string;
}
/** One hole in the vault: an entity its pages cite and none of them covers. */
export type { WikiGap };
/** What a page can answer, and what it lacks to answer more. */
export type { WikiAssessment };
/** What a gap report says about one vault. */
export interface WikiGapReport {
    readonly vault: string;
    readonly vaultLabel: string;
    readonly summary: WikiGraphSummary;
    /** The largest holes, most-cited first. */
    readonly gaps: readonly WikiGap[];
    /**
     * Terms that were asked for and came back empty.
     *
     * The other half of the picture, and not a restatement of `gaps`: those are
     * entities the pages cite and no page covers, while these are what a caller
     * wanted and the vault never had. A term can appear here with nothing citing it
     * at all — the case where documentation is missing rather than incomplete.
     *
     * Folded across every vault, because one question can span them.
     */
    readonly misses: readonly WikiUsageMiss[];
    /** How many questions the log holds, so an empty miss list reads correctly. */
    readonly asked: number;
}
/** One vault as the tools see it; the panel's copy is the shared view. */
export type { WikiVaultView };
/** One log line; the panel's copy is the shared view. */
export type { WikiLogEntry };
/** The knowledge base, as the tools and the HTTP face use it. */
export interface YonWikiService {
    /** The registered vaults, with their index state. */
    list(): Promise<readonly WikiVaultView[]>;
    /**
     * Find the pages answering one term.
     * @param term - URI, table name, page name, display name, or a fragment of any.
     * @param vaultId - restrict to one vault; all of them when omitted.
     */
    lookup(term: string, vaultId?: string): Promise<WikiLookupResult>;
    /**
     * Read one page in full.
     * @param page - page name, with or without the `.md` suffix.
     * @param vaultId - which vault to read from; required when several could match.
     */
    read(page: string, vaultId?: string): Promise<WikiPageContent>;
    /**
     * The vault's own history: the tail of its `log.md`.
     *
     * Every write appends a line there, so this answers "what has this knowledge base
     * been told lately" from a file that is already being maintained — without a new
     * store, and without the model having to guess its way in page by page.
     * @param vaultId - which vault; all of them when omitted.
     * @param limit - how many entries, newest first; 20 when omitted.
     */
    recent(vaultId?: string, limit?: number): Promise<readonly WikiLogEntry[]>;
    /**
     * The vault's own holes: entities its pages cite and none of them covers.
     *
     * Unlike a usage log, this needs nothing to accumulate — the evidence is
     * already in the pages, which name 23,052 references to entities the vault does
     * not hold. Those citations are the demand; the absence of a page is the supply.
     * @param vaultId - which vault; all of them when omitted.
     * @param limit - how many gaps per vault, most-cited first; 15 when omitted.
     */
    gaps(vaultId?: string, limit?: number): Promise<readonly WikiGapReport[]>;
    /**
     * One vault's health, for the panel's overview and gap tabs.
     *
     * Everything the panel draws about a vault's state, in one answer: the page
     * count, the level breakdown, the reference tallies, the largest holes and the
     * query activity. Assembled here rather than by three panel calls, so that two
     * tabs cannot show figures from two different moments.
     * @param vaultId - which vault; all of them when omitted.
     * @param gapLimit - how many holes to include; 20 when omitted.
     */
    health(vaultId?: string, gapLimit?: number): Promise<readonly WikiHealthReport[]>;
    /**
     * One page as a card: what it is good for and where it leads.
     *
     * Answered from the index and the graph alone — the page body is never read,
     * because a card is what the panel shows *before* deciding to open anything.
     * @param page - page name, with or without the `.md` suffix.
     * @param vaultId - which vault; required when several could match.
     */
    card(page: string, vaultId?: string): Promise<WikiCardView>;
    /**
     * The pages citing one entity URI.
     *
     * Expands a gap: knowing `bip-usercenter.bip_user_ref` is cited 818 times is a
     * number, and knowing which 818 pages cite it is a to-do list.
     * @param uri - the entity URI, as a page writes it.
     * @param vaultId - which vault; all of them when omitted.
     */
    citers(uri: string, vaultId?: string): Promise<readonly string[]>;
    /** Drop the cached indexes and rebuild them from disk. */
    rebuild(vaultId?: string): Promise<readonly WikiVaultView[]>;
    /**
     * Register a vault, or edit one that is already registered.
     *
     * The registration is the panel's own bookkeeping, so this writes the panel's
     * document and nothing else — a vault's files, its index cache included, belong
     * to the operator's own repository and are not this service's to touch.
     * @param input - the label and the directory.
     * @param id - the registration to edit; absent to add a new one. Immutable.
     * @returns the stored vault, with its readiness.
     */
    saveVault(input: SaveVaultInput, id?: string): Promise<WikiVaultView>;
    /**
     * Drop one registration.
     *
     * The directory is left exactly as it is, `wiki/.yon-index.json` included: the
     * index is derived and will be rebuilt if the vault is registered again, and
     * deleting a file inside somebody's Obsidian repository to unlist it would be
     * this panel reaching outside what it owns.
     * @param id - the registration to remove.
     */
    removeVault(id: string): Promise<void>;
    /**
     * Forget what is cached for one vault: on disk and in memory.
     *
     * Called after a write. The page on disk is newer than any index, and a lookup
     * served from the in-memory copy would not see it until the process restarted —
     * which is the difference between "the write worked" and "the write worked and
     * the knowledge base can tell you about it".
     * @param vaultId - the vault that changed; all of them when omitted.
     */
    invalidate(vaultId?: string): Promise<void>;
    dispose(): void;
}
/**
 * Build the knowledge base service over one store.
 * @param store - where the vault list lives.
 * @param usage - where queries are logged; the default log when omitted.
 * @returns the service.
 */
export declare function createYonWikiService(store: WikiStore, usage?: WikiUsageLog): YonWikiService;
/** The index path a vault would cache to, for the panel and for diagnostics. */
export declare function wikiIndexLocation(vault: WikiVault): string;
