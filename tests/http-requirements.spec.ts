/**
 * 需求条目的十一条路由：`/yon/api/requirements` 及其子资源。
 *
 * 这里是面板与宿主之间唯一的契约。两边各自的单测都看不出漂：面板拿到一个少了
 * `rows` 的对象只是画出一屏空的，宿主把 `?status=` 拼错只是少筛了一层——没有哪个
 * 单测能把这两种情况跟「本来就没有数据」区分开。所以这十一条路由的**返回形状**和
 * **喂给服务的参数**都在这里钉住。
 *
 * 值得点名的形状：
 *
 * - `POST` 答 **201**，body 是服务 `create` 的原样返回（`{created:true, requirement}`
 *   或 `{created:false, conflict}`）。面板那条路不带 `dedupe`，所以正常总是前者；
 *   留着后者是因为**这个形状是服务的**，HTTP 层不该把它翻译成别的东西。
 * - `POST <id>/archive` 的 body 可以是空的：不给原因也是一个完整的请求。
 * - 子资源段在**当成 id 用之前**先判掉（`annotations` / `archive` / `files`），未知的
 *   子资源段给 404 而不是「找不到这个 id 的条目」。这是 `pick-directory` 那次的规则。
 * - `files` 是**唯一一条不吃 JSON 的写路由**：body 是原始字节，文件名走
 *   `x-yon-file-name` 头（URL 编码）。理由是 `MAX_BODY_BYTES` 是**所有** JSON 路由
 *   共用的一道闸，为一个上传抬高它等于让每一条路由都能吃 50 MB。所以它有自己的读取
 *   器，用例里也就有了两条只在**没有真正读体**时才成立的断言（声明超限的请求不进服务）。
 *
 * 路由直接驱动，不开 socket，与 `http-iteration.spec.ts` 一样。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'
import { RequirementError } from '../src/host/requirement-service.ts'

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
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (text !== '') yield Buffer.from(text, 'utf8')
    },
  }
  return req as unknown as IncomingMessage
}

/**
 * A request whose body is raw bytes, with headers.
 *
 * The upload route is the one route that does not read JSON, so it is the one route
 * that needs this. `content-length` is filled in the way Node fills it, so a case can
 * be about the header shortcut rather than about a hand-set number.
 * @param url - the path, query included.
 * @param method - the HTTP verb.
 * @param bytes - the body.
 * @param headers - any extra headers, lower-cased keys.
 * @returns the request the handler will consume.
 */
function rawReq(
  url: string,
  method: string,
  bytes: Buffer,
  headers: Record<string, string> = {},
): IncomingMessage {
  const req = {
    url,
    method,
    headers: { 'content-length': String(bytes.length), ...headers },
    async *[Symbol.asyncIterator]() {
      if (bytes.length > 0) yield bytes
    },
  }
  return req as unknown as IncomingMessage
}

/** The entry this suite's routes answer with. */
const VIEW = {
  id: 'rq-20261005-abcd', projectId: 'prj-1', name: 'HG-01 固定资产卡片接口', status: 'working',
  createdAt: '2026-10-05T02:00:00.000Z', updatedAt: '2026-10-05T03:00:00.000Z',
  file: 'rq-20261005-abcd/entry.md', body: '要接三个接口。',
} as const

/** The list payload this suite's routes answer with. */
const LIST = {
  rows: [VIEW], root: '/tmp/requirements', unreadable: [],
} as const

/**
 * A service that records how it was asked and answers with fixed values.
 *
 * The parameters are declared even though the stand-ins ignore them: `vi.fn` types
 * `mock.calls` from the signature it is given, and a zero-argument mock makes every
 * `calls[0]?.[0]` a compile error rather than the assertion this file is built on.
 */
