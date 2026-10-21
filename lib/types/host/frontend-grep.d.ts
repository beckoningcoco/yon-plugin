import type { FrontendGrepHit } from '../shared/types.ts';
/** What a caller may ask `grep` for. */
export interface GrepQuery {
    /** Literal text, or a regular expression when `regex` is set. */
    readonly pattern: string;
    /** One extension, with or without the dot. Every text extension when omitted. */
    readonly ext?: string;
    /** A directory to search inside; `src` when omitted. */
    readonly under?: string;
    readonly regex?: boolean;
    /** Total hits to return; defaults to 40, capped at 200. */
    readonly limit?: number;
    /** Wall-clock budget; defaults to 8 s. */
    readonly timeoutMs?: number;
}
/** What one search found, before the caller names the registration. */
export interface GrepResult {
    readonly matches: readonly FrontendGrepHit[];
    /** Files actually read. */
    readonly filesScanned: number;
    /** Files that contributed at least one hit. */
    readonly filesMatched: number;
    /** True when a hit cap or the walk cap stopped the search. */
    readonly capped: boolean;
    readonly timedOut: boolean;
    readonly skipped: readonly string[];
}
/**
 * Search one project's text files.
 *
 * @param root - the registered project root.
 * @param query - what to look for and how far to go.
 * @returns the hits, and what bounded them.
 * @throws FrontendError when the pattern or the directory is unusable.
 */
export declare function grepProject(root: string, query: GrepQuery): Promise<GrepResult>;
