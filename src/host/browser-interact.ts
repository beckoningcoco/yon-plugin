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

import type { CdpConnection, CdpMessage } from './cdp-client.ts'

/** Why an in-page action could not be carried out. */
export type InteractErrorCode =
  /** The arguments do not describe a locatable element. */
  | 'invalid-target'
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
  | 'failed'

/** One refusal from this layer. */
export class InteractError extends Error {
  constructor(
    readonly code: InteractErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'InteractError'
  }
}

/** How an element is named. `by` defaults to `css`. */
export interface ElementTarget {
  /** How to interpret `value`. */
  readonly by?: 'css' | 'text' | 'xpath'
  /** The selector, the visible text, or the XPath. */
  readonly value: string
  /** Which match to take when several match. Default 0. */
  readonly index?: number
}

/** The locator as the page sees it, with every default filled in. */
interface TargetSpec {
  readonly by: string
  readonly value: string
  readonly index: number
}

/** How a `by: 'text'` locator matched: the whole text, or only part of it. */
export type TextMatch = 'exact' | 'contains'

/**
 * How what is under a point relates to the element that was aimed at.
 *
 * Reported instead of comparing tag names, because a tag-name comparison calls every legitimate
 * hit on a child element a miss — and the element that receives the gesture usually IS a child.
 */
export type HitRelation =
  | 'same'
  | 'hit-inside-target'
  | 'target-inside-hit'
  | 'unrelated'
  | 'unavailable'
  | 'target-is-detached'

/** What is under one viewport point, and how it relates to the target. */
export interface HitReport {
  readonly x: number
  readonly y: number
  readonly tag: string
  readonly text: string
  readonly relation: HitRelation
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
  readonly onTarget: boolean | null
}

/** One end of a locate: how many matched, which one was taken, how the text matched. */
export interface MatchInfo {
  readonly matched: number
  readonly matchedVisible: number
  readonly index: number
  readonly textMatch: TextMatch | null
  /** The match is a text-only leaf (a `font`/`span`), not the node root a drag usually wants. */
  readonly textHitIsLeaf: boolean
}

/** The connection and session an action runs on. */
export interface InteractContext {
  readonly connection: CdpConnection
  readonly sessionId: string
}

/** How long a locate may poll before giving up. */
const LOCATE_TIMEOUT_MS = 5_000

/** How long one dispatch may take. */
const DISPATCH_TIMEOUT_MS = 20_000

/**
 * The named keys this layer can press.
 *
 * The table is the whole vocabulary: CDP needs a `key`/`code`/virtual-key triple for a
 * non-printable key to be delivered as a keystroke rather than as nothing at all. `Space` is
 * the one printable entry and carries `text` — without it the key only scrolls.
 */
const KEY_SPECS: Readonly<Record<string, { readonly key: string; readonly code: string; readonly vk: number; readonly text?: string }>> = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
}

/** Every key name, for a tool's enum and for error messages. */
export const KEY_NAMES: readonly string[] = Object.keys(KEY_SPECS)

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
export const PAGE_HELPERS = `
  // 跨 realm 的可见性判断。脚本在主文档里执行，而 iframe 里的元素 instanceof
  // HTMLElement 恒为 false（那个构造函数来自另一个 realm），所以只能看能力，不能看
  // 身份——用身份判断会把 iframe 内的元素整体判成不可见。
  const isVisible = (el) => el !== null && el !== undefined
    && typeof el.getClientRects === 'function'
    && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0)
  const ownText = (el) => Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent || '').join('').trim()
  // An input has no text of its own: what a person calls it lives in its placeholder or
  // aria-label. Falling back to those only when there is no own text leaves every existing
  // match working, and makes "type into 搜索" mean what it reads like.
  const nameText = (el) => {
    const own = ownText(el)
    if (own !== '') return own
    const aria = el.getAttribute('aria-label')
    if (aria !== null && aria.trim() !== '') return aria.trim()
    const placeholder = el.getAttribute('placeholder')
    if (placeholder !== null && placeholder.trim() !== '') return placeholder.trim()
    return ''
  }
  const depthOf = (el) => { let d = 0; let p = el.parentElement; while (p) { d++; p = p.parentElement } return d }
  // 一个元素「看上去写着什么」。不能用 textContent：实测里一个业务流节点把内部那份隐藏的候选下拉
  // （里面是别的单据名：ERP销售合同、项目销售合同…）也算成了自己的文字，于是报告写着「拖的是
  // ERP销售合同」，而屏幕上明明是「销售订单」——元素找对了，是"取名字"取错了。取文字因此按两个
  // 条件走：子节点要可见，且不能整个落在元素自己的框之外。一条可见文字都读不到就交白卷——拿隐藏的
  // 文字凑出来的名字，正是这条报告最容易出错的地方。
  //
  // 也不许把几个分支的文字串起来：容器（画布、工具条）里每个子件各写各的字，串起来就是
  // div「- 100% + 销售订单 销售发货单 +」这种东西——读着像名字，其实是把画布内容念了一遍。
  // 所以只认**一支**文字：元素自己的直属文字与第一个写着字的子分支算同一支（「前缀<span>值</span>」
  // 照样读得出来），一旦出现第二个写着字的子分支，整段交白卷——容器不该有一个名字。
  const visibleText = (el, limit) => {
    if (!el) return ''
    let root = null
    try { root = el.getBoundingClientRect() } catch (error) { root = null }
    const hasBox = root !== null && (root.width > 0 || root.height > 0)
    // 只在「有框、且框整个在 root 之外」时才判为在外。没框的东西（display:contents 的包装层）不能
    // 当成"在外面"，否则它下面真正显示着的文字会被整段丢掉。
    const outsideBox = (node) => {
      if (!hasBox || typeof node.getBoundingClientRect !== 'function') return false
      let r = null
      try { r = node.getBoundingClientRect() } catch (error) { return false }
      if (r.width === 0 && r.height === 0) return false
      return !(r.right > root.left - 1 && r.left < root.right + 1
        && r.bottom > root.top - 1 && r.top < root.bottom + 1)
    }
    // display:contents 的元素自己不生成框，却被 isVisible 判成"不可见"；它只是包装层，要照常往下走。
    const isLayoutless = (node) => {
      try {
        const win = node.ownerDocument && node.ownerDocument.defaultView
        return !!win && win.getComputedStyle(node).display === 'contents'
      } catch (error) { return false }
    }
    const parts = []
    // 每一段文字来自哪一支：元素直属的文字节点算 'own'，元素子节点按它的序号各算一支。
    const origins = new Set()
    const walk = (node, depth, origin) => {
      if (depth > 8 || parts.join('').length >= limit) return
      if (node.nodeType === 3) {
        // 注意：这是 PAGE_HELPERS 模板字面量内部——正则里的反斜杠要写成两个，页面拿到的才是一个；
        // 写成一个，页面拿到的是 /s+/（匹配一串字母 s），名字里的换行与多空格就不会被折叠。
        // （这里也不能出现反引号，会提前结束模板字面量。）
        const t = (node.textContent || '').replace(/\\s+/g, ' ').trim()
        if (t !== '') { parts.push(t); origins.add(origin) }
        return
      }
      if (node.nodeType !== 1) return
      if (node !== el) {
        if (!isVisible(node) && !isLayoutless(node)) return
        if (outsideBox(node)) return
      }
      const kids = node.childNodes
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i]
        walk(child, depth + 1, node === el ? (child.nodeType === 3 ? 'own' : i) : origin)
      }
    }
    walk(el, 0, 'own')
    if (parts.length === 0) return ''
    // 直属文字与第一个写着字的子分支算同一支，它俩同时出现不算「两支」。
    let branches = origins.size
    if (origins.has('own') && branches > 1) branches -= 1
    if (branches > 1) return ''
    return parts.join(' ').trim().slice(0, limit)
  }
  // CDP 的鼠标坐标是相对**主框架**视口的，而 getBoundingClientRect 给的是相对元素所在
  // 文档视口的。元素在 iframe 里时，这两者差着整条 frame 链的位置：不加这段，点击会落在
  // 目标**上方**，而且偏多少由外层布局决定（实测 NCC 工作台偏 44px，正好是它顶栏的高度）
  // ——工具还会回一句「已点击」，因为按下确实发生了，只是发生在别的元素上。
  const mainFrameOffset = (el) => {
    let x = 0
    let y = 0
    try {
      let win = el.ownerDocument && el.ownerDocument.defaultView
      while (win && win.frameElement) {
        const frame = win.frameElement
        const r = frame.getBoundingClientRect()
        // clientLeft/clientTop 是 iframe 自己的边框：rect 从边框外沿算起，内容从内沿开始。
        x += r.left + (frame.clientLeft || 0)
        y += r.top + (frame.clientTop || 0)
        win = frame.ownerDocument && frame.ownerDocument.defaultView
      }
    } catch (error) {
      // 跨域 frame 读不到 frameElement，保持已累加的部分，让坐标去报它自己的错。
    }
    return { x: x, y: y }
  }
  const allRoots = () => {
    const roots = []
    const seen = new Set()
    const visit = (doc) => {
      if (seen.has(doc)) return
      seen.add(doc)
      roots.push(doc)
      for (const el of doc.querySelectorAll('*')) {
        if (el.shadowRoot) visit(el.shadowRoot)
        if (el.tagName === 'IFRAME') {
          try { const inner = el.contentDocument; if (inner) visit(inner) } catch { /* cross-origin */ }
        }
      }
    }
    visit(document)
    return roots
  }
  // 命中检测：某个视口坐标上最上层的是谁。document.elementFromPoint 不穿透 iframe（只回那个
  // iframe 元素本身），也不穿透 shadow root（只回 host），所以按坐标逐层往里钻——进 iframe
  // 要扣掉该层的边框偏移（与 mainFrameOffset 的累加方向相反，两者互为逆运算），进 shadow root
  // 则坐标不变：它和外层文档共用同一套视口坐标。
  // 单独写成一个共用的 helper，是因为「指针/落点底下到底是谁」在 hover、drag 里都要问，各写各的
  // 必然有两套口径，而这两处恰恰是最容易回报得理直气壮却错的地方。
  const hitAtPoint = (x, y) => {
    let cx = x
    let cy = y
    let doc = document
    for (let depth = 0; depth < 16; depth++) {
      if (!doc || typeof doc.elementFromPoint !== 'function') return null
      const found = doc.elementFromPoint(cx, cy)
      if (!found) return null
      let el = found
      for (let shadowDepth = 0; shadowDepth < 16; shadowDepth++) {
        const shadow = el.shadowRoot
        if (!shadow || typeof shadow.elementFromPoint !== 'function') break
        const inner = shadow.elementFromPoint(cx, cy)
        if (!inner || inner === el) break
        el = inner
      }
      if (el.tagName !== 'IFRAME') return el
      const r = el.getBoundingClientRect()
      let innerDoc = null
      try { innerDoc = el.contentDocument } catch (error) { innerDoc = null }
      if (!innerDoc || innerDoc === doc) return el
      cx = cx - (r.left + (el.clientLeft || 0))
      cy = cy - (r.top + (el.clientTop || 0))
      doc = innerDoc
    }
    return null
  }
  // 命中的元素和目标是什么关系。这是「点/拖到的东西对不对」该看的东西，比拿 tagName 比字符串
  // 可靠：命中的常常是目标内部的子元素（收到事件的正是它），字符串比法会把这种情况报成「偏了」。
  const hitRelation = (target, hit) => {
    if (!target || !hit) return 'unavailable'
    if (hit === target) return 'same'
    // elementFromPoint 只会给出还在文档里的元素，所以「已脱离文档」这一条只可能发生在**目标**
    // 身上：说明瞄的那个节点在读数之前已经被重绘换掉了，坐标再对也打不到它。
    if (target.isConnected === false) return 'target-is-detached'
    if (typeof target.contains === 'function' && target.contains(hit)) return 'hit-inside-target'
    if (typeof hit.contains === 'function' && hit.contains(target)) return 'target-inside-hit'
    return 'unrelated'
  }
  // 指针在不在目标自己的框里。与「谁接到了事件」分开问，因为两者不是一回事：落点是
  // pointer-events:none 的透明探针时 elementFromPoint 会穿过去、1px 的锚点会被它的外层容器接住、
  // 目标是 hover 才展开的节点时按下会落在内部的 span 上——这三种情况下命中的都不是目标，而指针
  // 其实就在目标身上。拿「命中谁」单独当「拖偏了」的证据，一次正常的拖拽就会带一条假警报。
  const pointOnTarget = (target, x, y) => {
    if (!target || target.isConnected === false) return null
    if (typeof target.getBoundingClientRect !== 'function') return null
    let r = null
    try { r = target.getBoundingClientRect() } catch (error) { return null }
    if (r.width === 0 && r.height === 0) return null
    return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2
  }
  const describeHit = (x, y, target) => {
    const el = hitAtPoint(x, y)
    const onTarget = pointOnTarget(target, x, y)
    if (!el) {
      return { x: x, y: y, tag: '', text: '', relation: 'unavailable', onTarget: onTarget }
    }
    return {
      x: x,
      y: y,
      tag: el.tagName.toLowerCase(),
      text: visibleText(el, 60),
      relation: hitRelation(target, el),
      onTarget: onTarget,
    }
  }
  const matchTargetInfo = (spec) => {
    const by = typeof spec.by === 'string' ? spec.by : 'css'
    const value = String(spec.value == null ? '' : spec.value)
    const index = typeof spec.index === 'number' ? spec.index : 0
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('target.index 必须是非负整数，收到 ' + JSON.stringify(spec.index))
    }
    const roots = allRoots()
    let els = []
    let textMatch = null
    if (by === 'css') {
      // A selector that does not PARSE can never match on a later poll, so it must not be
      // reported as a miss: the caller would wait out the whole budget and then read a
      // misleading "element not found" instead of "your selector is malformed".
      try { document.querySelectorAll(value) } catch (error) {
        throw new Error('CSS 选择器写错了 ' + JSON.stringify(value) + '（' + String((error && error.message) || error) + '）')
      }
      for (const root of roots) els.push(...root.querySelectorAll(value))
    } else if (by === 'xpath') {
      try {
        for (const root of roots) {
          const snap = document.evaluate(value, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
          for (let i = 0; i < snap.snapshotLength; i++) {
            const node = snap.snapshotItem(i)
            if (node instanceof Element) els.push(node)
          }
        }
      } catch (error) {
        throw new Error('XPath 写错了 ' + JSON.stringify(value) + '（' + String((error && error.message) || error) + '）')
      }
    } else {
      const all = roots.flatMap((root) => [...root.querySelectorAll('*')])
      const exact = all.filter((el) => isVisible(el) && nameText(el) === value)
      const pool = exact.length > 0 ? exact : all.filter((el) => isVisible(el) && nameText(el).includes(value))
      // 精确命中优先于「包含」，这一点报出去：调用者才知道这一次是怎么匹配上的——按文字定位
      // 拿到一个只因为「包含」而命中的元素时，很可能不是他想指的那个。
      textMatch = exact.length > 0 ? 'exact' : 'contains'
      els = pool.sort((a, b) => depthOf(b) - depthOf(a))
    }
    // 可见的排到前面：同一个选择器常常匹配到好几个（NCC 的参照窗在 DOM 里留着若干隐藏
    // 空壳），而 index 数的是「第几个匹配」。不排的话，第一个命中的可能是个 rect 全 0
    // 的隐藏元素——点击就落在 (0,0)，读起来像「点了没反应」，实际是点了一个看不见的东西。
    // sort 在现代 JS 里是稳定的，所以同可见性的元素保持原来的顺序。
    const ordered = els.slice().sort((a, b) => (isVisible(b) ? 1 : 0) - (isVisible(a) ? 1 : 0))
    let matchedVisible = 0
    for (const el of ordered) if (isVisible(el)) matchedVisible++
    const element = ordered[index] || null
    // text 定位必然落到最深的那个带字元素上（多半是 font/span 这类叶子）。想拖/点的是外层节点根
    // 时，这个事实比任何猜测都有用，所以照实报出去，而不是替调用者改选择器。
    return {
      element: element,
      matched: ordered.length,
      matchedVisible: matchedVisible,
      index: index,
      textMatch: textMatch,
      textHitIsLeaf: textMatch !== null && element !== null && element.children.length === 0,
    }
  }
  const matchesTarget = (spec) => matchTargetInfo(spec).element
  const waitForMatchInfo = async (spec, timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    let info = matchTargetInfo(spec)
    while (!info.element && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
      info = matchTargetInfo(spec)
    }
    return info
  }
  const waitFor = async (spec, timeoutMs) => (await waitForMatchInfo(spec, timeoutMs)).element
`

