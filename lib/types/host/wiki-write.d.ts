import type { Context } from '@deepseek-ai/cordis';
import type { YonWikiService } from './wiki-service.ts';
import type { WikiStore } from './wiki-store.ts';
/**
 * Every tool this module owns, **in the order `registerYonWikiWriteTools` registers
 * them**.
 *
 * `host-plugin.spec.ts` and `prompt.spec.ts` both take this array as the expectation
 * for what is registered and in what order. Adding a tool somewhere that reads more
 * naturally turns them red, and that is the point: either it goes where it is
 * registered, or the registration moves to it.
 */
export declare const WIKI_WRITE_TOOL_NAMES: readonly ["wiki_write", "wiki_page_write"];
/** What a call can fail with. */
export declare class WikiWriteError extends Error {
    readonly code: 'invalid-input' | 'not-found' | 'conflict' | 'failed';
    constructor(code: 'invalid-input' | 'not-found' | 'conflict' | 'failed', message: string);
}
/** The outcome of one write. */
export interface WikiWriteResult {
    readonly ok: boolean;
    readonly mode: string;
    readonly vault: string;
    readonly page: string;
    readonly file: string;
    /** What was written, in one line. */
    readonly summary: string;
    /** Files touched besides the page itself. */
    readonly sideEffects: readonly string[];
}
/** The outcome of one non-entity page write. */
export interface WikiPageWriteResult {
    readonly ok: boolean;
    readonly vault: string;
    readonly dir: string;
    readonly page: string;
    /** Vault-relative path, ready to hand to `digest_audit`'s `product`. */
    readonly file: string;
    readonly summary: string;
    readonly sideEffects: readonly string[];
}
/**
 * Register the knowledge base write tool and its gate.
 * @param ctx - host context carrying the tool registry.
 * @param wiki - the read service, used for the pre-write duplicate check.
 * @param store - where the vault list lives.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonWikiWriteTools(ctx: Context, wiki: YonWikiService, store: WikiStore): () => void;
