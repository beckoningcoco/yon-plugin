/**
 * Page tips: the momentary messages a page shows and then forgets.
 *
 * WHY THEY NEED COLLECTING AT ALL
 * A page that reports a business error through a toast reports it nowhere else — NCC's
 * front end puts "下列字段不能为空" and "请检查全文检索配置" in a toast and never in the
 * console. Two measured properties make "just look at the page afterwards" fail:
 * they fade within seconds, and they can arrive **seconds after** the operation that
 * caused them (measured: a save's validation at t=0, a full-text-search failure 9s later).
 *
 * HOW THIS SOLVES IT WITHOUT A SETUP STEP
 * The expression below both **installs** the observer and **drains** what it collected, so
 * there is no "remember to install first" step: any call runs it, it wires itself up, and it
 * hands back only what arrived since the previous call. The cursor lives in the page
 * (`window.__yonTips`) and therefore resets with the page, which is the right lifetime.
 *
 * WHY THE NODES AND NOT SOMETHING ELSE
 * The observer only watches `childList` on `body`, deliberately: that measured as free on a
 * real NCC page and it cannot deadlock against a framework's own re-rendering.
 *
 * WHAT IT IS NOT
 * This does not read the console or the network — that is the "why is this page blank"
 * question, a different one. Here the job is narrow: carry back what the page said.
 *
 * @module yon-panel/browser-tips
 */
/** One message a page showed while an operation ran. */
export interface PageTip {
    /** Milliseconds on the page's own clock, for ordering and for spotting a delayed tip. */
    readonly ms: number;
    /** What the message appears to be, read off the toast's own classes. */
    readonly level: 'info' | 'success' | 'warn' | 'error';
    /** The message itself, whitespace collapsed and the trailing 关闭 dropped. */
    readonly txt: string;
}
/**
 * The nodes worth watching.
 *
 * `.toast-content` is NCC's (measured on 1909); the rest are the common message widgets so a
 * non-NCC page is not silent. Kept narrow on purpose — a broad `[class*=message]` would turn
 * every list re-render into a "tip" and the feature would be switched off.
 */
export declare const TIPS_SELECTOR = ".toast-content,.ant-message-notice-content,.el-message__content";
/**
 * The in-page half, as source text.
 *
 * Written as a function expression so it can be stringified into `Runtime.evaluate`. It takes
 * the selector rather than closing over it, which keeps the whole thing testable in jsdom:
 * a spec can eval this text, append a node, and read the drained array.
 *
 * @param SEL - the selector for the message nodes.
 * @returns JSON array of tips that arrived since the previous call.
 */
export declare const TIPS_SCRIPT: string;
/**
 * The expression to run in the page: install on first use, then drain.
 * @param selector - the selector for the message nodes.
 * @returns one JavaScript expression whose value is a JSON array.
 */
export declare function tipsExpression(selector?: string): string;
/**
 * Read what the page sent back.
 *
 * Anything unexpected yields an empty list rather than an error: a malformed answer from a
 * page must never turn a successful click into a failed tool call.
 *
 * @param raw - the expression's value, expected to be a JSON array.
 * @returns the tips it carried, in arrival order.
 */
export declare function parseTips(raw: string): readonly PageTip[];
/**
 * Pull the tips an operation carried back, if any.
 *
 * Takes `unknown` on purpose: the tool layer reads this off whatever value a service call
 * returned, and threading `tips` through every result interface would be a dozen edits that
 * say nothing a reader needs. Absent means "the page said nothing", which is the norm.
 *
 * @param value - whatever an operation returned.
 * @returns the tips it carried, or an empty list.
 */
export declare function tipsOf(value: unknown): readonly PageTip[];
/**
 * Drain one page's tips through whatever evaluates expressions there.
 *
 * Never throws. Callers are operations the operator asked for; a page that answers with
 * nonsense, or a session that has already gone away, must not be able to fail them.
 *
 * @param evaluate - runs an expression in the page and returns its value as text.
 * @param selector - the selector for the message nodes.
 * @returns the tips that arrived since the previous drain, or an empty list.
 */
export declare function collectPageTips(evaluate: (expression: string) => Promise<string>, selector?: string): Promise<readonly PageTip[]>;
