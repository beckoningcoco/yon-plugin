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

import { CdpError, CdpConnection, probeEndpoint, type CdpMessage } from './cdp-client.ts'
import type { BrowserRunView } from '../shared/types.ts'
import type { YonBrowsersService } from './browser-service.ts'
import {
  InteractError,
  capturePage, clickAt, collectElements, dragBetween, fillFields, goBack, goForward, hoverAt, pressKey,
  readValueOf, reloadPage, scrapeRows, scrollPage, selectOption, setValueOf, typeText, waitForPage,
  type ScrapeFrameMatch, type ScrapeTruncation,
  type CaptureOptions, type ClickMode, type ClickOptions, type DragDelivery, type DragEndReport,
  type DragMode, type DragOptions, type DragVerification,
  type ElementTarget, type FillField,
  type FillOutcome, type HitReport, type HitRelation, type MouseButton, type PageElement,
  type ScrapeField, type SelectMatch,
} from './browser-interact.ts'
import { collectPageTips, type PageTip } from './browser-tips.ts'

/** How much of a page's text one read returns before it says it truncated. */
const MAX_TEXT_CHARS = 40_000

/** How much of an evaluation's value one call returns. */
const MAX_VALUE_CHARS = 40_000

/** Why a browser operation could not be carried out. */
export type BrowserCdpErrorCode =
  /** A tool argument was missing or not the shape it has to be. */
  | 'invalid-input'
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
  | 'protocol'

/** One refusal, with a code the tool layer renders as prose. */
export class BrowserCdpError extends Error {
  constructor(
    readonly code: BrowserCdpErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BrowserCdpError'
  }
}

/** One page, as the model reads it. */
export interface CdpPageView {
  readonly targetId: string
  /** Position in the listing this call produced. Re-resolved on every call. */
  readonly index: number
  readonly title: string
  readonly url: string
  /** True when this process created the page, and may therefore close it. */
  readonly ours: boolean
}

/** The pages of one run. */
export interface CdpPageListing {
  readonly run: BrowserRunView
  readonly pages: readonly CdpPageView[]
}

/** What one read returned. */
export interface CdpReadResult {
  readonly page: CdpPageView
  readonly format: 'text' | 'html'
  readonly text: string
  readonly chars: number
  readonly truncated: boolean
}

/** What one evaluation returned. */
export interface CdpEvalResult {
  readonly page: CdpPageView
  readonly value: string
  readonly chars: number
  readonly truncated: boolean
}

/** How a call names the page it wants. */
export interface PageRef {
  /** Position from the last listing, a target id, or a piece of the title/url. */
  readonly page: string
  /** A run id, a browser id, or part of a label. Omitted when only one is live. */
  readonly run?: string
}

/** What one click did. */
export interface CdpClickResult {
  readonly page: CdpPageView
  readonly tag: string
  readonly text: string
  /** Which route the click took: `real` is the CDP pointer, the other three are in-page. */
  readonly via: ClickMode
  /** Which button pressed. */
  readonly button: MouseButton
  /**
   * 按下之前，那一点底下是谁。「点了没反应」时第一个要看的东西：按点被别的东西占着，
   * 事件就发到了那个东西身上。页面内的三条路（`dom`/`seq`/`react`）没有指针，三者皆空。
   */
  readonly hitTag: string
  readonly hitText: string
  readonly hitRelation: HitRelation
}

/** What one hover settled on. */
export interface CdpHoverResult {
  readonly page: CdpPageView
  readonly tag: string
  readonly text: string
  /** What the pointer actually rests on — not necessarily the element we aimed at. */
  readonly hitTag: string
  readonly hitText: string
  /** How that hit relates to the element aimed at. */
  readonly hitRelation: HitRelation
}

