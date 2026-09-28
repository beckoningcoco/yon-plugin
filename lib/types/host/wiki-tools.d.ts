/**
 * The knowledge base, exposed to the agent as two tools.
 *
 * `wiki_lookup` answers "which page is this?", and takes any name the model
 * actually has: the entity URI from a line of code, a physical table name from an
 * error message, an English class name from a stack trace, or a Chinese display
 * name from a requirement. `wiki_read` then returns the page it named.
 *
 * Why tools at all, rather than a skill telling the model to grep a directory:
 * the vault lives at an absolute path that differs per machine, and a skill body
 * is inlined at build time, so it cannot name one. Hosting the lookup here also
 * means the answer arrives already parsed — the model gets a table name and a
 * verification date, not five thousand markdown files to search.
 *
 * Neither tool writes anything. The vault is read-only from this package's point
 * of view; what gets written into it is a later, separately gated concern.
 *
 * The tool registry's contract is declared in `tools.ts`, which this module
 * reuses rather than redeclaring.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonWikiService } from './wiki-service.ts';
/** Every tool this module owns. */
export declare const WIKI_TOOL_NAMES: readonly ["wiki_lookup", "wiki_read"];
/**
 * Register the knowledge base tools.
 * @param ctx - host context carrying the tool registry.
 * @param wiki - the service the tools read through.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonWikiTools(ctx: Context, wiki: YonWikiService): () => void;
