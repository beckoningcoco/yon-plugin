/**
 * What our tools may do to a browser the panel started.
 *
 * WHY THIS IS NOT PART OF `browser-service.ts`
 * That service owns a browser's *life*: scanning for installations, launching one
 * detached, ending it by name. This one owns only the conversation with a browser that
 * is already running, and it ends nothing. Keeping them apart is what lets a tool call
 * be a client of the panel's own configuration rather than a second, weaker copy of it.
 *
 * WHY EVERY CALL RECONNECTS
 * A CDP session lives and dies with its socket: `Target.attachToTarget` on one
 * connection means nothing to the next one. A long-lived socket would mean answering
 * "is it still there" out of a cache, while the browser can be closed by a person at any
 * moment — the stale-socket failure that reads as "the page is gone" when the truth is
 * "you closed the browser". Probing, acting and closing per call costs a few
 * milliseconds on loopback and cannot go stale.
 *
 * WHOSE PAGE IS IT
 * Two orthogonal questions, and conflating them is the easy mistake:
 *   - *May we act on it?* Anything in the target list — including the page the operator
 *     opened and logged into themselves. That is the whole point of driving their
 *     browser instead of a private one.
 *   - *May we close it?* Only what this process created. A page we borrowed is
 *     detached, never closed: ending somebody's logged-in tab because a task finished
 *     would be the most annoying possible bug.
 * So `open` records the target it made, in memory, and `close` refuses anything not in
 * that set. Memory rather than a document on purpose: it describes *this process's*
 * behaviour, and after a restart there is nothing left that could legitimately claim to
 * have created a tab that is still open.
 *
 * CHROMIUM ONLY
 * `types.ts` states why a family is a column rather than a label: Firefox's
 * `-start-debugger-server` speaks a different protocol with no HTTP endpoint at all.
 * This layer therefore refuses a Firefox run by name instead of timing out against it.
 *
 * @module yon-panel/browser-cdp-service
 */
import type { BrowserRunView } from '../shared/types.ts';
import type { YonBrowsersService } from './browser-service.ts';
import { type CaptureOptions, type ElementTarget, type FillOutcome, type PageElement, type ScrapeField, type SelectMatch } from './browser-interact.ts';
import { type PageTip } from './browser-tips.ts';
/** Why a browser operation could not be carried out. */
export type BrowserCdpErrorCode = 
/** A tool argument was missing or not the shape it has to be. */
'invalid-input'
/** The panel has no live instance to talk to. */
 | 'no-browser'
/** More than one live instance, and the call did not say which. */
 | 'ambiguous'
/** No such run, or no such page. */
 | 'not-found'
/** The chosen run is a Firefox, whose debugging protocol is not CDP. */
 | 'not-chromium'
/** The page exists but this process did not create it, so it will not be closed. */
 | 'not-ours'
/** The port answered something that is not the browser we recorded. */
 | 'impersonated'
/** Nothing answered, or the socket died. */
 | 'unreachable'
/** The browser took too long. */
 | 'timeout'
/** The browser rejected a command. */
 | 'protocol';
/** One refusal, with a code the tool layer renders as prose. */
export declare class BrowserCdpError extends Error {
    readonly code: BrowserCdpErrorCode;
    constructor(code: BrowserCdpErrorCode, message: string);
}
/** One page, as the model reads it. */
export interface CdpPageView {
    readonly targetId: string;
    /** Position in the listing this call produced. Re-resolved on every call. */
    readonly index: number;
    readonly title: string;
    readonly url: string;
    /** True when this process created the page, and may therefore close it. */
    readonly ours: boolean;
}
/** The pages of one run. */
export interface CdpPageListing {
    readonly run: BrowserRunView;
    readonly pages: readonly CdpPageView[];
}
/** What one read returned. */
export interface CdpReadResult {
    readonly page: CdpPageView;
    readonly format: 'text' | 'html';
    readonly text: string;
    readonly chars: number;
    readonly truncated: boolean;
}
/** What one evaluation returned. */
export interface CdpEvalResult {
    readonly page: CdpPageView;
    readonly value: string;
    readonly chars: number;
    readonly truncated: boolean;
}
/** How a call names the page it wants. */
export interface PageRef {
    /** Position from the last listing, a target id, or a piece of the title/url. */
    readonly page: string;
    /** A run id, a browser id, or part of a label. Omitted when only one is live. */
    readonly run?: string;
}
/** What one click did. */
export interface CdpClickResult {
    readonly page: CdpPageView;
    readonly tag: string;
    readonly text: string;
}
/** What one value write produced, so the caller can confirm rather than assume. */
export interface CdpSetValueResult {
    readonly page: CdpPageView;
    readonly tag: string;
    readonly value: string;
    /** Present for a checkbox or radio: what it holds now. */
    readonly checked?: boolean;
}
/** What choosing a `<select>` option produced. */
export interface CdpSelectResult {
    readonly page: CdpPageView;
    readonly value: string;
    readonly label: string;
}
/** What one batch fill produced. */
export interface CdpFillResult {
    readonly page: CdpPageView;
    readonly fields: readonly FillOutcome[];
    readonly submitted: boolean;
}
/** What one scrape produced. */
export interface CdpScrapeResult {
    readonly page: CdpPageView;
    readonly rows: readonly Record<string, string | null>[];
    readonly count: number;
    readonly truncated: boolean;
}
/**
 * A drain with no operation attached: what the page has said since the previous one.
 *
 * It exists because reading and writing are not the only two things a caller wants to do.
 * "Something looked wrong, what did the page actually say" is a third, and giving it a verb
 * means the answer does not have to be reconstructed out of the tips that happened to ride
 * along on some unrelated call.
 */
