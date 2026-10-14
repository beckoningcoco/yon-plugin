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
/**
 * 元素找到了，但真实指针到不了它身上（在视口外、被别的东西盖住、或者在按下之前被重绘换掉）。
 *
 * 与 `not-found` 分开是因为对策完全不同：找不到要改选择器，按不到要改 mode（`dom`/`react` 在
 * 页面内直接触发，不受视口限制）或者先把容器滚/展开。
 */
 | 'not-hit'
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
/** How a `by: 'text'` locator matched: the whole text, or only part of it. */
export type TextMatch = 'exact' | 'contains';
/**
 * How what is under a point relates to the element that was aimed at.
 *
 * Reported instead of comparing tag names, because a tag-name comparison calls every legitimate
 * hit on a child element a miss — and the element that receives the gesture usually IS a child.
 */
export type HitRelation = 'same' | 'hit-inside-target' | 'target-inside-hit' | 'unrelated' | 'unavailable' | 'target-is-detached';
/** What is under one viewport point, and how it relates to the target. */
export interface HitReport {
    readonly x: number;
    readonly y: number;
    readonly tag: string;
    readonly text: string;
    readonly relation: HitRelation;
    /**
     * 这一点是否落在**目标自己的框**里（±2px 容差）。
     *
     * 与 relation 是两个不同的问题，而报告曾经把它们当成一个：无论关系读成什么，只有这个字段能回答
     * 「指针到底在不在目标身上」。实测里三种情况下关系都会读成 unrelated，而指针其实就在目标身上——
     * 落点是 `pointer-events:none` 的透明探针（elementFromPoint 穿过去了）、目标是 1px 的锚点而按下
     * 被它的外层容器接住、目标是 hover 才展开的节点。拿 relation 单独当「拖偏了」的证据，一次正常
     * 的拖拽就会带一条假警报。
     *
     * null = 判不了：目标是重绘前的旧元素（框已经不在文档里），或者页面不给几何。
     */
    readonly onTarget: boolean | null;
}
/** One end of a locate: how many matched, which one was taken, how the text matched. */
export interface MatchInfo {
    readonly matched: number;
    readonly matchedVisible: number;
    readonly index: number;
    readonly textMatch: TextMatch | null;
    /** The match is a text-only leaf (a `font`/`span`), not the node root a drag usually wants. */
    readonly textHitIsLeaf: boolean;
}
/** The connection and session an action runs on. */
export interface InteractContext {
    readonly connection: CdpConnection;
    readonly sessionId: string;
}
/** Every key name, for a tool's enum and for error messages. */
export declare const KEY_NAMES: readonly string[];
/**
 * Helpers injected into every page expression.
 *
 * Kept as one string so the locator, the click and the fill cannot drift apart: they must
 * agree about what "visible" and "this element's text" mean, or one of them reports an
 * element the other cannot find. Written without backticks or `${` on purpose — it is
 * embedded inside a host template literal.
 *
 * Exported so a spec can evaluate it in jsdom and hold `mainFrameOffset` to its arithmetic;
 * the click coordinate it feeds is invisible in a unit test of anything else.
 */
