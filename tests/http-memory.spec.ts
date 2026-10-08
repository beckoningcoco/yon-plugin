/**
 * `/yon/api/memories`：面板那一侧的三条路由，以及它**没有**的那两条。
 *
 * 这一屏最要紧的性质是一个否定——没有 `POST`、没有 `PATCH`。记忆由模型写
 * （`memory-tools.ts` 的四个工具），人只能看与删。把这句写成用例，是因为「顺手加一个
 * 新建」看起来太自然了，而它会让使用者凭印象往库里写一条事实，然后下个会话把它当事实用。
 *
 * 另一件在这里钉住的事是**错误码**：`MemoryError` 必须出现在 `http.ts` 的映射链里，
 * 否则一条「读不到」会以 500 出去——那看起来像服务器崩了，而不是像「这条不在库里」。
 */
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'
import { MemoryError } from '../src/host/memory-service.ts'
import type { MemoryListRow, MemoryView } from '../src/shared/types.ts'

/** One captured `{status, body}` from a stand-in response. */
interface Written {
  status?: number
  body: string
}

/** A response that records what was written. */
function fakeRes(): { readonly res: ServerResponse, readonly written: Written } {
  const written: Written = { body: '' }
  const res = {
    headersSent: false,
    writeHead(status: number): void { written.status = status },
    end(body?: string): void { written.body = body ?? '' },
    on(): unknown { return res },
    off(): unknown { return res },
    destroy(): void {},
  }
  return { res: res as unknown as ServerResponse, written }
}

/**
 * A request for one URL, method and JSON body.
 * @param url - the path, query included.
 * @param method - the HTTP verb.
 * @param body - the JSON payload, when the route reads one.
 * @returns the request the handler will consume.
 */
function fakeReq(url: string, method: string, body?: unknown): IncomingMessage {
  const text = body === undefined ? '' : JSON.stringify(body)
  const req = {
    url,
    method,
    async *[Symbol.asyncIterator]() {
      if (text !== '') yield Buffer.from(text, 'utf8')
    },
  }
  return req as unknown as IncomingMessage
}

/** One row as a recall prints it. */
const ROW: MemoryListRow = {
  id: 'mem-20261005-141230-a1b2',
  projectId: 'prj-water',
  projectName: '水投',
  type: 'pitfall',
  title: '达梦下按时间范围查询必须走索引',
  tags: ['达梦'],
  source: '实测于 2026-10-05 会话',
  createdAt: '2026-10-05T06:12:30.000Z',
  updatedAt: '2026-10-05T06:12:30.000Z',
  snippet: '不带时间范围时全表扫。',
}

/** The same memory, full text. */
const MEMORY: MemoryView = { ...ROW, body: '不带时间范围时全表扫，要 40 秒。' }

/**
 * A service that records how it was asked and answers with fixed values.
 *
 * The parameters are declared even though the stand-ins ignore them: `vi.fn` types
 * `mock.calls` from the signature it is given, and a zero-argument mock makes every
 * `calls[0]?.[0]` a compile error rather than the assertion this file is built on.
 */
function bank(over: { readonly fail?: Error } = {}) {
  const throwIfAsked = (): void => { if (over.fail !== undefined) throw over.fail }
  return {
    list: vi.fn(async (_query?: unknown) => {
      throwIfAsked()
      return { rows: [ROW], path: '/tmp/memory/index.json' }
    }),
    read: vi.fn(async (_id: string) => {
      throwIfAsked()
      return MEMORY
    }),
    remove: vi.fn(async (id: string) => {
      throwIfAsked()
      return id
    }),
    recent: vi.fn(async () => []),
  }
}

/**
 * Mount the API over a stand-in for every service but the memory bank.
 * @param memory - the service under test.
 * @returns the handler `registerYonApi` registered.
 */
function mount(memory: unknown): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  // Everything else throws on use, for `http-iteration.spec.ts`'s reason: these cases
  // reach one service, and a stand-in that answers quietly would hide a route
  // dispatching to the wrong one.
  const unused = new Proxy({}, { get: () => () => { throw new Error('wrong service') } })
  registerYonApi(ctx, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, memory as never)
  const route = register.mock.calls[0]?.[0] as
  { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return route.handler
}

/** Run one request through the route and hand back what was written. */
async function send(
  memory: unknown,
  url: string,
  method: string,
  body?: unknown,
): Promise<Written> {
  const { res, written } = fakeRes()
  await mount(memory)(fakeReq(url, method, body), res)
  return written
}

describe('the memories API', () => {
  it('answers the bank, and passes the filters through', async () => {
    const service = bank()

    const plain = await send(service, '/yon/api/memories', 'GET')
    expect(plain.status).toBe(200)
    expect(service.list).toHaveBeenLastCalledWith({})
    expect(JSON.parse(plain.body)).toMatchObject({ path: '/tmp/memory/index.json' })

    await send(service, '/yon/api/memories?type=pitfall&project=prj-water&query=%E8%BE%BE%E6%A2%A6&tag=%E6%80%A7%E8%83%BD', 'GET')
    expect(service.list).toHaveBeenLastCalledWith({
      type: 'pitfall', project: 'prj-water', query: '达梦', tag: '性能',
    })
  })

  it('refuses an unknown type instead of answering with an empty list', async () => {
    // 空屏幕如果意味着「你把类型打错了」，那这一屏最该避免的失败就发生了。
    const service = bank()

    const { status, body } = await send(service, '/yon/api/memories?type=pitfall2', 'GET')

    expect(status).toBe(400)
    expect(JSON.parse(body)).toMatchObject({ code: 'invalid-input' })
    expect(service.list).not.toHaveBeenCalled()
  })

  it('reads one memory in full', async () => {
    const service = bank()

    const { status, body } = await send(service, `/yon/api/memories/${ROW.id}`, 'GET')

    expect(status).toBe(200)
    expect(service.read).toHaveBeenCalledWith(ROW.id)
    expect(JSON.parse(body)).toMatchObject({ memory: { id: ROW.id, body: MEMORY.body } })
  })

  it('deletes one, and answers with what went', async () => {
    const service = bank()

    const { status, body } = await send(service, `/yon/api/memories/${ROW.id}`, 'DELETE')

    expect(status).toBe(200)
    expect(service.remove).toHaveBeenCalledWith(ROW.id)
    expect(JSON.parse(body)).toEqual({ removed: ROW.id })
  })

  it('maps a missing memory to 404 rather than to a server error', async () => {
    // `MemoryError` 必须在那条 instanceof 链里。漏掉它，这条会以 500 出去。
    const service = bank({ fail: new MemoryError('not-found', '记忆库里没有这一条：mem-x') })

    const { status, body } = await send(service, '/yon/api/memories/mem-x', 'GET')

    expect(status).toBe(404)
    expect(JSON.parse(body)).toMatchObject({ code: 'not-found' })
  })

  it('has no route that creates or changes a memory', async () => {
    // 这一屏的立身之本，不是实现细节：写与改都是模型的动作，人只能看与删。
    const service = bank()

    expect((await send(service, '/yon/api/memories', 'POST', { title: '手写一条' })).status).toBe(405)
    expect((await send(service, `/yon/api/memories/${ROW.id}`, 'PATCH', { body: '改一下' })).status).toBe(405)
    expect(service.list).not.toHaveBeenCalled()
  })
})