export interface CdpMessagesResult {
    readonly page: CdpPageView;
    readonly tips?: readonly PageTip[];
}
/** Where a scroll came to rest. */
export interface CdpScrollResult {
    readonly page: CdpPageView;
    readonly y: number;
    readonly maxY: number;
}
/** The image a capture produced, still base64: saving it is the tool layer's business. */
export interface CdpCaptureResult {
    readonly page: CdpPageView;
    readonly base64: string;
    readonly mime: 'image/png' | 'image/jpeg';
    readonly width?: number;
    readonly height?: number;
}
/** The interactive elements of one page. */
export interface CdpElementListing {
    readonly page: CdpPageView;
    readonly elements: readonly PageElement[];
    readonly total: number;
}
/** One control's current value. */
export interface CdpValueResult {
    readonly page: CdpPageView;
    readonly tag: string;
    readonly value: string;
    readonly checked?: boolean;
}
/** What a wait came to. */
export interface CdpWaitResult {
    readonly page: CdpPageView;
    readonly ok: boolean;
    readonly url: string;
    readonly readyState: string;
    readonly reason: string;
}
/** Where a history move landed. */
export interface CdpNavResult {
    readonly page: CdpPageView;
    readonly moved: boolean;
    readonly url: string;
}
/** The surface the tools drive. */
export interface YonBrowserCdpService {
    pages(input: {
        readonly run?: string;
    }, signal: AbortSignal): Promise<CdpPageListing>;
    attach(input: PageRef, signal: AbortSignal): Promise<CdpPageListing>;
    open(input: {
        readonly url: string;
        readonly run?: string;
    }, signal: AbortSignal): Promise<CdpPageView>;
    read(input: PageRef & {
        readonly format?: 'text' | 'html';
        readonly maxChars?: number;
    }, signal: AbortSignal): Promise<CdpReadResult>;
    evaluate(input: PageRef & {
        readonly expression: string;
        readonly maxChars?: number;
    }, signal: AbortSignal): Promise<CdpEvalResult>;
    close(input: PageRef, signal: AbortSignal): Promise<CdpPageView>;
    click(input: PageRef & {
        readonly target: ElementTarget;
    }, signal: AbortSignal): Promise<CdpClickResult>;
    type(input: PageRef & {
        readonly text: string;
        readonly target?: ElementTarget;
    }, signal: AbortSignal): Promise<CdpPageView>;
    setValue(input: PageRef & {
        readonly target: ElementTarget;
        readonly value: string;
    }, signal: AbortSignal): Promise<CdpSetValueResult>;
    pressKey(input: PageRef & {
        readonly key: string;
    }, signal: AbortSignal): Promise<CdpPageView>;
    scroll(input: PageRef & {
        readonly deltaY?: number;
        readonly target?: ElementTarget;
    }, signal: AbortSignal): Promise<CdpScrollResult>;
    screenshot(input: PageRef & CaptureOptions, signal: AbortSignal): Promise<CdpCaptureResult>;
    snapshot(input: PageRef & {
        readonly maxNodes?: number;
    }, signal: AbortSignal): Promise<CdpElementListing>;
    getValue(input: PageRef & {
        readonly target: ElementTarget;
    }, signal: AbortSignal): Promise<CdpValueResult>;
    wait(input: PageRef & {
        readonly url?: string;
        readonly selector?: string;
        readonly timeoutMs?: number;
    }, signal: AbortSignal): Promise<CdpWaitResult>;
    history(input: PageRef & {
        readonly how: 'back' | 'forward' | 'reload';
        readonly hard?: boolean;
    }, signal: AbortSignal): Promise<CdpNavResult>;
    select(input: PageRef & {
        readonly target: ElementTarget;
        readonly value: string;
        readonly match?: SelectMatch;
    }, signal: AbortSignal): Promise<CdpSelectResult>;
    fill(input: PageRef & {
        readonly fields: readonly {
            readonly target: ElementTarget;
            readonly value: string;
        }[];
        readonly submit?: boolean;
    }, signal: AbortSignal): Promise<CdpFillResult>;
    scrape(input: PageRef & {
        readonly rows: string;
        readonly fields: readonly ScrapeField[];
        readonly limit?: number;
    }, signal: AbortSignal): Promise<CdpScrapeResult>;
    messages(input: PageRef, signal: AbortSignal): Promise<CdpMessagesResult>;
}
/**
 * Build the service over the panel's own browser service.
 * @param browsers - the panel's service, for the runs it knows about.
 * @returns the CDP-facing surface.
 */
export declare function createYonBrowserCdpService(browsers: YonBrowsersService): YonBrowserCdpService;
