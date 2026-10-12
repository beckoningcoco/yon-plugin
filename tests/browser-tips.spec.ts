// @vitest-environment jsdom
/**
 * The page-tips collector, tested where it actually runs: in a DOM.
 *
 * Two halves are worth testing and both are here — the pure parsing the host does with what
 * came back, and the in-page script itself, evaluated in jsdom the same way CDP evaluates it
 * in a real page. The second half carries the load: the measured failures that shaped this
 * (a message counted two or three times, a leftover message reported as if it had just
 * happened) are all behaviours of that script, and none of them would show up in a test of
 * the parser alone.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { collectPageTips, parseTips, tipsExpression, tipsOf } from '../src/host/browser-tips.ts'

/** The page-level buffer, as this module understands it. */
interface TipsBuffer {
  obs?: { disconnect(): void }
}

/** Run the in-page half exactly as the CDP layer does: one expression, its value as text. */
function drain(selector?: string): string {
  const evaluate = eval as (source: string) => unknown
  return String(evaluate(tipsExpression(selector)))
}

/** The observer's callback is a microtask; give it a turn. */
async function settle(): Promise<void> {
  await new Promise(resolve => { setTimeout(resolve, 0) })
}

/** Append a message node the way a page would. */
function toast(text: string, classes = '', doc: Document = document): HTMLElement {
  const wrap = doc.createElement('div')
  wrap.className = `toast-modal ${classes}`.trim()
  const content = doc.createElement('div')
  content.className = 'toast-content'
  content.textContent = text
  wrap.appendChild(content)
  doc.body.appendChild(wrap)
  return content
}

afterEach(() => {
  const buffer = (window as unknown as { __yonTips?: TipsBuffer }).__yonTips
  buffer?.obs?.disconnect()
  delete (window as unknown as { __yonTips?: TipsBuffer }).__yonTips
  document.body.innerHTML = ''
})

describe('parseTips', () => {
  it('reads what the page sent, in arrival order', () => {
    const tips = parseTips(JSON.stringify([
      { ms: 12, level: 'error', txt: '提示!下列字段不能为空：订单类型' },
      { ms: 9000, level: 'info', txt: '请检查全文检索配置！' },
    ]))
    expect(tips.map(tip => tip.txt)).toEqual([
      '提示!下列字段不能为空：订单类型',
      '请检查全文检索配置！',
    ])
    expect(tips[1]?.ms).toBe(9000)
  })

  it('refuses nonsense rather than throwing, so a page cannot fail a click', () => {
    expect(parseTips('')).toEqual([])
    expect(parseTips('not json')).toEqual([])
    expect(parseTips('{"a":1}')).toEqual([])
    expect(parseTips('[null, 7, {"txt":""}]')).toEqual([])
  })

  it('falls back to info for a level it does not recognise', () => {
    const tips = parseTips(JSON.stringify([{ ms: 1, level: 'catastrophe', txt: 'x' }]))
    expect(tips[0]?.level).toBe('info')
  })
})

describe('tipsOf', () => {
  it('pulls tips off an operation result, and reports none when there are none', () => {
    expect(tipsOf({ page: {}, tips: [{ ms: 1, level: 'warn', txt: 'a' }] })[0]?.txt).toBe('a')
    expect(tipsOf({ page: {} })).toEqual([])
    expect(tipsOf(null)).toEqual([])
    expect(tipsOf('tips')).toEqual([])
    expect(tipsOf({ tips: 'not an array' })).toEqual([])
  })
})

describe('the in-page collector', () => {
  it('starts silent, reports a message once, and never twice', async () => {
    expect(drain()).toBe('[]')

    toast('请检查全文检索配置！ 关闭')
    await settle()

    const first = parseTips(drain())
    expect(first).toHaveLength(1)
    expect(first[0]?.txt).toBe('请检查全文检索配置！')

    // Draining is what makes it once-only: the second call has nothing left to give.
    expect(drain()).toBe('[]')
  })

  it('counts one message once even though several mutations mention the same node', async () => {
    // The real shape: a wrapper is added, and the content node is added inside a later
    // mutation. Both records can reach the same `.toast-content`, which is how an earlier
    // version reported a single save three times.
    drain()                                  // install first, the way any real call would
    const wrap = document.createElement('div')
    wrap.className = 'toast-modal danger'
    document.body.appendChild(wrap)
    await settle()

    const content = document.createElement('div')
    content.className = 'toast-content'
    content.textContent = '未知的错误'
    wrap.appendChild(content)
    await settle()

    const tips = parseTips(drain())
    expect(tips).toHaveLength(1)
    expect(tips[0]?.txt).toBe('未知的错误')
  })

  it('reads the severity off the toast\'s own classes', async () => {
    drain()
    toast('保存失败', 'danger')
    await settle()
    expect(parseTips(drain())[0]?.level).toBe('error')
  })

  it('ignores nodes too short to be a message', async () => {
    toast(' ')
    await settle()
    expect(parseTips(drain())).toEqual([])
  })

  it('leaves messages that were already on the page out of the first drain', async () => {
    // They belong to whoever put them there. Reporting them as this operation's output is
    // the failure the `pre` push exists to prevent.
    toast('上一步留下的提示')
    await settle()
    expect(drain()).toBe('[]')
    expect(parseTips(drain())).toEqual([])
  })

  it('reaches into a same-origin frame, which is where NCC keeps its node pages', async () => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    const inner = frame.contentDocument
    expect(inner).not.toBeNull()

    drain()                                  // install now: the frame has to exist by this point
    toast('提交失败：权限不足', '', inner as Document)
    await settle()

    const tips = parseTips(drain())
    expect(tips.map(tip => tip.txt)).toEqual(['提交失败：权限不足'])
  })

  it('honours a custom selector', async () => {
    drain('.my-own-message')
    const notice = document.createElement('div')
    notice.className = 'my-own-message'
    notice.textContent = '自定义提示'
    document.body.appendChild(notice)
    await settle()

    expect(parseTips(drain('.my-own-message'))[0]?.txt).toBe('自定义提示')
  })
})

describe('collectPageTips', () => {
  it('returns what the page sent', async () => {
    const tips = await collectPageTips(async () =>
      JSON.stringify([{ ms: 1, level: 'warn', txt: '警告' }]))
    expect(tips[0]?.txt).toBe('警告')
  })

  it('swallows a failure, because an operation must not fail over this', async () => {
    const tips = await collectPageTips(async () => {
      throw new Error('session gone')
    })
    expect(tips).toEqual([])
  })
})
