/**
 * The replay tools: prepare an offline classpath, run a captured call, compare runs.
 *
 * ## What this group is for
 *
 * `arthas_capture` put a live object on disk. These four tools are what make that
 * worth doing: change a business method, run it again against the same argument, and
 * read the diff — measured at about four seconds end to end, against restarting NCC
 * and re-driving the screen.
 *
 * ## Why they are four tools and not one
 *
 * Because the expensive part is separable from the repeated part. Preparing an
 * environment reads 5,481 classpath entries out of the JVM and builds a 59 KB jar;
 * that is worth doing once and reusing for every later run. A single
 * "replay this dump" tool would pay that cost per call, and the whole point of this
 * module is a short loop.
 *
 * ## Why the diff ignores the cost header
 *
 * Measured: two runs of the same dump differ in their `# cost=Nms` line and nowhere
 * else. Without that exclusion every diff would look like a change, and a tool that
 * always reports a difference is one nobody reads — which is the failure mode this
 * module exists to avoid.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonReplayService } from './replay-service.ts';
/** Every tool this module owns. */
export declare const REPLAY_TOOL_NAMES: readonly ["replay_prepare", "replay_run", "replay_diff", "replay_list"];
/**
 * Register the replay tools.
 *
 * The service arrives already built rather than being created here, because the
 * panel's HTTP routes read the same one: one list of environments and runs that both
 * halves see, the way the observation sessions are shared in `arthas-service.ts`.
 *
 * @param ctx - host context carrying the tool registry.
 * @param replay - the offline replay service.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonReplayTools(ctx: Context, replay: YonReplayService): () => void;
