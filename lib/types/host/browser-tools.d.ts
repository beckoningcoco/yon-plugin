/**
 * The debugging browser, as tools the model can call.
 *
 * WHY TOOLS AT ALL
 * The same argument `tools.ts` opens with: the model that reads "把后台里这个单子提交了"
 * is the one the operator is already talking to, and the agent loop already owns prompting,
 * credentials, retries and the transcript. Handing it tools means this package carries no
 * model client, and the operator keeps one place where the work is visible.
 *
 * WHAT IS DIFFERENT HERE
 * Every other store in this package belongs to us: a document we own, and a write is ours
 * to make. A browser does not. It is the operator's, it is already signed in, and the tab
 * in front of them is the one they care about — which is precisely why driving *their*
 * browser beats opening a private one. So these tools are deliberately lopsided: nearly
 * all of them read or act inside a page, and the single destructive verb is narrow enough
 * to be safe by construction rather than by asking.
 *
 * TWO WAYS TO ACT, AND WHEN EACH IS RIGHT
 * `browser_eval` can do anything the named verbs cannot — but it is a blunt instrument: the
 * page sees a script run, not a person interacting. `browser_click`, `browser_set_value`,
 * `browser_type` and `browser_key` dispatch real input through CDP, so a page that watches
 * mousedown, keystrokes or focus behaves exactly as it does for a person and the
 * framework's own state stays in step. Reach for the verbs first; let `browser_eval` be the
 * escape hatch for what they do not cover.
 *
 * THE BORROWED PAGE
 * `browser_attach` is the entry point, not a formality. Attaching creates nothing and
 * closes nothing: it resolves a page the operator opened, confirms it is still there, and
 * hands back the handle every other tool takes. Their tab keeps its login, its scroll
 * position and its place in their window, and no tool here can end it — `browser_close`
 * refuses anything this process did not create, and says why.
 *
 * `browser_eval` IS NOT BEHIND THE PRE-EXECUTE GATE
 * It runs arbitrary JavaScript in a page the operator is signed into. It is left ungated on
 * purpose: a task that has to approve every read is a task nobody runs, and the limits that
 * hold are structural rather than per-call (nothing here writes to our own documents, and
 * nothing can close a page that is not ours). An operator who wants a gate can add
 * `browser_eval` to a `tools/pre-execute` listener — the tool name is stable for that.
 *
 * @module yon-panel/browser-tools
 */
import type { Context } from '@deepseek-ai/cordis';
import { type CdpEvalResult, type CdpPageListing, type CdpPageView, type CdpReadResult, type YonBrowserCdpService } from './browser-cdp-service.ts';
/**
 * Register the debugging browser tools.
 * @param ctx - host context carrying the tool registry.
 * @param cdp - the service over the panel's running browsers.
 * @returns the disposer that withdraws every registration.
 */
export declare function registerYonBrowserTools(ctx: Context, cdp: YonBrowserCdpService): () => void;
/**
 * Every tool this module registers, **in the order it registers them**.
 *
 * That order is what `host-plugin.spec.ts` holds every family to (`toEqual` against
 * the list of calls the registry saw), and this list was written from the "order a
 * caller should reach for them" instead — leaving the two out of step for as long
 * as the family existed, invisible because the spec's own list did not name these
 * tools yet. The registration order is the truth; this now states it.
 */
export declare const YON_BROWSER_TOOL_NAMES: readonly ["browser_targets", "browser_attach", "browser_open", "browser_read", "browser_eval", "browser_close", "browser_click", "browser_set_value", "browser_type", "browser_key", "browser_scroll", "browser_screenshot", "browser_snapshot", "browser_get_value", "browser_wait", "browser_back", "browser_forward", "browser_refresh", "browser_select", "browser_fill", "browser_scrape", "browser_messages"];
/** Re-exported so the module's public surface names what it registers. */
export type { CdpEvalResult, CdpPageListing, CdpPageView, CdpReadResult };