export declare const PAGE_HELPERS = "\n  // \u8DE8 realm \u7684\u53EF\u89C1\u6027\u5224\u65AD\u3002\u811A\u672C\u5728\u4E3B\u6587\u6863\u91CC\u6267\u884C\uFF0C\u800C iframe \u91CC\u7684\u5143\u7D20 instanceof\n  // HTMLElement \u6052\u4E3A false\uFF08\u90A3\u4E2A\u6784\u9020\u51FD\u6570\u6765\u81EA\u53E6\u4E00\u4E2A realm\uFF09\uFF0C\u6240\u4EE5\u53EA\u80FD\u770B\u80FD\u529B\uFF0C\u4E0D\u80FD\u770B\n  // \u8EAB\u4EFD\u2014\u2014\u7528\u8EAB\u4EFD\u5224\u65AD\u4F1A\u628A iframe \u5185\u7684\u5143\u7D20\u6574\u4F53\u5224\u6210\u4E0D\u53EF\u89C1\u3002\n  const isVisible = (el) => el !== null && el !== undefined\n    && typeof el.getClientRects === 'function'\n    && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)\n  const ownText = (el) => Array.from(el.childNodes)\n    .filter((n) => n.nodeType === Node.TEXT_NODE)\n    .map((n) => n.textContent || '').join('').trim()\n  // An input has no text of its own: what a person calls it lives in its placeholder or\n  // aria-label. Falling back to those only when there is no own text leaves every existing\n  // match working, and makes \"type into \u641C\u7D22\" mean what it reads like.\n  const nameText = (el) => {\n    const own = ownText(el)\n    if (own !== '') return own\n    const aria = el.getAttribute('aria-label')\n    if (aria !== null && aria.trim() !== '') return aria.trim()\n    const placeholder = el.getAttribute('placeholder')\n    if (placeholder !== null && placeholder.trim() !== '') return placeholder.trim()\n    return ''\n  }\n  const depthOf = (el) => { let d = 0; let p = el.parentElement; while (p) { d++; p = p.parentElement } return d }\n  // \u4E00\u4E2A\u5143\u7D20\u300C\u770B\u4E0A\u53BB\u5199\u7740\u4EC0\u4E48\u300D\u3002\u4E0D\u80FD\u7528 textContent\uFF1A\u5B9E\u6D4B\u91CC\u4E00\u4E2A\u4E1A\u52A1\u6D41\u8282\u70B9\u628A\u5185\u90E8\u90A3\u4EFD\u9690\u85CF\u7684\u5019\u9009\u4E0B\u62C9\n  // \uFF08\u91CC\u9762\u662F\u522B\u7684\u5355\u636E\u540D\uFF1AERP\u9500\u552E\u5408\u540C\u3001\u9879\u76EE\u9500\u552E\u5408\u540C\u2026\uFF09\u4E5F\u7B97\u6210\u4E86\u81EA\u5DF1\u7684\u6587\u5B57\uFF0C\u4E8E\u662F\u62A5\u544A\u5199\u7740\u300C\u62D6\u7684\u662F\n  // ERP\u9500\u552E\u5408\u540C\u300D\uFF0C\u800C\u5C4F\u5E55\u4E0A\u660E\u660E\u662F\u300C\u9500\u552E\u8BA2\u5355\u300D\u2014\u2014\u5143\u7D20\u627E\u5BF9\u4E86\uFF0C\u662F\"\u53D6\u540D\u5B57\"\u53D6\u9519\u4E86\u3002\u53D6\u6587\u5B57\u56E0\u6B64\u6309\u4E24\u4E2A\n  // \u6761\u4EF6\u8D70\uFF1A\u5B50\u8282\u70B9\u8981\u53EF\u89C1\uFF0C\u4E14\u4E0D\u80FD\u6574\u4E2A\u843D\u5728\u5143\u7D20\u81EA\u5DF1\u7684\u6846\u4E4B\u5916\u3002\u4E00\u6761\u53EF\u89C1\u6587\u5B57\u90FD\u8BFB\u4E0D\u5230\u5C31\u4EA4\u767D\u5377\u2014\u2014\u62FF\u9690\u85CF\u7684\n  // \u6587\u5B57\u51D1\u51FA\u6765\u7684\u540D\u5B57\uFF0C\u6B63\u662F\u8FD9\u6761\u62A5\u544A\u6700\u5BB9\u6613\u51FA\u9519\u7684\u5730\u65B9\u3002\n  //\n  // \u4E5F\u4E0D\u8BB8\u628A\u51E0\u4E2A\u5206\u652F\u7684\u6587\u5B57\u4E32\u8D77\u6765\uFF1A\u5BB9\u5668\uFF08\u753B\u5E03\u3001\u5DE5\u5177\u6761\uFF09\u91CC\u6BCF\u4E2A\u5B50\u4EF6\u5404\u5199\u5404\u7684\u5B57\uFF0C\u4E32\u8D77\u6765\u5C31\u662F\n  // div\u300C- 100% + \u9500\u552E\u8BA2\u5355 \u9500\u552E\u53D1\u8D27\u5355 +\u300D\u8FD9\u79CD\u4E1C\u897F\u2014\u2014\u8BFB\u7740\u50CF\u540D\u5B57\uFF0C\u5176\u5B9E\u662F\u628A\u753B\u5E03\u5185\u5BB9\u5FF5\u4E86\u4E00\u904D\u3002\n  // \u6240\u4EE5\u53EA\u8BA4**\u4E00\u652F**\u6587\u5B57\uFF1A\u5143\u7D20\u81EA\u5DF1\u7684\u76F4\u5C5E\u6587\u5B57\u4E0E\u7B2C\u4E00\u4E2A\u5199\u7740\u5B57\u7684\u5B50\u5206\u652F\u7B97\u540C\u4E00\u652F\uFF08\u300C\u524D\u7F00<span>\u503C</span>\u300D\n  // \u7167\u6837\u8BFB\u5F97\u51FA\u6765\uFF09\uFF0C\u4E00\u65E6\u51FA\u73B0\u7B2C\u4E8C\u4E2A\u5199\u7740\u5B57\u7684\u5B50\u5206\u652F\uFF0C\u6574\u6BB5\u4EA4\u767D\u5377\u2014\u2014\u5BB9\u5668\u4E0D\u8BE5\u6709\u4E00\u4E2A\u540D\u5B57\u3002\n  const visibleText = (el, limit) => {\n    if (!el) return ''\n    let root = null\n    try { root = el.getBoundingClientRect() } catch (error) { root = null }\n    const hasBox = root !== null && (root.width > 0 || root.height > 0)\n    // \u53EA\u5728\u300C\u6709\u6846\u3001\u4E14\u6846\u6574\u4E2A\u5728 root \u4E4B\u5916\u300D\u65F6\u624D\u5224\u4E3A\u5728\u5916\u3002\u6CA1\u6846\u7684\u4E1C\u897F\uFF08display:contents \u7684\u5305\u88C5\u5C42\uFF09\u4E0D\u80FD\n    // \u5F53\u6210\"\u5728\u5916\u9762\"\uFF0C\u5426\u5219\u5B83\u4E0B\u9762\u771F\u6B63\u663E\u793A\u7740\u7684\u6587\u5B57\u4F1A\u88AB\u6574\u6BB5\u4E22\u6389\u3002\n    const outsideBox = (node) => {\n      if (!hasBox || typeof node.getBoundingClientRect !== 'function') return false\n      let r = null\n      try { r = node.getBoundingClientRect() } catch (error) { return false }\n      if (r.width === 0 && r.height === 0) return false\n      return !(r.right > root.left - 1 && r.left < root.right + 1\n        && r.bottom > root.top - 1 && r.top < root.bottom + 1)\n    }\n    // display:contents \u7684\u5143\u7D20\u81EA\u5DF1\u4E0D\u751F\u6210\u6846\uFF0C\u5374\u88AB isVisible \u5224\u6210\"\u4E0D\u53EF\u89C1\"\uFF1B\u5B83\u53EA\u662F\u5305\u88C5\u5C42\uFF0C\u8981\u7167\u5E38\u5F80\u4E0B\u8D70\u3002\n    const isLayoutless = (node) => {\n      try {\n        const win = node.ownerDocument && node.ownerDocument.defaultView\n        return !!win && win.getComputedStyle(node).display === 'contents'\n      } catch (error) { return false }\n    }\n    const parts = []\n    // \u6BCF\u4E00\u6BB5\u6587\u5B57\u6765\u81EA\u54EA\u4E00\u652F\uFF1A\u5143\u7D20\u76F4\u5C5E\u7684\u6587\u5B57\u8282\u70B9\u7B97 'own'\uFF0C\u5143\u7D20\u5B50\u8282\u70B9\u6309\u5B83\u7684\u5E8F\u53F7\u5404\u7B97\u4E00\u652F\u3002\n    const origins = new Set()\n    const walk = (node, depth, origin) => {\n      if (depth > 8 || parts.join('').length >= limit) return\n      if (node.nodeType === 3) {\n        // \u6CE8\u610F\uFF1A\u8FD9\u662F PAGE_HELPERS \u6A21\u677F\u5B57\u9762\u91CF\u5185\u90E8\u2014\u2014\u6B63\u5219\u91CC\u7684\u53CD\u659C\u6760\u8981\u5199\u6210\u4E24\u4E2A\uFF0C\u9875\u9762\u62FF\u5230\u7684\u624D\u662F\u4E00\u4E2A\uFF1B\n        // \u5199\u6210\u4E00\u4E2A\uFF0C\u9875\u9762\u62FF\u5230\u7684\u662F /s+/\uFF08\u5339\u914D\u4E00\u4E32\u5B57\u6BCD s\uFF09\uFF0C\u540D\u5B57\u91CC\u7684\u6362\u884C\u4E0E\u591A\u7A7A\u683C\u5C31\u4E0D\u4F1A\u88AB\u6298\u53E0\u3002\n        // \uFF08\u8FD9\u91CC\u4E5F\u4E0D\u80FD\u51FA\u73B0\u53CD\u5F15\u53F7\uFF0C\u4F1A\u63D0\u524D\u7ED3\u675F\u6A21\u677F\u5B57\u9762\u91CF\u3002\uFF09\n        const t = (node.textContent || '').replace(/\\s+/g, ' ').trim()\n        if (t !== '') { parts.push(t); origins.add(origin) }\n        return\n      }\n      if (node.nodeType !== 1) return\n      if (node !== el) {\n        if (!isVisible(node) && !isLayoutless(node)) return\n        if (outsideBox(node)) return\n      }\n      const kids = node.childNodes\n      for (let i = 0; i < kids.length; i++) {\n        const child = kids[i]\n        walk(child, depth + 1, node === el ? (child.nodeType === 3 ? 'own' : i) : origin)\n      }\n    }\n    walk(el, 0, 'own')\n    if (parts.length === 0) return ''\n    // \u76F4\u5C5E\u6587\u5B57\u4E0E\u7B2C\u4E00\u4E2A\u5199\u7740\u5B57\u7684\u5B50\u5206\u652F\u7B97\u540C\u4E00\u652F\uFF0C\u5B83\u4FE9\u540C\u65F6\u51FA\u73B0\u4E0D\u7B97\u300C\u4E24\u652F\u300D\u3002\n    let branches = origins.size\n    if (origins.has('own') && branches > 1) branches -= 1\n    if (branches > 1) return ''\n    return parts.join(' ').trim().slice(0, limit)\n  }\n  // CDP \u7684\u9F20\u6807\u5750\u6807\u662F\u76F8\u5BF9**\u4E3B\u6846\u67B6**\u89C6\u53E3\u7684\uFF0C\u800C getBoundingClientRect \u7ED9\u7684\u662F\u76F8\u5BF9\u5143\u7D20\u6240\u5728\n  // \u6587\u6863\u89C6\u53E3\u7684\u3002\u5143\u7D20\u5728 iframe \u91CC\u65F6\uFF0C\u8FD9\u4E24\u8005\u5DEE\u7740\u6574\u6761 frame \u94FE\u7684\u4F4D\u7F6E\uFF1A\u4E0D\u52A0\u8FD9\u6BB5\uFF0C\u70B9\u51FB\u4F1A\u843D\u5728\n  // \u76EE\u6807**\u4E0A\u65B9**\uFF0C\u800C\u4E14\u504F\u591A\u5C11\u7531\u5916\u5C42\u5E03\u5C40\u51B3\u5B9A\uFF08\u5B9E\u6D4B NCC \u5DE5\u4F5C\u53F0\u504F 44px\uFF0C\u6B63\u597D\u662F\u5B83\u9876\u680F\u7684\u9AD8\u5EA6\uFF09\n  // \u2014\u2014\u5DE5\u5177\u8FD8\u4F1A\u56DE\u4E00\u53E5\u300C\u5DF2\u70B9\u51FB\u300D\uFF0C\u56E0\u4E3A\u6309\u4E0B\u786E\u5B9E\u53D1\u751F\u4E86\uFF0C\u53EA\u662F\u53D1\u751F\u5728\u522B\u7684\u5143\u7D20\u4E0A\u3002\n  const mainFrameOffset = (el) => {\n    let x = 0\n    let y = 0\n    try {\n      let win = el.ownerDocument && el.ownerDocument.defaultView\n      while (win && win.frameElement) {\n        const frame = win.frameElement\n        const r = frame.getBoundingClientRect()\n        // clientLeft/clientTop \u662F iframe \u81EA\u5DF1\u7684\u8FB9\u6846\uFF1Arect \u4ECE\u8FB9\u6846\u5916\u6CBF\u7B97\u8D77\uFF0C\u5185\u5BB9\u4ECE\u5185\u6CBF\u5F00\u59CB\u3002\n        x += r.left + (frame.clientLeft || 0)\n        y += r.top + (frame.clientTop || 0)\n        win = frame.ownerDocument && frame.ownerDocument.defaultView\n      }\n    } catch (error) {\n      // \u8DE8\u57DF frame \u8BFB\u4E0D\u5230 frameElement\uFF0C\u4FDD\u6301\u5DF2\u7D2F\u52A0\u7684\u90E8\u5206\uFF0C\u8BA9\u5750\u6807\u53BB\u62A5\u5B83\u81EA\u5DF1\u7684\u9519\u3002\n    }\n    return { x: x, y: y }\n  }\n  const allRoots = () => {\n    const roots = []\n    const seen = new Set()\n    const visit = (doc) => {\n      if (seen.has(doc)) return\n      seen.add(doc)\n      roots.push(doc)\n      for (const el of doc.querySelectorAll('*')) {\n        if (el.shadowRoot) visit(el.shadowRoot)\n        if (el.tagName === 'IFRAME') {\n          try { const inner = el.contentDocument; if (inner) visit(inner) } catch { /* cross-origin */ }\n        }\n      }\n    }\n    visit(document)\n    return roots\n  }\n  // \u547D\u4E2D\u68C0\u6D4B\uFF1A\u67D0\u4E2A\u89C6\u53E3\u5750\u6807\u4E0A\u6700\u4E0A\u5C42\u7684\u662F\u8C01\u3002document.elementFromPoint \u4E0D\u7A7F\u900F iframe\uFF08\u53EA\u56DE\u90A3\u4E2A\n  // iframe \u5143\u7D20\u672C\u8EAB\uFF09\uFF0C\u4E5F\u4E0D\u7A7F\u900F shadow root\uFF08\u53EA\u56DE host\uFF09\uFF0C\u6240\u4EE5\u6309\u5750\u6807\u9010\u5C42\u5F80\u91CC\u94BB\u2014\u2014\u8FDB iframe\n  // \u8981\u6263\u6389\u8BE5\u5C42\u7684\u8FB9\u6846\u504F\u79FB\uFF08\u4E0E mainFrameOffset \u7684\u7D2F\u52A0\u65B9\u5411\u76F8\u53CD\uFF0C\u4E24\u8005\u4E92\u4E3A\u9006\u8FD0\u7B97\uFF09\uFF0C\u8FDB shadow root\n  // \u5219\u5750\u6807\u4E0D\u53D8\uFF1A\u5B83\u548C\u5916\u5C42\u6587\u6863\u5171\u7528\u540C\u4E00\u5957\u89C6\u53E3\u5750\u6807\u3002\n  // \u5355\u72EC\u5199\u6210\u4E00\u4E2A\u5171\u7528\u7684 helper\uFF0C\u662F\u56E0\u4E3A\u300C\u6307\u9488/\u843D\u70B9\u5E95\u4E0B\u5230\u5E95\u662F\u8C01\u300D\u5728 hover\u3001drag \u91CC\u90FD\u8981\u95EE\uFF0C\u5404\u5199\u5404\u7684\n  // \u5FC5\u7136\u6709\u4E24\u5957\u53E3\u5F84\uFF0C\u800C\u8FD9\u4E24\u5904\u6070\u6070\u662F\u6700\u5BB9\u6613\u56DE\u62A5\u5F97\u7406\u76F4\u6C14\u58EE\u5374\u9519\u7684\u5730\u65B9\u3002\n  const hitAtPoint = (x, y) => {\n    let cx = x\n    let cy = y\n    let doc = document\n    for (let depth = 0; depth < 16; depth++) {\n      if (!doc || typeof doc.elementFromPoint !== 'function') return null\n      const found = doc.elementFromPoint(cx, cy)\n      if (!found) return null\n      let el = found\n      for (let shadowDepth = 0; shadowDepth < 16; shadowDepth++) {\n        const shadow = el.shadowRoot\n        if (!shadow || typeof shadow.elementFromPoint !== 'function') break\n        const inner = shadow.elementFromPoint(cx, cy)\n        if (!inner || inner === el) break\n        el = inner\n      }\n      if (el.tagName !== 'IFRAME') return el\n      const r = el.getBoundingClientRect()\n      let innerDoc = null\n      try { innerDoc = el.contentDocument } catch (error) { innerDoc = null }\n      if (!innerDoc || innerDoc === doc) return el\n      cx = cx - (r.left + (el.clientLeft || 0))\n      cy = cy - (r.top + (el.clientTop || 0))\n      doc = innerDoc\n    }\n    return null\n  }\n  // \u547D\u4E2D\u7684\u5143\u7D20\u548C\u76EE\u6807\u662F\u4EC0\u4E48\u5173\u7CFB\u3002\u8FD9\u662F\u300C\u70B9/\u62D6\u5230\u7684\u4E1C\u897F\u5BF9\u4E0D\u5BF9\u300D\u8BE5\u770B\u7684\u4E1C\u897F\uFF0C\u6BD4\u62FF tagName \u6BD4\u5B57\u7B26\u4E32\n  // \u53EF\u9760\uFF1A\u547D\u4E2D\u7684\u5E38\u5E38\u662F\u76EE\u6807\u5185\u90E8\u7684\u5B50\u5143\u7D20\uFF08\u6536\u5230\u4E8B\u4EF6\u7684\u6B63\u662F\u5B83\uFF09\uFF0C\u5B57\u7B26\u4E32\u6BD4\u6CD5\u4F1A\u628A\u8FD9\u79CD\u60C5\u51B5\u62A5\u6210\u300C\u504F\u4E86\u300D\u3002\n  const hitRelation = (target, hit) => {\n    if (!target || !hit) return 'unavailable'\n    if (hit === target) return 'same'\n    // elementFromPoint \u53EA\u4F1A\u7ED9\u51FA\u8FD8\u5728\u6587\u6863\u91CC\u7684\u5143\u7D20\uFF0C\u6240\u4EE5\u300C\u5DF2\u8131\u79BB\u6587\u6863\u300D\u8FD9\u4E00\u6761\u53EA\u53EF\u80FD\u53D1\u751F\u5728**\u76EE\u6807**\n    // \u8EAB\u4E0A\uFF1A\u8BF4\u660E\u7784\u7684\u90A3\u4E2A\u8282\u70B9\u5728\u8BFB\u6570\u4E4B\u524D\u5DF2\u7ECF\u88AB\u91CD\u7ED8\u6362\u6389\u4E86\uFF0C\u5750\u6807\u518D\u5BF9\u4E5F\u6253\u4E0D\u5230\u5B83\u3002\n    if (target.isConnected === false) return 'target-is-detached'\n    if (typeof target.contains === 'function' && target.contains(hit)) return 'hit-inside-target'\n    if (typeof hit.contains === 'function' && hit.contains(target)) return 'target-inside-hit'\n    return 'unrelated'\n  }\n  // \u6307\u9488\u5728\u4E0D\u5728\u76EE\u6807\u81EA\u5DF1\u7684\u6846\u91CC\u3002\u4E0E\u300C\u8C01\u63A5\u5230\u4E86\u4E8B\u4EF6\u300D\u5206\u5F00\u95EE\uFF0C\u56E0\u4E3A\u4E24\u8005\u4E0D\u662F\u4E00\u56DE\u4E8B\uFF1A\u843D\u70B9\u662F\n  // pointer-events:none \u7684\u900F\u660E\u63A2\u9488\u65F6 elementFromPoint \u4F1A\u7A7F\u8FC7\u53BB\u30011px \u7684\u951A\u70B9\u4F1A\u88AB\u5B83\u7684\u5916\u5C42\u5BB9\u5668\u63A5\u4F4F\u3001\n  // \u76EE\u6807\u662F hover \u624D\u5C55\u5F00\u7684\u8282\u70B9\u65F6\u6309\u4E0B\u4F1A\u843D\u5728\u5185\u90E8\u7684 span \u4E0A\u2014\u2014\u8FD9\u4E09\u79CD\u60C5\u51B5\u4E0B\u547D\u4E2D\u7684\u90FD\u4E0D\u662F\u76EE\u6807\uFF0C\u800C\u6307\u9488\n  // \u5176\u5B9E\u5C31\u5728\u76EE\u6807\u8EAB\u4E0A\u3002\u62FF\u300C\u547D\u4E2D\u8C01\u300D\u5355\u72EC\u5F53\u300C\u62D6\u504F\u4E86\u300D\u7684\u8BC1\u636E\uFF0C\u4E00\u6B21\u6B63\u5E38\u7684\u62D6\u62FD\u5C31\u4F1A\u5E26\u4E00\u6761\u5047\u8B66\u62A5\u3002\n  const pointOnTarget = (target, x, y) => {\n    if (!target || target.isConnected === false) return null\n    if (typeof target.getBoundingClientRect !== 'function') return null\n    let r = null\n    try { r = target.getBoundingClientRect() } catch (error) { return null }\n    if (r.width === 0 && r.height === 0) return null\n    return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2\n  }\n  const describeHit = (x, y, target) => {\n    const el = hitAtPoint(x, y)\n    const onTarget = pointOnTarget(target, x, y)\n    if (!el) {\n      return { x: x, y: y, tag: '', text: '', relation: 'unavailable', onTarget: onTarget }\n    }\n    return {\n      x: x,\n      y: y,\n      tag: el.tagName.toLowerCase(),\n      text: visibleText(el, 60),\n      relation: hitRelation(target, el),\n      onTarget: onTarget,\n    }\n  }\n  const matchTargetInfo = (spec) => {\n    const by = typeof spec.by === 'string' ? spec.by : 'css'\n    const value = String(spec.value == null ? '' : spec.value)\n    const index = typeof spec.index === 'number' ? spec.index : 0\n    if (!Number.isInteger(index) || index < 0) {\n      throw new Error('target.index \u5FC5\u987B\u662F\u975E\u8D1F\u6574\u6570\uFF0C\u6536\u5230 ' + JSON.stringify(spec.index))\n    }\n    const roots = allRoots()\n    let els = []\n    let textMatch = null\n    if (by === 'css') {\n      // A selector that does not PARSE can never match on a later poll, so it must not be\n      // reported as a miss: the caller would wait out the whole budget and then read a\n      // misleading \"element not found\" instead of \"your selector is malformed\".\n      try { document.querySelectorAll(value) } catch (error) {\n        throw new Error('CSS \u9009\u62E9\u5668\u5199\u9519\u4E86 ' + JSON.stringify(value) + '\uFF08' + String((error && error.message) || error) + '\uFF09')\n      }\n      for (const root of roots) els.push(...root.querySelectorAll(value))\n    } else if (by === 'xpath') {\n      try {\n        for (const root of roots) {\n          const snap = document.evaluate(value, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)\n          for (let i = 0; i < snap.snapshotLength; i++) {\n            const node = snap.snapshotItem(i)\n            if (node instanceof Element) els.push(node)\n          }\n        }\n      } catch (error) {\n        throw new Error('XPath \u5199\u9519\u4E86 ' + JSON.stringify(value) + '\uFF08' + String((error && error.message) || error) + '\uFF09')\n      }\n    } else {\n      const all = roots.flatMap((root) => [...root.querySelectorAll('*')])\n      const exact = all.filter((el) => isVisible(el) && nameText(el) === value)\n      const pool = exact.length > 0 ? exact : all.filter((el) => isVisible(el) && nameText(el).includes(value))\n      // \u7CBE\u786E\u547D\u4E2D\u4F18\u5148\u4E8E\u300C\u5305\u542B\u300D\uFF0C\u8FD9\u4E00\u70B9\u62A5\u51FA\u53BB\uFF1A\u8C03\u7528\u8005\u624D\u77E5\u9053\u8FD9\u4E00\u6B21\u662F\u600E\u4E48\u5339\u914D\u4E0A\u7684\u2014\u2014\u6309\u6587\u5B57\u5B9A\u4F4D\n      // \u62FF\u5230\u4E00\u4E2A\u53EA\u56E0\u4E3A\u300C\u5305\u542B\u300D\u800C\u547D\u4E2D\u7684\u5143\u7D20\u65F6\uFF0C\u5F88\u53EF\u80FD\u4E0D\u662F\u4ED6\u60F3\u6307\u7684\u90A3\u4E2A\u3002\n      textMatch = exact.length > 0 ? 'exact' : 'contains'\n      els = pool.sort((a, b) => depthOf(b) - depthOf(a))\n    }\n    // \u53EF\u89C1\u7684\u6392\u5230\u524D\u9762\uFF1A\u540C\u4E00\u4E2A\u9009\u62E9\u5668\u5E38\u5E38\u5339\u914D\u5230\u597D\u51E0\u4E2A\uFF08NCC \u7684\u53C2\u7167\u7A97\u5728 DOM \u91CC\u7559\u7740\u82E5\u5E72\u9690\u85CF\n    // \u7A7A\u58F3\uFF09\uFF0C\u800C index \u6570\u7684\u662F\u300C\u7B2C\u51E0\u4E2A\u5339\u914D\u300D\u3002\u4E0D\u6392\u7684\u8BDD\uFF0C\u7B2C\u4E00\u4E2A\u547D\u4E2D\u7684\u53EF\u80FD\u662F\u4E2A rect \u5168 0\n    // \u7684\u9690\u85CF\u5143\u7D20\u2014\u2014\u70B9\u51FB\u5C31\u843D\u5728 (0,0)\uFF0C\u8BFB\u8D77\u6765\u50CF\u300C\u70B9\u4E86\u6CA1\u53CD\u5E94\u300D\uFF0C\u5B9E\u9645\u662F\u70B9\u4E86\u4E00\u4E2A\u770B\u4E0D\u89C1\u7684\u4E1C\u897F\u3002\n    // sort \u5728\u73B0\u4EE3 JS \u91CC\u662F\u7A33\u5B9A\u7684\uFF0C\u6240\u4EE5\u540C\u53EF\u89C1\u6027\u7684\u5143\u7D20\u4FDD\u6301\u539F\u6765\u7684\u987A\u5E8F\u3002\n    const ordered = els.slice().sort((a, b) => (isVisible(b) ? 1 : 0) - (isVisible(a) ? 1 : 0))\n    let matchedVisible = 0\n    for (const el of ordered) if (isVisible(el)) matchedVisible++\n    const element = ordered[index] || null\n    // text \u5B9A\u4F4D\u5FC5\u7136\u843D\u5230\u6700\u6DF1\u7684\u90A3\u4E2A\u5E26\u5B57\u5143\u7D20\u4E0A\uFF08\u591A\u534A\u662F font/span \u8FD9\u7C7B\u53F6\u5B50\uFF09\u3002\u60F3\u62D6/\u70B9\u7684\u662F\u5916\u5C42\u8282\u70B9\u6839\n    // \u65F6\uFF0C\u8FD9\u4E2A\u4E8B\u5B9E\u6BD4\u4EFB\u4F55\u731C\u6D4B\u90FD\u6709\u7528\uFF0C\u6240\u4EE5\u7167\u5B9E\u62A5\u51FA\u53BB\uFF0C\u800C\u4E0D\u662F\u66FF\u8C03\u7528\u8005\u6539\u9009\u62E9\u5668\u3002\n    return {\n      element: element,\n      matched: ordered.length,\n      matchedVisible: matchedVisible,\n      index: index,\n      textMatch: textMatch,\n      textHitIsLeaf: textMatch !== null && element !== null && element.children.length === 0,\n    }\n  }\n  const matchesTarget = (spec) => matchTargetInfo(spec).element\n  const waitForMatchInfo = async (spec, timeoutMs) => {\n    const deadline = Date.now() + timeoutMs\n    let info = matchTargetInfo(spec)\n    while (!info.element && Date.now() < deadline) {\n      await new Promise((r) => setTimeout(r, 100))\n      info = matchTargetInfo(spec)\n    }\n    return info\n  }\n  const waitFor = async (spec, timeoutMs) => (await waitForMatchInfo(spec, timeoutMs)).element\n";
/** A JSON value the page produced, or a refusal. */
export declare function evaluateJson<T>(context: InteractContext, expression: string): Promise<T>;
/** An element's box, in the coordinates a pointer lands in. */
export interface ClickRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
/** How one relation reads in a sentence. */
export declare function describeHitRelation(relation: HitRelation): string;
/** How one hit reads in a sentence: who it was, and how it related to the target. */
export declare function describeHitBrief(hit: HitReport): string;
/**
 * 指针真的没落在目标身上吗——这是几何问题，不是「谁接到了事件」的问题。
 *
 * 只有 `onTarget === false`（目标的框还在、而这一点落在框外）才算真偏了。关系读成 unrelated
 * 不算：透明探针、被外层容器接住的 1px 锚点、hover 才展开的节点，都会让 elementFromPoint 给出别的
 * 元素，而指针就在目标身上。「目标已被重绘换掉」不算——框已经不在文档里，几何无从判断；也不要在
 * 这种时候替页面下结论，如实说不知道。
 */