function ledger(over: { readonly list?: unknown; readonly create?: unknown } = {}) {
  return {
    list: vi.fn(async (_query?: unknown) => over.list ?? LIST),
    read: vi.fn(async (_ref?: string, _options?: unknown) => VIEW),
    create: vi.fn(async (_input?: unknown, _options?: unknown) => over.create ?? { created: true, requirement: VIEW }),
    annotate: vi.fn(async (_ref?: string, _text?: string) => VIEW),
    update: vi.fn(async (_ref?: string, _patch?: unknown) => VIEW),
    archive: vi.fn(async (_ref?: string, _reason?: string) => VIEW),
    remove: vi.fn(async (_ref?: string) => ({ id: VIEW.id, name: VIEW.name, path: `/tmp/requirements/${VIEW.id}` })),
    fileList: vi.fn(async (_ref?: string, _only?: string) => FILES),
    fileRead: vi.fn(async (_ref?: string, _dir?: string, _name?: string) => READ),
    importFile: vi.fn(async (_ref?: string, _dir?: string, _name?: string, _bytes?: Buffer) => IMPORTED),
    removeFile: vi.fn(async (_ref?: string, _dir?: string, _name?: string) => ({ id: VIEW.id, entry: VIEW.name, file: FILE_ROW })),
  }
}

/** 一行附件，形状与 `RequirementFile` 一致。 */
const FILE_ROW = {
  dir: 'user', name: '华科接口文档.txt', file: `${VIEW.id}/user/华科接口文档.txt`,
  bytes: 42, modifiedAt: '2026-10-05T03:00:00.000Z', readable: true,
} as const

/** 三个目录的清单。 */
const FILES = {
  id: VIEW.id, entry: VIEW.name, dir: `/tmp/requirements/${VIEW.id}`,
  groups: [{ dir: 'user', files: [FILE_ROW], bytes: 42 }],
} as const

/** 一次读取。 */
const READ = {
  file: FILE_ROW, text: '三个接口：卡片、变动、对照。', encoding: 'utf-8', truncated: false,
} as const

/** 一次归档。 */
const IMPORTED = { entry: VIEW.name, file: FILE_ROW } as const

/**
 * Mount the API over a stand-in for every service but the ledger.
 * @param requirements - the ledger service under test.
 * @returns the handler `registerYonApi` registered.
 */
function mount(requirements: unknown): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  // Everything else throws on use: these cases reach one service, and a stand-in that
  // answers quietly would hide a route dispatching to the wrong one.
  const unused = new Proxy({}, { get: () => () => { throw new Error('wrong service') } })
  registerYonApi(ctx, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, unused as never, unused as never,
    unused as never, requirements as never, unused as never)
  const route = register.mock.calls[0]?.[0] as
  { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return route.handler
}

/** Run one request through the route and hand back what was written. */
async function send(
  requirements: unknown,
  url: string,
  method: string,
  body?: unknown,
): Promise<Written> {
  const { res, written } = fakeRes()
  await mount(requirements)(fakeReq(url, method, body), res)
  return written
}

/** Parse a response body that is expected to be JSON. */
function json(written: Written): Record<string, unknown> {
  return JSON.parse(written.body) as Record<string, unknown>
}

describe('GET /yon/api/requirements', () => {
  it('answers the list, and asks for no filter at all when none was given', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements', 'GET')
    expect(written.status).toBe(200)
    // The shape the panel reads: rows, the library root, and what could not be read.
    expect(json(written)).toEqual(LIST)
    expect(service.list.mock.calls[0]?.[0]).toEqual({})
  })

  it('passes both filters through', async () => {
    const service = ledger()
    await send(service, '/yon/api/requirements?project=prj-1&status=working', 'GET')
    expect(service.list.mock.calls[0]?.[0]).toEqual({ projectId: 'prj-1', status: 'working' })
  })

  it('refuses a status it does not know, listing the six that exist', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements?status=opne', 'GET')
    expect(written.status).toBe(400)
    // An empty list and a misspelled filter look identical, and the second one reads
    // as "there is nothing in the ledger".
    expect(String(json(written).message)).toContain('proposed / working / review / done / onHold / dropped')
    expect(service.list).not.toHaveBeenCalled()
  })

  it('still answers with the reason when the index could not be read', async () => {
    const service = ledger({ list: { rows: [], root: '/tmp/requirements', unreadable: ['rq-x'], error: '坏了' } })
    const written = await send(service, '/yon/api/requirements', 'GET')
    expect(written.status).toBe(200)
    expect(json(written)).toMatchObject({ unreadable: ['rq-x'], error: '坏了' })
  })

  it('refuses any other verb', async () => {
    const written = await send(ledger(), '/yon/api/requirements', 'PUT')
    expect(written.status).toBe(405)
  })
})

