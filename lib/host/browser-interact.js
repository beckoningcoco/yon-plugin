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
/** One refusal from this layer. */
export class InteractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'InteractError';
    }
}
/** How long a locate may poll before giving up. */
const LOCATE_TIMEOUT_MS = 5_000;
/** How long one dispatch may take. */
const DISPATCH_TIMEOUT_MS = 20_000;
/**
 * The named keys this layer can press.
 *
 * The table is the whole vocabulary: CDP needs a `key`/`code`/virtual-key triple for a
 * non-printable key to be delivered as a keystroke rather than as nothing at all. `Space` is
 * the one printable entry and carries `text` — without it the key only scrolls.
 */
const KEY_SPECS = {
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
};
/** Every key name, for a tool's enum and for error messages. */
export const KEY_NAMES = Object.keys(KEY_SPECS);
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
  const matchesTarget = (spec) => {
    const by = typeof spec.by === 'string' ? spec.by : 'css'
    const value = String(spec.value == null ? '' : spec.value)
    const index = typeof spec.index === 'number' ? spec.index : 0
    if (!Number.isInteger(index) || index < 0) {
      throw new Error('target.index 必须是非负整数，收到 ' + JSON.stringify(spec.index))
    }
    const roots = allRoots()
    let els = []
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
      els = pool.sort((a, b) => depthOf(b) - depthOf(a))
    }
    // 可见的排到前面：同一个选择器常常匹配到好几个（NCC 的参照窗在 DOM 里留着若干隐藏
    // 空壳），而 index 数的是「第几个匹配」。不排的话，第一个命中的可能是个 rect 全 0
    // 的隐藏元素——点击就落在 (0,0)，读起来像「点了没反应」，实际是点了一个看不见的东西。
    // sort 在现代 JS 里是稳定的，所以同可见性的元素保持原来的顺序。
    const ordered = els.slice().sort((a, b) => (isVisible(b) ? 1 : 0) - (isVisible(a) ? 1 : 0))
    return ordered[index] || null
  }
  const waitFor = async (spec, timeoutMs) => {
    const deadline = Date.now() + timeoutMs
    let el = matchesTarget(spec)
    while (!el && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
      el = matchesTarget(spec)
    }
    return el
  }