export declare function isAstrayHit(hit: HitReport): boolean;
/** Where a real click is about to press, and what is under that point. */
export interface ClickPoint {
    readonly x: number;
    readonly y: number;
    /** Whether any of the target's own box is on screen. Absent when the locate could not say. */
    readonly inViewport?: boolean;
    readonly rect?: ClickRect;
    readonly viewport?: {
        readonly width: number;
        readonly height: number;
    };
    /** What is under (x, y). Pass `unreadHit(x, y)` when the question has not been asked yet. */
    readonly hit: HitReport;
}
/**
 * 这一按到底会不会落在目标身上——不会就说清为什么，会就返回 undefined。
 *
 * 为什么值得单独设一关：`browser_click` 从前进到 `Input.dispatchMouseEvent` 就报成功，而 CDP 对
 * 「这个坐标上没有目标」毫无怨言。实测（金隅共享首页点「业务流设计」）：元素躺在被 CSS 平移出视口
 * 的折叠容器里（`rect.x = -967`），`scrollIntoView` 对这种容器无效，press 发到了视口外，页面毫发
 * 无损，报告却写着「已在页面上点击了 div『业务流设计』」。所以这里把 hover / drag 早就在问的那句话
 * ——「指针底下是谁」——挪到按下之前来问。
 *
 * 三种拒绝各有各的对策，所以分开说：
 * - 按点在视口外：`dom` / `react` 在页面内直接触发，不受视口限制；或者先把容器滚/展开。
 * - 按点底下是别的元素：多半被浮层、固定栏或折叠容器挡住，照实说出是谁挡的。
 * - 目标在按下之前被重绘换掉：等页面稳定再点，别把这一按当成「点到了它」。
 *
 * 读不到命中（跨域 iframe 等）不作判断——这种情况下几何说不了话，如实放行而不是替页面猜。
 */