/** A JSON value the page produced, or a refusal. */
export async function evaluateJson<T>(context: InteractContext, expression: string): Promise<T> {
  const result = await context.connection.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, context.sessionId)

  const exception = result['exceptionDetails']
  if (exception !== null && exception !== undefined && typeof exception === 'object') {
    const detail = exception as Record<string, unknown>
    const described = detail['exception']
    const text = described !== null && typeof described === 'object'
      ? (described as Record<string, unknown>)['description']
      : undefined
    throw new InteractError('failed',
      `页面里报错了：${typeof text === 'string' ? text : JSON.stringify(detail)}`)
  }

  const remote = result['result']
  if (remote === null || typeof remote !== 'object') return undefined as T
  return (remote as Record<string, unknown>)['value'] as T
}

/** An element's box, in the coordinates a pointer lands in. */
export interface ClickRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** What a locate returns: where the element is, or why it is not there. */
interface Located {
  readonly ok: boolean
  readonly reason?: string
  readonly x?: number
  readonly y?: number
  readonly tag?: string
  readonly text?: string
  /** How many elements matched, how many of those were visible, and which was taken. */
  readonly matched?: number
  readonly matchedVisible?: number
  readonly index?: number
  readonly textMatch?: TextMatch | null
  readonly textHitIsLeaf?: boolean
  /**
   * 元素自己的框、所在视口的大小、以及「框有没有落在视口里」。
   *
   * 带着它回来，是因为「坐标算出来了」不等于「这个坐标在屏幕上有东西」：被 CSS 平移出视口的
   * 折叠容器里，`scrollIntoView` 救不了，`rect.x` 仍旧是负的，而 CDP 会照样把 press 发出去。
   */
  readonly rect?: ClickRect
  readonly viewport?: { readonly width: number; readonly height: number }
  readonly inViewport?: boolean
}

/** The locator as the page will receive it: defaults filled in. */
function specOf(target: ElementTarget): TargetSpec {
  return { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 }
}

/**
 * Run a locator that scrolls the element into view and reports its centre.
 *
 * `focus` is folded into the same round-trip rather than done separately: focusing means
 * locating again, and an element found a moment ago may be gone by then.
 */
async function locate(context: InteractContext, target: ElementTarget, focus = false): Promise<Located> {
  const spec = specOf(target)
  const focusIt = focus ? 'true' : 'false'
  const script = `(async () => {
    const spec = ${JSON.stringify(spec)}
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    ${PAGE_HELPERS}
    let info
    try { info = await waitForMatchInfo(spec, timeoutMs) } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    const el = info.element
    // 「一个都没匹配到」和「匹配到了好几个、但 index 指到了范围外」是两回事，以前都报成
    // not-found，于是把一个 index 写错读成了「页面上还没有这个元素」。
    if (!el) {
      return {
        ok: false,
        reason: info.matched > 0 ? 'index-out-of-range' : 'not-found',
        matched: info.matched,
        matchedVisible: info.matchedVisible,
        index: info.index,
      }
    }
    if (${focusIt} && typeof el.focus === 'function') el.focus()
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    // 相对主框架的坐标：CDP 的输入事件按主框架视口定位，iframe 内的元素必须补上偏移。
    const offset = mainFrameOffset(el)
    const win = (el.ownerDocument && el.ownerDocument.defaultView) || window
    const vw = win.innerWidth || 0
    const vh = win.innerHeight || 0
    return {
      ok: true,
      x: Math.round(offset.x + r.x + r.width / 2),
      y: Math.round(offset.y + r.y + r.height / 2),
      tag: el.tagName.toLowerCase(),
      text: visibleText(el, 80),
      matched: info.matched,
      matchedVisible: info.matchedVisible,
      index: info.index,
      textMatch: info.textMatch,
      textHitIsLeaf: info.textHitIsLeaf,
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      viewport: { width: vw, height: vh },
      inViewport: r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh,
    }
  })()`
  const located = await evaluateJson<Located>(context, script)
  if (located.ok) return located
  if (located.reason === 'index-out-of-range') {
    throw new InteractError('not-found',
      `${describeTarget(target)} 匹配到了 ${String(located.matched ?? 0)} 个元素`
      + `（其中可见的 ${String(located.matchedVisible ?? 0)} 个），但要的是第 ${String((located.index ?? 0) + 1)} 个`
      + `（index=${String(located.index ?? 0)}）。index 从 0 数起、数的是全部匹配（隐藏的也算）：`
      + '要么把 index 改小，要么把选择器写窄一点，只留下你要的那一个。')
  }
  if (located.reason === 'not-found') {
    throw new InteractError('not-found',
      `没有找到 ${describeTarget(target)}。页面里可能还没有这个元素（可以先用 browser_read 看一遍），`
      + '或者选择器/文字对不上。CSS 选择器可以写 `#id`、`[name=x]`、`button.primary` 这类；'
      + '按可见文字找就用 by="text"，只写按钮上的字。')
  }
  throw new InteractError('invalid-target', located.reason ?? '定位失败')
}

