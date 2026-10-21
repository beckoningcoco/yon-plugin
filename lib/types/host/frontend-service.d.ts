import { type ReadOptions } from './home-files.ts';
import { type GrepQuery } from './frontend-grep.ts';
import type { FrontendStore } from './frontend-store.ts';
import { type FrontendDirPayload, type FrontendFindPayload, type FrontendGrepPayload, type FrontendListPayload, type FrontendPagesPayload, type FrontendPageStatusView, type FrontendReadPayload, type FrontendView, type SaveFrontendInput } from '../shared/types.ts';
/** What a caller may ask `find` for; `limit` is clamped by the file layer. */
export interface FrontendFindQuery {
    readonly name?: string;
    readonly ext?: string;
    readonly under?: string;
    readonly limit?: number;
}
/** What a caller may ask `pages` for. Every filter is a case-insensitive substring. */
export interface FrontendPageQuery {
    readonly domain?: string;
    readonly module?: string;
    readonly node?: string;
    /** Matched against `领域/模块/节点`. */
    readonly term?: string;
    /** How many nodes to return; defaults to 100, capped at 500. */
    readonly limit?: number;
}
/**
 * The directories a search never descends into.
 *
 * Kept here rather than in the tool, because the panel's own file browsing has to
 * skip the same ones — a second list would eventually disagree with this one
 * about what counts as source.
 */
export declare const FRONTEND_SKIP_DIRS: readonly string[];
/** The registered projects, as the host and the tools use them. */
export interface YonFrontendsService {
    /** The document the registrations live in, for the panel to name. */
    readonly storePath: string;
    list(): Promise<FrontendListPayload>;
    save(input: SaveFrontendInput, id?: string): Promise<FrontendView>;
    remove(id: string): Promise<void>;
    setDefault(id: string): Promise<FrontendView>;
    probe(id: string): Promise<FrontendView>;
    find(id: string, query: FrontendFindQuery): Promise<FrontendFindPayload>;
    read(id: string, requested: string, options: ReadOptions): Promise<FrontendReadPayload>;
    /** Search the project's text files for a literal string or a regular expression. */
    grep(id: string, query: GrepQuery): Promise<FrontendGrepPayload>;
    /**
     * The project's page nodes, from the stored index — built on first ask.
     *
     * Lazy rather than on save: the index costs a walk of the whole project, and a
     * registration that is only being looked at should not pay for it. The answer
     * says when it was built, so a stale one is visible.
     */
    pages(id: string, query?: FrontendPageQuery): Promise<FrontendPagesPayload>;
    /** What is stored, or undefined when nothing is. */
    pageStatus(id: string): Promise<FrontendPageStatusView | undefined>;
    /** Walk the project again and replace the index. */
    rebuildPages(id: string): Promise<FrontendPageStatusView>;
    /** Drop the index; the next `pages` call rebuilds it. */
    removePages(id: string): Promise<boolean>;
    /** One directory level, for the panel's page tree. */
    dir(id: string, requested: string): Promise<FrontendDirPayload>;
    /** The version to fall back on when a caller names none. */
    defaultVersion(): Promise<string | undefined>;
}
/** The service and the disposer that drops its state. */
export interface YonFrontendsHandle {
    readonly service: YonFrontendsService;
    dispose(): void;
}
/** One failure a front-end call reports. */
export declare class FrontendError extends Error {
    readonly code: 'not-found' | 'invalid-input';
    constructor(code: 'not-found' | 'invalid-input', message: string);
}
/**
 * Open the service over a store.
 * @param store - the registration document.
 * @param indexDir - where page-index documents live; defaults to the operator's
 *   own directory. The seam exists so a test can exercise the lazy build without
 *   writing into the machine that runs it.
 * @returns the service and its disposer.
 */
export declare function createYonFrontendsService(store: FrontendStore, indexDir?: string): YonFrontendsHandle;