describe('GET /yon/api/requirements/<id>', () => {
  it('reads one entry, and asks for the history only when told to', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements/rq-1', 'GET')
    expect(written.status).toBe(200)
    expect(json(written)).toEqual({ requirement: VIEW })
    expect(service.read.mock.calls[0]).toEqual(['rq-1', { history: false }])

    await send(service, '/yon/api/requirements/rq-1?history=1', 'GET')
    expect(service.read.mock.calls[1]).toEqual(['rq-1', { history: true }])
  })

  it('answers 404 for an entry that is not there', async () => {
    const service = ledger()
    service.read.mockRejectedValue(new RequirementError('not-found', '没有名为「x」的需求条目。'))
    const written = await send(service, '/yon/api/requirements/rq-x', 'GET')
    expect(written.status).toBe(404)
    expect(json(written)).toMatchObject({ code: 'not-found' })
  })

  it('answers 400 for a request the service itself refuses', async () => {
    const service = ledger()
    service.read.mockRejectedValue(new RequirementError('invalid-input', '两个项目下都有这个名字。'))
    const written = await send(service, '/yon/api/requirements/接口对接', 'GET')
    expect(written.status).toBe(400)
    expect(json(written)).toMatchObject({ code: 'invalid-input' })
  })
})

describe('POST /yon/api/requirements', () => {
  it('creates from the panel and answers 201 with the service\'s own shape', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements', 'POST', {
      projectId: 'prj-1', name: 'HG-01 固定资产卡片接口', body: '要接三个接口。',
    })
    expect(written.status).toBe(201)
    expect(json(written)).toEqual({ created: true, requirement: VIEW })
    // `projectId`, not a project reference: the panel holds the list and picks by id.
    expect(service.create.mock.calls[0]?.[0]).toEqual({
      projectId: 'prj-1', name: 'HG-01 固定资产卡片接口', body: '要接三个接口。',
    })
    // The panel's path never turns dedupe on — a person typing the same words twice
    // gets two entries (see `requirement-service.ts`, rule 3).
    expect(service.create.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('passes a status through and refuses one it does not know', async () => {
    const service = ledger()
    await send(service, '/yon/api/requirements', 'POST', { projectId: 'prj-1', name: 'X', status: 'working' })
    expect(service.create.mock.calls[0]?.[0]).toMatchObject({ status: 'working' })

    const written = await send(service, '/yon/api/requirements', 'POST', { projectId: 'prj-1', name: 'X', status: 'nope' })
    expect(written.status).toBe(400)
    expect(service.create).toHaveBeenCalledTimes(1)
  })

  it('passes a conflict answer through untouched', async () => {
    // The panel does not use this branch, but the shape belongs to the service: an
    // HTTP layer that translated it would be a second definition of it.
    const conflict = { created: false, conflict: { id: 'rq-twin', name: '接口对接' } }
    const service = ledger({ create: conflict })
    const written = await send(service, '/yon/api/requirements', 'POST', { projectId: 'prj-1', name: '接口对接' })
    expect(written.status).toBe(201)
    expect(json(written)).toEqual(conflict)
  })
})

describe('PATCH /yon/api/requirements/<id>', () => {
  it('changes the name and the status', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements/rq-1', 'PATCH', { name: '新名字', status: 'done' })
    expect(written.status).toBe(200)
    expect(json(written)).toEqual({ requirement: VIEW })
    expect(service.update.mock.calls[0]).toEqual(['rq-1', { name: '新名字', status: 'done' }])
  })

  it('refuses an empty patch and an unknown status', async () => {
    const empty = await send(ledger(), '/yon/api/requirements/rq-1', 'PATCH', {})
    expect(empty.status).toBe(400)
    expect(String(json(empty).message)).toContain('没有 name 也没有 status')

    const unknown = await send(ledger(), '/yon/api/requirements/rq-1', 'PATCH', { status: 'nope' })
    expect(unknown.status).toBe(400)
  })
})