/** How a target reads in an error message. */
function describeTarget(target: ElementTarget): string {
  const by = target.by ?? 'css'
  const which = by === 'css' ? '这个选择器' : by === 'text' ? '这段文字' : '这个 XPath'
  return `${which}「${target.value}」`
}

/**
 * Ask the page what is under one viewport point.
 *
 * `targetExpr` names the element that was aimed at, evaluated in the SAME round-trip: relation is
 * a question about that element and this point together, and asking it in two round-trips would
 * answer about a DOM that has already moved on.
 */
async function readHitAt(
  context: InteractContext,
  x: number,
  y: number,
  targetExpr: string,
): Promise<HitReport> {
  const hit = await evaluateJson<HitReport | undefined>(context, `(() => {
    ${PAGE_HELPERS}
    let target = null
    try { target = ${targetExpr} } catch (error) { target = null }
    return describeHit(${String(x)}, ${String(y)}, target)
  })()`)
  return hit ?? { x, y, tag: '', text: '', relation: 'unavailable', onTarget: null }
}

/** What is under a point, against the element a locator names. */
async function readHit(
  context: InteractContext,
  x: number,
  y: number,
  spec: TargetSpec,
): Promise<HitReport> {
  return await readHitAt(context, x, y, `matchesTarget(${JSON.stringify(spec)})`)
}

/**
 * What is under a point, against an element stashed at the start of a drag.
 *
 * A drag rewrites the DOM it drags in, so re-locating by selector mid-drag can land on the ghost
 * copy the page has just inserted and answer "you hit the target" about a different node. The two
 * elements are therefore kept on `window.__dshDragEnds` for the duration of the gesture.
 */
async function readStashedHit(
  context: InteractContext,
  x: number,
  y: number,
  which: 'from' | 'to',
): Promise<HitReport> {
  return await readHitAt(context, x, y,
    `(function () { const s = window.__dshDragEnds; return s ? s[${JSON.stringify(which)}] : null })()`)
}

/** A hit nobody could be read at, so a report always carries all of its samples. */
function unreadHit(x: number, y: number): HitReport {
  return { x, y, tag: '', text: '', relation: 'unavailable', onTarget: null }
}

/** The relation between a hit and its target, in the words a report should use. */
const RELATION_TEXT: Readonly<Record<HitRelation, string>> = {
  same: '就是目标本身',
  'hit-inside-target': '目标内部的子元素',
  'target-inside-hit': '包住目标的外层元素',
  unrelated: '与目标无关的另一个元素',
  unavailable: '没读到',
  'target-is-detached': '目标已被页面重绘换掉',
}

/** How one relation reads in a sentence. */
export function describeHitRelation(relation: HitRelation): string {
  return RELATION_TEXT[relation]
}

/** How one hit reads in a sentence: who it was, and how it related to the target. */
export function describeHitBrief(hit: HitReport): string {
  if (hit.tag === '') return '没读到（页面没给出元素）'
  const who = hit.text === '' ? hit.tag : `${hit.tag}「${hit.text}」`
  const astray = hit.onTarget === false ? '，这一点不在它的框里' : ''
  return `${who}（${describeHitRelation(hit.relation)}${astray}）`
}

/**
 * 指针真的没落在目标身上吗——这是几何问题，不是「谁接到了事件」的问题。
 *
 * 只有 `onTarget === false`（目标的框还在、而这一点落在框外）才算真偏了。关系读成 unrelated
 * 不算：透明探针、被外层容器接住的 1px 锚点、hover 才展开的节点，都会让 elementFromPoint 给出别的
 * 元素，而指针就在目标身上。「目标已被重绘换掉」不算——框已经不在文档里，几何无从判断；也不要在
 * 这种时候替页面下结论，如实说不知道。
 */
export function isAstrayHit(hit: HitReport): boolean {
  return hit.onTarget === false
}

