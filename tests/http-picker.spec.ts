/**
 * The folder-chooser route: `POST /yon/api/pick-directory`.
 *
 * The first coverage this route layer has ever had, scoped to the branch added
 * for the Home panel's path field. It is worth its own file because every
 * interesting case here is a branch nothing else would notice: a host that
 * mounts a picker, one that mounts a different kind of picker, one that mounts
 * none, an operator who cancels, and a panel closed while the dialog is still up.
 * A silent change to any of those turns into "the button does nothing" on some
 * machine, which no unit test of the panel could tell apart from a missing click
 * handler.
 *
 * The route is driven directly rather than through a listening socket: what is
 * under test is the dispatch and the answers, not Node's HTTP server.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'

/** One captured `{status, body}` from a stand-in response. */
interface Written {
  status?: number
  body: string
}

/**
 * A response that records what was written and lets a test fire `close`.
 * @returns the response, what it recorded, and the close emitter.
 */
function fakeRes(): {
  readonly res: ServerResponse
  readonly written: Written
  readonly close: () => void
  readonly listeners: () => readonly string[]
} {
  const written: Written = { body: '' }
  const handlers = new Map<string, () => void>()
  const res = {
    headersSent: false,
    writeHead(status: number): void { written.status = status },
    end(body?: string): void { written.body = body ?? '' },
    on(event: string, handler: () => void): unknown { handlers.set(event, handler); return res },
    off(event: string): unknown { handlers.delete(event); return res },
    destroy(): void {},
  }
  return {
    res: res as unknown as ServerResponse,
    written,
    close: () => { handlers.get('close')?.() },
    listeners: () => [...handlers.keys()],
  }
}

/** A request for one URL and method; the picker route reads no body. */
function fakeReq(url: string, method: string): IncomingMessage {
  return { url, method } as unknown as IncomingMessage
}

/**
 * Mount the API over a context carrying (or not carrying) a directory picker.
 *
 * Every service but the picker is a stand-in: these cases never reach them, and a
 * stand-in that throws on use is a better witness than one that quietly answers.
 *
 * @param picker - the picker service, or undefined for a host that mounts none.
 * @returns the one prefix route `registerYonApi` registers.
 */
function mount(picker?: unknown): {
  readonly ctx: Context
  readonly handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
} {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  if (picker !== undefined) ctx.provide('directoryPicker', picker as never)
  registerYonApi(ctx, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  const route = register.mock.calls[0]?.[0] as
    { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return { ctx, handler: route.handler }
}

describe('POST /yon/api/pick-directory', () => {
  it('returns the native chooser’s answer', async () => {
    const pick = vi.fn(async () => 'E:/NCProject/NCC/home')
    const { handler } = mount({ capability: () => ({ kind: 'native', pick }) })
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/pick-directory', 'POST'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ kind: 'native', path: 'E:/NCProject/NCC/home' })
    expect(pick).toHaveBeenCalledTimes(1)
  })

  it('passes a cancelled dialog through as a null path', async () => {
    // Cancelling is an answer, not a failure: the panel keeps what the field had.
    const { handler } = mount({ capability: () => ({ kind: 'native', pick: async () => null }) })
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/pick-directory', 'POST'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ kind: 'native', path: null })
  })

  it('reports a host whose chooser is a different kind, and picks nothing', async () => {
    // The harness composes one backend per environment; `browse` (over SSH or a LAN
    // address) lists a directory in the browser and has no `pick`. Reporting the kind
    // through lets the panel drop the button rather than offer one that cannot work.
    //
    // The stray `pick` is deliberate: it pins the rule that only `native` is driven,
    // so a future tidy-up to "call `pick` whenever it exists" fails here instead of
    // writing a path nobody promised would be absolute.
    const pick = vi.fn(async () => 'should not be called')
    const { handler } = mount({ capability: () => ({ kind: 'browse', pick }) })
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/pick-directory', 'POST'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ kind: 'browse' })
    expect(pick).not.toHaveBeenCalled()
  })

  it('reports a host with no picker service at all', async () => {
    const { handler } = mount()
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/pick-directory', 'POST'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ kind: 'unavailable' })
  })

  it('does not claim `native` for a picker that has no pick to call', async () => {
    // The trap this exists for: the panel draws its button on the word `native`
    // alone, so echoing that word back without a callable `pick` would put a control
    // on screen that can never answer — no error, no path, nothing to act on.
    const { handler } = mount({ capability: () => ({ kind: 'native' }) })
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/pick-directory', 'POST'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ kind: 'unavailable' })
  })

  it('refuses every other method', async () => {
    const pick = vi.fn(async () => 'nope')
    const { handler } = mount({ capability: () => ({ kind: 'native', pick }) })
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/pick-directory', 'GET'), res)

    expect(written.status).toBe(405)
    expect(JSON.parse(written.body).code).toBe('method-not-allowed')
    expect(pick).not.toHaveBeenCalled()
  })

  it('aborts the dialog when the response closes under it', async () => {
    // A native dialog outlives the request that opened it. Closing the panel must
    // not leave an OS window up with nobody waiting on the answer.
    const signal = vi.fn((value: AbortSignal) => value)
    const { handler } = mount({
      capability: () => ({
        kind: 'native',
        pick: (incoming: AbortSignal) => new Promise<string | null>((resolve) => {
          signal(incoming)
          incoming.addEventListener('abort', () => { resolve(null) })
        }),
      }),
    })
    const { res, written, close, listeners } = fakeRes()

    const inFlight = handler(fakeReq('/yon/api/pick-directory', 'POST'), res)
    expect(listeners()).toContain('close')
    close()
    await inFlight

    expect(signal.mock.calls[0]?.[0]?.aborted).toBe(true)
    expect(JSON.parse(written.body)).toEqual({ kind: 'native', path: null })
    // And the listener is gone once the request is done, so a later close on the
    // same response cannot abort somebody else's dialog.
    expect(listeners()).not.toContain('close')
  })

  it('is a segment of its own, not a Home id', async () => {
    // `/yon/api/homes/pick-directory` would be read as "the Home named
    // pick-directory" and 405 long before a picker ran — the reason the route is
    // top-level. Pinned here so a future tidy-up cannot fold it back in.
    const pick = vi.fn(async () => 'nope')
    const { handler } = mount({ capability: () => ({ kind: 'native', pick }) })
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/homes/pick-directory', 'POST'), res)

    expect(written.status).toBe(405)
    expect(pick).not.toHaveBeenCalled()
  })
})
