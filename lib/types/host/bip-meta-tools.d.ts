/**
 * The flagship-edition metadata, exposed to the agent as two tools.
 *
 * ## Why these are separate tools and not a `product` argument
 *
 * `ncc_meta_find` and `bip_meta_find` read different data from different places — one a
 * built index over an installation's `.bmf` tree, the other the snapshots in this package
 * — and the one rule this whole plugin exists to enforce is that the two product lines
 * never mix: they share no table, entity or class name, and a model that crosses them
 * produces confident, wrong schema. A single tool with a `product` flag makes that
 * crossing a one-character mistake and makes the *default* one of the two lines. Two
 * tools make the choice explicit and visible in the tool list, which is where a model
 * decides what to reach for. `ncc_meta_find` names NCC in its first three words for the
 * same reason.
 *
 * ## The shape it keeps from its NCC sibling
 *
 * Same three kinds (`entity` / `field` / `enum`), same two-step rhythm — find names a
 * thing, detail describes it — and the same "no `home`, no path" rule: these snapshots
 * are shipped, so there is nothing for the caller to point at.
 *
 * ## What it cannot answer, said out loud
 *
 * An enumeration's values are not in the payloads; only the name of the enum a column
 * uses. `kind=enum` therefore reports which columns use it and says the value set is
 * absent, rather than printing an empty value list that reads as "this enum has no
 * values".
 */
import type { Context } from '@deepseek-ai/cordis';
import { type MemoryHintLine } from './memory-session.ts';
/** Every tool this module owns. */
export declare const BIP_META_TOOL_NAMES: readonly ["bip_meta_find", "bip_meta_detail"];
/**
 * Register the flagship-edition metadata tools.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonBipMetaTools(ctx: Context, hint?: MemoryHintLine): () => void;
