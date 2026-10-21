/**
 * The `/yon/api/frontends` branch: the verbs the panel drives, and the shape of
 * each answer.
 *
 * The service is the real one over a scratch store and a scratch project, unlike
 * the other HTTP specs' stand-ins: this branch is thin enough that what is worth
 * proving is the dispatch and the status codes, and a stand-in service would only
 * prove those against itself.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFrontendStore } from '../src/host/frontend-store.ts'
import { createYonFrontendsService } from '../src/host/frontend-service.ts'
import { registerYonApi } from '../src/host/http.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/** One captured `{status, body}` from a stand-in response. */
interface Written {
  status: number
  body: string
}

/** A response that records what was written to it. */
function fakeRes(): { res: ServerResponse; written: Written } {
  const written: Written = { status: 0, body: '' }
  const shape = { headersSent: false }
  const res = {
    get headersSent(): boolean { return shape.headersSent },
    writeHead(status: number) { written.status = status; shape.headersSent = true; return res },
    end(body?: string) { written.body = body ?? '' },
    destroy() {},
  } as unknown as ServerResponse
  return { res, written }
}

/** A request for one URL and method with a JSON body. */
function fakeReq(url: string, method: string, body?: unknown): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    url,
    method,
    async *[Symbol.asyncIterator]() { yield* chunks },
  } as unknown as IncomingMessage
}

/**
 * Mount the API over a context carrying the real front-end service.
 * @returns the one prefix route `registerYonApi` registers, and the project root.
 */
async function mount(): Promise<{
  readonly handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  readonly root: string
}> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-http-'))
  temporary.push(dir)
  const root = join(dir, 'hotwebs')
  await mkdir(join(root, 'src', 'cmp', 'bank', 'node', 'list'), { recursive: true })
  await writeFile(join(root, 'src', 'cmp', 'bank', 'node', 'list', 'index.js'), '// page\n', 'utf8')
  await writeFile(join(root, 'config.json'), '{}', 'utf8')

  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  const service = createYonFrontendsService(
    createFrontendStore(join(dir, 'frontend_config.json')),
    join(dir, 'index'),
  ).service

  const unused = new Proxy({}, { get: () => () => { throw new Error('wrong service') } })
  registerYonApi(ctx, unused as never, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, service as never)
  const route = register.mock.calls[0]?.[0] as
    { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return { handler: route.handler, root }
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('/yon/api/frontends', () => {
  it('lists what is registered, and where the document is', async () => {
    const { handler, root } = await mount()
    const saved = fakeRes()
    await handler(fakeReq(`/yon/api/frontends`, 'POST', {
      path: root.replace(/\\/g, '/'), product: 'ncc', version: '2005',
    }), saved.res)
    expect(saved.written.status).toBe(201)

    const { res, written } = fakeRes()
    await handler(fakeReq('/yon/api/frontends', 'GET'), res)
    expect(written.status).toBe(200)
    const payload = JSON.parse(written.body) as { frontends: { id: string }[]; configPath: string }
    expect(payload.frontends.map(row => row.id)).toEqual(['fe-ncc-2005'])
    expect(payload.configPath).toContain('frontend_config.json')
  })

  it('registers, edits, probes, promotes and removes one', async () => {
    const { handler, root } = await mount()
    const path = root.replace(/\\/g, '/')

    const created = fakeRes()
    await handler(fakeReq('/yon/api/frontends', 'POST', { path, product: 'ncc', version: '2005' }), created.res)
    expect(created.written.status).toBe(201)

    const edited = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005', 'PUT', { path, product: 'ncc', version: '2005' }), edited.res)
    expect(edited.written.status).toBe(200)

    const probed = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/probe', 'POST', {}), probed.res)
    expect(probed.written.status).toBe(200)
    expect(JSON.parse(probed.written.body)).toMatchObject({ frontend: { id: 'fe-ncc-2005' } })

    const promoted = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/default', 'PUT', {}), promoted.res)
    expect(promoted.written.status).toBe(200)

    const removed = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005', 'DELETE'), removed.res)
    expect(removed.written.status).toBe(200)
    expect(JSON.parse(removed.written.body)).toEqual({ removed: 'fe-ncc-2005' })
  })

  it('answers a version clash with 400 and the row it clashed with', async () => {
    const { handler, root } = await mount()
    const body = { path: root.replace(/\\/g, '/'), product: 'ncc', version: '2005' }
    await handler(fakeReq('/yon/api/frontends', 'POST', body), fakeRes().res)
    const { res, written } = fakeRes()
    await handler(fakeReq('/yon/api/frontends', 'POST', body), res)
    expect(written.status).toBe(400)
    expect(JSON.parse(written.body)).toMatchObject({ code: 'invalid-input' })
    expect(written.body).toContain('NCC2005')
  })

  it('answers an unknown id with 404', async () => {
    const { handler } = await mount()
    const { res, written } = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-9999/probe', 'POST', {}), res)
    expect(written.status).toBe(404)
    expect(JSON.parse(written.body)).toMatchObject({ code: 'not-found' })
  })

  it('answers an unknown route under the branch with 404', async () => {
    const { handler } = await mount()
    const { res, written } = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/nonsense', 'GET'), res)
    expect(written.status).toBe(404)
  })

  it('serves the page tree, its status, a directory listing and a file preview', async () => {
    const { handler, root } = await mount()
    await handler(fakeReq('/yon/api/frontends', 'POST', {
      path: root.replace(/\\/g, '/'), product: 'ncc', version: '2005',
    }), fakeRes().res)

    // No index yet: the status route answers null without building one.
    const empty = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/pages/status', 'GET'), empty.res)
    expect(empty.written.status).toBe(200)
    expect(JSON.parse(empty.written.body)).toEqual({ frontend: 'fe-ncc-2005', status: null })

    // GET pages builds it on first ask.
    const pages = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/pages', 'GET'), pages.res)
    expect(pages.written.status).toBe(200)
    const tree = JSON.parse(pages.written.body) as { totalNodes: number; nodes: { dir: string }[] }
    expect(tree.totalNodes).toBe(1)
    expect(tree.nodes[0]?.dir).toBe('src/cmp/bank/node')

    // POST walks it again.
    const rebuilt = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/pages', 'POST', {}), rebuilt.res)
    expect(rebuilt.written.status).toBe(200)
    expect(JSON.parse(rebuilt.written.body)).toMatchObject({ status: { nodes: 1, pages: 1 } })

    // The dir route lists one level.
    const dir = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/dir?path=src/cmp/bank/node/list', 'GET'), dir.res)
    expect(dir.written.status).toBe(200)
    const listing = JSON.parse(dir.written.body) as { entries: { name: string }[] }
    expect(listing.entries.map(entry => entry.name)).toContain('index.js')

    // The file route previews through the same service the tool uses.
    const file = fakeRes()
    await handler(fakeReq(
      '/yon/api/frontends/fe-ncc-2005/file?path=src/cmp/bank/node/list/index.js&from=1&to=5', 'GET',
    ), file.res)
    expect(file.written.status).toBe(200)
    expect(JSON.parse(file.written.body)).toMatchObject({ encoding: 'utf-8', text: '// page\n' })

    // A missing path is the caller's mistake, not a crash.
    const missing = fakeRes()
    await handler(fakeReq('/yon/api/frontends/fe-ncc-2005/file', 'GET'), missing.res)
    expect(missing.written.status).toBe(400)
  })
})
