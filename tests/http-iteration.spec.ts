/**
 * 迭代表板的四条路由：`/yon/api/iterations` 与 `/yon/api/iterations/<id>`。
 *
 * 这里是面板那一半与宿主那一半之间唯一的契约。两边各自的单测都看不出漂：面板拿到
 * 一个少了 `rows` 的对象只是画出一屏空的，宿主收到的 `status` 拼错了只是少筛了一
 * 层——没有哪个单测能把这两种情况跟「本来就没有数据」区分开。所以这四条路由的**返回
 * 形状**和**喂给服务的参数**都在这里钉住。
 *
 * 两个值得点名的形状：
 *
 * - `POST` 答 **201**，body 是 `{row, created}`。面板新建之后要把这行放到最前面，
 *   它读的就是 `row`；`created` 恒为 true（面板那条路不去重），留着是为了与模型那
 *   条路回应同一个形状。
 * - 四个筛选值在**边界**上校验：`?status=opne` 是 400 并列出合法取值，不是一条空
 *   列表。空列表和「筛错了」长得一模一样，而后者会让人以为台账里什么都没有。
 *
 * 路由直接驱动，不开 socket，与 `http-class-index.spec.ts` / `http-wiki-vaults.spec.ts`
 * 一样。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'
import { IterationError } from '../src/host/iteration-service.ts'

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

/** The ledger this suite's routes answer with. */
const ROW = {
  id: 'it-1', at: '2026-10-03T02:00:00.000Z', kind: 'gap', severity: 'high',
  scene: '查字段', symptom: '为了拿到表名绕了三步', suggestion: '', target: 'wiki_lookup',
  context: '', status: 'open',
} as const

/**
 * A service that records how it was asked and answers with fixed values.
 *
 * The parameters are declared even though the stand-ins ignore them: `vi.fn` types
 * `mock.calls` from the signature it is given, and a zero-argument mock makes every
 * `calls[0]?.[0]` a compile error rather than the assertion this file is built on.
 */
function ledger(over: { readonly row?: unknown } = {}) {
  return {
    list: vi.fn(async (_query?: unknown) => ({ rows: [over.row ?? ROW], path: '/tmp/iteration.json' })),
    create: vi.fn(async (_input?: unknown) => ({ row: over.row ?? ROW, created: true })),
    update: vi.fn(async (_id?: string, _patch?: unknown) => over.row ?? ROW),
    remove: vi.fn(async (id: string) => id),
  }
}

/**
 * Mount the API over a stand-in for every service but the ledger.
 * @param iteration - the ledger service under test.
 * @returns the handler `registerYonApi` registered.
 */
function mount(iteration: unknown): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  // Everything else throws on use: these cases reach one service, and a stand-in that
  // answers quietly would hide a route dispatching to the wrong one.
  const unused = new Proxy({}, { get: () => () => { throw new Error('wrong service') } })
  registerYonApi(ctx, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, unused as never, iteration as never,
    unused as never)
  const route = register.mock.calls[0]?.[0] as
  { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return route.handler
}

/** Run one request through the route and hand back what was written. */
async function send(
  iteration: unknown,
  url: string,
  method: string,
  body?: unknown,
): Promise<Written> {
  const { res, written } = fakeRes()
  await mount(iteration)(fakeReq(url, method, body), res)
  return written
}

describe('GET /yon/api/iterations', () => {
  it('answers the ledger with its path', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations', 'GET')
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ rows: [ROW], path: '/tmp/iteration.json' })
    // No filter asked for: the panel loads the whole ledger so its tally counts the
    // ledger rather than the view it happens to be showing.
    expect(service.list.mock.calls[0]?.[0]).toEqual({})
  })

  it('passes status and kind through', async () => {
    const service = ledger()
    await send(service, '/yon/api/iterations?status=open&kind=improvement', 'GET')
    expect(service.list.mock.calls[0]?.[0]).toEqual({ status: 'open', kind: 'improvement' })
  })

  it('refuses a filter value it does not know, naming the ones it does', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations?status=opne', 'GET')
    expect(written.status).toBe(400)
    const body = JSON.parse(written.body) as { code: string, message: string }
    expect(body.code).toBe('invalid-input')
    expect(body.message).toContain('open')
    // A typo answered with an empty list would read as 「台账里没有记录」.
    expect(service.list).not.toHaveBeenCalled()

    expect((await send(service, '/yon/api/iterations?kind=nope', 'GET')).status).toBe(400)
    // An empty value is an absent filter, not a bad one: a cleared form field.
    expect((await send(service, '/yon/api/iterations?status=&kind=', 'GET')).status).toBe(200)
  })
})

