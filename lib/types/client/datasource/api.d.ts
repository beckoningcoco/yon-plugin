import { type DataSourceListPayload, type DataSourceProbeResult, type DataSourceView, type SaveDataSourceInput } from '../../shared/types.ts';
export { ApiError as DataSourceApiError } from '../request.ts';
/** The datasource operations the UI drives. */
export interface DataSourceApi {
    /**
     * Every registered connection, one row per environment, without any secret.
     * @returns the rows plus where they were read from.
     */
    listDataSources(): Promise<DataSourceListPayload>;
    /**
     * Create or replace one environment branch.
     * @param input - the group, the branch, and its details.
     * @returns the stored row.
     */
    saveDataSource(input: SaveDataSourceInput): Promise<DataSourceView>;
    /**
     * Remove one environment branch; the group goes with its last branch.
     * @param key - the row's composite key.
     */
    removeDataSource(key: string): Promise<void>;
    /**
     * Run `SELECT 1` against one connection.
     * @param key - the row's composite key.
     * @param user - a login to use; the first one is taken when this is absent.
     * @returns whether it answered, how long it took, and why not when it did not.
     */
    probeDataSource(key: string, user?: string): Promise<DataSourceProbeResult>;
    /**
     * Bind one connection group to a project, or unbind it.
     * @param key - any composite key of the group.
     * @param projectId - the project to bind; an empty string unbinds.
     */
    bindDataSource(key: string, projectId: string): Promise<void>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createDataSourceApi(): DataSourceApi;