export declare function describeUnclickableIssue(point: ClickPoint): string | undefined;
/**
 * 一端拖拽在报告里的一行：说的是「到了哪里、怎么匹配上的」，不是「想拖哪里」。
 *
 * 这一行存在的理由：一次拖拽失败时，「按文字取到的其实是最内层的 font」「定位到 7 个元素取了第 1 个」
 * 「元素在页面上是隐藏的」这三件事，决定了下一步该改选择器还是改 mode，而从返回的标签名里一个字都
 * 看不出来。
 */
export declare function describeDragEnd(role: string, end: DragEndReport): string;
/**
 * 一次拖拽的收尾报告：两端各自被定位成了什么，加上四个时刻指针底下是谁。
 *
 * 为什么报告要长成这样：这个工具曾经回报「已拖拽」，而页面什么都没发生——按下被浮层吃掉、七个
 * 候选里取错了那个、松手落在别处，三种情况下 CDP 都毫无怨言。所以报告里必须出现「实际落点」，
 * 而不是只出现「想拖到哪里」。措辞放在这里而不是工具层，是为了让这套规则能被单独测到：一句
 * 错话比一个错数值更难发现。
 */
export declare function reportDrag(pageName: string, outcome: DragOutcome): string;
/**
 * How a click reaches the page.
 *
 * `real` is the CDP pointer — the only one a person could mistake for a human click, and the
 * one most widgets need. The other three run inside the page, for controls that ignore a
 * synthesized pointer: `dom` is a bare `el.click()`, `seq` fires the full
 * mouseenter → over → down → up → click sequence, and `react` walks up to the nearest React
 * handler and calls its `onClick` directly. Reach for them in that order — each sits further
 * from a person than the one before, and the panel's own UI is written for a real pointer.
 */
