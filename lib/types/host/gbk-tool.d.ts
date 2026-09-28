import type { Context } from '@deepseek-ai/cordis';
/** Every tool this module owns. */
export declare const GBK_TOOL_NAMES: readonly ["ncc_gbk_edit"];
/**
 * The bundled editor, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works
 * for the compiled plugin and for a spec running against the sources.
 */
export declare const GBK_EDIT_SCRIPT_PATH: string;
/** What a call can fail with. */
export declare class GbkError extends Error {
    readonly code: 'invalid-input' | 'failed';
    constructor(code: 'invalid-input' | 'failed', message: string);
}
/** Whether one call could change a file on disk. */
export declare function isGbkWrite(args: unknown): boolean;
/**
 * Register the GBK editing tool and its write gate.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonGbkTools(ctx: Context): () => void;
