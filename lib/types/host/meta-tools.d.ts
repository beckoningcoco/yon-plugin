/**
 * The metadata index, exposed to the agent as two tools.
 *
 * The question these answer is "what does this installation call things, and where" —
 * which entity a Chinese label names, what table backs it, which entities carry a given
 * column, what a status code means. Today that is a data dictionary someone keeps open
 * in another window, or a `ncc_home_find` for `.bmf` files followed by reading 244 MB of
 * XML one entity at a time.
 *
 * ## Why two tools and not one
 *
 * Because the two halves have different costs and different answers. `ncc_meta_find`
 * reads a prepared index and returns names, tables and defining files — twenty hits for
 * a millisecond. `ncc_meta_detail` opens the one file a hit names and returns that
 * entity's field list with types, lengths and the value set of every enumerated column —
 * so it is the second call, made once the caller knows which entity they mean. A single
 * tool returning details for every hit would read a dozen files to answer a question
 * about one.
 *
 * ## Why neither is gated
 *
 * Neither writes anything. `home-tools.ts` and `class-tools.ts` both argue the same
 * point: a gate on a read trains the operator to approve without reading, which costs
 * more than it protects.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { YonMetaService } from './meta-service.ts';
/** Every tool this module owns. */
export declare const META_TOOL_NAMES: readonly ["ncc_meta_find", "ncc_meta_detail"];
/**
 * Register the metadata tools.
 * @param ctx - host context carrying the tool registry.
 * @param meta - the service over the built indexes.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonMetaTools(ctx: Context, meta: YonMetaService): () => void;