export type ClickMode = 'real' | 'dom' | 'seq' | 'react';
/** Every click mode, in the order they should be tried. */
export declare const CLICK_MODES: readonly ClickMode[];
/**
 * Which mouse button presses.
 *
 * Only `real` delivers it: a right-press is wanted for the page's own `contextmenu`, and a
 * dispatched DOM event is precisely what 用友's widgets ignore (measured on the semantic-model
 * tree and its table), so a synthesized right-click has nothing to add.
 */
export type MouseButton = 'left' | 'right' | 'middle';
/** Every mouse button, for a tool's enum. */
export declare const MOUSE_BUTTONS: readonly MouseButton[];
/** What a click did, for the caller to report. */
export interface ClickOutcome {
    readonly tag: string;
    readonly text: string;
    /** Which route the click took, so a report can say "synthesized" instead of implying a person. */
    readonly via: ClickMode;
    /** Which button pressed. */
    readonly button: MouseButton;
    /**
     * 按下去之前，那一点底下是谁。空字符串表示这一次没有指针可言（`dom`/`seq`/`react` 在页面内
     * 直接触发），或者没能读到。
     */
    readonly hitTag: string;
    readonly hitText: string;
    readonly hitRelation: HitRelation;
}
/** What one hover settled on. */
export interface HoverOutcome {
    /** The element the caller aimed at. */
    readonly tag: string;
    readonly text: string;
    /** What the pointer actually rests on — not necessarily the element we aimed at. */
    readonly hitTag: string;
    readonly hitText: string;
    /** How that hit relates to the element aimed at. */
    readonly hitRelation: HitRelation;
}
/** Options a click may carry beyond the element it names. */
export interface ClickOptions {
    /** How the click is delivered. Default `real`. */
    readonly mode?: ClickMode;
    /** Which button presses. Default `left`. Only `real` delivers it. */
    readonly button?: MouseButton;
    /**
     * How long to rest on the element after moving the pointer and before pressing.
     *
     * A synthesized click moves and presses in the same instant, while a hand leaves a gap. A
     * widget that renders its own controls on hover therefore has nothing to receive the press:
     * measured on the 旗舰版 semantic-model list, whose row actions appear only once the row is
     * hovered — a real pointer opened them, `browser_click` never did. 200–500 usually suffices.
     */
    readonly hoverMs?: number;
}
/**
 * Click the centre of a located element with a real pointer sequence.
 *
 * The pointer moves first: Chromium delivers a synthesized press to whatever the view
 * currently considers hovered, and a tab that has never seen a mouse event has no hover
 * target at all — the press then goes nowhere while CDP reports success.
 *
 * `hoverMs` extends that same idea in time: a hand arrives, the widget reacts, and only then
 * does it press; a synthetic click does both in the same millisecond.
 */
