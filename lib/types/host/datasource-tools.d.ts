/**
 * The data sources, their statements and their one write, exposed to the agent as
 * tools.
 *
 * Why tools and not a skill telling the model to run a script: the plugin's
 * installation path differs on every machine, and a skill body is inlined at
 * build time, so it cannot name one. Hosting the call here means the model never
 * learns a path, a connection string, or a password — it names a connection and a
 * statement, and the plugin resolves everything else.
 *
 * The split between the three tools follows the one the operator can see:
 *
 * - `datasource_list` answers "what is there" and reads nothing secret. No gate.
 * - `datasource_upsert` registers or patches one environment branch. It is gated
 *   like a destructive write, and a secret only ever travels inward: it is written
 *   to the operator's document and appears in no answer, no preview and no log.
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
import { type YonProjectsService } from './service.ts';
import { type MemoryHintLine } from './memory-session.ts';
/** Every tool this module owns. */
export declare const DATASOURCE_TOOL_NAMES: readonly ["datasource_list", "datasource_upsert", "datasource_query"];
/**
 * Whether one statement is anything other than provably a read.
 *
 * "Provably" carries the meaning: true is the answer whenever this cannot show
 * the statement is a read, so an unparseable or comment-only statement counts as
 * a write and a person decides. The gate checks the arguments before calling
 * this, so an empty string is refused for honesty rather than to raise a prompt.
 * @param sql - the statement a call wants to run.
 * @returns true when the statement must not run without an approval.
 */
export declare function isDestructiveSql(sql: unknown): boolean;
/**
 * What one write would do, as the approval card reads it.
 *
 * Exported so the gate and the tests read the same sentence. Two rules hold here:
 * the preview is derived from the same plan the call itself runs, so what the
 * operator approves is what gets written, and **no secret is ever rendered** — a
 * password is reported as "will be written", never as a value.
 * @param sources - the connection service, read for the current values.
 * @param projects - the project store, for resolving a binding by name.
 * @param args - the raw tool arguments.
 * @returns the preview, or undefined when the arguments are unusable (the tool
 *   itself reports that, and asking about a call that cannot run is noise).
 */
export declare function previewUpsert(sources: YonDataSourcesService, projects: YonProjectsService, args: unknown): Promise<string | undefined>;
/**
 * Register the datasource tools and their write gate.
 * @param ctx - host context carrying the tool registry.
 * @param sources - the service the tools read, run against and write through.
 * @param projects - the project store, so a binding can be given by name.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonDataSourceTools(ctx: Context, sources: YonDataSourcesService, projects: YonProjectsService, hint?: MemoryHintLine): () => void;