/** What one drag did. */
export interface CdpDragResult {
  readonly page: CdpPageView
  readonly mode: DragMode
  /** How the pointer sequence was played, as opposed to which mode was asked for. */
  readonly delivery: DragDelivery
  /** What the browser itself could confirm; `unavailable` for a mouse-only drag. */
  readonly verification: DragVerification
  /** Where the drag started: what was located there, and how the locator matched it. */
  readonly from: DragEndReport
  /** Where it was dropped: same, for the other end. */
  readonly to: DragEndReport
  /** Who was under the pointer when it pressed. */
  readonly fromPressHit: HitReport
  /** Who was under the drop point before the gesture began. */
  readonly toBeforeHit: HitReport
  /** Who was under the drop point after the last move, before the drop — often the page's own proxy. */
  readonly toMidHit: HitReport
  /** Who was under the drop point after the release. */
  readonly toReleaseHit: HitReport
  /** Whether real HTML5 drag data moved; always false for `mouse`. */
  readonly intercepted: boolean
}

/** What one value write produced, so the caller can confirm rather than assume. */
export interface CdpSetValueResult {
  readonly page: CdpPageView
  readonly tag: string
  readonly value: string
  /** Present for a checkbox or radio: what it holds now. */
  readonly checked?: boolean
}

/** What choosing a `<select>` option produced. */
export interface CdpSelectResult {
  readonly page: CdpPageView
  readonly value: string
  readonly label: string
}

/** What one batch fill produced. */
export interface CdpFillResult {
  readonly page: CdpPageView
  readonly fields: readonly FillOutcome[]
  readonly submitted: boolean
}

/** What one scrape produced. */
export interface CdpScrapeResult {
  readonly page: CdpPageView
  readonly rows: readonly Record<string, string | null>[]
  readonly count: number
  readonly truncated: boolean
  /** 有证据说明只渲染了可视区时才有（虚拟化表格）。 */
  readonly truncation?: ScrapeTruncation
  /** 顶层没匹配到、而某个同源 iframe 里有的时候才有。 */
  readonly frames?: readonly ScrapeFrameMatch[]
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
  readonly page: CdpPageView
  readonly tips?: readonly PageTip[]
}

/** Where a scroll came to rest. */
export interface CdpScrollResult {
  readonly page: CdpPageView
  readonly y: number
  readonly maxY: number
}

/** The image a capture produced, still base64: saving it is the tool layer's business. */
export interface CdpCaptureResult {
  readonly page: CdpPageView
  readonly base64: string
  readonly mime: 'image/png' | 'image/jpeg'
  readonly width?: number
  readonly height?: number
  /** 原参数失败、这张是用最保守的参数重试拿到的。 */
  readonly degraded?: boolean
}

/** The interactive elements of one page. */
export interface CdpElementListing {
  readonly page: CdpPageView
  readonly elements: readonly PageElement[]
  readonly total: number
}

/** One control's current value. */
export interface CdpValueResult {
  readonly page: CdpPageView
  readonly tag: string
  readonly value: string
  readonly checked?: boolean
}

/** What a wait came to. */
export interface CdpWaitResult {
  readonly page: CdpPageView
  readonly ok: boolean
  readonly url: string
  readonly readyState: string
  readonly reason: string
}

/** Where a history move landed. */
export interface CdpNavResult {
  readonly page: CdpPageView
  readonly moved: boolean
  readonly url: string
}