export declare function clickAt(context: InteractContext, target: ElementTarget, options?: ClickOptions): Promise<ClickOutcome>;
/**
 * Move the pointer onto an element and leave it there, WITHOUT pressing.
 *
 * WHY THIS EXISTS
 * Some controls do not exist in the DOM until something is hovered — the 旗舰版 semantic-model
 * list renders its row actions (重命名 / 复制到 / 移动到 / 更多) only while the row is hovered,
 * and they are gone the moment the pointer leaves. `browser_click` moves and presses in the
 * same instant, so it can neither open that menu nor let a caller see what is in it. The
 * panel's scripts solved this with `hover.mjs`, which needs a shell; this is that same move,
 * in the tool layer, where a session without a shell can still reach it.
 *
 * TWO STEPS, NOT ONE
 * The pointer first lands a short way to the left, pauses, then settles on the centre — some
 * widgets only believe a hover once they have seen a move. One jump to the centre is what a
 * naive implementation does, and what some of these components ignore.
 *
 * THE POINTER STAYS WHERE IT IS
 * Nothing is released, because nothing was pressed. The hover therefore lasts exactly as long
 * as nothing else moves the pointer: a later `browser_click`, a second `hover`, or the
 * operator's own hand all end it. Read the page with `browser_eval` — which does not move the
 * pointer — and finish the job through React props if the menu itself is out of reach.
 *
 * @param context - the attached page.
 * @param target - the element to hover.
 * @param holdMs - how long to rest on it before returning. Default 900ms.
 * @returns the element aimed at, and the element the pointer actually landed on.
 */