/** Where a real click is about to press, and what is under that point. */
export interface ClickPoint {
  readonly x: number
  readonly y: number
  /** Whether any of the target's own box is on screen. Absent when the locate could not say. */
  readonly inViewport?: boolean
  readonly rect?: ClickRect
  readonly viewport?: { readonly width: number; readonly height: number }
  /** What is under (x, y). Pass `unreadHit(x, y)` when the question has not been asked yet. */
  readonly hit: HitReport
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
export function describeUnclickableIssue(point: ClickPoint): string | undefined {
  const vp = point.viewport
  const place = point.rect === undefined
    ? `(${String(point.x)}, ${String(point.y)})`
    : `(${String(point.x)}, ${String(point.y)})，目标框 x=${String(point.rect.x)} y=${String(point.rect.y)}`
      + ` w=${String(point.rect.width)} h=${String(point.rect.height)}`
  const pointOutside = vp !== undefined
    && (point.x < 0 || point.y < 0 || point.x > vp.width || point.y > vp.height)
  if (point.inViewport === false || pointOutside) {
    const seen = vp === undefined ? '' : `视口 ${String(vp.width)}×${String(vp.height)}，`
    return `按点 ${place}；${seen}这一点不在视口里，真实指针落不到它身上，所以这一次点击没有发生。`
      + '元素多半躺在一个被平移或折叠出屏幕的容器里，scrollIntoView 对这种容器无效。'
      + '改用 mode="dom" 或 "react"（在页面内直接触发，不受视口限制），'
      + '或者先把那个容器展开、滚到看得见再点。'
  }

  const hit = point.hit
  if (hit.relation === 'target-is-detached') {
    return `按点 ${place}；但目标在按下之前就被页面重绘换掉了，这一点上已经不是它，所以这一次点击`
      + '没有发生。等页面稳定一点再点，或者把定位写得更稳（例如按 id、按稳定的容器）。'
  }
  if (isAstrayHit(hit)) {
    return `按点 ${place}；指针底下是 ${describeHitBrief(hit)}，不是要点的那个元素，所以这一次点击`
      + '没有发生。它可能被浮层、固定栏或折叠容器挡住了。'
      + '用 browser_read / browser_eval 看一眼那一点周围是什么，或者改用 mode="dom" / "react"。'
  }
  return undefined
}

/**
 * 一端拖拽在报告里的一行：说的是「到了哪里、怎么匹配上的」，不是「想拖哪里」。
 *
 * 这一行存在的理由：一次拖拽失败时，「按文字取到的其实是最内层的 font」「定位到 7 个元素取了第 1 个」
 * 「元素在页面上是隐藏的」这三件事，决定了下一步该改选择器还是改 mode，而从返回的标签名里一个字都
 * 看不出来。
 */
export function describeDragEnd(role: string, end: DragEndReport): string {
  const who = end.text === '' ? end.tag : `${end.tag}「${end.text}」`
  const notes: string[] = []
  if (end.matched > 1) notes.push(`定位到 ${end.matched} 个（取第 ${end.index + 1} 个）`)
  if (end.textMatch === 'contains') notes.push('按文字只是部分匹配，不是整串相等')
  if (end.textHitIsLeaf) notes.push('按文字取到的是只有文字的最内层元素（如 font/span），'
    + '拖拽通常要它的外层节点')
  if (!end.matchedVisible) notes.push('页面上不可见（display/visibility/尺寸为零）')
  const about = notes.length === 0 ? '' : `（${notes.join('；')}）`
  return `${role} ${who}${about}`
}

/**
 * 一次拖拽的收尾报告：两端各自被定位成了什么，加上四个时刻指针底下是谁。
 *
 * 为什么报告要长成这样：这个工具曾经回报「已拖拽」，而页面什么都没发生——按下被浮层吃掉、七个
 * 候选里取错了那个、松手落在别处，三种情况下 CDP 都毫无怨言。所以报告里必须出现「实际落点」，
 * 而不是只出现「想拖到哪里」。措辞放在这里而不是工具层，是为了让这套规则能被单独测到：一句
 * 错话比一个错数值更难发现。
 */
export function reportDrag(pageName: string, outcome: DragOutcome): string {
  const src = describeDragEnd('起点', outcome.from)
  const dst = describeDragEnd('落点', outcome.to)
  const via = outcome.mode === 'html5'
    ? (outcome.intercepted
      ? 'HTML5 拖拽数据已由浏览器投递——按下确实变成了拖拽'
      : '⚠️ 浏览器没有交出 HTML5 拖拽数据——源头多半不是 draggable="true"，或者这个控件其实在听 '
        + 'mousemove，那就该换 mode: "mouse"')
    : '鼠标拖拽（mousedown/mousemove/mouseup），浏览器这一侧没有可核对的信号'
  const warnings: string[] = []
  // 需要说破、但不构成「可能失败了」的观察。与 warnings 分开，是因为警告是要人去改点什么的
  // （换选择器、换 mode、重试），而这里只是防止读报告的人自己推出一个错的结论。
  const notes: string[] = []
  if (outcome.from.matched > 1) {
    warnings.push(`⚠️ 起点定位到 ${outcome.from.matched} 个元素，这次取的是第 ${outcome.from.index + 1} 个；`
      + '如果拖错了对象，用更精确的选择器或 fromIndex 指定。')
  }
  if (outcome.to.matched > 1) {
    warnings.push(`⚠️ 落点定位到 ${outcome.to.matched} 个元素，这次取的是第 ${outcome.to.index + 1} 个；`
      + '如果落在错的格子，用更精确的选择器或 toIndex 指定。')
  }
  if (outcome.from.matchedVisible === 0) {
    warnings.push('⚠️ 起点在页面上不可见（display/visibility/尺寸为零），拖的是它自己的框，'
      + '这可能不是你要的位置。')
  }
  if (outcome.to.matchedVisible === 0) {
    warnings.push('⚠️ 落点在页面上不可见（display/visibility/尺寸为零），拖的是它自己的框，'
      + '这可能不是你要的位置。')
  }
  if (isAstrayHit(outcome.fromPressHit)) {
    warnings.push(`⚠️ 按下时指针底下是 ${describeHitBrief(outcome.fromPressHit)}——这一点确实不在起点的`
      + '框里，按下多半落在了别处（坐标算错、页面又滚过、或起点被移走了）。')
  }
  if (isAstrayHit(outcome.toReleaseHit)) {
    warnings.push(`⚠️ 松手时指针底下是 ${describeHitBrief(outcome.toReleaseHit)}——这一点确实不在落点的`
      + '框里，接收方多半没收到这次拖拽。')
  }
  // 关系读成「与目标无关」而指针其实在目标框里，是这套页面里最常见的一种形状（透明覆盖层、锚点被
  // 外层容器接住、hover 才展开的节点）。它看着像失败，所以要说破；不说破，人就会去重试一次已经成功
  // 的拖拽，那才会真的做出重复的节点和重复的连线。
  //
  // 但「在框里」这句话必须有正面证据（onTarget === true）。onTarget 为 null 是「几何无从判断」：
  // 尺寸为零的隐藏空壳、已脱离文档的节点都落在这里。旧写法拿 !isAstrayHit() 当条件，等于把「不知道」
  // 也算成了「在框里」，于是同一份报告一边写着「起点在页面上不可见」，一边又断言「这一点就在起点的
  // 框里」——实测于业务流设计器未搜索时的左栏菜单，起点正是 0×0 的空壳。
  if (outcome.fromPressHit.relation === 'unrelated' && outcome.fromPressHit.onTarget === true) {
    notes.push(`按下时接住指针的 ${describeHitBrief(outcome.fromPressHit)} 不是起点本身，但这一点就在`
      + '起点的框里——不等于按偏了。')
  } else if (outcome.fromPressHit.relation === 'unrelated' && outcome.fromPressHit.onTarget === null) {
    notes.push(`按下时接住指针的 ${describeHitBrief(outcome.fromPressHit)} 不是起点本身；而起点这一次`
      + '没有可用的框（尺寸为零、或已脱离文档），几何无从判断——它算不算按在起点上，这里给不出结论。')
  }
  if (outcome.toReleaseHit.relation === 'unrelated' && outcome.toReleaseHit.onTarget === true) {
    notes.push(`松手时接住指针的 ${describeHitBrief(outcome.toReleaseHit)} 不是落点本身，但这一点就在`
      + '落点的框里——不等于落偏了。')
  } else if (outcome.toReleaseHit.relation === 'unrelated' && outcome.toReleaseHit.onTarget === null) {
    notes.push(`松手时接住指针的 ${describeHitBrief(outcome.toReleaseHit)} 不是落点本身；而落点这一次`
      + '没有可用的框（尺寸为零、或已脱离文档），几何无从判断——落没落上，这里给不出结论。')
  }
  if (outcome.toReleaseHit.relation === 'target-is-detached') {
    notes.push('松手时落点的框已经不在了（页面把它重绘换掉了），这一次是按坐标落的——'
      + '中没中要读一遍页面才算数。')
  }
  const midAstray = outcome.toMidHit.relation === 'unrelated'
  return [
    `已在页面 ${pageName} 上把 ${src} 拖到 ${dst}：${via}。`,
    `按下时指针底下：${describeHitBrief(outcome.fromPressHit)}`,
    `拖动中（松手前）指针底下：${describeHitBrief(outcome.toMidHit)}`
    + (midAstray ? '（页面自己的拖拽替身出现在这里属于正常；若是别的元素，说明落点被挡住了）' : ''),
    `松手后指针底下：${describeHitBrief(outcome.toReleaseHit)}`,
    ...notes,
    ...warnings,
    '拖拽后页面常要一会儿才反应过来（重新取数、重画）；要确认结果就读一遍，或者稍等再 browser_read。',
  ].join('\n')
}

/** Let go of the elements a finished drag was holding, best effort — the page may forbid writes. */
async function clearDragStash(context: InteractContext): Promise<void> {
  await evaluateJson<boolean>(context,
    '(() => { try { delete window.__dshDragEnds } catch (error) { /* 页面禁写 */ } return true })()',
  ).catch(() => undefined)
}

/** One CDP dispatch, bounded so a wedged page cannot hold the call open. */
async function dispatch(
  context: InteractContext,
  method: string,
  params: Record<string, unknown>,
): Promise<CdpMessage> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const budget = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new InteractError('failed', `${method} 超过 ${String(DISPATCH_TIMEOUT_MS)}ms 没有回应。`))
    }, DISPATCH_TIMEOUT_MS)
  })
  try {
    return await Promise.race([context.connection.send(method, params, context.sessionId), budget])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

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
export type ClickMode = 'real' | 'dom' | 'seq' | 'react'

/** Every click mode, in the order they should be tried. */
export const CLICK_MODES: readonly ClickMode[] = ['real', 'dom', 'seq', 'react']

/**
 * Which mouse button presses.
 *
 * Only `real` delivers it: a right-press is wanted for the page's own `contextmenu`, and a
 * dispatched DOM event is precisely what 用友's widgets ignore (measured on the semantic-model
 * tree and its table), so a synthesized right-click has nothing to add.
 */
export type MouseButton = 'left' | 'right' | 'middle'

/** Every mouse button, for a tool's enum. */
export const MOUSE_BUTTONS: readonly MouseButton[] = ['left', 'right', 'middle']

/** CDP's `buttons` bitmask for each button. */
const BUTTON_MASK: Readonly<Record<MouseButton, number>> = { left: 1, right: 2, middle: 4 }

/** What a click did, for the caller to report. */
export interface ClickOutcome {
  readonly tag: string
  readonly text: string
  /** Which route the click took, so a report can say "synthesized" instead of implying a person. */
  readonly via: ClickMode
  /** Which button pressed. */
  readonly button: MouseButton
  /**
   * 按下去之前，那一点底下是谁。空字符串表示这一次没有指针可言（`dom`/`seq`/`react` 在页面内
   * 直接触发），或者没能读到。
   */
  readonly hitTag: string
  readonly hitText: string
  readonly hitRelation: HitRelation
}

/** What one hover settled on. */
export interface HoverOutcome {
  /** The element the caller aimed at. */
  readonly tag: string
  readonly text: string
  /** What the pointer actually rests on — not necessarily the element we aimed at. */
  readonly hitTag: string
  readonly hitText: string
  /** How that hit relates to the element aimed at. */
  readonly hitRelation: HitRelation
}

/** How long a hover rests on its target when the caller does not say. */
const HOVER_HOLD_MS = 900

/** The gap between the pointer's approach step and its arrival on the target. */
const HOVER_APPROACH_MS = 120

/** A pause the host waits, as opposed to one the page waits. */
function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** Options a click may carry beyond the element it names. */
export interface ClickOptions {
  /** How the click is delivered. Default `real`. */
  readonly mode?: ClickMode
  /** Which button presses. Default `left`. Only `real` delivers it. */
  readonly button?: MouseButton
  /**
   * How long to rest on the element after moving the pointer and before pressing.
   *
   * A synthesized click moves and presses in the same instant, while a hand leaves a gap. A
   * widget that renders its own controls on hover therefore has nothing to receive the press:
   * measured on the 旗舰版 semantic-model list, whose row actions appear only once the row is
   * hovered — a real pointer opened them, `browser_click` never did. 200–500 usually suffices.
   */
  readonly hoverMs?: number
}

/** What the in-page half of a synthesized click reports back. */
interface ClickedInPage {
  readonly ok: boolean
  readonly reason?: string
  readonly tag?: string
  readonly text?: string
}

/**
 * Click from inside the page, for controls that ignore a synthesized pointer.
 *
 * `dom`, `seq` and `react` are the three escalation steps the panel's scripts used to carry as
 * separate `.mjs` files; folding them in here means a session without a shell can still reach
 * them. They are NOT interchangeable with `real`: they raise events a page can tell apart from
 * a person's, and anything checking `isTrusted` will ignore all three.
 */
async function clickInPage(
  context: InteractContext,
  target: ElementTarget,
  mode: ClickMode,
): Promise<ClickOutcome> {
  const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 }
  const script = `(async () => {
    const spec = ${JSON.stringify(spec)}
    const mode = ${JSON.stringify(mode)}
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    ${PAGE_HELPERS}
    let el
    try { el = await waitFor(spec, timeoutMs) } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    if (!el) return { ok: false, reason: 'not-found' }
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    const offset = mainFrameOffset(el)
    const x = Math.round(offset.x + r.x + r.width / 2)
    const y = Math.round(offset.y + r.y + r.height / 2)
    const fire = (type) => el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, button: 0, buttons: 1,
    }))
    if (mode === 'dom') {
      el.click()
    } else if (mode === 'seq') {
      fire('mouseenter'); fire('mouseover'); fire('mousedown'); fire('mouseup'); fire('click')
    } else {
      // react：沿祖先最多 8 层找 React 挂上的事件处理器，直接调 onClick。
      // 实测用友的 wui 组件对合成 DOM 事件不响应，但对这条路响应（行操作菜单即如此）。
      let node = el
      let found = false
      for (let i = 0; i < 8 && node; i++) {
        const key = Object.keys(node).find((k) =>
          k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'))
        const props = key ? node[key] : null
        if (props && typeof props.onClick === 'function') {
          props.onClick({
            stopPropagation() {}, preventDefault() {},
            target: el, currentTarget: node,
            nativeEvent: new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
          })
          found = true
          break
        }
        node = node.parentElement
      }
      if (!found) return { ok: false, reason: 'react-no-onclick' }
    }
    return { ok: true, tag: el.tagName.toLowerCase(), text: visibleText(el, 80) }
  })()`
  const done = await evaluateJson<ClickedInPage>(context, script)
  // 这三条路都不经过指针，所以没有「按点底下是谁」可报——如实留空，而不是编一个。
  if (done.ok) {
    return {
      tag: done.tag ?? '', text: done.text ?? '', via: mode, button: 'left',
      hitTag: '', hitText: '', hitRelation: 'unavailable',
    }
  }
  if (done.reason === 'not-found') {
    throw new InteractError('not-found',
      `没有找到 ${describeTarget(target)}，所以 ${mode} 方式无从点起。`)
  }
  if (done.reason === 'react-no-onclick') {
    throw new InteractError('failed',
      `${describeTarget(target)} 及其 8 层祖先上都没有 React 的 onClick（这个元素可能不是 React 渲染的）。`
      + '改用 mode="dom" 或 "seq"，或者退回真正的指针（不传 mode）。')
  }
  throw new InteractError('invalid-target', done.reason ?? '点击失败')
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
export async function clickAt(
  context: InteractContext,
  target: ElementTarget,
  options: ClickOptions = {},
): Promise<ClickOutcome> {
  const mode = options.mode ?? 'real'
  if (mode !== 'real') return await clickInPage(context, target, mode)

  const located = await locate(context, target)
  const x = located.x ?? 0
  const y = located.y ?? 0
  const hoverMs = options.hoverMs ?? 0
  const button = options.button ?? 'left'
  const mask = BUTTON_MASK[button]
  const point = {
    x,
    y,
    ...(located.rect === undefined ? {} : { rect: located.rect }),
    ...(located.viewport === undefined ? {} : { viewport: located.viewport }),
    ...(located.inViewport === undefined ? {} : { inViewport: located.inViewport }),
  }

  // 先问几何：这个按点在不在屏幕上。它不需要移动指针，所以在移动之前就能拒绝——不给页面留下
  // 一次「指针飘到视口外、什么都没按」的噪声。
  const geometryIssue = describeUnclickableIssue({ ...point, hit: unreadHit(x, y) })
  if (geometryIssue !== undefined) throw new InteractError('not-hit', geometryIssue)

  // Best-effort release, used when either half of the click fails: a pointer left pressed
  // turns the next action on that page into a drag. It has to carry the same button that was
  // pressed, or a right-press would leave the page holding a button nobody ever releases.
  const release = (): void => {
    void context.connection
      .send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 }, context.sessionId)
      .catch(() => undefined)
  }

  await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  if (hoverMs > 0) await sleepMs(hoverMs)

  // 再问命中：指针已经停在按点上，底下到底是谁。用的是 hover 与 drag 同一套读法（穿 iframe /
  // shadow、按对象引用判关系）。几何说得了话的时候它已经拦过了；这里拦的是「元素在屏幕上，但
  // 按点被别的东西占了」——浮层、固定栏、折叠容器的残留，以及按下前一瞬间被重绘换掉的元素。
  const hit = await readHit(context, x, y, specOf(target))
  const aimIssue = describeUnclickableIssue({ ...point, hit })
  if (aimIssue !== undefined) throw new InteractError('not-hit', aimIssue)

  try {
    await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: mask, clickCount: 1 })
  } catch (error) {
    release()
    throw error
  }
  try {
    await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 })
  } catch (error) {
    release()
    throw error
  }

  return {
    tag: located.tag ?? '',
    text: located.text ?? '',
    via: 'real',
    button,
    hitTag: hit.tag,
    hitText: hit.text,
    hitRelation: hit.relation,
  }
}

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
export async function hoverAt(
  context: InteractContext,
  target: ElementTarget,
  holdMs = HOVER_HOLD_MS,
): Promise<HoverOutcome> {
  const located = await locate(context, target)
  const x = located.x ?? 0
  const y = located.y ?? 0

  // Leave the element first, then arrive.
  //
  // Two moves INSIDE the target produce no `mouseenter` at all — the pointer never left, so a
  // widget that renders on hover never hears about it. Measured on the 旗舰版 semantic-model
  // list: hovering the same row twice in a row did nothing, while moving away and back rendered
  // its 重命名/复制到/移动到/更多 buttons every time. So the first move goes to a neutral corner
  // rather than a few pixels to the left — a few pixels is still inside a wide element, which is
  // exactly the bug this replaced.
  await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1, buttons: 0 })
  await sleepMs(HOVER_APPROACH_MS)
  await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  if (holdMs > 0) await sleepMs(holdMs)

  // Report what is actually under the pointer. That is not the same question as "what did we
  // aim at": an overlay, a sticky column or a mis-measured coordinate all put the hover
  // somewhere else, and the caller would otherwise build on a target that never received it.
  // The point is resolved through frames and shadow roots (the plain `elementFromPoint` stops at
  // the iframe), and the answer is a RELATION to the element we aimed at rather than a tag name
  // to compare — a hover that landed on a child of the target did land where it was asked to.
  const hit = await readHit(context, x, y, specOf(target))

  return {
    tag: located.tag ?? '',
    text: located.text ?? '',
    hitTag: hit.tag,
    hitText: hit.text,
    hitRelation: hit.relation,
  }
}