/** The surface the tools drive. */
export interface YonBrowserCdpService {
  pages(input: { readonly run?: string }, signal: AbortSignal): Promise<CdpPageListing>
  attach(input: PageRef, signal: AbortSignal): Promise<CdpPageListing>
  open(input: { readonly url: string; readonly run?: string }, signal: AbortSignal): Promise<CdpPageView>
  read(input: PageRef & { readonly format?: 'text' | 'html'; readonly maxChars?: number }, signal: AbortSignal): Promise<CdpReadResult>
  evaluate(input: PageRef & { readonly expression: string; readonly maxChars?: number }, signal: AbortSignal): Promise<CdpEvalResult>
  close(input: PageRef, signal: AbortSignal): Promise<CdpPageView>
  activate(input: PageRef, signal: AbortSignal): Promise<CdpPageView>
  click(input: PageRef & { readonly target: ElementTarget } & ClickOptions, signal: AbortSignal): Promise<CdpClickResult>
  drag(input: PageRef & { readonly from: ElementTarget; readonly to: ElementTarget } & DragOptions, signal: AbortSignal): Promise<CdpDragResult>
  hover(input: PageRef & { readonly target: ElementTarget; readonly holdMs?: number }, signal: AbortSignal): Promise<CdpHoverResult>
  type(input: PageRef & { readonly text: string; readonly target?: ElementTarget }, signal: AbortSignal): Promise<CdpPageView>
  setValue(input: PageRef & { readonly target: ElementTarget; readonly value: string }, signal: AbortSignal): Promise<CdpSetValueResult>
  pressKey(input: PageRef & { readonly key: string }, signal: AbortSignal): Promise<CdpPageView>
  scroll(input: PageRef & { readonly deltaY?: number; readonly target?: ElementTarget }, signal: AbortSignal): Promise<CdpScrollResult>
  screenshot(input: PageRef & CaptureOptions, signal: AbortSignal): Promise<CdpCaptureResult>
  snapshot(input: PageRef & { readonly maxNodes?: number }, signal: AbortSignal): Promise<CdpElementListing>
  getValue(input: PageRef & { readonly target: ElementTarget }, signal: AbortSignal): Promise<CdpValueResult>
  wait(input: PageRef & { readonly url?: string; readonly selector?: string; readonly timeoutMs?: number }, signal: AbortSignal): Promise<CdpWaitResult>
  history(input: PageRef & { readonly how: 'back' | 'forward' | 'reload'; readonly hard?: boolean }, signal: AbortSignal): Promise<CdpNavResult>
  select(input: PageRef & { readonly target: ElementTarget; readonly value: string; readonly match?: SelectMatch }, signal: AbortSignal): Promise<CdpSelectResult>
  fill(input: PageRef & { readonly fields: readonly { readonly target: ElementTarget; readonly value: string }[]; readonly submit?: boolean }, signal: AbortSignal): Promise<CdpFillResult>
  scrape(input: PageRef & { readonly rows: string; readonly fields: readonly ScrapeField[]; readonly limit?: number }, signal: AbortSignal): Promise<CdpScrapeResult>
  messages(input: PageRef, signal: AbortSignal): Promise<CdpMessagesResult>
}

/** The slice of a CDP target info this layer reads. */
interface TargetInfo {
  readonly targetId: string
  readonly type: string
  readonly title: string
  readonly url: string
}

/** One page plus the session slot it was attached under. */
interface Attached {
  readonly connection: CdpConnection
  readonly sessionId: string
  readonly targetId: string
}

/**
 * Read the target list a `Target.getTargets` answer carries.
 * @param result - the command's result object.
 * @returns every `page` target, in the order the browser listed them.
 */
function targetInfosOf(result: CdpMessage): readonly TargetInfo[] {
  const raw = result['targetInfos']
  if (!Array.isArray(raw)) return []
  const infos: TargetInfo[] = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const info = entry as Record<string, unknown>
    const targetId = info['targetId']
    const type = info['type']
    if (typeof targetId !== 'string' || typeof type !== 'string') continue
    infos.push({
      targetId,
      type,
      title: typeof info['title'] === 'string' ? info['title'] : '',
      url: typeof info['url'] === 'string' ? info['url'] : '',
    })
  }
  return infos
}

/** Unwrap a CDP string field, or refuse rather than carry an unknown onward. */
function stringField(source: CdpMessage, key: string, what: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value === '') {
    throw new BrowserCdpError('protocol', `浏览器的回答里没有 ${what}。`)
  }
  return value
}

