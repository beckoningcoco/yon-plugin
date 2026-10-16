/**
 * 截图失败时的两条路：降级重试，以及把话说清楚。
 *
 * 为什么值得单独守：截图失败是所有浏览器工具里**最不会自己解释**的一种。记下这条迭代的人
 * 连试两次都只拿到「Page.captureScreenshot 超过 20000ms 没有回应」，而同一时刻同一页签的
 * DOM 操作是秒回的——他不知道该缩小范围还是换手段，最后放弃了截图。所以这里守两件事：
 * 失败之后**有没有换一条更轻的路再试**，以及报错**有没有告诉他页面还活着**。
 *
 * 超时本身不在这里真等：让命令直接抛错即可，超时只是失败的一种。
 */
import { describe, expect, it } from 'vitest'
import { capturePage, type CaptureOptions, type InteractContext } from '../src/host/browser-interact.ts'

/** One CDP call this spec's stand-in was handed. */
interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

/** A session whose every answer is decided per method. */
function session(
  answers: (method: string, params: Record<string, unknown>) => unknown,
): { context: InteractContext; calls: Call[] } {
  const calls: Call[] = []
  const context = {
    sessionId: 'session-1',
    connection: {
      send: async (method: string, params: Record<string, unknown>): Promise<unknown> => {
        calls.push({ method, params })
        return await answers(method, params)
      },
    },
  } as unknown as InteractContext
  return { context, calls }
}

/** The failure the tool reports when the screenshot command never comes back. */
const TIMEOUT = new Error('Page.captureScreenshot 超过 30000ms 没有回应。')

/** A page that still answers a trivial evaluate — the fact that decides what to say. */
const ALIVE = { result: { type: 'number', value: 2 } }

/** The screenshot calls a run made. */
const shotsOf = (calls: readonly Call[]): readonly Call[] =>
  calls.filter(call => call.method === 'Page.captureScreenshot')

describe('capturePage', () => {
  it('returns the first attempt when it works', async () => {
    const { context, calls } = session(method => (method === 'Page.captureScreenshot' ? { data: 'PNGDATA' } : ALIVE))

    const shot = await capturePage(context, {})

    expect(shot).toMatchObject({ base64: 'PNGDATA', mime: 'image/png' })
    expect(shot.degraded).toBeUndefined()
    expect(shotsOf(calls)).toHaveLength(1)
  })

  it('falls back to the most conservative parameters, and says that it did', async () => {
    // 静默降级最坏：调用者以为拿到的是他点名要的那张图，其实是另一张（只截可视区、没有缩放）。
    let attempts = 0
    const { context, calls } = session(method => {
      if (method !== 'Page.captureScreenshot') return ALIVE
      attempts += 1
      if (attempts === 1) throw TIMEOUT
      return { data: 'JPEGDATA' }
    })

    const shot = await capturePage(context, { maxWidth: 1400 })

    expect(shot).toMatchObject({ base64: 'JPEGDATA', mime: 'image/jpeg', degraded: true })
    // 降级那张不是原来那张，所以原来算出来的宽高不再成立。
    expect(shot.width).toBeUndefined()
    const shots = shotsOf(calls)
    expect(shots).toHaveLength(2)
    expect(shots[1]?.params).toEqual({ format: 'jpeg', quality: 60 })
  })

  it('drops the clip on the retry, so the second road is a different one', async () => {
    // 原参数会因为 maxWidth 走 clip（依赖 Page.getLayoutMetrics）；降级必须换一条不依赖它的路，
    // 否则"重试"只是把同一件可能卡住的事再做一遍。
    const metrics = { cssContentSize: { width: 2000, height: 5000 }, cssLayoutViewport: { clientHeight: 700 } }
    let attempts = 0
    const { context, calls } = session(method => {
      if (method === 'Page.getLayoutMetrics') return metrics
      if (method !== 'Page.captureScreenshot') return ALIVE
      attempts += 1
      if (attempts === 1) throw TIMEOUT
      return { data: 'JPEGDATA' }
    })

    const shot = await capturePage(context, { maxWidth: 1400 })

    const first = shotsOf(calls)[0]
    expect(first?.params).toHaveProperty('clip')
    expect(shotsOf(calls)[1]?.params).not.toHaveProperty('clip')
    expect(shot.degraded).toBe(true)
  })

  it('says the page is still alive when only the screenshot would not come back', async () => {
    const { context, calls } = session(method => {
      if (method === 'Page.captureScreenshot') throw TIMEOUT
      return ALIVE
    })

    const message = await failureOf(context)

    expect(message).toContain('仍在响应')
    expect(message).toContain('最保守的参数')
    // 这一问必须真的问过：没有它，"页面死了"和"CDP 没回来"就分不开。
    expect(calls.some(call => call.method === 'Runtime.evaluate')).toBe(true)
  })

  it('says so when the page stopped answering too', async () => {
    const { context } = session(() => { throw TIMEOUT })

    expect(await failureOf(context)).toContain('页面此刻也不响应')
  })
})

/** Run a capture that must fail, and hand back what it said. */
async function failureOf(context: InteractContext, options: CaptureOptions = {}): Promise<string> {
  try {
    await capturePage(context, options)
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : String(thrown)
  }
  throw new Error('这次截图本该失败，却成功了')
}