/** How a drag is delivered. */
export type DragMode = 'html5' | 'mouse'

/** Every drag mode, for a tool's enum. */
export const DRAG_MODES: readonly DragMode[] = ['html5', 'mouse']

/** How the pointer sequence was actually played. */
export type DragDelivery = 'mouse-events-sent' | 'html5-drop-dispatched'

/** What, if anything, could be verified about the drag from the browser's own side. */
export type DragVerification = 'unavailable' | 'drag-data-intercepted'

/** How many interpolated moves a drag makes between its two ends. */
const DRAG_STEPS = 12

/** The gap between two of those moves. */
const DRAG_STEP_MS = 60

/** How long to wait for `Input.dragIntercepted` after the last move. */
const DRAG_INTERCEPT_WAIT_MS = 600

/** One end of a drag, as the page measured it. */
export interface DragEndReport extends MatchInfo {
  readonly tag: string
  readonly text: string
  /** The centre the pointer was aimed at, in main-frame viewport coordinates. */
  readonly x: number
  readonly y: number
}

/** What one drag did, for the caller to report. */
export interface DragOutcome {
  /** Which route the drag took. */
  readonly mode: DragMode
  /** Which pointer sequence was played, as opposed to which mode was asked for. */
  readonly delivery: DragDelivery
  /**
   * What the browser itself could confirm about this drag.
   *
   * `drag-data-intercepted` means real HTML5 drag data came back from the browser — the one
   * honest signal that the press became a drag rather than a click that went nowhere. `mouse`
   * has no such signal at all, which is why this is reported rather than assumed.
   */
  readonly verification: DragVerification
  /**
   * Whether the browser handed back real HTML5 drag data.
   *
   * Always false for `mouse`, where nothing can be intercepted. For `html5` it is the one
   * honest signal that the press actually became a drag: a source that is not `draggable`, or
   * a widget built on `mousemove`, never produces it — and without it there is nothing to
   * drop, which is why this is reported rather than assumed.
   */
  readonly intercepted: boolean
  /**
   * Where the drag started and where it was dropped, as the page measured those two elements —
   * what was located, how many candidates matched, which one was taken, and how the means of
   * locating it behaved. This is what the caller reports when a drag "worked" but did the wrong
   * thing: the wrong one of seven matches and a text hit on a `font` look identical in a tag name.
   */
  readonly from: DragEndReport
  readonly to: DragEndReport
  /** Who was under the pointer when it pressed — the sample an overlay swallowing the press shows up in. */
  readonly fromPressHit: HitReport
  /** Who was under the drop point before the gesture began, to compare with `toMidHit`. */
  readonly toBeforeHit: HitReport
  /** Who was under the drop point after the last move, before the drop — where a page's own drag proxy appears. */
  readonly toMidHit: HitReport
  /** Who was under the drop point after the release — whether the drop reached the intended element. */
  readonly toReleaseHit: HitReport
}

/** Options a drag may carry. */
export interface DragOptions {
  /** How the drag is delivered. Default `html5`. */
  readonly mode?: DragMode
  /** How many interpolated moves to make between the two ends. Default 12. */
  readonly steps?: number
  /** Milliseconds between two moves. Default 60. */
  readonly stepMs?: number
}

/** One end of a drag, as the page measured it. */
interface MeasuredEnd extends MatchInfo {
  readonly x: number
  readonly y: number
  readonly tag: string
  readonly text: string
  readonly inView: boolean
}

/** The page's answer for both ends of a drag, plus the drop-point baseline taken before it starts. */
interface MeasuredDrag {
  readonly ok: boolean
  readonly reason?: string
  readonly matched?: number
  readonly matchedVisible?: number
  readonly index?: number
  readonly from?: MeasuredEnd
  readonly to?: MeasuredEnd
  /** Who was under the drop point before the gesture began, for comparison mid-drag. */
  readonly toBeforeHit?: HitReport
}

/** One end of a drag, for the caller to report. */
function endReport(end: MeasuredEnd): DragEndReport {
  return {
    tag: end.tag,
    text: end.text,
    x: end.x,
    y: end.y,
    matched: end.matched,
    matchedVisible: end.matchedVisible,
    index: end.index,
    textMatch: end.textMatch,
    textHitIsLeaf: end.textHitIsLeaf,
  }
}

