/**
 * The verbs that act inside a page.
 *
 * WHY A THIRD FILE
 * `cdp-client.ts` speaks the protocol and `browser-cdp-service.ts` decides which page a call
 * means. This one is what happens *inside* a page once that is settled: locating an element,
 * clicking it, filling it, pressing a key, scrolling, capturing. Those verbs share a body of
 * hard-won detail (a pointer must move before it presses, a controlled input needs the
 * prototype setter, a key must be released even when the press throws) and none of it is
 * about sessions or runs — so it lives here, where a test can drive it against a stub
 * connection without a browser.
 *
 * WHAT WAS LEARNED FROM ELSEWHERE, AND WHERE
 * `dsh-builtin-browser` (MIT, `wqty123/dsh-browser`) solves the same problems over the same
 * protocol, and three of its findings are load-bearing enough to state here rather than
 * rediscover:
 *
 *   1. **Move the pointer before pressing.** Chromium routes a synthesized `mousePressed` to
 *      the widget's CURRENT hover target rather than hit-testing the coordinates. A view that
 *      has never received a mouse event has no hover target, so the first click on a fresh tab
 *      goes nowhere while CDP still answers success.
 *   2. **A controlled input needs the prototype setter.** Assigning `el.value` is overwritten
 *      by the next React/Vue render; `Object.getOwnPropertyDescriptor(proto, 'value').set` is
 *      what the framework itself uses, and the events afterwards are what it listens for.
 *   3. **Release what you pressed.** A `mousePressed` or `keyDown` whose counterpart is lost
 *      leaves the page with a stuck button or a stuck modifier, and every later input is
 *      wrong in a way that looks like the site misbehaving.
 *
 * POSITIONING IS SEMANTIC FIRST
 * A selector or a piece of text locates by meaning and survives scrolling and layout changes;
 * coordinates cannot. Text matching uses an element's OWN text nodes (not `textContent`) and
 * prefers the deepest match, so a button inside a card wins over the card.
 *
 * @module yon-panel/browser-interact
 */
import type { CdpConnection } from './cdp-client.ts';
/** Why an in-page action could not be carried out. */
export type InteractErrorCode = 
/** The arguments do not describe a locatable element. */
'invalid-target'
/** Nothing matched, within the wait budget. */
 | 'not-found'
/** The page raised while running the action. */
 | 'failed';
/** One refusal from this layer. */
export declare class InteractError extends Error {
    readonly code: InteractErrorCode;
    constructor(code: InteractErrorCode, message: string);
}
/** How an element is named. `by` defaults to `css`. */
export interface ElementTarget {
    /** How to interpret `value`. */
    readonly by?: 'css' | 'text' | 'xpath';
    /** The selector, the visible text, or the XPath. */
    readonly value: string;
    /** Which match to take when several match. Default 0. */
    readonly index?: number;
}
/** The connection and session an action runs on. */
export interface InteractContext {
    readonly connection: CdpConnection;
    readonly sessionId: string;
}
/** Every key name, for a tool's enum and for error messages. */
export declare const KEY_NAMES: readonly string[];
/** A JSON value the page produced, or a refusal. */
export declare function evaluateJson<T>(context: InteractContext, expression: string): Promise<T>;
/** What a click did, for the caller to report. */
export interface ClickOutcome {
    readonly tag: string;
    readonly text: string;
}
/**
 * Click the centre of a located element with a real pointer sequence.
 *
 * The pointer moves first: Chromium delivers a synthesized press to whatever the view
 * currently considers hovered, and a tab that has never seen a mouse event has no hover
 * target at all — the press then goes nowhere while CDP reports success.
 */
export declare function clickAt(context: InteractContext, target: ElementTarget): Promise<ClickOutcome>;
/**
 * Insert text at the focused element, or focus a located one first.
 *
 * `Input.insertText` goes through the browser's own input pipeline, so it raises the same
 * events a person typing would — which is what controlled widgets listen for.
 */
export declare function typeText(context: InteractContext, text: string, target?: ElementTarget): Promise<void>;
/** What setting a value produced, so the caller can confirm rather than assume. */
export interface SetValueOutcome {
    readonly tag: string;
    readonly value: string;
    /** Present for a checkbox or radio: what it holds now. */
    readonly checked?: boolean;
}
/**
 * Set a control's value the way the framework itself does.
 *
 * The prototype setter is the point: assigning `el.value` writes the DOM property but leaves
 * React's/Vue's own state untouched, so the next render restores the old value and the form
 * submits empty. Calling the setter the framework installed, then raising `input` and
 * `change`, is indistinguishable from a person filling the field.
 *
 * A checkbox or radio takes a boolean instead — `true`/`false`, `on`/`off`, `1`/`0` — and is
 * toggled by a real click, because that is what fires the events the page listens for and
 * what the framework's own state follows. Anything else is refused rather than guessed at:
 * setting the *value* of a checkbox is a silent no-op that reads as success.
 */