export declare function hoverAt(context: InteractContext, target: ElementTarget, holdMs?: number): Promise<HoverOutcome>;
/** How a drag is delivered. */
export type DragMode = 'html5' | 'mouse';
/** Every drag mode, for a tool's enum. */
export declare const DRAG_MODES: readonly DragMode[];
/** How the pointer sequence was actually played. */
export type DragDelivery = 'mouse-events-sent' | 'html5-drop-dispatched';
/** What, if anything, could be verified about the drag from the browser's own side. */
export type DragVerification = 'unavailable' | 'drag-data-intercepted';
/** One end of a drag, as the page measured it. */
export interface DragEndReport extends MatchInfo {
    readonly tag: string;
    readonly text: string;
    /** The centre the pointer was aimed at, in main-frame viewport coordinates. */
    readonly x: number;
    readonly y: number;
}
/** What one drag did, for the caller to report. */
export interface DragOutcome {
    /** Which route the drag took. */
    readonly mode: DragMode;
    /** Which pointer sequence was played, as opposed to which mode was asked for. */
    readonly delivery: DragDelivery;
    /**
     * What the browser itself could confirm about this drag.
     *
     * `drag-data-intercepted` means real HTML5 drag data came back from the browser — the one
     * honest signal that the press became a drag rather than a click that went nowhere. `mouse`
     * has no such signal at all, which is why this is reported rather than assumed.
     */
    readonly verification: DragVerification;
    /**
     * Whether the browser handed back real HTML5 drag data.
     *
     * Always false for `mouse`, where nothing can be intercepted. For `html5` it is the one
     * honest signal that the press actually became a drag: a source that is not `draggable`, or
     * a widget built on `mousemove`, never produces it — and without it there is nothing to
     * drop, which is why this is reported rather than assumed.
     */
    readonly intercepted: boolean;
    /**
     * Where the drag started and where it was dropped, as the page measured those two elements —
     * what was located, how many candidates matched, which one was taken, and how the means of
     * locating it behaved. This is what the caller reports when a drag "worked" but did the wrong
     * thing: the wrong one of seven matches and a text hit on a `font` look identical in a tag name.
     */
    readonly from: DragEndReport;
    readonly to: DragEndReport;
    /** Who was under the pointer when it pressed — the sample an overlay swallowing the press shows up in. */
    readonly fromPressHit: HitReport;
    /** Who was under the drop point before the gesture began, to compare with `toMidHit`. */
    readonly toBeforeHit: HitReport;
    /** Who was under the drop point after the last move, before the drop — where a page's own drag proxy appears. */
    readonly toMidHit: HitReport;
    /** Who was under the drop point after the release — whether the drop reached the intended element. */
    readonly toReleaseHit: HitReport;
}
/** Options a drag may carry. */
export interface DragOptions {
    /** How the drag is delivered. Default `html5`. */
    readonly mode?: DragMode;
    /** How many interpolated moves to make between the two ends. Default 12. */
    readonly steps?: number;
    /** Milliseconds between two moves. Default 60. */
    readonly stepMs?: number;
}
/**
 * Drag one element onto another with a real pointer.
 *
 * WHY NOT A SYNTHESIZED DRAGEVENT
 * A drop zone that checks the event (or anything upstream of it) can tell a dispatched
 * `DragEvent` from a real one, and 用友's designer drop targets are exactly that: measured,
 * a synthesized `dragstart`/`drop` pair does nothing, while this sequence works. That is why
 * the whole thing has to happen at the CDP level.
 *
 * TWO WAYS, AND THEY ARE NOT INTERCHANGEABLE
 * `html5` is for `draggable="true"` sources: the browser must be told to hand the drag to us
 * (`Input.setInterceptDrags`), we then wait for `Input.dragIntercepted` to learn what is being
 * carried, and finally replay `dragEnter` → `dragOver` → `drop` at the target.
 * `mouse` is for everything built on `mousedown`/`mousemove`/`mouseup` — sliders, sortable
 * tables, canvas panning. Running the wrong one produces no error in the page, only nothing
 * happening, which is why each reports `intercepted` and the html5 failure names the other mode.
 *
 * BOTH ENDS MUST BE IN VIEW
 * CDP pointer coordinates are viewport coordinates, so a target scrolled out of sight cannot
 * be dropped on. Both ends are therefore measured after a single scroll (measuring them
 * separately would move the page between the two readings), and a drag whose ends do not both
 * fit is refused with an explanation instead of silently missing.
 *
 * WHAT IS REPORTED, AND WHY IT IS SAMPLED RATHER THAN INFERRED
 * "It says it dragged" and "it dragged" are different claims, and the gap between them is where
 * this tool used to be trusted wrongly. So four points of the gesture are read back from the
 * page: who was under the press, who was under the drop point before the gesture, who was under
 * it after the last move (where the page's own drag proxy shows up), and who was under it after
 * the release. Each is reported as a RELATION to the element aimed at, plus how many elements
 * the locator matched and which one was taken — a wrong `index`, a text match that landed on a
 * `font` inside the node, or an overlay swallowing the press are all visible in that, and none
 * of them are visible from "intercepted: true".
 *
 * @param context - the attached page.
 * @param from - the element to drag.
 * @param to - the element to drop on.
 * @param options - mode and pacing.
 * @returns both ends as located and measured, the four hit samples, and whether real drag data moved.
 */
export declare function dragBetween(context: InteractContext, from: ElementTarget, to: ElementTarget, options?: DragOptions): Promise<DragOutcome>;
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