`;
/** A JSON value the page produced, or a refusal. */
export async function evaluateJson(context, expression) {
    const result = await context.connection.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    }, context.sessionId);
    const exception = result['exceptionDetails'];
    if (exception !== null && exception !== undefined && typeof exception === 'object') {
        const detail = exception;
        const described = detail['exception'];
        const text = described !== null && typeof described === 'object'
            ? described['description']
            : undefined;
        throw new InteractError('failed', `页面里报错了：${typeof text === 'string' ? text : JSON.stringify(detail)}`);
    }
    const remote = result['result'];
    if (remote === null || typeof remote !== 'object')
        return undefined;
    return remote['value'];
}
/**
 * Run a locator that scrolls the element into view and reports its centre.
 *
 * `focus` is folded into the same round-trip rather than done separately: focusing means
 * locating again, and an element found a moment ago may be gone by then.
 */
async function locate(context, target, focus = false) {
    const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 };
    const focusIt = focus ? 'true' : 'false';
    const script = `(async () => {
    const spec = ${JSON.stringify(spec)}
    const timeoutMs = ${String(LOCATE_TIMEOUT_MS)}
    ${PAGE_HELPERS}
    let el
    try { el = await waitFor(spec, timeoutMs) } catch (error) {
      return { ok: false, reason: String((error && error.message) || error) }
    }
    if (!el) return { ok: false, reason: 'not-found' }
    if (${focusIt} && typeof el.focus === 'function') el.focus()
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    // 相对主框架的坐标：CDP 的输入事件按主框架视口定位，iframe 内的元素必须补上偏移。
    const offset = mainFrameOffset(el)
    return {
      ok: true,
      x: Math.round(offset.x + r.x + r.width / 2),
      y: Math.round(offset.y + r.y + r.height / 2),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 80),
    }
  })()`;
    const located = await evaluateJson(context, script);
    if (located.ok)
        return located;
    if (located.reason === 'not-found') {
        throw new InteractError('not-found', `没有找到 ${describeTarget(target)}。页面里可能还没有这个元素（可以先用 browser_read 看一遍），`
            + '或者选择器/文字对不上。CSS 选择器可以写 `#id`、`[name=x]`、`button.primary` 这类；'
            + '按可见文字找就用 by="text"，只写按钮上的字。');
    }
    throw new InteractError('invalid-target', located.reason ?? '定位失败');
}
/** How a target reads in an error message. */
function describeTarget(target) {
    const by = target.by ?? 'css';
    const which = by === 'css' ? '这个选择器' : by === 'text' ? '这段文字' : '这个 XPath';
    return `${which}「${target.value}」`;
}
/** One CDP dispatch, bounded so a wedged page cannot hold the call open. */
async function dispatch(context, method, params) {
    let timer;
    const budget = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new InteractError('failed', `${method} 超过 ${String(DISPATCH_TIMEOUT_MS)}ms 没有回应。`));
        }, DISPATCH_TIMEOUT_MS);
    });
    try {
        return await Promise.race([context.connection.send(method, params, context.sessionId), budget]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/**
 * Click the centre of a located element with a real pointer sequence.
 *
 * The pointer moves first: Chromium delivers a synthesized press to whatever the view
 * currently considers hovered, and a tab that has never seen a mouse event has no hover
 * target at all — the press then goes nowhere while CDP reports success.
 */
export async function clickAt(context, target) {
    const located = await locate(context, target);
    const x = located.x ?? 0;
    const y = located.y ?? 0;
    // Best-effort release, used when either half of the click fails: a pointer left pressed
    // turns the next action on that page into a drag.
    const release = () => {
        void context.connection
            .send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, context.sessionId)
            .catch(() => undefined);
    };
    await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    try {
        await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    }
    catch (error) {
        release();
        throw error;
    }
    try {
        await dispatch(context, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    catch (error) {
        release();
        throw error;
    }
    return { tag: located.tag ?? '', text: located.text ?? '' };
}
/**
 * Insert text at the focused element, or focus a located one first.
 *
 * `Input.insertText` goes through the browser's own input pipeline, so it raises the same
 * events a person typing would — which is what controlled widgets listen for.
 */
export async function typeText(context, text, target) {
    if (target !== undefined) {
        // Locate with focus folded in: this is the only step that can name the selector in the
        // "no such field" message, which beats a generic "nothing is focused".
        await locate(context, target, true);
    }
    else {
        const state = await evaluateJson(context, `(() => {
        const el = document.activeElement
        return { ok: el !== null && el !== document.body, tag: el ? el.tagName.toLowerCase() : '' }
      })()`);
        if (!state.ok) {
            throw new InteractError('not-found', '页面上没有获得焦点的元素，所以不知道往哪里输入。用 target 指明一个输入框，'
                + '或者先用 browser_click 点一下它。');
        }
    }
    await dispatch(context, 'Input.insertText', { text });
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
export async function setValueOf(context, target, value) {
    const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 };
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
  })()`;
    const outcome = await evaluateJson(context, script);
    if (outcome.ok) {
        return {
            tag: outcome.tag ?? '',
            value: outcome.value ?? '',
            ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
        };
    }
    if (outcome.reason === 'not-a-boolean') {
        throw new InteractError('invalid-target', `${describeTarget(target)} 是勾选框或单选框，值要写成 "true" 或 "false"（也接受 on/off、1/0）。`);
    }
    if (outcome.reason === 'unsupported-control') {
        throw new InteractError('invalid-target', `${describeTarget(target)} 不是输入框、文本域、下拉框、勾选框或可编辑区域，设值对它没有意义。`);
    }
    if (outcome.reason === 'not-found')
        await locate(context, target);
    throw new InteractError('invalid-target', outcome.reason ?? '设值失败');
}
/** One named key press, with the release guaranteed. */
export async function pressKey(context, key) {
    const spec = KEY_SPECS[key];
    if (spec === undefined) {
        throw new InteractError('invalid-target', `不支持的按键「${key}」。可用的是：${KEY_NAMES.join('、')}。`);
    }
    const params = {
        key: spec.key,
        code: spec.code,
        windowsVirtualKeyCode: spec.vk,
        nativeVirtualKeyCode: spec.vk,
        ...(spec.text === undefined ? {} : { text: spec.text }),
    };
    const release = () => {
        void context.connection.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, context.sessionId).catch(() => undefined);
    };
    try {
        await dispatch(context, 'Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    }
    catch (error) {
        release();
        throw error;
    }
    try {
        await dispatch(context, 'Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    }
    catch (error) {
        release();
        throw error;
    }
}
/**
 * Scroll a located element into view, or the page by a pixel delta.
 *
 * Scrolling the page rather than dispatching a wheel event: a wheel event only moves what is
 * under the pointer, so a call meant to "go down the page" would depend on where the mouse
 * happens to be. Lazy lists that need real wheel input are a later, deliberate addition.
 */
export async function scrollPage(context, deltaY, target) {
    if (target !== undefined) {
        await locate(context, target);
        return await evaluateJson(context, '({ y: Math.round(window.scrollY), maxY: Math.round(document.documentElement.scrollHeight - window.innerHeight) })');
    }
    const script = `(() => {
    window.scrollBy({ top: ${String(deltaY)}, left: 0, behavior: 'instant' })
    return { y: Math.round(window.scrollY), maxY: Math.round(document.documentElement.scrollHeight - window.innerHeight) }
  })()`;
    return await evaluateJson(context, script);
}
/** The document's own size, in CSS pixels, as `Page.getLayoutMetrics` reports it. */
function layoutSize(metrics) {
    const content = metrics['cssContentSize'] ?? metrics['contentSize'];
    const viewport = metrics['cssLayoutViewport'] ?? metrics['layoutViewport'];
    if (content === null || content === undefined || typeof content !== 'object')
        return undefined;
    const size = content;
    const width = typeof size['width'] === 'number' ? size['width'] : undefined;
    const height = typeof size['height'] === 'number' ? size['height'] : undefined;
    if (width === undefined || height === undefined || width <= 0 || height <= 0)
        return undefined;
    const view = viewport !== null && viewport !== undefined && typeof viewport === 'object'
        ? viewport
        : {};
    const viewportHeight = typeof view['clientHeight'] === 'number' ? view['clientHeight'] : height;
    return { width, height, viewportHeight };
}
/**
 * Capture the page.
 *
 * Downscaling goes through `clip.scale`, which only applies to the region a clip names — so
 * the clip has to cover the whole document, and `captureBeyondViewport` must then be dropped
 * or the two describe different images.
 */
export async function capturePage(context, options) {
    const format = options.format ?? 'png';
    const params = {};
    if (options.fullPage === true)
        params['captureBeyondViewport'] = true;
    if (format === 'jpeg') {
        params['format'] = 'jpeg';
        // CDP's range is 0-100 and defaults to 80 when omitted.
        if (options.quality !== undefined)
            params['quality'] = options.quality;
    }
    let width;
    let height;
    if (options.maxWidth !== undefined || options.maxHeight !== undefined) {
        const metrics = await context.connection.send('Page.getLayoutMetrics', {}, context.sessionId);
        const size = layoutSize(metrics);
        if (size !== undefined) {
            const target = options.fullPage === true ? size.height : size.viewportHeight;
            const byWidth = options.maxWidth !== undefined && size.width > 0 ? options.maxWidth / size.width : 1;
            const byHeight = options.maxHeight !== undefined && target > 0 ? options.maxHeight / target : 1;
            const scale = Math.min(1, byWidth, byHeight);
            width = Math.round(size.width * scale);
            height = Math.round(target * scale);
            if (scale < 1) {
                params['clip'] = { x: 0, y: 0, width: size.width, height: target, scale };
                delete params['captureBeyondViewport'];
            }
        }
    }
    const shot = await dispatch(context, 'Page.captureScreenshot', params);
    const data = shot['data'];
    if (typeof data !== 'string' || data === '') {
        throw new InteractError('failed', '截图返回了空图像。页面可能还没画出来（刚导航完），等一下再截。');
    }
    return {
        base64: data,
        mime: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
    };
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
export async function collectElements(context, maxNodes) {
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
  })()`;
    return await evaluateJson(context, script);
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
export async function readValueOf(context, target) {
    const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 };
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
  })()`;
    const outcome = await evaluateJson(context, script);
    if (outcome.ok) {
        return {
            tag: outcome.tag,
            value: outcome.value,
            ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
        };
    }
    if (outcome.reason === 'not-found')
        await locate(context, target);
    throw new InteractError('invalid-target', outcome.reason ?? '读取失败');
}
/** How long a wait polls by default. */
const WAIT_TIMEOUT_MS = 10_000;
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
export async function waitForPage(context, options) {
    const timeoutMs = options.timeoutMs ?? WAIT_TIMEOUT_MS;
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
  })()`;
    return await evaluateJson(context, script);
}
/** Step through the page's own history, or say there is nowhere to go. */
async function moveHistory(context, offset) {
    const history = await context.connection.send('Page.getNavigationHistory', {}, context.sessionId);
    const index = history['currentIndex'];
    const entries = history['entries'];
    if (typeof index !== 'number' || !Array.isArray(entries)) {
        throw new InteractError('failed', '浏览器没有给出这个页面的历史记录。');
    }
    const wanted = index + offset;
    if (wanted < 0 || wanted >= entries.length)
        return { moved: false, url: '' };
    const entry = entries[wanted];
    if (entry === null || typeof entry !== 'object')
        return { moved: false, url: '' };
    const record = entry;
    const entryId = record['id'];
    if (typeof entryId !== 'number')
        return { moved: false, url: '' };
    await context.connection.send('Page.navigateToHistoryEntry', { entryId }, context.sessionId);
    return { moved: true, url: typeof record['url'] === 'string' ? record['url'] : '' };
}
/** Go back one step. */
export async function goBack(context) {
    return await moveHistory(context, -1);
}
/** Go forward one step. */
export async function goForward(context) {
    return await moveHistory(context, 1);
}
/** Reload the page, optionally bypassing the cache. */
export async function reloadPage(context, ignoreCache) {
    await dispatch(context, 'Page.reload', { ignoreCache });
}
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
export async function selectOption(context, target, wanted, match) {
    const spec = { by: target.by ?? 'css', value: target.value, index: target.index ?? 0 };
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
  })()`;
    const outcome = await evaluateJson(context, script);
    if (outcome.ok)
        return { value: outcome.value, label: outcome.label };
    if (outcome.reason === 'not-a-select') {
        throw new InteractError('invalid-target', `${describeTarget(target)} 是 ${outcome.tag ?? '未知标签'}，不是下拉框。`);
    }
    if (outcome.reason === 'no-option') {
        const available = outcome.available ?? [];
        throw new InteractError('not-found', `${describeTarget(target)} 里没有「${wanted}」这一项。可选的有：`
            + `${available.length === 0 ? '(一个都没有)' : available.join('、')}。`);
    }
    if (outcome.reason === 'not-found')
        await locate(context, target);
    throw new InteractError('invalid-target', outcome.reason ?? '选择失败');
}
/** How long each field of a batch is given to appear. */
const FILL_FIELD_TIMEOUT_MS = 1_500;
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
export async function fillFields(context, fields, submit) {
    const specs = fields.map(field => ({
        target: {
            by: field.target.by ?? 'css',
            value: field.target.value,
            index: field.target.index ?? 0,
        },
        value: field.value,
    }));
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
  })()`;
    return await evaluateJson(context, script);
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
export async function scrapeRows(context, rowSelector, fields, limit) {
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
  })()`;
    const result = await evaluateJson(context, script);
    if (!result.ok)
        throw new InteractError('invalid-target', result.reason ?? '抓取失败');
    const rows = result.rows ?? [];
    return { rows, count: result.count ?? rows.length, truncated: (result.count ?? rows.length) > rows.length };
}
