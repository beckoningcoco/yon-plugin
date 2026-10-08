/**
 * The data sources and their statements, exposed to the agent as tools.
 *
 * Why tools and not a skill telling the model to run a script: the plugin's
 * installation path differs on every machine, and a skill body is inlined at
 * build time, so it cannot name one. Hosting the call here means the model never
 * learns a path, a connection string, or a password — it names a connection and a
 * statement, and the plugin resolves everything else.
 *
 * The split between the two tools follows the one the operator can see:
 *
 * - `datasource_list` answers "what is there" and reads nothing secret. No gate.
 * - `datasource_query` runs whatever statement it is given, which is why it is
 *   gated: a statement that could change data stops for the operator's approval,
 *   and a read-only session refuses it outright. The rule is the script's own
 *   keyword list, so the plugin and the script agree on what "destructive" means
 *   instead of drifting apart.
 *
 * The tool registry's contract is declared in `tools.ts`, which this module
 * reuses rather than redeclaring.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonDataSourcesService } from './datasource-service.ts';
import { type MemoryHintLine } from './memory-session.ts';
/** Every tool this module owns. */
export declare const DATASOURCE_TOOL_NAMES: readonly ["datasource_list", "datasource_query"];
/**
 * Whether one statement could change data.
 * @param sql - the statement a call wants to run.
 * @returns true when it carries a keyword that can write.
 */
export declare function isDestructiveSql(sql: unknown): boolean;
/**
 * Register the datasource tools and their write gate.
 * @param ctx - host context carrying the tool registry.
 * @param sources - the service the tools read and run against.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonDataSourceTools(ctx: Context, sources: YonDataSourcesService, hint?: MemoryHintLine): () => void;
