/**
 * The three registration routes: `POST/PUT/DELETE /yon/api/wiki/vaults[/<id>]`.
 *
 * These are the first routes that let a panel *write* the vault list, so what is
 * worth pinning is not "the call reaches the service" but the four things a wrong
 * dispatch would silently get wrong:
 *
 *   · which verb does what — a PUT that fell through to the create branch would
 *     register a second vault where the operator asked to edit one;
 *   · the id is a decoded URL segment, so an id with a character that needs
 *     escaping still names the same registration;
 *   · a missing field arrives as an empty string rather than a guess, because the
 *     refusal wording (and its reason) lives in the service, in one place;
 *   · an error code maps to the status the panel reads — `not-found` to 404, a
 *     refused input to 400.
 *
 * The route is driven directly rather than through a listening socket: what is
 * under test is the dispatch and the answers, not Node's HTTP server.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'
import { WikiError } from '../src/host/wiki-service.ts'

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

/** A stub whose every method throws, so a route reaching one is loud about it. */
function unreached(): never {
  throw new Error('this case should not have reached that service')
}

/** The vault list the routes are exercised against. */
const SAVED = { id: 'bip', label: 'BIP 知识库', path: 'D:/yon-bip-obsidian/yon-bip-obsidian', pages: 0, ready: false }

/**
 * Mount the API over a stand-in wiki service.
 * @param wiki - the four methods these routes call.
 * @returns the one prefix route `registerYonApi` registers.
 */
function mount(wiki: unknown): { readonly handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> } {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  registerYonApi(ctx, {} as never, {} as never, {} as never, wiki as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never)
  const route = register.mock.calls[0]?.[0] as
    { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return { handler: route.handler }
}

/** A wiki service that answers the two write calls and refuses everything else. */
function writable(): {
  readonly service: Record<string, unknown>
  readonly saveVault: ReturnType<typeof vi.fn>
  readonly removeVault: ReturnType<typeof vi.fn>
} {
  const saveVault = vi.fn(async () => SAVED)
  const removeVault = vi.fn(async () => undefined)
  return {
    service: { saveVault, removeVault, list: unreached, recent: unreached, rebuild: unreached },
    saveVault,
    removeVault,
  }
}

describe('POST /yon/api/wiki/vaults', () => {
  it('registers a vault and answers 201 with it', async () => {
    const { service, saveVault } = writable()
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults', 'POST',
      { label: 'BIP 知识库', path: 'D:/yon-bip-obsidian/yon-bip-obsidian' }), res)

    expect(written.status).toBe(201)
    expect(JSON.parse(written.body)).toEqual({ vault: SAVED })
    // No id, which is what makes this a create: the service mints one from the
    // directory. That the edit route does pass one is the PUT case below.
    expect(saveVault.mock.calls[0]?.[0])
      .toEqual({ label: 'BIP 知识库', path: 'D:/yon-bip-obsidian/yon-bip-obsidian' })
  })

  it('sends a missing field on as an empty string, not as a guess', async () => {
    // The refusal and its wording belong to the service — one place, and the place
    // that knows why the label cannot be derived. A route that invented a label, or
    // that rejected the request itself, would be a second rule to keep in step.
    const { service, saveVault } = writable()
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults', 'POST', {}), res)

    expect(written.status).toBe(201)
    expect(saveVault.mock.calls[0]?.[0]).toEqual({ label: '', path: '' })
  })

  it('maps a refused input to 400 with the service’s own words', async () => {
    const { service } = writable()
    service.saveVault = vi.fn(async () => { throw new WikiError('invalid-input', '路径不能为空') })
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults', 'POST', { label: 'x', path: '' }), res)

    expect(written.status).toBe(400)
    expect(JSON.parse(written.body)).toMatchObject({ code: 'invalid-input', message: '路径不能为空' })
  })

  it('refuses every other method', async () => {
    const { service, saveVault } = writable()
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults', 'GET'), res)

    expect(written.status).toBe(405)
    expect(JSON.parse(written.body).code).toBe('method-not-allowed')
    expect(saveVault).not.toHaveBeenCalled()
  })
})

describe('PUT /yon/api/wiki/vaults/<id>', () => {
  it('edits the registration the segment names', async () => {
    const { service, saveVault } = writable()
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults/bip', 'PUT',
      { label: '改过的名字', path: 'D:/other' }), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ vault: SAVED })
    expect(saveVault.mock.calls[0]).toEqual([{ label: '改过的名字', path: 'D:/other' }, 'bip'])
  })

  it('decodes a segment that had to be escaped', async () => {
    // Ids are minted from directory names, so one can hold a character a URL cannot
    // carry raw. Handing the escaped form to the service would address a row that
    // does not exist — and the answer would be a 404 for a registration on screen.
    const { service, saveVault } = writable()
    const { handler } = mount(service)
    const { res } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults/a%20b', 'PUT', { label: 'x', path: 'D:/y' }), res)

    expect(saveVault.mock.calls[0]?.[1]).toBe('a b')
  })

  it('answers 404 for an id that is not registered', async () => {
    const { service } = writable()
    service.saveVault = vi.fn(async () => { throw new WikiError('not-found', '没有登记这个知识库：nope') })
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults/nope', 'PUT', { label: 'x', path: 'D:/y' }), res)

    expect(written.status).toBe(404)
    expect(JSON.parse(written.body).code).toBe('not-found')
  })
})

describe('DELETE /yon/api/wiki/vaults/<id>', () => {
  it('unlists the registration and echoes the id it removed', async () => {
    const { service, removeVault } = writable()
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults/bip', 'DELETE'), res)

    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ removed: 'bip' })
    expect(removeVault.mock.calls[0]).toEqual(['bip'])
  })

  it('answers 404 for an id that is not registered', async () => {
    const { service } = writable()
    service.removeVault = vi.fn(async () => { throw new WikiError('not-found', '没有登记这个知识库：nope') })
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults/nope', 'DELETE'), res)

    expect(written.status).toBe(404)
    expect(JSON.parse(written.body).code).toBe('not-found')
  })

  it('refuses GET on an id', async () => {
    const { service, removeVault } = writable()
    const { handler } = mount(service)
    const { res, written } = fakeRes()

    await handler(fakeReq('/yon/api/wiki/vaults/bip', 'GET'), res)

    expect(written.status).toBe(405)
    expect(removeVault).not.toHaveBeenCalled()
  })
})