/** Translate a transport or in-page failure into the vocabulary the tools speak. */
function asCdpError(error: unknown): BrowserCdpError {
  if (error instanceof BrowserCdpError) return error
  if (error instanceof InteractError) {
    const code: BrowserCdpErrorCode =
      error.code === 'not-found' ? 'not-found'
        : error.code === 'invalid-target' ? 'invalid-input'
          // 「元素在，但这一按到不了它」不是找不到：调用者要改的是点法（换 mode、先展开容器、
          // 把定位写稳），所以按输入问题上报，而不是按目标不存在——后者的对策是重新定位。
          : error.code === 'not-hit' ? 'invalid-input'
            : 'protocol'
    return new BrowserCdpError(code, error.message)
  }
  if (error instanceof CdpError) {
    const code: BrowserCdpErrorCode =
      error.code === 'unreachable' ? 'unreachable'
        : error.code === 'timeout' ? 'timeout'
          : error.code === 'protocol' ? 'protocol'
            : 'unreachable'
    return new BrowserCdpError(code, error.message)
  }
  return new BrowserCdpError('protocol', error instanceof Error ? error.message : String(error))
}

/** Wait, for the settle window in which a toast appears. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}

/**
 * How one operation treats page tips.
 *
 * `pre` exists because the buffer belongs to the page, not to the call: without pushing the
 * cursor first, a writing verb would report whatever the *previous* action left behind as if
 * it had just happened. Reading verbs must not push — catching a late tip is the reason they
 * drain at all.
 */
interface TipMode {
  /** Push the cursor past everything already on the page, so only what follows is reported. */
  readonly pre?: boolean
  /** Wait this long after the action before draining, for a toast that appears with it. */
  readonly settleMs?: number
}

/** Writing verbs: push first, then give the page a moment to complain. */
const WRITE_TIPS: TipMode = { pre: true, settleMs: 400 }

/**
 * Whether a reference is already a target id.
 *
 * Chromium target ids are 32 upper-case hex characters. Recognising one lets a call skip
 * the listing round-trip when the model is holding an id from an earlier answer, and it
 * is deliberately narrow: a title that happens to look like hex is a coincidence worth
 * losing to a listing that is cheap.
 */
function looksLikeTargetId(text: string): boolean {
  return /^[0-9A-F]{32}$/.test(text)
}

/**
 * Build the service over the panel's own browser service.
 * @param browsers - the panel's service, for the runs it knows about.
 * @returns the CDP-facing surface.
 */