/** Best-effort release, so a failed drag does not leave the page holding a button. */
async function releasePointer(context: InteractContext, x: number, y: number): Promise<void> {
  await context.connection
    .send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, context.sessionId)
    .then(() => undefined)
    .catch(() => undefined)
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
export async function dragBetween(
  context: InteractContext,
  from: ElementTarget,
  to: ElementTarget,
  options: DragOptions = {},
): Promise<DragOutcome> {
  const mode = options.mode ?? 'html5'
  const steps = Math.max(1, Math.trunc(options.steps ?? DRAG_STEPS))
  const stepMs = Math.max(0, options.stepMs ?? DRAG_STEP_MS)

  const fromSpec = specOf(from)
  const toSpec = specOf(to)
  const script = `(async () => {
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    ${PAGE_HELPERS}
    let a, b
    try {
      a = await waitForMatchInfo(${JSON.stringify(fromSpec)}, timeoutMs)
      b = await waitForMatchInfo(${JSON.stringify(toSpec)}, timeoutMs)
    } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    if (!a.element) return {
      ok: false,
      reason: a.matched > 0 ? 'index-out-of-range-from' : 'not-found-from',
      matched: a.matched, matchedVisible: a.matchedVisible, index: a.index,
    }
    if (!b.element) return {
      ok: false,
      reason: b.matched > 0 ? 'index-out-of-range-to' : 'not-found-to',
      matched: b.matched, matchedVisible: b.matchedVisible, index: b.index,
    }
    // Scroll to the SOURCE first, then measure both: scrolling after a measurement would
    // invalidate the coordinates already taken.
    a.element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    const inView = (r) => r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
    const endOf = (el, info) => {
      const r = el.getBoundingClientRect()
      const offset = mainFrameOffset(el)
      return {
        x: Math.round(offset.x + r.x + r.width / 2),
        y: Math.round(offset.y + r.y + r.height / 2),
        tag: el.tagName.toLowerCase(),
        text: visibleText(el, 80),
        inView: inView(r),
        matched: info.matched,
        matchedVisible: info.matchedVisible,
        index: info.index,
        textMatch: info.textMatch,
        textHitIsLeaf: info.textHitIsLeaf,
      }
    }
    const from = endOf(a.element, a)
    const to = endOf(b.element, b)
    // 手势开始前落点处本来是谁。页面在拖拽途中往落点塞自己的代理元素（幽灵行、插入指示线）时，
    // 只有跟这条基线比，才看得出「同一个点上换人了」——否则那个代理看起来就是一切正常。
    const toBeforeHit = describeHit(to.x, to.y, b.element)
    // 这两个元素要用到手势结束，而拖拽会改写 DOM：中途按选择器重新定位，可能已经指到页面刚插进来
    // 的副本上，于是「命中的就是目标」这句话变成了一句关于另一个节点的话。
    try { window.__dshDragEnds = { from: a.element, to: b.element } } catch (error) { /* 页面禁写时退回按选择器定位 */ }
    return { ok: true, from: from, to: to, toBeforeHit: toBeforeHit }
  })()`

  const measured = await evaluateJson<MeasuredDrag>(context, script)
  if (!measured.ok) {
    const atDrop = measured.reason !== undefined && measured.reason.endsWith('-to')
    const which = atDrop ? '落点' : '起点'
    const target = atDrop ? to : from
    if (measured.reason === 'not-found-from' || measured.reason === 'not-found-to') {
      throw new InteractError('not-found', `没有找到 ${describeTarget(target)} —— 拖拽的${which}得先存在。`)
    }
    if (measured.reason === 'index-out-of-range-from' || measured.reason === 'index-out-of-range-to') {
      throw new InteractError('not-found',
        `拖拽${which} ${describeTarget(target)} 匹配到了 ${String(measured.matched ?? 0)} 个元素`
        + `（其中可见的 ${String(measured.matchedVisible ?? 0)} 个），但要的是第 ${String((measured.index ?? 0) + 1)} 个`
        + `（index=${String(measured.index ?? 0)}）。index 从 0 数起、数的是全部匹配（隐藏的也算）：`
        + '把 index 改小，或者把选择器写窄一点，只留下要拖的那一个。')
    }
    throw new InteractError('invalid-target', measured.reason ?? '拖拽端点定位失败')
  }

  const start = measured.from as MeasuredEnd
  const end = measured.to as MeasuredEnd
  if (!start.inView || !end.inView) {
    const which = `起点${start.inView ? '在' : '不在'}视口内、落点${end.inView ? '在' : '不在'}视口内`
    throw new InteractError('failed',
      `拖拽的两个端点没有同时出现在视口里（${which}）。CDP 的指针坐标是视口坐标，看不到的地方拖不到：`
      + '先把页面滚到两者都能看见的位置再来拖。')
  }

  const dragData = { from: endReport(start), to: endReport(end) }
  const toBeforeHit = measured.toBeforeHit ?? unreadHit(end.x, end.y)

  // html5 needs the browser to hand the drag to us before the press that starts it.
  let interceptedData: CdpMessage | undefined
  const unsubscribe = mode === 'html5'
    ? context.connection.on((event) => {
      if (event.method !== 'Input.dragIntercepted') return
      if (event.sessionId !== undefined && event.sessionId !== context.sessionId) return
      interceptedData = event.params['data'] as CdpMessage | undefined
    })
    : undefined
  if (mode === 'html5') await dispatch(context, 'Input.setInterceptDrags', { enabled: true })

  let released = false
  try {
    // The press itself is sampled: everything before this is where the pointer was AIMED, and a
    // press that lands on a floating overlay is the classic reason a drag does nothing at all.
    await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y, buttons: 0 })
    await sleepMs(HOVER_APPROACH_MS)
    const fromPressHit = await readStashedHit(context, start.x, start.y, 'from')
    await dispatch(context, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1,
    })
    await sleepMs(150)
    for (let i = 1; i <= steps; i++) {
      await dispatch(context, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(start.x + ((end.x - start.x) * i) / steps),
        y: Math.round(start.y + ((end.y - start.y) * i) / steps),
        button: 'left',
        buttons: 1,
      })
      await sleepMs(stepMs)
    }
    // 最后一次移动之后、投放之前：页面自己的拖拽代理就是在这个时刻占住落点的。
    const toMidHit = await readStashedHit(context, end.x, end.y, 'to')

    if (mode === 'mouse') {
      await dispatch(context, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1,
      })
      released = true
      return {
        ...dragData,
        mode: 'mouse',
        delivery: 'mouse-events-sent',
        // Nothing in a mouse-only drag can be confirmed from the browser's side: there is no
        // interception, no drop, no result. That is a fact about the mode, not a failure.
        verification: 'unavailable',
        intercepted: false,
        fromPressHit,
        toBeforeHit,
        toMidHit,
        toReleaseHit: await readStashedHit(context, end.x, end.y, 'to'),
      }
    }

    if (interceptedData === undefined) await sleepMs(DRAG_INTERCEPT_WAIT_MS)

    // Read through a const so the narrowing survives the closure assignment above.
    const data = interceptedData
    if (data === undefined) {
      await releasePointer(context, end.x, end.y)
      released = true
      throw new InteractError('failed',
        `拖拽手势已经完整发给了页面（在 ${describeTarget(from)} 上按下，中间走了 `
        + `${String(DRAG_STEPS)} 步 mousemove 到落点，mouseup 也释放了），但浏览器没有回 `
        + 'Input.dragIntercepted —— 它不认为这是一次 HTML5 拖拽，因此没有拖拽数据可以投递。'
        + '通常两种原因：这个元素不是 draggable；或者它用的是 mousemove 那套拖拽 —— 后者改用 '
        + 'mode="mouse"。'
        + '\n注意：没拿到拖拽数据不等于页面什么都没做。上面那串鼠标事件是真的发下去了，页面照样可能'
        + '已经处理了这次手势（实测里就出现过「报什么都没发生，而画布上真的多出一个节点、一条连线」）。'
        + '重试之前先读一遍页面确认结果——直接重拖会得到重复的节点、重复的连线。'
        + `\n这次的实际落点：按下时指针底下是 ${describeHitBrief(fromPressHit)}；`
        + `拖到落点时是 ${describeHitBrief(toMidHit)}（拖拽开始前那里是 ${describeHitBrief(toBeforeHit)}）。`)
    }

    const rawItems = data['items']
    const items = Array.isArray(rawItems)
      ? (rawItems as readonly Record<string, unknown>[])
          .map((item) => ({ mimeType: item['mimeType'], data: item['data'] }))
          .filter((item) => item.data !== undefined && item.data !== null && item.data !== '')
      : []
    const payload = {
      items: items.length > 0 ? items : rawItems ?? [],
      dragOperationsMask: 1,
    }

    await dispatch(context, 'Input.dispatchDragEvent', { type: 'dragEnter', x: end.x, y: end.y, data: payload })
    await sleepMs(120)
    await dispatch(context, 'Input.dispatchDragEvent', { type: 'dragOver', x: end.x, y: end.y, data: payload })
    await sleepMs(120)
    await dispatch(context, 'Input.dispatchDragEvent', { type: 'drop', x: end.x, y: end.y, data: payload })
    await sleepMs(200)
    await dispatch(context, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1,
    })
    released = true
    return {
      ...dragData,
      mode: 'html5',
      delivery: 'html5-drop-dispatched',
      verification: 'drag-data-intercepted',
      intercepted: true,
      fromPressHit,
      toBeforeHit,
      toMidHit,
      toReleaseHit: await readStashedHit(context, end.x, end.y, 'to'),
    }
  } finally {
    if (unsubscribe !== undefined) unsubscribe()
    if (mode === 'html5') {
      await dispatch(context, 'Input.setInterceptDrags', { enabled: false }).catch(() => undefined)
    }
    if (!released) await releasePointer(context, end.x, end.y)
    await clearDragStash(context)
  }
}

/**
 * Insert text at the focused element, or focus a located one first.
 *
 * `Input.insertText` goes through the browser's own input pipeline, so it raises the same
 * events a person typing would — which is what controlled widgets listen for.
 */
export async function typeText(context: InteractContext, text: string, target?: ElementTarget): Promise<void> {
  if (target !== undefined) {
    // Locate with focus folded in: this is the only step that can name the selector in the
    // "no such field" message, which beats a generic "nothing is focused".
    await locate(context, target, true)
  } else {
    const state = await evaluateJson<{ ok: boolean; tag: string }>(context,
      `(() => {
        const el = document.activeElement
        return { ok: el !== null && el !== document.body, tag: el ? el.tagName.toLowerCase() : '' }
      })()`)
    if (!state.ok) {
      throw new InteractError('not-found',
        '页面上没有获得焦点的元素，所以不知道往哪里输入。用 target 指明一个输入框，'
        + '或者先用 browser_click 点一下它。')
    }
  }
  await dispatch(context, 'Input.insertText', { text })
}

/** What setting a value produced, so the caller can confirm rather than assume. */
export interface SetValueOutcome {
  readonly tag: string
  readonly value: string
  /** Present for a checkbox or radio: what it holds now. */
  readonly checked?: boolean
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
export async function setValueOf(context: InteractContext, target: ElementTarget, value: string): Promise<SetValueOutcome> {
  const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 }
  const script = `(async () => {
    const spec = ${JSON.stringify(spec)}
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    const next = ${JSON.stringify(value)}
    ${PAGE_HELPERS}
    let el
    try { el = await waitFor(spec, timeoutMs) } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    if (!el) return { ok: false, reason: 'not-found' }

    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      const word = next.trim().toLowerCase()
      const on = ['true', '1', 'on', 'yes', 'checked'].indexOf(word) >= 0
      const off = ['false', '0', 'off', 'no', ''].indexOf(word) >= 0
      if (!on && !off) return { ok: false, reason: 'not-a-boolean' }
      if (el.checked !== on) el.click()
      return { ok: true, tag: 'input', value: on ? 'true' : 'false', checked: el.checked === true }
    }

    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : el instanceof HTMLInputElement ? HTMLInputElement.prototype
      : null
    if (proto !== null) {
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')
      if (setter && typeof setter.set === 'function') setter.set.call(el, next)
      else el.value = next
    } else if (el.isContentEditable) {
      el.textContent = next
    } else {
      return { ok: false, reason: 'unsupported-control' }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, tag: el.tagName.toLowerCase(), value: String(el.value == null ? el.textContent || '' : el.value) }
  })()`
  const outcome = await evaluateJson<Located & { value?: string; checked?: boolean }>(context, script)
  if (outcome.ok) {
    return {
      tag: outcome.tag ?? '',
      value: outcome.value ?? '',
      ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
    }
  }
  if (outcome.reason === 'not-a-boolean') {
    throw new InteractError('invalid-target',
      `${describeTarget(target)} 是勾选框或单选框，值要写成 "true" 或 "false"（也接受 on/off、1/0）。`)
  }
  if (outcome.reason === 'unsupported-control') {
    throw new InteractError('invalid-target',
      `${describeTarget(target)} 不是输入框、文本域、下拉框、勾选框或可编辑区域，设值对它没有意义。`)
  }
  if (outcome.reason === 'not-found') await locate(context, target)
  throw new InteractError('invalid-target', outcome.reason ?? '设值失败')
}

/** One named key press, with the release guaranteed. */
export async function pressKey(context: InteractContext, key: string): Promise<void> {
  const spec = KEY_SPECS[key]
  if (spec === undefined) {
    throw new InteractError('invalid-target',
      `不支持的按键「${key}」。可用的是：${KEY_NAMES.join('、')}。`)
  }
  const params: Record<string, unknown> = {
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.vk,
    nativeVirtualKeyCode: spec.vk,
    ...(spec.text === undefined ? {} : { text: spec.text }),
  }
  const release = (): void => {
    void context.connection.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, context.sessionId).catch(() => undefined)
  }
  try {
    await dispatch(context, 'Input.dispatchKeyEvent', { type: 'keyDown', ...params })
  } catch (error) {
    release()
    throw error
  }
  try {
    await dispatch(context, 'Input.dispatchKeyEvent', { type: 'keyUp', ...params })
  } catch (error) {
    release()
    throw error
  }
}

/** Where a scroll ended up. */
export interface ScrollOutcome {
  readonly y: number
  readonly maxY: number
}

/**
 * Scroll a located element into view, or the page by a pixel delta.
 *
 * Scrolling the page rather than dispatching a wheel event: a wheel event only moves what is
 * under the pointer, so a call meant to "go down the page" would depend on where the mouse
 * happens to be. Lazy lists that need real wheel input are a later, deliberate addition.
 */
