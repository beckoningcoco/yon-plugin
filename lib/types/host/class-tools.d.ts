/**
 * The class index, exposed to the agent as two tools: build one, then look in it.
 *
 * The pair exists for one question — "which jar holds this class" — which is the
 * precondition for reading a platform implementation when the documentation runs
 * out. A stack trace gives a fully-qualified name; a search returns the jar; the
 * jar is then a `cfr` invocation away from being readable.
 *
 * ## Why building is a tool of its own
 *
 * Building walks an entire installation. It is slow — measured at 26.2 s on the
 * reference Home — it is deliberate, and it is done once per version rather than per
 * question. So it is a call the operator asks for, not something a search does behind
 * their back when it finds no index: a search over a missing index says which versions
 * *are* indexed instead.
 *
 * ## Why the build names a Home and not a path
 *
 * `knowledge_build_index` takes the id `ncc_home_list` returned, the same as every
 * other call that reaches an installation. It used to take a raw path, and that is
 * exactly how two indexes came to exist for `C:\Users\...\Documents` — a path the
 * model offered, a build that obeyed, and an index stored under a version label that
 * nothing else on the machine recognised. A path the operator registered cannot be
 * that, and the version comes from the registration rather than from the caller, so
 * the label under which an index is stored is decided once, by the person who owns
 * the installation.
 *
 * ## Why neither tool is gated
 *
 * They write nothing of the operator's: an index lands under the plugin's own data
 * directory, and a search only reads it. Gating them would train the operator to
 * approve without reading, which is the one habit a gate cannot afford.
 */
import type { Context } from '@deepseek-ai/cordis';
import { listClassIndexes } from './class-index.ts';
import type { YonClassService } from './class-service.ts';
/** Every tool this module owns. */
export declare const CLASS_TOOL_NAMES: readonly ["knowledge_build_index", "ncc_class_search"];
/** What a call can fail with. */
export declare class ClassIndexError extends Error {
    readonly code: 'invalid-input' | 'not-found' | 'failed';
    constructor(code: 'invalid-input' | 'not-found' | 'failed', message: string);
}
/** A byte count the model can read. */
declare function mb(bytes: number): string;
/**
 * Register the class index tools.
 * @param ctx - host context carrying the tool registry.
 * @param classes - the service that builds and reports on indexes. It is where the
 *   version label comes from: the caller names a Home, and the registration says
 *   which version that Home is.
 * @param defaultVersion - the version of the Home the operator marked as default,
 *   consulted when a search names no version. This is the one place a registration
 *   changes what an existing tool does: without it, "which index did you mean"
 *   falls back to "the one built most recently", which is a property of the last
 *   build rather than of the installation the operator is working on.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonClassTools(ctx: Context, classes: YonClassService, defaultVersion?: () => Promise<string | undefined>): () => void;
/** The indexes currently stored, for a surface that reports on them. */
export { listClassIndexes, mb };