export declare function setValueOf(context: InteractContext, target: ElementTarget, value: string): Promise<SetValueOutcome>;
/** One named key press, with the release guaranteed. */
export declare function pressKey(context: InteractContext, key: string): Promise<void>;
/** Where a scroll ended up. */
export interface ScrollOutcome {
    readonly y: number;
    readonly maxY: number;
}
/**
 * Scroll a located element into view, or the page by a pixel delta.
 *
 * Scrolling the page rather than dispatching a wheel event: a wheel event only moves what is
 * under the pointer, so a call meant to "go down the page" would depend on where the mouse
 * happens to be. Lazy lists that need real wheel input are a later, deliberate addition.
 */
export declare function scrollPage(context: InteractContext, deltaY: number, target?: ElementTarget): Promise<ScrollOutcome>;
/** How a screenshot was asked for. */
export interface CaptureOptions {
    readonly fullPage?: boolean;
    readonly format?: 'png' | 'jpeg';
    readonly quality?: number;
    readonly maxWidth?: number;
    readonly maxHeight?: number;
}
/** What a capture produced. */
export interface CaptureResult {
    readonly base64: string;
    readonly mime: 'image/png' | 'image/jpeg';
    readonly width?: number;
    readonly height?: number;
}
/**
 * Capture the page.
 *
 * Downscaling goes through `clip.scale`, which only applies to the region a clip names — so
 * the clip has to cover the whole document, and `captureBeyondViewport` must then be dropped
 * or the two describe different images.
 */
export declare function capturePage(context: InteractContext, options: CaptureOptions): Promise<CaptureResult>;
/** One control a page exposes, as the collector reports it. */
export interface PageElement {
    readonly index: number;
    readonly tag: string;
    /** The semantic role: button, textbox, link, checkbox, combobox… */
    readonly role: string;
    /** The accessible name — what a person would call this control. */
    readonly name: string;
    /** Its current value, for the controls that have one. */
    readonly value: string;
    /** `disabled`, `checked`, `required`, `readonly`, `expanded=true`… */
    readonly state: readonly string[];
    /** `#id` or `[name="x"]` when the element carries one; empty when it carries neither. */
    readonly selector: string;
}
/** What one collection found. */
export interface ElementListing {
    readonly elements: readonly PageElement[];
    /** How many interactive elements the page has, however many were returned. */
    readonly total: number;
}
/**
 * Collect the page's interactive elements.
 *
 * The point is that a model cannot see a page: it can only read text or guess selectors.
 * This is the list of things that can be acted on, each with the name a person would use
 * and — when the element carries an `id` or a `name` — a selector that survives scrolling
 * and layout changes. Nothing is invented: an element with neither gets an empty selector
 * rather than a fragile nth-child path, and is meant to be reached by its visible text.
 *
 * The same visibility rule as the locator decides what counts, so the list and the actions
 * agree about what exists. Elements inside shadow roots and same-origin iframes are
 * included, for the same reason.
 * @param context - the attached session.
 * @param maxNodes - how many elements to return; the total is reported regardless.
 * @returns the elements, plus how many there were.
 */
export declare function collectElements(context: InteractContext, maxNodes: number): Promise<ElementListing>;
/** What reading one control's value produced. */
export interface ValueOutcome {
    readonly tag: string;
    readonly value: string;
    readonly checked?: boolean;
}
/**
 * Read one control's current value.
 *
 * Here rather than left to `browser_eval` because "what does that field hold now" is the
 * question every write is followed by, and the answer differs by control type: `value` for
 * a text box or a select, `checked` for a box, text content for an editable region.
 * @param context - the attached session.
 * @param target - which control.
 * @returns its tag, its value, and its checked state when it has one.
 */
export declare function readValueOf(context: InteractContext, target: ElementTarget): Promise<ValueOutcome>;
/** What a wait was asked for. */
export interface WaitOptions {
    /** A substring the address must contain. */
    readonly url?: string;
    /** A selector that must exist. */
    readonly selector?: string;
    /** How long to keep polling. Default 10s. */
    readonly timeoutMs?: number;
}
/** What a wait came to. */
export interface WaitOutcome {
    readonly ok: boolean;
    readonly url: string;
    readonly readyState: string;
    /** `ready`, `selector-missing`, `url-mismatch`, `loading`, or a bad-selector message. */
    readonly reason: string;
}
/**
 * Wait until the page is loaded, and optionally until an address or a selector shows up.
 *
 * Every one of these conditions is checked in the page rather than by polling from here: a
 * navigation replaces the document, and a poll loop on this side would be asking a target
 * that no longer exists. Reporting *which* condition failed matters — "still loading" and
 * "that element never appeared" call for opposite next steps.
 * @param context - the attached session.
 * @param options - what to wait for.
 * @returns whether it became true, and the state either way.
 */
