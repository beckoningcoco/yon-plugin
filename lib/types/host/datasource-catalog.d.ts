/**
 * Turning the stored document into what the panel and the model read.
 *
 * The stored shape is the query script's own (`projects.<name>.<env>.{host,…}`),
 * which carries a password per login. This module is the one place that shape is
 * interpreted, and the interpretation is where the secrets stop: the value it
 * produces has no password member at all, so nothing downstream can leak one —
 * not the HTTP route, not a tool result, not a log line.
 *
 * Reading the presence of a secret is still useful, so {@link DataSourceView}
 * answers `hasPassword` instead of the secret, which is the whole fact the
 * surface needs to explain a connection before trying it.
 */
import type { DataSourceView } from '../shared/types.ts';
import type { StoredConfig, StoredConnection } from './datasource-store.ts';
/**
 * Database types the bundled query script ships a connector for.
 *
 * Anything else is listed but not probeable: the plugin reports "this type has
 * no connector" rather than pretending a failure to connect was a network
 * problem, which is what a bare error message would have said.
 */
export declare const PROBEABLE_TYPES: readonly string[];
/**
 * Every environment branch of one stored connection, in display order.
 * @param connection - the stored connection.
 * @returns the branch names.
 */
export declare function environmentNames(connection: StoredConnection): string[];
/** How a stored connection's binding resolves to a project, when the caller can. */
export type ProjectLookup = (projectId: string) => {
    readonly name: string;
} | undefined;
/**
 * Flatten the stored document into one view per connection and environment.
 * @param config - the stored document.
 * @param resolveProject - looks a bound project id up, or answers undefined.
 * @returns every connection this plugin can show, in display order.
 */
export declare function toViews(config: StoredConfig, resolveProject: ProjectLookup): DataSourceView[];
/**
 * Read one stored connection by its key.
 * @param config - the stored document.
 * @param configKey - the connection's key in the document.
 * @returns the stored connection, or undefined when there is none.
 */
export declare function connectionOf(config: StoredConfig, configKey: string): StoredConnection | undefined;
