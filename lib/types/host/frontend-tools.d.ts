/**
 * The registered front-end source projects, exposed to the agent as three tools.
 *
 * The question this answers is "where is the NCC front-end source for this
 * version, and what is in it" — which today the model can only ask the operator,
 * and then forgets at the end of the session. The three are deliberately shaped
 * like `ncc_home_*`, because they are the same kind of question asked about a
 * different directory: list what is registered, find a file, read it in its
 * actual encoding.
 *
 * ## Why the model gets an id and never a path
 *
 * Same argument as `home-tools.ts`, and the same consequence: a path is a thing
 * the model would guess from an earlier conversation, while an id is resolved
 * against the operator's own registrations. The `fe-` prefix on the id is the
 * one addition — it makes an id from `ncc_home_list` visibly the wrong argument
 * here, instead of silently pointing at an installation directory.
 *
 * ## Why none of the three is gated
 *
 * They write nothing. A gate on a read trains the operator to approve without
 * reading, which costs more than it protects.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonFrontendsService } from './frontend-service.ts';
/** Every tool this module owns, in registration order. */
export declare const FRONTEND_TOOL_NAMES: readonly ["ncc_fe_list", "ncc_fe_find", "ncc_fe_read", "ncc_fe_pages", "ncc_fe_grep"];
/**
 * Register the front-end source tools.
 * @param ctx - host context carrying the tool registry.
 * @param frontends - the service holding the operator's registrations.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonFrontendTools(ctx: Context, frontends: YonFrontendsService): () => void;
