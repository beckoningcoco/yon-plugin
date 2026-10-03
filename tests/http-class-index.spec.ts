/**
 * The class-index routes: `GET`/`POST`/`DELETE /yon/api/homes/<id>/class-index`.
 *
 * Batch 3a put two buttons in the Home panel — 建立/重建 and 删除索引 — and this is the
 * only place their transport is pinned. Everything else about the pair is covered
 * elsewhere: the walk in `class-index.spec.ts`, the one-build-per-version rule in
 * `class-service.spec.ts`, the text the model reads in `class-tools.spec.ts`, and the
 * states the panel draws in the preview. What is left is the contract between the two
 * halves of the panel — the response bodies `src/client/home/api.ts` destructures —
 * and a drift there fails at *nothing*: the buttons turn into no-ops or into an error
 * banner, and no unit test of either half can tell that apart from a missing click
 * handler.
 *
 * Three shapes are worth naming, because each is a promise one half makes to the other:
 *
 * - `POST` answers **202**, not 200, and carries `started` beside `status`. The panel
 *   reads `started` to decide whether to start polling, and it is not the same question
 *   as "is a build running" — a build already in flight is exactly the one worth polling.
 * - `GET` wraps the status in `{home, status}`; the panel takes `.status` and nothing else.
 * - `DELETE` answers `{removed}` — a boolean, because "there was no file" is an answer the
 *   panel has a sentence for, and a bare 204 would erase the difference.
 *
 * The routes are driven directly rather than over a socket, the way `http-picker.spec.ts`
 * does it. The older `/homes` routes have no coverage of their own; this file is scoped
 * to the three added here rather than pretending to be the whole route layer's suite.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'
import { HomeError } from '../src/host/home-files.ts'

/** One captured `{status, body}` from a stand-in response. */
interface Written {
  status?: number
  body: string
}

