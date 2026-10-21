import type { FrontendDomainView } from '../shared/types.ts';
/**
 * The fourth-level directory names that are page builds.
 *
 * Shared with the probe so the two cannot disagree about what a page is. A page
 * kind that ships later is the one thing this rule cannot see; the index says
 * which kinds it found instead of pretending the total is all of them.
 */
export declare const PAGE_KINDS: ReadonlySet<string>;
/** One page build of a node. */
export interface FrontendPageEntry {
    /** `list`, `card`, `main`… */
    readonly kind: string;
    /** Project-relative path of the entry file. */
    readonly rel: string;
    readonly bytes: number;
}
/** One page node: the unit a person calls "一个页面 / 一个功能". */
export interface FrontendPageNode {
    readonly domain: string;
    readonly module: string;
    readonly node: string;
    /** Project-relative directory of the node, e.g. `src/cmp/bank/bankcontrast_tzwy`. */
    readonly dir: string;
    readonly entries: readonly FrontendPageEntry[];
    /** Files anywhere under the node directory, the entry files included. */
    readonly files: number;
    readonly bytes: number;
}
/** What one walk of the project found. */
export interface ProjectScan {
    readonly files: number;
    readonly bytes: number;
    /** Nodes that have at least one page entry. */
    readonly nodes: number;
    readonly pages: number;
    readonly pageTypes: readonly string[];
    readonly domains: readonly FrontendDomainView[];
    readonly pageNodes: readonly FrontendPageNode[];
    readonly capped: boolean;
}
/** One directory entry, for the panel's file list. */
export interface FrontendDirEntry {
    readonly name: string;
    readonly rel: string;
    readonly directory: boolean;
    readonly bytes: number;
}
/** The stored page index. */
export interface FrontendPageIndex {
    /** Display version the index was built for. */
    readonly version: string;
    /** The registration path it describes, so a moved registration invalidates it. */
    readonly root: string;
    readonly builtAt: string;
    readonly nodes: readonly FrontendPageNode[];
}
/** Where the index documents live. */
export declare function frontendIndexDir(): string;
/**
 * One registration's index document.
 * @param id - the registration id (`fe-ncc-1909`).
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 * @returns the absolute path.
 */
export declare function frontendIndexPath(id: string, dir?: string): string;
/**
 * Walk a project and collect its page nodes.
 *
 * @param root - the project root, as registered.
 * @returns file and size totals, the page nodes, and the per-domain breakdown.
 */
export declare function scanProject(root: string): Promise<ProjectScan>;
/** One read of a stored index. */
export interface FrontendIndexRead {
    readonly path: string;
    readonly index?: FrontendPageIndex;
    /** True when the document exists but describes another root. */
    readonly stale: boolean;
    /** Set when the document exists but could not be parsed. */
    readonly error?: string;
}
/**
 * Read one registration's page index.
 * @param id - the registration id.
 * @param root - the registration's current path, to detect a moved one.
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 * @returns the index, or why there is none.
 */
export declare function readPageIndex(id: string, root: string, dir?: string): Promise<FrontendIndexRead>;
/**
 * Write one registration's page index.
 * @param id - the registration id.
 * @param index - the document.
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 */
export declare function writePageIndex(id: string, index: FrontendPageIndex, dir?: string): Promise<void>;
/**
 * Drop one registration's page index.
 * @param id - the registration id.
 * @param dir - where the documents live; defaults to {@link frontendIndexDir}.
 * @returns whether a document was there.
 */
export declare function removePageIndex(id: string, dir?: string): Promise<boolean>;
