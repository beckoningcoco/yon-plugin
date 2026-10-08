import type { Context } from '@deepseek-ai/cordis';
/** Every tool this module owns. */
export declare const DOC_PARSE_TOOL_NAMES: readonly ["doc_parse"];
/**
 * The bundled reader, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL
 * works for the compiled plugin and for a spec running against the sources.
 */
export declare const DOC_PARSE_SCRIPT_PATH: string;
/** What a call can fail with. */
export declare class DocParseError extends Error {
    readonly code: 'invalid-input' | 'failed';
    constructor(code: 'invalid-input' | 'failed', message: string);
}
/**
 * Register the document reader.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws the registration.
 */
export declare function registerYonDocParseTools(ctx: Context): () => void;