describe('POST /yon/api/iterations', () => {
  it('files a hand-written row and answers 201', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations', 'POST',
      { kind: 'gap', symptom: '手工记的一条' })
    expect(written.status).toBe(201)
    expect(JSON.parse(written.body)).toEqual({ row: ROW, created: true })
    // The panel's path never dedupes, and every absent member arrives as the empty
    // string rather than as undefined: the service's own validator sees one shape.
    expect(service.create.mock.calls[0]?.[0]).toEqual({
      kind: 'gap', symptom: '手工记的一条',
      scene: '', suggestion: '', target: '', context: '',
    })
  })

  it('passes a severity through and refuses one it does not know', async () => {
    const service = ledger()
    await send(service, '/yon/api/iterations', 'POST', { kind: 'gap', symptom: 'x', severity: 'low' })
    expect(service.create.mock.calls[0]?.[0]).toMatchObject({ severity: 'low' })

    const written = await send(service, '/yon/api/iterations', 'POST',
      { kind: 'gap', symptom: 'x', severity: 'urgent' })
    expect(written.status).toBe(400)
    expect(JSON.parse(written.body).message).toContain('high')
    expect(service.create).toHaveBeenCalledTimes(1)
  })

  it('refuses a body with no kind', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations', 'POST', { symptom: 'x' })
    expect(written.status).toBe(400)
    expect(JSON.parse(written.body).code).toBe('invalid-input')
    expect(service.create).not.toHaveBeenCalled()
  })
})

describe('/yon/api/iterations/<id>', () => {
  it('re-triages one row', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations/it-1', 'PATCH', { status: 'fixed' })
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ row: ROW })
    expect(service.update.mock.calls[0]).toEqual(['it-1', { status: 'fixed' }])
  })

  it('refuses a patch that changes nothing', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations/it-1', 'PATCH', {})
    expect(written.status).toBe(400)
    expect(JSON.parse(written.body).message).toContain('status')
    expect(service.update).not.toHaveBeenCalled()
  })

  it('answers 404 for an id the ledger does not hold', async () => {
    const service = ledger()
    service.update.mockRejectedValueOnce(new IterationError('not-found', '台账里没有这一条：it-nope'))
    service.remove.mockRejectedValueOnce(new IterationError('not-found', '台账里没有这一条：it-nope'))

    const patched = await send(service, '/yon/api/iterations/it-nope', 'PATCH', { status: 'fixed' })
    expect(patched.status).toBe(404)
    expect(JSON.parse(patched.body).code).toBe('not-found')

    const dropped = await send(service, '/yon/api/iterations/it-nope', 'DELETE')
    expect(dropped.status).toBe(404)
  })

  it('answers 405 on a method it does not serve, and 404 off the branch', async () => {
    const service = ledger()
    expect((await send(service, '/yon/api/iterations/it-1', 'GET')).status).toBe(405)
    expect((await send(service, '/yon/api/iterations', 'PUT')).status).toBe(405)
    // A near-miss path must not fall into this branch: the plugin has other routes
    // registered at the same prefix, and a typo answered by the ledger would be the
    // hardest kind of wrong to notice.
    expect((await send(service, '/yon/api/iteration', 'GET')).status).toBe(404)
  })
})

describe('DELETE /yon/api/iterations/<id>', () => {
  it('removes the row and answers with its id', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/iterations/it-1', 'DELETE')
    expect(written.status).toBe(200)
    // The id, not a boolean: the panel knows which row it just dropped, and an id
    // lets it check that the answer is about the row it asked about.
    expect(JSON.parse(written.body)).toEqual({ removed: 'it-1' })
    expect(service.remove.mock.calls[0]?.[0]).toBe('it-1')
  })

  it('unescapes the id it was given', async () => {
    const service = ledger()
    await send(service, '/yon/api/iterations/it%2F1', 'DELETE')
    expect(service.remove.mock.calls[0]?.[0]).toBe('it/1')
  })
})
