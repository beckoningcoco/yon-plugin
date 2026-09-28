import { type DataSourceListPayload, type DataSourceProbeResult, type DataSourceView, type SaveDataSourceInput } from '../shared/types.ts';
import { type DataSourceRunner } from './datasource-probe.ts';
import type { DataSourceStore } from './datasource-store.ts';
import type { YonProjectsService } from './service.ts';
/** A failure the caller can act on; the HTTP layer maps it to a status code. */
export declare class DataSourceError extends Error {
    /** Machine code the API reports. */
    readonly code: 'not-found' | 'invalid-input';
    constructor(
    /** Machine code the API reports. */
    code: 'not-found' | 'invalid-input', message: string);
}
/** Where one run pointed, resolved from a composite key. */
export interface DataSourceTarget {
    readonly configKey: string;
    readonly env: string;
    readonly dbType: string;
}
/** How one statement ended, as the model reads it. */
export interface DataSourceQueryOutcome {
    readonly ok: boolean;
    readonly latencyMs: number;
    readonly configKey: string;
    readonly env: string;
    /** The script's report, banner stripped. */
    readonly output: string;
    readonly rowCount?: number;
    readonly error?: string;
}
/** The surface reachable in-process as `ctx.yonDataSources`. */
export interface YonDataSourcesService {
    /** Absolute path of the document this service reads and writes. */
    readonly path: string;
    /**
     * Every stored connection, one row per environment, with no secrets.
     * @returns the rows plus how the read went.
     */
    list(): Promise<DataSourceListPayload>;
    /**
     * Try one connection by running `SELECT 1` through the bundled script.
     * @param key - the connection's composite key (`<configKey>::<env>`).
     * @param user - a login to use; the first one is taken when this is absent.
     * @returns whether it answered, how long it took, and the script's text on failure.
     */
    probe(key: string, user?: string): Promise<DataSourceProbeResult>;
    /**
     * Run one statement against one connection.
     * @param key - the connection's composite key.
     * @param sql - the statement to run.
     * @param user - a login to use; the first one is taken when this is absent.
     * @returns the script's report, or why it failed.
     */
    query(key: string, sql: string, user?: string): Promise<DataSourceQueryOutcome>;
    /**
     * Create or replace one environment branch of one connection.
     * @param input - the connection group, the branch, and its details.
     * @returns the stored row.
     */
    save(input: SaveDataSourceInput): Promise<DataSourceView>;
    /**
     * Remove one environment branch; the connection group goes with its last branch.
     * @param key - the connection's composite key.
     */
    remove(key: string): Promise<void>;
    /**
     * Bind or unbind one connection group to a project.
     *
     * The binding is a property of the connection, not of one environment: every
     * environment of `天九(NCC2312)` belongs to the same project, and asking the
     * operator to repeat that per branch would only invite the two to disagree.
     * @param key - any composite key of the connection group.
     * @param projectId - the project to bind, or undefined to unbind.
     */
    bind(key: string, projectId: string | undefined): Promise<void>;
}
/** The service plus the plugin-owned teardown. */
export interface YonDataSourcesHandle {
    readonly service: YonDataSourcesService;
    dispose(): void;
}
/**
 * Build the service over the store, the project store and the runner.
 * @param store - the document store.
 * @param projects - the project store, read for a binding's display name.
 * @param runner - the statement runner.
 * @returns the service and its disposer.
 */
export declare function createYonDataSourcesService(store: DataSourceStore, projects: YonProjectsService, runner: DataSourceRunner): YonDataSourcesHandle;
