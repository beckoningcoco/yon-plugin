import type { Context } from '@deepseek-ai/cordis';
import { type ArthasStore } from './arthas-store.ts';
import type { YonArthasService } from './arthas-service.ts';
/** Every tool this module owns. */
export declare const ARTHAS_TOOL_NAMES: readonly ["arthas_env_list", "arthas_env_add", "arthas_env_download", "arthas_targets", "arthas_attach", "arthas_exec", "arthas_sc", "arthas_watch_start", "arthas_events", "arthas_watch_stop", "arthas_capture", "arthas_catch", "arthas_trace"];
/**
 * The OGNL that keeps an exception scene: the throwable, and optionally the arguments that caused it.
 *
 * ## Why the file names are decided here, and not inside the JVM
 *
 * An earlier version let the JVM's clock name every file, on the reasoning that several failures
 * must not overwrite one another. It cost the caller the paths: measured, OGNL evaluates `{(a, b)}`
 * as an array of ONE element — the value of the sequence, which is its last term — so a leading
 * `"DUMP_OK "+#b` term is evaluated and then dropped, never reaching the event stream. The name is
 * therefore only inside the JVM when a run is long enough to need it:
 *
 *  - `count: 1` (the default) fixes the WHOLE name here, so the tool can state both paths before
 *    the watch ever fires.
 *  - a longer run fixes a unique PREFIX here and lets the JVM's clock finish it, so nothing
 *    overwrites anything; the paths are found by listing that prefix, which the tool also reports.
 *
 * Either way the expression returns the throwable, because that is what a person reads in the event
 * stream to find out what went wrong — a `DUMP_OK` line would say only that some file appeared.
 *
 * ## Why the throwable is written first
 *
 * OGNL has no try/catch, so a statement that throws ends the whole expression. The arguments are the
 * part that can realistically fail to serialise (the throwable itself almost never does), so writing
 * them second means a failure still leaves the exception on disk instead of nothing at all.
 *
 * @param input.dir - the directory to create first, forward-slash.
 * @param input.prefix - the sanitised, plugin-stamped head of each file name.
 * @param input.withArgs - whether to also write `params`, the shape `replay_run` replays.
 * @param input.uniqueNames - whether the JVM must add its clock to keep several hits apart.
 * @returns one OGNL expression, braces included, with no spaces in it.
 */
export declare function catchExpression(input: {
    readonly dir: string;
    readonly prefix: string;
    readonly withArgs: boolean;
    readonly uniqueNames: boolean;
}): string;
/**
 * Register the Arthas tools.
 *
 * The observation sessions are **not** here: they live in `arthas-service.ts`,
 * because the panel is a second reader of them and lives in the other half of the
 * plugin. What stays is everything only a tool call needs — argument validation,
 * the classloader-hash cache, the PID check, and the rendering.
 *
 * @param ctx - host context carrying the tool registry.
 * @param arthas - the sessions, the audit ledger, and the process scan.
 * @param store - where the operator's Arthas registrations live.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonArthasTools(ctx: Context, arthas: YonArthasService, store: ArthasStore): () => void;
