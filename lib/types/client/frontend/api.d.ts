import type { DirectoryPickResult, FrontendDirPayload, FrontendListPayload, FrontendPagesPayload, FrontendPageStatusView, FrontendReadPayload, FrontendView, SaveFrontendInput } from '../../shared/types.ts';
export { ApiError as FrontendApiError } from '../request.ts';
/** The front-end source operations the UI drives. */
export interface FrontendApi {
    /**
     * Every registered project, with its last probe.
     * @returns the rows plus where they were read from.
     */
    listFrontends(): Promise<FrontendListPayload>;
    /**
     * Register a project, or edit one already registered.
     * @param id - the registration to edit; absent to create.
     * @param input - the path and version.
     * @returns the stored row, probed.
     */
    saveFrontend(id: string | undefined, input: SaveFrontendInput): Promise<FrontendView>;
    /**
     * Drop one registration.
     * @param id - the registration to remove.
     */
    removeFrontend(id: string): Promise<void>;
    /**
     * Read the directory again and store what is there now.
     * @param id - the registration to re-probe.
     * @returns the stored row with its fresh profile.
     */
    probeFrontend(id: string): Promise<FrontendView>;
    /**
     * Make this the project a bare version refers to.
     * @param id - the registration to promote.
     * @returns the stored row.
     */
    setDefaultFrontend(id: string): Promise<FrontendView>;
    /**
     * Ask the host to open its own folder chooser.
     *
     * Here rather than in the component because the browser half cannot produce an
     * absolute path — see `handlePickDirectory` in the host.
     * @returns the host's kind, and the chosen path when it has one to give.
     */
    pickPath(): Promise<DirectoryPickResult>;
    /**
     * The project's page nodes. Builds the index on first ask.
     * @param id - the registration.
     * @returns the nodes, the totals and when the index was built.
     */
    pages(id: string): Promise<FrontendPagesPayload>;
    /**
     * What the stored page index says, without building one.
     * @param id - the registration.
     * @returns the status, or undefined when nothing is stored.
     */
    pageStatus(id: string): Promise<FrontendPageStatusView | undefined>;
    /**
     * Walk the project again and replace the index.
     * @param id - the registration.
     * @returns the fresh status.
     */
    rebuildPages(id: string): Promise<FrontendPageStatusView>;
    /**
     * One directory level, for the tree.
     * @param id - the registration.
     * @param path - the directory, relative to the project.
     * @returns the entries.
     */
    listDir(id: string, path: string): Promise<FrontendDirPayload>;
    /**
     * Read a file's text for the preview.
     * @param id - the registration.
     * @param path - the file, relative to the project.
     * @param from - the first line, 1-based.
     * @param to - the last line, 1-based.
     * @returns the decoded text and its encoding.
     */
    readFile(id: string, path: string, from: number, to: number): Promise<FrontendReadPayload>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createFrontendApi(): FrontendApi;