export function createYonBrowserCdpService(browsers: YonBrowsersService): YonBrowserCdpService {
  /** Target ids this process created, and the only ones `close` will end. */
  const ours = new Set<string>()

  /**
   * Pick the run a call means.
   *
   * A single live run is used without being named — that is the common case, and making
   * the model type a run id it would have to look up first would be friction with no
   * safety value. Two or more, and the call has to say which: guessing between two
   * browsers is exactly the mistake this error prevents.
   */
  async function resolveRun(named: string | undefined): Promise<BrowserRunView> {
    const payload = await browsers.list()
    const live = payload.runs.filter(run => run.alive !== 'gone')
    if (live.length === 0) {
      throw new BrowserCdpError('no-browser',
        '面板里没有正在运行的调试浏览器。先在 Yon 面板的「调试浏览器」里启动一个，再调工具。')
    }

    if (named === undefined || named === '') {
      const first = live[0]
      if (live.length === 1 && first !== undefined) return first
      const names = live
        .map(run => `${run.label === '' ? run.browserId : run.label}（run ${run.runId}，端口 ${String(run.port)}）`)
        .join('、')
      throw new BrowserCdpError('ambiguous',
        `有 ${String(live.length)} 个调试浏览器在跑，得说清用哪个：${names}。`
        + '把 runId、浏览器 id 或名字放进 run 参数。')
    }

    const needle = named.toLowerCase()
    const match = live.find(run =>
      run.runId === named
      || run.browserId.toLowerCase() === needle
      || run.label.toLowerCase() === needle)
      ?? live.find(run =>
        run.runId.includes(named)
        || run.browserId.toLowerCase().includes(needle)
        || run.label.toLowerCase().includes(needle))
    if (match === undefined) {
      throw new BrowserCdpError('not-found',
        `没有找到叫「${named}」的调试浏览器。现有：`
        + live.map(run => run.label === '' ? run.browserId : run.label).join('、') + '。')
    }
    return match
  }

  /** Refuse a family whose protocol is not CDP, with the reason rather than a timeout. */
  function requireChromium(run: BrowserRunView): void {
    if (run.family !== 'chromium') {
      throw new BrowserCdpError('not-chromium',
        `「${run.label === '' ? run.browserId : run.label}」是 ${run.family} 系浏览器，`
        + '它的调试协议不是 CDP（Firefox 用 -start-debugger-server，没有 /json/version 这个端点），'
        + '所以这套工具驱动不了它。要用 CDP 的话，请在面板里启一个 Chromium 系的浏览器。')
    }
  }

  /**
   * Probe a run's endpoint and open a connection.
   *
   * The panel records the debugger URL a browser reported when it was launched, and an
   * earlier version of this compared that record before acting — on the theory that a
   * different string means a different browser has taken the port. It does not. Chromium
   * generates that GUID per launch, so simply restarting the same browser (same profile,
   * same port, same executable) changes it too, and the comparison then refused every call
   * until somebody went to the panel and relaunched — measured here, on the first restart.
   * The check could never tell a stranger from a restart, so it broke the common case while
   * guarding against a rare one. What remains is the part that does carry information:
   * whatever answers on the port has to speak CDP at all.
   */
  async function connect(run: BrowserRunView, signal: AbortSignal): Promise<{ connection: CdpConnection; webSocket: string }> {
    const endpoint = await probeEndpoint(run.endpoint, signal)
    const connection = await CdpConnection.open(endpoint, signal)
    return { connection, webSocket: endpoint.webSocket }
  }

  /** List the page targets of one connection. */
  async function listPages(connection: CdpConnection): Promise<readonly CdpPageView[]> {
    const result = await connection.send('Target.getTargets')
    const pages: CdpPageView[] = []
    let index = 0
    for (const info of targetInfosOf(result)) {
      if (info.type !== 'page') continue
      pages.push({
        targetId: info.targetId,
        index: index++,
        title: info.title,
        url: info.url,
        ours: ours.has(info.targetId),
      })
    }
    return pages
  }

  /** Resolve a page reference against a freshly read listing. */
  function matchPage(pages: readonly CdpPageView[], ref: string): CdpPageView {
    const text = ref.trim()
    if (text === '') {
      throw new BrowserCdpError('not-found',
        'page 参数是空的。先调 browser_targets 看有哪些页面，再用序号、标题或地址指定一个。')
    }

    if (looksLikeTargetId(text)) {
      const byId = pages.find(page => page.targetId === text)
      if (byId !== undefined) return byId
      throw new BrowserCdpError('not-found',
        `目标 id ${text} 不在当前的页面清单里；它可能已经被关掉了。先调 browser_targets 重新看一遍。`)
    }

    const asIndex = /^\d+$/.test(text) ? Number(text) : Number.NaN
    if (Number.isInteger(asIndex)) {
      const byIndex = pages.find(page => page.index === asIndex)
      if (byIndex !== undefined) return byIndex
      throw new BrowserCdpError('not-found',
        `序号 ${String(asIndex)} 超出范围：现在有 ${String(pages.length)} 个页面（序号 0 起）。`)
    }

    const needle = text.toLowerCase()
    const byText = pages.filter(page =>
      page.title.toLowerCase().includes(needle) || page.url.toLowerCase().includes(needle))
    const exactly = byText.find(page =>
      page.title.toLowerCase() === needle || page.url.toLowerCase() === needle)
    const chosen = exactly ?? byText[0]
    if (chosen === undefined) {
      const listing = pages.length === 0
        ? '当前一个页面都没有。'
        : '当前有：' + pages.map(page => `[${String(page.index)}] ${page.title || page.url}`).join('、') + '。'
      throw new BrowserCdpError('not-found',
        `没有哪个页面的标题或地址包含「${text}」。${listing}`)
    }
    return chosen
  }

  /**
   * Attach to one page and hand the session to a callback.
   *
   * The connection is closed on every exit path — success, refusal, or a throw — because
   * a socket left open is a second owner of a browser we do not own.
   */
  async function withPage<T extends object>(
    ref: PageRef,
    signal: AbortSignal,
    body: (context: Attached, page: CdpPageView, run: BrowserRunView) => Promise<T>,
    tipMode: TipMode = {},
  ): Promise<T> {
    const run = await resolveRun(ref.run)
    requireChromium(run)

    let connection: CdpConnection | undefined
    try {
      const opened = await connect(run, signal)
      connection = opened.connection
      const pages = await listPages(connection)
      const page = matchPage(pages, ref.page)
      const attached = await connection.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
      const sessionId = stringField(attached, 'sessionId', '会话 id')
      const context: Attached = { connection, sessionId, targetId: page.targetId }
      const drain = async (): Promise<void> => {
        await collectPageTips(expression => evaluateIn(context, expression))
      }
      if (tipMode.pre === true) await drain()
      const value = await body(context, page, run)
      const settleMs = tipMode.settleMs ?? 0
      if (settleMs > 0) await sleep(settleMs)
      const tips = await collectPageTips(expression => evaluateIn(context, expression))
      return tips.length === 0 ? value : { ...value, tips }
    } catch (error) {
      throw asCdpError(error)
    } finally {
      connection?.close()
    }
  }

  /**
   * Wake a page Chrome has frozen.
   *
   * A tab left alone long enough enters the frozen lifecycle state to save power, and in
   * that state a **synchronous** expression still evaluates while **timers and network do
   * not advance**. So `1+1` answers instantly, a 2-second `setTimeout` does not fire in
   * twenty, and `fetch` never settles — which means `Runtime.evaluate` with `awaitPromise`
   * never answers and the tool call hangs until the transport gives up. Measured on a real
   * page: frozen, a 2s timer timed out at 20s; after this call, it fired in 2.2s and a GET
   * came back in 33ms.
   *
   * Failure is ignored on purpose: an older Chromium without the method should still be
   * driven exactly as before.
   */
  async function wakePage(context: Attached): Promise<void> {
    try {
      await context.connection.send('Page.setWebLifecycleState', { state: 'active' }, context.sessionId)
    } catch {
      // Unsupported here; carry on as before.
    }
  }

  /** Run one expression in an attached session and return its value as text. */
  async function evaluateIn(
    context: Attached,
    expression: string,
  ): Promise<string> {
    await wakePage(context)
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
      throw new BrowserCdpError('protocol',
        `页面里的这段代码报错了：${typeof text === 'string' ? text : JSON.stringify(detail)}`)
    }

    const remote = result['result']
    if (remote === null || typeof remote !== 'object') return ''
    const value = (remote as Record<string, unknown>)['value']
    if (value === undefined) return ''
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  /** One listing, against one resolved run. */
  async function pagesOf(ref: { readonly run?: string }, signal: AbortSignal): Promise<CdpPageListing> {
    const run = await resolveRun(ref.run)
    requireChromium(run)

    let connection: CdpConnection | undefined
    try {
      const opened = await connect(run, signal)
      connection = opened.connection
      return { run, pages: await listPages(connection) }
    } catch (error) {
      throw asCdpError(error)
    } finally {
      connection?.close()
    }
  }

  return {
    pages: pagesOf,

    /**
     * Bring one page to the front.
     *
     * `Target.activateTarget` is a BROWSER-level command: it takes a target id and wants no
     * session, which is exactly why this cannot ride on `withPage` — that attaches to the page
     * first, and an attached session is what the command does not want. The connection here is
     * already browser-level (`probeEndpoint` asks the browser for its own
     * `webSocketDebuggerUrl`), so this needs nothing new.
     *
     * It moves the operator's window, so it is a deliberate, visible act rather than a
     * formality: call it before a WRITING action, not before a read.
     */
    async activate(input, signal) {
      const run = await resolveRun(input.run)
      requireChromium(run)

      let connection: CdpConnection | undefined
      try {
        const opened = await connect(run, signal)
        connection = opened.connection
        const pages = await listPages(connection)
        const page = matchPage(pages, input.page)
        await connection.send('Target.activateTarget', { targetId: page.targetId })
        return page
      } catch (error) {
        throw asCdpError(error)
      } finally {
        connection?.close()
      }
    },

    async click(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const options: ClickOptions = {
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          ...(input.hoverMs === undefined ? {} : { hoverMs: input.hoverMs }),
          ...(input.button === undefined ? {} : { button: input.button }),
        }
        const outcome = await clickAt(context, input.target, options)
        return {
          page,
          tag: outcome.tag,
          text: outcome.text,
          via: outcome.via,
          button: outcome.button,
          hitTag: outcome.hitTag,
          hitText: outcome.hitText,
          hitRelation: outcome.hitRelation,
        }
      }, WRITE_TIPS)
    },

    async hover(input, signal) {
      // Deliberately NOT WRITE_TIPS: a hover writes nothing, and pushing the tip cursor here
      // would swallow whatever the page had already said before the pointer even arrived.
      return await withPage(input, signal, async (context, page) => {
        const outcome = await hoverAt(context, input.target, input.holdMs)
        return {
          page,
          tag: outcome.tag,
          text: outcome.text,
          hitTag: outcome.hitTag,
          hitText: outcome.hitText,
          hitRelation: outcome.hitRelation,
        }
      })
    },

    async drag(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const options: DragOptions = {
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          ...(input.steps === undefined ? {} : { steps: input.steps }),
          ...(input.stepMs === undefined ? {} : { stepMs: input.stepMs }),
        }
        const outcome = await dragBetween(context, input.from, input.to, options)
        return {
          page,
          mode: outcome.mode,
          delivery: outcome.delivery,
          verification: outcome.verification,
          from: outcome.from,
          to: outcome.to,
          fromPressHit: outcome.fromPressHit,
          toBeforeHit: outcome.toBeforeHit,
          toMidHit: outcome.toMidHit,
          toReleaseHit: outcome.toReleaseHit,
          intercepted: outcome.intercepted,
        }
      }, WRITE_TIPS)
    },

    async type(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        await typeText(context, input.text, input.target)
        return page
      }, WRITE_TIPS)
    },
    async setValue(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const outcome = await setValueOf(context, input.target, input.value)
        return {
          page,
          tag: outcome.tag,
          value: outcome.value,
          ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
        }
      }, WRITE_TIPS)
    },

    async pressKey(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        await pressKey(context, input.key)
        return page
      }, WRITE_TIPS)
    },

    async scroll(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const outcome = await scrollPage(context, input.deltaY ?? 600, input.target)
        return { page, y: outcome.y, maxY: outcome.maxY }
      }, WRITE_TIPS)
    },

    async screenshot(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const shot = await capturePage(context, input)
        return { page, ...shot }
      })
    },

    async attach(input, signal) {
      const listing = await pagesOf({ ...(input.run === undefined ? {} : { run: input.run }) }, signal)
      const page = matchPage(listing.pages, input.page)
      return { run: listing.run, pages: [page] }
    },

    async open(input, signal) {
      const run = await resolveRun(input.run)
      requireChromium(run)

      let connection: CdpConnection | undefined
      try {
        const opened = await connect(run, signal)
        connection = opened.connection
        const created = await connection.send('Target.createTarget', { url: input.url })
        const targetId = stringField(created, 'targetId', '新页面的 id')
        ours.add(targetId)
        return { targetId, index: -1, title: '', url: input.url, ours: true }
      } catch (error) {
        throw asCdpError(error)
      } finally {
        connection?.close()
      }
    },

    async read(input, signal) {
      const format = input.format ?? 'text'
      const limit = input.maxChars ?? MAX_TEXT_CHARS
      return await withPage(input, signal, async (context, page) => {
        const expression = format === 'html'
          ? 'document.documentElement.outerHTML'
          : '(document.body ? document.body.innerText : document.documentElement.innerText)'
        const text = await evaluateIn(context, expression)
        const truncated = text.length > limit
        return {
          page,
          format,
          text: truncated ? text.slice(0, limit) : text,
          chars: text.length,
          truncated,
        }
      })
    },

    async evaluate(input, signal) {
      const limit = input.maxChars ?? MAX_VALUE_CHARS
      return await withPage(input, signal, async (context, page) => {
        const value = await evaluateIn(context, input.expression)
        const truncated = value.length > limit
        return {
          page,
          value: truncated ? value.slice(0, limit) : value,
          chars: value.length,
          truncated,
        }
      })
    },

    async close(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        if (!page.ours) {
          throw new BrowserCdpError('not-ours',
            `「${page.title === '' ? page.url : page.title}」不是这个进程开的页面，所以不会关它`
            + '（你自己的页面，关不关由你决定）。要关的话请在浏览器里自己关。')
        }
        await context.connection.send('Target.closeTarget', { targetId: page.targetId })
        ours.delete(page.targetId)
        return page
      })
    },

    async snapshot(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const listing = await collectElements(context, input.maxNodes ?? 60)
        return { page, elements: listing.elements, total: listing.total }
      })
    },

    async getValue(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const outcome = await readValueOf(context, input.target)
        return {
          page,
          tag: outcome.tag,
          value: outcome.value,
          ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
        }
      })
    },

    async wait(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const outcome = await waitForPage(context, {
          ...(input.url === undefined ? {} : { url: input.url }),
          ...(input.selector === undefined ? {} : { selector: input.selector }),
          ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
        })
        return { page, ok: outcome.ok, url: outcome.url, readyState: outcome.readyState, reason: outcome.reason }
      })
    },

    async history(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        if (input.how === 'reload') {
          await reloadPage(context, input.hard === true)
          return { page, moved: true, url: page.url }
        }
        const outcome = input.how === 'back' ? await goBack(context) : await goForward(context)
        return { page, moved: outcome.moved, url: outcome.url }
      }, WRITE_TIPS)
    },

    async select(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const outcome = await selectOption(context, input.target, input.value, input.match ?? 'auto')
        return { page, value: outcome.value, label: outcome.label }
      }, WRITE_TIPS)
    },

    async fill(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const fields: FillField[] = input.fields.map(field => ({ target: field.target, value: field.value }))
        const outcome = await fillFields(context, fields, input.submit === true)
        return { page, fields: outcome.fields, submitted: outcome.submitted }
      }, WRITE_TIPS)
    },

    async messages(input, signal) {
      return await withPage(input, signal, async (_context, page) => ({ page }))
    },

    async scrape(input, signal) {
      return await withPage(input, signal, async (context, page) => {
        const outcome = await scrapeRows(context, input.rows, input.fields, input.limit ?? 100)
        return {
          page,
          rows: outcome.rows,
          count: outcome.count,
          truncated: outcome.truncated,
          ...outcome.truncation === undefined ? {} : { truncation: outcome.truncation },
          ...outcome.frames === undefined ? {} : { frames: outcome.frames },
        }
      })
    },
  }
}