/** A response that records what was written to it. */
function fakeRes(): { readonly res: ServerResponse; readonly written: Written } {
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

/** A request for one URL and method; none of these three routes reads a body. */
function fakeReq(url: string, method: string): IncomingMessage {
  return { url, method } as unknown as IncomingMessage
}

/** A service that records how it was asked and answers with fixed values. */
function classService(over: Partial<Record<'status' | 'startBuild' | 'remove', unknown>> = {}) {
  const asked: string[] = []
  const note = (kind: string, id: string): void => { asked.push(`${kind}:${id}`) }
  return {
    asked,
    service: {
      status: vi.fn(async (id: string) => {
        note('status', id)
        if (over.status !== undefined) throw over.status
        return { indexed: false, version: '2111' }
      }),
      startBuild: vi.fn(async (id: string) => {
        note('startBuild', id)
        return { started: true, status: { indexed: false, version: '2111' } }
      }),
      remove: vi.fn(async (id: string) => { note('remove', id); return true }),
      build: vi.fn(async () => { throw new Error('not routed here') }),
      dispose: vi.fn(),
    },
  }
}

/**
 * Mount the API over a stand-in for every service but the class one.
 * @param classes - the class service under test.
 * @returns the handler `registerYonApi` registered.
 */
function mount(classes: unknown): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  // Everything else throws on use: these cases reach one service, and a stand-in that
  // answers quietly would hide a route dispatching to the wrong one.
  const unused = new Proxy({}, { get: () => () => { throw new Error('wrong service') } })
  registerYonApi(ctx, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, classes as never)
  const route = register.mock.calls[0]?.[0] as
    { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return route.handler
}

describe('/yon/api/homes/<id>/class-index', () => {
  it('answers GET with the status wrapped beside the id', async () => {
    const { service, asked } = classService({
      status: undefined,
    })
    const { res, written } = fakeRes()

    await mount(service)(fakeReq('/yon/api/homes/ncc-2111/class-index', 'GET'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({
      home: 'ncc-2111',
      status: { indexed: false, version: '2111' },
    })
    expect(asked).toEqual(['status:ncc-2111'])
  })

  it('answers POST with 202 and the handle, so the panel can start polling', async () => {
    const { service, asked } = classService()
    const { res, written } = fakeRes()

    await mount(service)(fakeReq('/yon/api/homes/ncc-2111/class-index', 'POST'), res)

    // 202 rather than 200: nothing has been built yet, the walk is only queued. The
    // request is answered now because the reference installation's walk is 26.2 s.
    expect(written.status).toBe(202)
    expect(JSON.parse(written.body)).toEqual({
      home: 'ncc-2111',
      started: true,
      status: { indexed: false, version: '2111' },
    })
    expect(asked).toEqual(['startBuild:ncc-2111'])
  })

  it('answers DELETE with whether a file was actually there', async () => {
    const { service, asked } = classService()
    const { res, written } = fakeRes()

    await mount(service)(fakeReq('/yon/api/homes/ncc-2111/class-index', 'DELETE'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ home: 'ncc-2111', removed: true })
    expect(asked).toEqual(['remove:ncc-2111'])
  })

  it('turns down every other method without touching the service', async () => {
    const { service, asked } = classService()
    const { res, written } = fakeRes()

    await mount(service)(fakeReq('/yon/api/homes/ncc-2111/class-index', 'PUT'), res)

    expect(written.status).toBe(405)
    expect(JSON.parse(written.body).code).toBe('method-not-allowed')
    expect(asked).toEqual([])
  })

  it('reports a registration that is not there as a 404, not as a failed build', async () => {
    // The panel's delete is two clicks away from a row that was removed in another
    // window. A 500 would say "the plugin broke"; the code is what lets the panel say
    // which of the two happened.
    const { service } = classService({ status: new HomeError('not-found', '没有登记这个 Home：gone') })
    const { res, written } = fakeRes()

    await mount(service)(fakeReq('/yon/api/homes/gone/class-index', 'GET'), res)

    expect(written.status).toBe(404)
    const body = JSON.parse(written.body)
    expect(body.code).toBe('not-found')
    expect(body.message).toContain('没有登记这个 Home：gone')
  })

  it('reads an id that needs escaping as one segment', async () => {
    // Home ids are derived from what the operator typed, so they are Chinese as often as
    // not, and the client encodes them on the way in. Decoding has to happen before the
    // service is asked, or a Chinese registration can never be built from the panel.
    const { service, asked } = classService()
    const { res, written } = fakeRes()

    await mount(service)(
      fakeReq(`/yon/api/homes/${encodeURIComponent('ncc-2111-机械院')}/class-index`, 'GET'),
      res,
    )

    expect(asked).toEqual(['status:ncc-2111-机械院'])
    expect(JSON.parse(written.body).home).toBe('ncc-2111-机械院')
  })

  it('keeps the class route apart from the metadata one beside it', async () => {
    // Two routes, one segment apart, dispatched by the same `tail` chain. Sending the
    // class status to the metadata service would answer with the wrong walk's numbers and
    // look entirely plausible in the panel.
    const meta = vi.fn(() => { throw new Error('the metadata service was asked') })
    const ctx = new Context()
    const register = vi.fn((_route: unknown) => vi.fn())
    ctx.provide('webServer', { register } as never)
    const homes = { list: vi.fn(() => { throw new Error('wrong service') }) }
    const { service, asked } = classService()
    const metaService = { status: meta, startBuild: meta }
    registerYonApi(ctx, {} as never, {} as never, {} as never, {} as never, {} as never,
      homes as never, metaService as never, service as never)
    const route = register.mock.calls[0]?.[0] as
      { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }

    const { res, written } = fakeRes()
    await route.handler(fakeReq('/yon/api/homes/ncc-2111/class-index', 'GET'), res)

    expect(meta).not.toHaveBeenCalled()
    expect(asked).toEqual(['status:ncc-2111'])
    expect(JSON.parse(written.body).status.version).toBe('2111')
  })
})