describe('POST /yon/api/requirements/<id>/annotations', () => {
  it('appends and answers 201', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements/rq-1/annotations', 'POST', { text: '使用者说字段 A 可以空。' })
    expect(written.status).toBe(201)
    expect(json(written)).toEqual({ requirement: VIEW })
    expect(service.annotate.mock.calls[0]).toEqual(['rq-1', '使用者说字段 A 可以空。'])
  })

  it('leaves an empty note to the service to refuse', async () => {
    const service = ledger()
    // The route does not invent a second validation: the service is the one authority
    // on what a note may be, and it answers with a message naming the problem.
    await send(service, '/yon/api/requirements/rq-1/annotations', 'POST', {})
    expect(service.annotate.mock.calls[0]).toEqual(['rq-1', ''])
  })

  it('refuses another verb on the sub-resource', async () => {
    const written = await send(ledger(), '/yon/api/requirements/rq-1/annotations', 'GET')
    expect(written.status).toBe(405)
  })
})

describe('POST /yon/api/requirements/<id>/archive', () => {
  it('retires an entry, with and without a reason', async () => {
    const service = ledger()
    await send(service, '/yon/api/requirements/rq-1/archive', 'POST', { reason: '需求方撤了' })
    expect(service.archive.mock.calls[0]).toEqual(['rq-1', '需求方撤了'])

    // No body at all is a complete request: the reason is optional.
    await send(service, '/yon/api/requirements/rq-1/archive', 'POST')
    expect(service.archive.mock.calls[1]).toEqual(['rq-1', undefined])
  })
})

describe('DELETE /yon/api/requirements/<id>', () => {
  it('removes the entry and reports what went', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements/rq-1', 'DELETE')
    expect(written.status).toBe(200)
    expect(json(written)).toEqual({ removed: { id: VIEW.id, name: VIEW.name, path: `/tmp/requirements/${VIEW.id}` } })
    expect(service.remove.mock.calls[0]).toEqual(['rq-1'])
  })
})

