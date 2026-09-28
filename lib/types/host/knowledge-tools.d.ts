import type { Context } from '@deepseek-ai/cordis';
/** Every tool this module owns. */
export declare const KNOWLEDGE_TOOL_NAMES: readonly ["knowledge_search", "knowledge_read"];
/**
 * The shipped library, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works
 * for the compiled plugin and for a spec running against the sources.
 */
export declare const KNOWLEDGE_ROOT: string;
/** What a call can fail with. */
export declare class KnowledgeError extends Error {
    readonly code: 'invalid-input' | 'not-found';
    constructor(code: 'invalid-input' | 'not-found', message: string);
}
/**
 * Register the knowledge library tools.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonKnowledgeTools(ctx: Context): () => void;
