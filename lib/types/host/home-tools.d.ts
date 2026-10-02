/**
 * The registered Home directories, exposed to the agent as three tools.
 *
 * The question this answers is "where is the installation, and what is in it" —
 * which today the model can only ask the operator, and then forgets at the end of
 * the session. `ncc_home_list` is that answer, made durable: the operator
 * registered a Home once, and afterwards the model looks it up instead of asking.
 * The other two make the answer usable: find a file, then read it in its actual
 * encoding.
 *
 * ## Why the model gets an id and never a path
 *
 * `ncc_home_find` and `ncc_home_read` take an `id` that `ncc_home_list` returned,
 * exactly as `datasource_query` takes a connection key rather than a connection
 * string. Two reasons, and the second is the one that matters:
 *
 * - A path is a thing the model would guess. It has seen `E:/NCProject/.../home`
 *   in a conversation before and will offer it again for a different installation.
 * - The id is resolved against the operator's own registrations, so a path that
 *   nobody registered cannot be read at all — a prompt-injected "read
 *   C:/Users/.../.ssh/id_rsa" has no id to name.
 *
 * ## Why none of the three is gated
 *
 * They write nothing. `class-tools.ts` makes the same argument for the same
 * reason: a gate on a read trains the operator to approve without reading, which
 * costs more than it protects.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonHomesService } from './home-service.ts';
/** Every tool this module owns. */
export declare const HOME_TOOL_NAMES: readonly ["ncc_home_list", "ncc_home_find", "ncc_home_read"];
/**
 * Register the Home tools.
 * @param ctx - host context carrying the tool registry.
 * @param homes - the service holding the operator's registrations.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonHomeTools(ctx: Context, homes: YonHomesService): () => void;