export async function scrollPage(context: InteractContext, deltaY: number, target?: ElementTarget): Promise<ScrollOutcome> {
  if (target !== undefined) {
    await locate(context, target)
    return await evaluateJson<ScrollOutcome>(context, '({ y: Math.round(window.scrollY), maxY: Math.round(document.documentElement.scrollHeight - window.innerHeight) })')
  }
  const script = `(() => {
    window.scrollBy({ top: ${String(deltaY)}, left: 0, behavior: 'instant' })
    return { y: Math.round(window.scrollY), maxY: Math.round(document.documentElement.scrollHeight - window.innerHeight) }
  })()`
  return await evaluateJson<ScrollOutcome>(context, script)
}

/** How a screenshot was asked for. */
export interface CaptureOptions {
  readonly fullPage?: boolean
  readonly format?: 'png' | 'jpeg'
  readonly quality?: number
  readonly maxWidth?: number
  readonly maxHeight?: number
}

/** What a capture produced. */
export interface CaptureResult {
  readonly base64: string
  readonly mime: 'image/png' | 'image/jpeg'
  readonly width?: number
  readonly height?: number
}

/** The document's own size, in CSS pixels, as `Page.getLayoutMetrics` reports it. */
function layoutSize(metrics: CdpMessage): { width: number; height: number; viewportHeight: number } | undefined {
  const content = metrics['cssContentSize'] ?? metrics['contentSize']
  const viewport = metrics['cssLayoutViewport'] ?? metrics['layoutViewport']
  if (content === null || content === undefined || typeof content !== 'object') return undefined
  const size = content as Record<string, unknown>
  const width = typeof size['width'] === 'number' ? size['width'] : undefined
  const height = typeof size['height'] === 'number' ? size['height'] : undefined
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return undefined
  const view = viewport !== null && viewport !== undefined && typeof viewport === 'object'
    ? viewport as Record<string, unknown>
    : {}
  const viewportHeight = typeof view['clientHeight'] === 'number' ? view['clientHeight'] : height
  return { width, height, viewportHeight }
}

/**
 * Capture the page.
 *
 * Downscaling goes through `clip.scale`, which only applies to the region a clip names — so
 * the clip has to cover the whole document, and `captureBeyondViewport` must then be dropped
 * or the two describe different images.
 */
