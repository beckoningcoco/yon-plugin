// @vitest-environment jsdom
/**
 * 客户端这一侧唯一一处「一次调用怎么发出去」：JSON 与字节两条路，一条失败处理。
 *
 * 这一层此前没有用例，因为它的每一个字面量都只是把参数搬进 `fetch`；**上传那一条不是**
 * ——头叫什么、方法是什么、名字怎么编码，写错一个字母没有任何类型检查抓得住，宿主那一侧
 * 也只在真上传时才回一句 400，而那时人已经在用了。所以这里把它钉死。
 *
 * 与宿主那一侧的约定是成对的：`http-requirements.spec.ts` 收的就是这里发出去的那个头，
 * 两边各自钉住自己这一半，谁改了另一头就会红。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request, upload } from '../src/client/request.ts'
import { API_PREFIX } from '../src/shared/types.ts'

/** 一次假的应答：`readAnswer` 只用到 `ok` / `status` / `text()` 三样。 */
interface FakeAnswer {
  readonly ok: boolean
  readonly status: number
  text(): Promise<string>
}

/**
 * 拼一次应答。
 * @param text - the raw body.
 * @param status - the status code.
 * @returns the answer the stub hands back.
 */
function answer(text: string, status = 200): FakeAnswer {
  return { ok: status >= 200 && status < 300, status, text: async () => text }
}

/**
 * 换掉全局 `fetch`，并把这一次调用的实参留在手上。
 * @param reply - what the call answers with.
 * @returns the stub, whose `mock.calls` is the assertion surface.
 */
function stubFetch(reply: FakeAnswer): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => reply)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 那一次调用的实参，按类型取出来——`vi.fn` 只记得 `unknown`。 */
function callOf(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined
  if (call === undefined) throw new Error('这一次没有发出去')
  return { url: call[0], init: call[1] }
}

/**
 * 等一次本该失败的调用，把失败本身取回来。
 * @param promise - the call.
 * @returns the error it threw.
 */
async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error: unknown) {
    return error as ApiError
  }
  throw new Error('这次调用本该失败，但它成功了')
}

afterEach(() => { vi.unstubAllGlobals() })

describe('request', () => {
  it('speaks JSON, and carries the API code out of a failure body', async () => {
    const fetchMock = stubFetch(answer('{"code":"not-found","message":"没有这条条目。"}', 404))

    const failure = await failureOf(request('/requirements/nope'))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.code).toBe('not-found')
    expect(failure.message).toBe('没有这条条目。')
    const { url, init } = callOf(fetchMock)
    expect(url).toBe(`${API_PREFIX}/requirements/nope`)
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })
})

describe('upload', () => {
  it('sends the file itself, with the name URL-encoded in a header', async () => {
    const fetchMock = stubFetch(answer('{"entry":"接口对接"}', 201))
    const picked = new File(['x'], '卡片接口清单.xlsx')

    await upload('/requirements/rq-1/files?dir=user', picked)

    const { url, init } = callOf(fetchMock)
    expect(url).toBe(`${API_PREFIX}/requirements/rq-1/files?dir=user`)
    expect(init.method).toBe('POST')
    // 名字走头，且**必须 URL 编码**：HTTP 头的值是 latin-1，中文原样放进去就是乱码，
    // 而宿主那一侧只做 `decodeURIComponent`（它不猜）。
    const header = (init.headers as Record<string, string>)['x-yon-file-name']
    expect(String(header)).toBe(encodeURIComponent('卡片接口清单.xlsx'))
    // 解回来还是那份原名——宿主那一侧只做这一步，它不猜。
    expect(decodeURIComponent(String(header))).toBe('卡片接口清单.xlsx')
    // body 就是那个 `File` 本身：先读成字符串再拼一遍，会把一个 50 MB 的附件整个读进内存。
    expect(init.body).toBe(picked)
    // 这一条不是 JSON，所以不能带上 JSON 的类型——那是 `request` 的形状，不是这条路的。
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
  })

  it('reports a refused upload the same way a refused JSON call is reported', async () => {
    stubFetch(answer('{"code":"invalid-input","message":"一个附件最多 50.0 MB。"}', 400))

    const failure = await failureOf(upload('/x', new File(['x'], 'a.bin')))

    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.code).toBe('invalid-input')
    expect(failure.message).toBe('一个附件最多 50.0 MB。')
  })
})