describe('附件路由', () => {
  it('lists all three folders, and one when asked for one', async () => {
    const service = ledger()
    const all = await send(service, '/yon/api/requirements/rq-1/files', 'GET')
    expect(all.status).toBe(200)
    expect(json(all)).toEqual(FILES)
    // No filter means no filter — not `?dir=` defaulted to something on the way in.
    expect(service.fileList.mock.calls[0]).toEqual(['rq-1', undefined])

    await send(service, '/yon/api/requirements/rq-1/files?dir=patches', 'GET')
    expect(service.fileList.mock.calls[1]).toEqual(['rq-1', 'patches'])
  })

  it('takes an upload as raw bytes with the name in a header, and answers 201', async () => {
    const service = ledger()
    const { res, written } = fakeRes()
    const bytes = Buffer.from('卡片接口：字段 A 可以空', 'utf8')
    await mount(service)(
      rawReq('/yon/api/requirements/rq-1/files', 'POST', bytes, {
        'x-yon-file-name': encodeURIComponent('华科接口文档.txt'),
        'content-type': 'application/octet-stream',
      }),
      res,
    )
    expect(written.status).toBe(201)
    expect(json(written)).toEqual(IMPORTED)
    const call = service.importFile.mock.calls[0]
    expect(call?.[0]).toBe('rq-1')
    // The default folder is the operator's own: that is what an upload almost always is.
    expect(call?.[1]).toBe('user')
    // The header is URL-decoded, so a Chinese name arrives as itself rather than as
    // the percent-escapes a latin-1 header could carry.
    expect(call?.[2]).toBe('华科接口文档.txt')
    expect(Buffer.compare(call?.[3] as Buffer, bytes)).toBe(0)
  })

  it('uploads into another folder when the query says so', async () => {
    const service = ledger()
    const { res } = fakeRes()
    await mount(service)(
      rawReq('/yon/api/requirements/rq-1/files?dir=patches', 'POST', Buffer.from('x'), {
        'x-yon-file-name': 'a.patch',
      }),
      res,
    )
    expect(service.importFile.mock.calls[0]?.[1]).toBe('patches')
  })

  it('refuses an upload with no name header, and one that is not URL-encoded', async () => {
    const service = ledger()
    const bare = await send(service, '/yon/api/requirements/rq-1/files', 'POST', {})
    expect(bare.status).toBe(400)
    expect(String(json(bare).message)).toContain('x-yon-file-name')

    // `%E4%BD` is a truncated escape; it must be a 400 with a sentence, not a thrown
    // URIError turning into a 500 with a stack.
    const { res, written } = fakeRes()
    await mount(service)(
      rawReq('/yon/api/requirements/rq-1/files', 'POST', Buffer.from('x'), {
        'x-yon-file-name': '%E4%BD',
      }),
      res,
    )
    expect(written.status).toBe(400)
    expect(String(json(written).message)).toContain('URL 编码')
    expect(service.importFile).not.toHaveBeenCalled()
  })

  it('refuses a body that declares itself over the cap, without reading it', async () => {
    const service = ledger()
    const { res, written } = fakeRes()
    // A real request this large would be 50 MB of buffer in the test process; the
    // header is what makes this case cheap, and the header is exactly what is under
    // test here. The running-total half of the check is not covered by this case.
    await mount(service)(
      rawReq('/yon/api/requirements/rq-1/files', 'POST', Buffer.alloc(0), {
        'x-yon-file-name': 'huge.zip',
        'content-length': '52428801',
      }),
      res,
    )
    expect(written.status).toBe(400)
    expect(String(json(written).message)).toContain('50.0 MB')
    expect(service.importFile).not.toHaveBeenCalled()
  })

  it('reads one file as text, defaulting to user/', async () => {
    const service = ledger()
    const written = await send(
      service,
      `/yon/api/requirements/rq-1/files/${encodeURIComponent('华科接口文档.txt')}`,
      'GET',
    )
    expect(written.status).toBe(200)
    expect(json(written)).toEqual(READ)
    expect(service.fileRead.mock.calls[0]).toEqual(['rq-1', 'user', '华科接口文档.txt'])

    await send(service, '/yon/api/requirements/rq-1/files/a.md?dir=generated', 'GET')
    expect(service.fileRead.mock.calls[1]).toEqual(['rq-1', 'generated', 'a.md'])
  })

  it('deletes one file, and refuses another verb on it', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements/rq-1/files/a.patch?dir=patches', 'DELETE')
    expect(written.status).toBe(200)
    expect(json(written)).toMatchObject({ removed: { entry: VIEW.name } })
    expect(service.removeFile.mock.calls[0]).toEqual(['rq-1', 'patches', 'a.patch'])

    const refused = await send(service, '/yon/api/requirements/rq-1/files/a.md', 'PUT')
    expect(refused.status).toBe(405)
  })

  it('reads a trailing slash as the folder, not as a file named ""', async () => {
    const service = ledger()
    const written = await send(service, '/yon/api/requirements/rq-1/files/', 'GET')
    expect(written.status).toBe(200)
    expect(service.fileList).toHaveBeenCalledTimes(1)
  })

  it('answers 404 with the service\'s own sentence for a file that is not there', async () => {
    const service = ledger()
    service.fileRead.mockRejectedValue(new RequirementError('not-found', 'rq-1 的 user/ 里没有「x.md」。'))
    const written = await send(service, '/yon/api/requirements/rq-1/files/x.md', 'GET')
    expect(written.status).toBe(404)
    expect(json(written)).toMatchObject({ code: 'not-found' })
  })
})

describe('分支派发', () => {
  it('reads an unknown sub-resource as a missing route, not as a missing entry', async () => {
    const service = ledger()
    // `notes` is not a sub-resource. This has to be a 404 about the route, and — the
    // part that would be easy to get wrong — it must not reach the service at all.
    const written = await send(service, '/yon/api/requirements/rq-1/notes', 'GET')
    expect(written.status).toBe(404)
    expect(json(written)).toMatchObject({ code: 'not-found' })
    expect(service.read).not.toHaveBeenCalled()
  })

  it('reads a bare sub-resource word as an entry id', async () => {
    const service = ledger()
    // `/requirements/archive` has no third segment, so it is an id — the sub-resource
    // check only ever fires on `segments[2]`. The service is the one that says whether
    // an entry by that name exists.
    await send(service, '/yon/api/requirements/archive', 'GET')
    expect(service.read.mock.calls[0]?.[0]).toBe('archive')
  })

  it('decodes an id that carries non-ASCII text', async () => {
    const service = ledger()
    await send(service, '/yon/api/requirements/%E6%8E%A5%E5%8F%A3%E5%AF%B9%E6%8E%A5', 'GET')
    expect(service.read.mock.calls[0]?.[0]).toBe('接口对接')
  })
})
