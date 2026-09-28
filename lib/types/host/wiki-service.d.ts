import { type WikiVault } from './wiki-index.ts';
import type { WikiStore } from './wiki-store.ts';
import type { WikiVaultView } from '../shared/types.ts';
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
    readonly matchedBy: WikiMatch;
}
/** The answer to one lookup. */
export interface WikiLookupResult {
    /** The term as it was asked. */
    readonly term: string;
    readonly hits: readonly WikiHit[];
    /** When the index behind this answer was built. */
    readonly indexAge: string;
    /** How many pages were searched. */
    readonly scanned: number;
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
    readonly text: string;
}
/** One vault as the tools see it; the panel's copy is the shared view. */
export type { WikiVaultView };
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
    /** Drop the cached indexes and rebuild them from disk. */
    rebuild(vaultId?: string): Promise<readonly WikiVaultView[]>;
    dispose(): void;
}
/**
 * Build the knowledge base service over one store.
 * @param store - where the vault list lives.
 * @returns the service.
 */
export declare function createYonWikiService(store: WikiStore): YonWikiService;
/** The index path a vault would cache to, for the panel and for diagnostics. */
export declare function wikiIndexLocation(vault: WikiVault): string;