export async function capturePage(context: InteractContext, options: CaptureOptions): Promise<CaptureResult> {
  const format = options.format ?? 'png'
  const params: Record<string, unknown> = {}
  if (options.fullPage === true) params['captureBeyondViewport'] = true
  if (format === 'jpeg') {
    params['format'] = 'jpeg'
    // CDP's range is 0-100 and defaults to 80 when omitted.
    if (options.quality !== undefined) params['quality'] = options.quality
  }

  let width: number | undefined
  let height: number | undefined
  if (options.maxWidth !== undefined || options.maxHeight !== undefined) {
    const metrics = await context.connection.send('Page.getLayoutMetrics', {}, context.sessionId)
    const size = layoutSize(metrics)
    if (size !== undefined) {
      const target = options.fullPage === true ? size.height : size.viewportHeight
      const byWidth = options.maxWidth !== undefined && size.width > 0 ? options.maxWidth / size.width : 1
      const byHeight = options.maxHeight !== undefined && target > 0 ? options.maxHeight / target : 1
      const scale = Math.min(1, byWidth, byHeight)
      width = Math.round(size.width * scale)
      height = Math.round(target * scale)
      if (scale < 1) {
        params['clip'] = { x: 0, y: 0, width: size.width, height: target, scale }
        delete params['captureBeyondViewport']
      }
    }
  }

  const shot = await dispatch(context, 'Page.captureScreenshot', params)
  const data = shot['data']
  if (typeof data !== 'string' || data === '') {
    throw new InteractError('failed',
      '截图返回了空图像。页面可能还没画出来（刚导航完），等一下再截。')
  }
  return {
    base64: data,
    mime: format === 'jpeg' ? 'image/jpeg' : 'image/png',
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

/** One control a page exposes, as the collector reports it. */
export interface PageElement {
  readonly index: number
  readonly tag: string
  /** The semantic role: button, textbox, link, checkbox, combobox… */
  readonly role: string
  /** The accessible name — what a person would call this control. */
  readonly name: string
  /** Its current value, for the controls that have one. */
  readonly value: string
  /** `disabled`, `checked`, `required`, `readonly`, `expanded=true`… */
  readonly state: readonly string[]
  /** `#id` or `[name="x"]` when the element carries one; empty when it carries neither. */
  readonly selector: string
}

/** What one collection found. */
export interface ElementListing {
  readonly elements: readonly PageElement[]
  /** How many interactive elements the page has, however many were returned. */
  readonly total: number
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
export async function collectElements(context: InteractContext, maxNodes: number): Promise<ElementListing> {
  const script = `(() => {
    const max = ${String(maxNodes)}
    ${PAGE_HELPERS}
    const INTERACTIVE = 'a[href],button,input,select,textarea,[contenteditable=""],[contenteditable="true"],[role]'
    const nameOf = (el) => {
      const aria = el.getAttribute('aria-label')
      if (aria !== null && aria.trim() !== '') return aria.trim()
      const labelledBy = el.getAttribute('aria-labelledby')
      if (labelledBy !== null && labelledBy.trim() !== '') {
        const joined = labelledBy.split(/\\s+/)
          .map((id) => { const n = document.getElementById(id); return n ? (n.textContent || '').trim() : '' })
          .filter((t) => t !== '').join(' ')
        if (joined !== '') return joined.trim()
      }
      const id = el.getAttribute('id')
      if (id !== null && id !== '') {
        const forLabel = document.querySelector('label[for="' + CSS.escape(id) + '"]')
        if (forLabel) { const t = (forLabel.textContent || '').trim(); if (t !== '') return t }
      }
      const wrap = el.closest('label')
      if (wrap) { const t = (wrap.textContent || '').trim(); if (t !== '') return t }
      const placeholder = el.getAttribute('placeholder')
      if (placeholder !== null && placeholder.trim() !== '') return placeholder.trim()
      const title = el.getAttribute('title')
      if (title !== null && title.trim() !== '') return title.trim()
      const alt = el.getAttribute('alt')
      if (alt !== null && alt.trim() !== '') return alt.trim()
      const own = ownText(el)
      if (own !== '') return own
      if (typeof el.value === 'string' && el.value !== '') return el.value.trim()
      return ''
    }
    const roleOf = (el) => {
      const explicit = el.getAttribute('role')
      if (explicit !== null && explicit.trim() !== '') {
        const value = explicit.trim()
        if (value === 'presentation' || value === 'none') return ''
        return value
      }
      const tag = el.tagName.toLowerCase()
      if (tag === 'a') return el.hasAttribute('href') ? 'link' : ''
      if (tag === 'button') return 'button'
      if (tag === 'textarea') return 'textbox'
      if (tag === 'select') return el.multiple ? 'listbox' : 'combobox'
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase()
        if (type === 'hidden') return ''
        if (type === 'checkbox') return 'checkbox'
        if (type === 'radio') return 'radio'
        if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') return 'button'
        if (type === 'file') return 'file'
        if (type === 'range') return 'slider'
        if (type === 'search') return 'searchbox'
        return 'textbox'
      }
      if (el.isContentEditable) return 'textbox'
      return ''
    }
    const stateOf = (el) => {
      const out = []
      if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') out.push('disabled')
      if (el.checked === true) out.push('checked')
      if (el.required === true || el.getAttribute('aria-required') === 'true') out.push('required')
      if (el.readOnly === true) out.push('readonly')
      if (el.multiple === true) out.push('multiple')
      const expanded = el.getAttribute('aria-expanded')
      if (expanded !== null) out.push('expanded=' + expanded)
      return out
    }
    const valueOf = (el) => typeof el.value === 'string' ? el.value : (el.isContentEditable ? (el.textContent || '').trim() : '')
    const attr = (name, value) => '[' + name + '=' + JSON.stringify(value) + ']'
    const selectorOf = (el) => {
      const id = el.getAttribute('id')
      if (id !== null && id !== '') return '#' + CSS.escape(id)
      const name = el.getAttribute('name')
      if (name !== null && name !== '') return attr('name', name)
      // A control with neither: its placeholder or aria-label is what it is called, and
      // both make a selector that survives across calls. Reporting a text= suggestion for
      // an input was worse than reporting nothing — text matching compares an element's
      // own text nodes, and an input has none, so that suggestion could never work.
      const placeholder = el.getAttribute('placeholder')
      if (placeholder !== null && placeholder !== '') return attr('placeholder', placeholder)
      const aria = el.getAttribute('aria-label')
      if (aria !== null && aria !== '') return attr('aria-label', aria)
      return ''
    }

    const seen = new Set()
    const out = []
    let total = 0
    for (const root of allRoots()) {
      for (const el of root.querySelectorAll(INTERACTIVE)) {
        if (seen.has(el)) continue
        seen.add(el)
        const role = roleOf(el)
        if (role === '') continue
        if (!isVisible(el)) continue
        total++
        if (out.length >= max) continue
        out.push({
          index: out.length,
          tag: el.tagName.toLowerCase(),
          role,
          name: nameOf(el).slice(0, 80),
          value: String(valueOf(el)).slice(0, 80),
          state: stateOf(el),
          selector: selectorOf(el),
        })
      }
    }
    return { elements: out, total }
  })()`
  return await evaluateJson<ElementListing>(context, script)
}

/** What reading one control's value produced. */
export interface ValueOutcome {
  readonly tag: string
  readonly value: string
  readonly checked?: boolean
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
export async function readValueOf(context: InteractContext, target: ElementTarget): Promise<ValueOutcome> {
  const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 }
  const script = `(async () => {
    const spec = ${JSON.stringify(spec)}
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    ${PAGE_HELPERS}
    let el
    try { el = await waitFor(spec, timeoutMs) } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    if (!el) return { ok: false, reason: 'not-found' }
    const result = {
      ok: true,
      tag: el.tagName.toLowerCase(),
      value: typeof el.value === 'string' ? el.value : (el.isContentEditable ? (el.textContent || '').trim() : ''),
    }
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      result.checked = el.checked === true
    }
    return result
  })()`
  const outcome = await evaluateJson<ValueOutcome & { ok: boolean; reason?: string }>(context, script)
  if (outcome.ok) {
    return {
      tag: outcome.tag,
      value: outcome.value,
      ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
    }
  }
  if (outcome.reason === 'not-found') await locate(context, target)
  throw new InteractError('invalid-target', outcome.reason ?? '读取失败')
}

/** What a wait was asked for. */
export interface WaitOptions {
  /** A substring the address must contain. */
  readonly url?: string
  /** A selector that must exist. */
  readonly selector?: string
  /** How long to keep polling. Default 10s. */
  readonly timeoutMs?: number
}

/** What a wait came to. */
export interface WaitOutcome {
  readonly ok: boolean
  readonly url: string
  readonly readyState: string
  /** `ready`, `selector-missing`, `url-mismatch`, `loading`, or a bad-selector message. */
  readonly reason: string
}

/** How long a wait polls by default. */
const WAIT_TIMEOUT_MS = 10_000

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
export async function waitForPage(context: InteractContext, options: WaitOptions): Promise<WaitOutcome> {
  const timeoutMs = options.timeoutMs ?? WAIT_TIMEOUT_MS
  const script = `(async () => {
    const deadline = Date.now() + ${String(timeoutMs)}
    const wantUrl = ${options.url === undefined ? 'null' : JSON.stringify(options.url)}
    const wantSelector = ${options.selector === undefined ? 'null' : JSON.stringify(options.selector)}
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    let last = 'timeout'
    for (;;) {
      const ready = document.readyState
      const href = location.href
      if (wantSelector !== null) {
        let present = false
        try { present = document.querySelector(wantSelector) !== null } catch (error) {
          return { ok: false, url: href, readyState: ready, reason: 'bad-selector: ' + String((error && error.message) || error) }
        }
        if (!present) {
          last = 'selector-missing'
          if (Date.now() >= deadline) break
          await sleep(150)
          continue
        }
      }
      if (wantUrl !== null && !href.includes(wantUrl)) {
        last = 'url-mismatch'
        if (Date.now() >= deadline) break
        await sleep(150)
        continue
      }
      if (ready !== 'complete') {
        last = 'loading'
        if (Date.now() >= deadline) break
        await sleep(150)
        continue
      }
      return { ok: true, url: href, readyState: ready, reason: 'ready' }
    }
    return { ok: false, url: location.href, readyState: document.readyState, reason: last }
  })()`
  return await evaluateJson<WaitOutcome>(context, script)
}

/** Where a history move landed. */
export interface NavOutcome {
  readonly moved: boolean
  readonly url: string
}

/** Step through the page's own history, or say there is nowhere to go. */
async function moveHistory(context: InteractContext, offset: number): Promise<NavOutcome> {
  const history = await context.connection.send('Page.getNavigationHistory', {}, context.sessionId)
  const index = history['currentIndex']
  const entries = history['entries']
  if (typeof index !== 'number' || !Array.isArray(entries)) {
    throw new InteractError('failed', '浏览器没有给出这个页面的历史记录。')
  }
  const wanted = index + offset
  if (wanted < 0 || wanted >= entries.length) return { moved: false, url: '' }
  const entry = entries[wanted]
  if (entry === null || typeof entry !== 'object') return { moved: false, url: '' }
  const record = entry as Record<string, unknown>
  const entryId = record['id']
  if (typeof entryId !== 'number') return { moved: false, url: '' }
  await context.connection.send('Page.navigateToHistoryEntry', { entryId }, context.sessionId)
  return { moved: true, url: typeof record['url'] === 'string' ? record['url'] : '' }
}

/** Go back one step. */
export async function goBack(context: InteractContext): Promise<NavOutcome> {
  return await moveHistory(context, -1)
}

/** Go forward one step. */
export async function goForward(context: InteractContext): Promise<NavOutcome> {
  return await moveHistory(context, 1)
}

/** Reload the page, optionally bypassing the cache. */
export async function reloadPage(context: InteractContext, ignoreCache: boolean): Promise<void> {
  await dispatch(context, 'Page.reload', { ignoreCache })
}

/** What choosing an option produced. */
export interface SelectOutcome {
  readonly value: string
  readonly label: string
}

/** How the wanted option is matched against the control's own options. */
export type SelectMatch = 'auto' | 'value' | 'label' | 'index'

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
export async function selectOption(
  context: InteractContext,
  target: ElementTarget,
  wanted: string,
  match: SelectMatch,
): Promise<SelectOutcome> {
  const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 }
  const script = `(async () => {
    const spec = ${JSON.stringify(spec)}
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    const wanted = ${JSON.stringify(wanted)}
    const match = ${JSON.stringify(match)}
    ${PAGE_HELPERS}
    let el
    try { el = await waitFor(spec, timeoutMs) } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    if (!el) return { ok: false, reason: 'not-found' }
    if (!(el instanceof HTMLSelectElement)) {
      return { ok: false, reason: 'not-a-select', tag: el.tagName.toLowerCase() }
    }
    const label = (option) => (option.textContent || '').trim()
    const options = Array.prototype.slice.call(el.options)
    const byValue = options.filter((option) => option.value === wanted)[0]
    const byExactLabel = options.filter((option) => label(option) === wanted)[0]
    const byPartLabel = options.filter((option) => label(option).indexOf(wanted) >= 0)[0]
    let chosen = null
    if (match === 'value') chosen = byValue
    else if (match === 'label') chosen = byExactLabel || byPartLabel
    else if (match === 'index') chosen = options[Number(wanted)]
    else chosen = byValue || byExactLabel || byPartLabel

    if (!chosen) {
      return { ok: false, reason: 'no-option', available: options.slice(0, 20).map(label) }
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
    if (setter && typeof setter.set === 'function') setter.set.call(el, chosen.value)
    else el.value = chosen.value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true, value: el.value, label: label(chosen) }
  })()`
  const outcome = await evaluateJson<SelectOutcome & {
    ok: boolean
    reason?: string
    tag?: string
    available?: readonly string[]
  }>(context, script)
  if (outcome.ok) return { value: outcome.value, label: outcome.label }
  if (outcome.reason === 'not-a-select') {
    throw new InteractError('invalid-target',
      `${describeTarget(target)} 是 ${outcome.tag ?? '未知标签'}，不是下拉框。`)
  }
  if (outcome.reason === 'no-option') {
    const available = outcome.available ?? []
    throw new InteractError('not-found',
      `${describeTarget(target)} 里没有「${wanted}」这一项。可选的有：`
      + `${available.length === 0 ? '(一个都没有)' : available.join('、')}。`)
  }
  if (outcome.reason === 'not-found') await locate(context, target)
  throw new InteractError('invalid-target', outcome.reason ?? '选择失败')
}

/** One field of a batch fill. */
export interface FillField {
  readonly target: ElementTarget
  readonly value: string
}

/** What one field of a batch fill did. */
export interface FillOutcome {
  readonly index: number
  readonly ok: boolean
  readonly tag: string
  readonly value: string
  readonly reason: string
}

/** What a batch fill produced. */
export interface FillResult {
  readonly fields: readonly FillOutcome[]
  /** Whether a form was actually submitted — false also when none was found. */
  readonly submitted: boolean
}

/** How long each field of a batch is given to appear. */
const FILL_FIELD_TIMEOUT_MS = 1_500

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
export async function fillFields(
  context: InteractContext,
  fields: readonly FillField[],
  submit: boolean,
): Promise<FillResult> {
  const specs = fields.map(field => ({
    target: {
      by: field.target.by ?? 'css',
      value: field.target.value,
      index: field.target.index ?? 0,
    },
    value: field.value,
  }))
  const script = `(async () => {
    const specs = ${JSON.stringify(specs)}
    const submit = ${submit ? 'true' : 'false'}
    const perField = ${String(FILL_FIELD_TIMEOUT_MS)}
    ${PAGE_HELPERS}
    const out = []
    let first = null
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]
      let el = null
      try { el = await waitFor(spec.target, perField) } catch (error) {
        out.push({ index: i, ok: false, tag: '', value: '', reason: String((error && error.message) || error) })
        continue
      }
      if (!el) { out.push({ index: i, ok: false, tag: '', value: '', reason: 'not-found' }); continue }
      if (first === null) first = el
      const tag = el.tagName.toLowerCase()
      const next = String(spec.value)

      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const word = next.trim().toLowerCase()
        const on = ['true', '1', 'on', 'yes', 'checked'].indexOf(word) >= 0
        const off = ['false', '0', 'off', 'no', ''].indexOf(word) >= 0
        if (!on && !off) { out.push({ index: i, ok: false, tag, value: '', reason: 'not-a-boolean' }); continue }
        if (el.checked !== on) el.click()
        out.push({ index: i, ok: true, tag, value: on ? 'true' : 'false', reason: '' })
        continue
      }

      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : el instanceof HTMLInputElement ? HTMLInputElement.prototype
        : null
      if (proto !== null) {
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')
        if (setter && typeof setter.set === 'function') setter.set.call(el, next)
        else el.value = next
      } else if (el.isContentEditable) {
        el.textContent = next
      } else {
        out.push({ index: i, ok: false, tag, value: '', reason: 'unsupported-control' })
        continue
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      out.push({ index: i, ok: true, tag, value: String(el.value == null ? el.textContent || '' : el.value), reason: '' })
    }
    let submitted = false
    if (submit && first !== null) {
      const form = first.closest('form')
      if (form) { form.requestSubmit(); submitted = true }
    }
    return { fields: out, submitted }
  })()`
  return await evaluateJson<FillResult>(context, script)
}

/** One column of a scrape. */
export interface ScrapeField {
  /** The key this column gets in each row object. */
  readonly name: string
  /** A selector resolved inside each row. */
  readonly selector: string
  /** Read this attribute instead of the text. */
  readonly attribute?: string
}

/** What a scrape produced. */
export interface ScrapeResult {
  readonly rows: readonly Record<string, string | null>[]
  /** How many rows the page had, whether or not all were returned. */
  readonly count: number
  readonly truncated: boolean
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
export async function scrapeRows(
  context: InteractContext,
  rowSelector: string,
  fields: readonly ScrapeField[],
  limit: number,
): Promise<ScrapeResult> {
  const script = `(() => {
    const rowSelector = ${JSON.stringify(rowSelector)}
    const fields = ${JSON.stringify(fields.map(field => ({
      name: field.name,
      selector: field.selector,
      attribute: field.attribute ?? null,
    })))}
    const limit = ${String(limit)}
    let rows
    try { rows = document.querySelectorAll(rowSelector) } catch (error) {
      return { ok: false, reason: 'CSS 选择器写错了：' + String((error && error.message) || error) }
    }
    const count = rows.length
    const out = []
    for (const row of rows) {
      if (out.length >= limit) break
      const record = {}
      for (const field of fields) {
        let el = null
        try { el = row.querySelector(field.selector) } catch (error) { el = null }
        if (el === null) { record[field.name] = null; continue }
        record[field.name] = field.attribute === null
          ? (el.textContent || '').trim()
          : el.getAttribute(field.attribute)
      }
      out.push(record)
    }
    return { ok: true, rows: out, count }
  })()`
  const result = await evaluateJson<{
    ok: boolean
    reason?: string
    rows?: readonly Record<string, string | null>[]
    count?: number
  }>(context, script)
  if (!result.ok) throw new InteractError('invalid-target', result.reason ?? '抓取失败')
  const rows = result.rows ?? []
  return { rows, count: result.count ?? rows.length, truncated: (result.count ?? rows.length) > rows.length }
}
