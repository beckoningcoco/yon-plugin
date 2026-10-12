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
  readonly ms: number
  /** What the message appears to be, read off the toast's own classes. */
  readonly level: 'info' | 'success' | 'warn' | 'error'
  /** The message itself, whitespace collapsed and the trailing 关闭 dropped. */
  readonly txt: string
}

/**
 * The nodes worth watching.
 *
 * `.toast-content` is NCC's (measured on 1909); the rest are the common message widgets so a
 * non-NCC page is not silent. Kept narrow on purpose — a broad `[class*=message]` would turn
 * every list re-render into a "tip" and the feature would be switched off.
 */
export const TIPS_SELECTOR = '.toast-content,.ant-message-notice-content,.el-message__content'

/** How many tips one call may carry back, so a runaway page cannot flood the answer. */
const MAX_TIPS = 20

/** How deep to follow same-origin frames. NCC's node pages sit one level down. */
const MAX_FRAME_DEPTH = 2

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
export const TIPS_SCRIPT = `function (SEL) {
  function install(doc, win, S) {
    function levelOf(el) {
      for (var n = el; n && n !== doc.body; n = n.parentElement) {
        var c = String(n.className || '')
        if (/danger|error|fail/i.test(c)) return 'error'
        if (/success|ok/i.test(c)) return 'success'
        if (/warn/i.test(c)) return 'warn'
      }
      return 'info'
    }
    function push(el) {
      if (!el || S.seen.has(el)) return
      S.seen.add(el)
      var t = (el.innerText || el.textContent || '')
        .replace(/\\s+/g, ' ').replace(/\\s*\\u5173\\u95ed\\s*$/, '').trim()
      if (t.length < 2) return
      S.items.push({ ms: Math.round(win.performance.now()), level: levelOf(el), txt: t.slice(0, 160) })
    }
    var all = doc.querySelectorAll(SEL)
    for (var k = 0; k < all.length; k++) push(all[k])
    var Observer = win.MutationObserver
    if (!Observer) return null
    var obs = new Observer(function (muts) {
      for (var m = 0; m < muts.length; m++) {
        var added = muts[m].addedNodes || []
        for (var n = 0; n < added.length; n++) {
          var node = added[n]
          if (!node || node.nodeType !== 1) continue
          if (node.matches && node.matches(SEL)) push(node)
          else if (node.querySelectorAll) {
            var inner = node.querySelectorAll(SEL)
            for (var x = 0; x < inner.length; x++) push(inner[x])
          }
        }
      }
    })
    obs.observe(doc.body, { childList: true, subtree: true })
    return obs
  }

  var docs = []
  function walk(root, depth) {
    if (depth > ${String(MAX_FRAME_DEPTH)}) return
    var frames
    try { frames = root.querySelectorAll('iframe') } catch (e) { return }
    for (var i = 0; i < frames.length; i++) {
      var doc = null
      try { doc = frames[i].contentDocument } catch (e) { doc = null }
      if (!doc || !doc.body) continue
      docs.push(doc)
      walk(doc, depth + 1)
    }
  }
  docs.push(document)
  walk(document, 0)

  var out = []
  for (var d = 0; d < docs.length; d++) {
    var doc = docs[d]
    var win = doc.defaultView
    if (!win) continue
    var S = win.__yonTips
    if (!S) S = win.__yonTips = { seen: new WeakSet(), items: [], cursor: 0, obs: null }
    if (!S.obs && doc.body) {
      S.obs = install(doc, win, S)
      // Whatever was already on the page belongs to whoever put it there. It goes into the
      // buffer, and the cursor moves past it in the same breath, so that no call ever reports
      // it as something that just happened. (This is the line a jsdom spec caught missing.)
      S.cursor = S.items.length
    }
    var from = S.cursor
    S.cursor = S.items.length
    for (var j = from; j < S.items.length; j++) out.push(S.items[j])
    if (out.length >= ${String(MAX_TIPS)}) break
  }
  return JSON.stringify(out.slice(0, ${String(MAX_TIPS)}))
}`

/**
 * The expression to run in the page: install on first use, then drain.
 * @param selector - the selector for the message nodes.
 * @returns one JavaScript expression whose value is a JSON array.
 */
export function tipsExpression(selector: string = TIPS_SELECTOR): string {
  return `(${TIPS_SCRIPT})(${JSON.stringify(selector)})`
}

/**
 * Read what the page sent back.
 *
 * Anything unexpected yields an empty list rather than an error: a malformed answer from a
 * page must never turn a successful click into a failed tool call.
 *
 * @param raw - the expression's value, expected to be a JSON array.
 * @returns the tips it carried, in arrival order.
 */
export function parseTips(raw: string): readonly PageTip[] {
  if (raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const tips: PageTip[] = []
  for (const entry of parsed) {
    if (entry === null || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const txt = typeof row['txt'] === 'string' ? row['txt'] : ''
    if (txt === '') continue
    const level = row['level']
    tips.push({
      ms: typeof row['ms'] === 'number' ? row['ms'] : 0,
      level: level === 'error' || level === 'warn' || level === 'success' ? level : 'info',
      txt,
    })
  }
  return tips
}

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
export function tipsOf(value: unknown): readonly PageTip[] {
  if (value === null || typeof value !== 'object') return []
  const raw = (value as { tips?: unknown }).tips
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is PageTip =>
    entry !== null && typeof entry === 'object'
    && typeof (entry as PageTip).txt === 'string')
}

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
export async function collectPageTips(
  evaluate: (expression: string) => Promise<string>,
  selector: string = TIPS_SELECTOR,
): Promise<readonly PageTip[]> {
  try {
    return parseTips(await evaluate(tipsExpression(selector)))
  } catch {
    return []
  }
}