export declare function waitForPage(context: InteractContext, options: WaitOptions): Promise<WaitOutcome>;
/** Where a history move landed. */
export interface NavOutcome {
    readonly moved: boolean;
    readonly url: string;
}
/** Go back one step. */
export declare function goBack(context: InteractContext): Promise<NavOutcome>;
/** Go forward one step. */
export declare function goForward(context: InteractContext): Promise<NavOutcome>;
/** Reload the page, optionally bypassing the cache. */
export declare function reloadPage(context: InteractContext, ignoreCache: boolean): Promise<void>;
/** What choosing an option produced. */
export interface SelectOutcome {
    readonly value: string;
    readonly label: string;
}
/** How the wanted option is matched against the control's own options. */
export type SelectMatch = 'auto' | 'value' | 'label' | 'index';
/**
 * Choose an option in a `<select>`.
 *
 * A select is the one control where "set its value" is not enough: the value an operator
 * knows is the words on the option, and the `value` attribute is usually a code. So the
 * default tries the value first, then the exact label, then a label that contains the text —
 * and when nothing matches it answers with the options that do exist, because the caller's
 * next move is to correct the request, not to retry it.
 * @param context - the attached session.
 * @param target - which select.
 * @param wanted - the value, the label, or the position, per `match`.
 * @param match - how to read `wanted`; `auto` tries value, then label.
 * @returns the value and the label that ended up selected.
 */
export declare function selectOption(context: InteractContext, target: ElementTarget, wanted: string, match: SelectMatch): Promise<SelectOutcome>;
/** One field of a batch fill. */
export interface FillField {
    readonly target: ElementTarget;
    readonly value: string;
}
/** What one field of a batch fill did. */
export interface FillOutcome {
    readonly index: number;
    readonly ok: boolean;
    readonly tag: string;
    readonly value: string;
    readonly reason: string;
}
/** What a batch fill produced. */
export interface FillResult {
    readonly fields: readonly FillOutcome[];
    /** Whether a form was actually submitted — false also when none was found. */
    readonly submitted: boolean;
}
/**
 * Fill several fields in one round-trip, optionally submitting afterwards.
 *
 * One script rather than N calls because a form is one thing: the fields of an order entry
 * appear together, and paying a session attach per field is both slower and less coherent.
 * Each field is resolved and written independently, so a field that is missing or refuses the
 * word leaves the others done — a partial fill is information, whereas an all-or-nothing
 * failure would hide which control was the problem.
 *
 * Submission goes through `form.requestSubmit()`, which runs the page's own validation and
 * handlers; clicking a submit button would depend on guessing which button is the right one.
 * @param context - the attached session.
 * @param fields - what to write where.
 * @param submit - whether to submit the form the first field belongs to.
 * @returns one outcome per field, plus whether a submit happened.
 */
export declare function fillFields(context: InteractContext, fields: readonly FillField[], submit: boolean): Promise<FillResult>;
/** One column of a scrape. */
export interface ScrapeField {
    /** The key this column gets in each row object. */
    readonly name: string;
    /** A selector resolved inside each row. */
    readonly selector: string;
    /** Read this attribute instead of the text. */
    readonly attribute?: string;
}
/** What a scrape produced. */
export interface ScrapeResult {
    readonly rows: readonly Record<string, string | null>[];
    /** How many rows the page had, whether or not all were returned. */
    readonly count: number;
    readonly truncated: boolean;
}
/**
 * Pull repeated rows out of a table or a list, as data.
 *
 * `browser_read` returns the page as prose; a list of two hundred orders then costs the
 * caller everything the page says and leaves the structure to be guessed back out of it.
 * This takes a row selector and a field map and returns objects, which is both smaller and
 * unambiguous. A field whose selector matches nothing is `null` — a missing column is a fact
 * about the page, and inventing an empty string for it would hide that.
 * @param context - the attached session.
 * @param rowSelector - a selector matching each row.
 * @param fields - what to take from each row.
 * @param limit - how many rows to return; the total is reported regardless.
 * @returns the rows, and how many there were.
 */
export declare function scrapeRows(context: InteractContext, rowSelector: string, fields: readonly ScrapeField[], limit: number): Promise<ScrapeResult>;
