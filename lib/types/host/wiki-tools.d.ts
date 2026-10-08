/**
 * The knowledge base, exposed to the agent as four tools.
 *
 * `wiki_lookup` answers "which page is this?", and takes any name the model
 * actually has: the entity URI from a line of code, a physical table name from an
 * error message, an English class name from a stack trace, or a Chinese display
 * name from a requirement. `wiki_read` then returns the page it named.
 * `wiki_recent` says what the base has been told lately, and `wiki_gaps` says
 * what it cannot answer.
 *
 * Why tools at all, rather than a skill telling the model to grep a directory:
 * the vault lives at an absolute path that differs per machine, and a skill body
 * is inlined at build time, so it cannot name one. Hosting the lookup here also
 * means the answer arrives already parsed — the model gets a table name and a
 * verification date, not five thousand markdown files to search.
 *
 * Only `wiki_write` writes, and it is gated. The four tools here never do.
 *
 * The tool registry's contract is declared in `tools.ts`, which this module
 * reuses rather than redeclaring.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type YonWikiService } from './wiki-service.ts';
import { type MemoryHintLine } from './memory-session.ts';
/** Every tool this module owns. */
export declare const WIKI_TOOL_NAMES: readonly ["wiki_lookup", "wiki_read", "wiki_recent", "wiki_gaps"];
/**
 * Register the knowledge base tools.
 * @param ctx - host context carrying the tool registry.
 * @param wiki - the service the tools read through.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonWikiTools(ctx: Context, wiki: YonWikiService, hint?: MemoryHintLine): () => void;
