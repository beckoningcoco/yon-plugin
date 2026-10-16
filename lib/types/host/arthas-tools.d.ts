import type { Context } from '@deepseek-ai/cordis';
import { type ArthasStore } from './arthas-store.ts';
import type { YonArthasService } from './arthas-service.ts';
/** Every tool this module owns. */
export declare const ARTHAS_TOOL_NAMES: readonly ["arthas_env_list", "arthas_env_add", "arthas_env_download", "arthas_targets", "arthas_attach", "arthas_exec", "arthas_sc", "arthas_watch_start", "arthas_events", "arthas_watch_stop", "arthas_capture", "arthas_catch", "arthas_trace"];
/**
 * 命中之后才写侧车——没有 dump 就什么都不留。
 *
 * 侧车（`<dump>.json`）是面板与 `replay_run` 用来「一键重放」的元数据。它原来在启动 watch
 * **之前**就写下去，而 `.ser` 是 JVM 里的 Arthas 在命中那一刻才写的：挂载失败（例如
 * `java.*` 挂不上）或始终没命中的观测，于是在目录里留下一个永远配不上对的 json。
 * `arthas_catch` 的多命中分支早就为此不写侧车（「a sidecar that can never be paired with one
 * is just litter」），这里补上的是另一半：单命中与 `arthas_capture` 也不该在命中前写。
 *
 * 等 `settled` 而不是等命中本身：成功、失败、被停止都会走到它，而下一步的「dump 真的在吗」
 * 是更准的判据。
 *
 * @param dump - 那个 `.ser` 的完整路径；侧车就是它加 `.json`。
 * @param sidecar - 侧车的内容。
 * @param settled - 观测结束的信号，来自 `startWatch` 的句柄。
 */
export declare function writeSidecarAfterDump(dump: string, sidecar: Record<string, unknown>, settled: Promise<void>): Promise<void>;
/**
 * 清掉配不上对的侧车——`writeSidecarAfterDump` 之前的版本留下的那些。
 *
 * 只删「名字正好是某个 `.ser` 加 `.json`、搭档不在、而且足够老」的文件：最小年龄是必需的，
 * 理由见 {@link ORPHAN_SIDECAR_MIN_AGE_MS}。读不到、判不了、删不掉一律放过——清理失败不是错误，
 * 而这个函数跑在每次观测开始的时候，它不该有任何让工具失败的机会。
 *
 * @param dir - 一个观测落盘目录（`dump/` 或 `catch/`）。
 * @param minAgeMs - 覆盖最小年龄，测试用；默认一天。
 */
export declare function sweepOrphanSidecars(dir: string, minAgeMs?: number): Promise<void>;
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
