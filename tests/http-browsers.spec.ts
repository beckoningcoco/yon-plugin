/**
 * The five browser routes: `/yon/api/browsers` and everything under it.
 *
 * This is the contract between the panel half and the host half, and the one place a
 * wrong dispatch is visible. Two of the shapes are worth naming:
 *
 * - **`POST .../launch` answers 201**, and a `ready:false` run is still a 201. Only a
 *   process that exited inside the readiness window is a failure; a port that is slow to
 *   answer is not. Answering 400 for the slow case would have the panel tell the operator
 *   the browser never started while it is starting.
 * - **An absent member is not an empty one.** No `profileDir` and `profileDir: ''` are
 *   two different requests — the first leaves what the row remembers, the second blanks
 *   the field back to the default. So the patch handed to the service is asserted member
 *   by member, and an empty body in is asserted to be an empty patch out.
 *
 * A third thing is asserted rather than only commented: **`runs` is read before the
 * browser id**. Nothing downstream could tell them apart — an id is opaque at this layer
 * — so a `runs` taken as an id would ask the service about a browser by that name, and
 * the case below pins which service actually got called.
 *
 * Routes are driven directly, with no socket, as in `http-iteration.spec.ts`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { registerYonApi } from '../src/host/http.ts'
import { BrowserError } from '../src/host/browser-service.ts'

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

/** The registration this suite's routes answer with. */
const VIEW = {
  id: 'edge',
  family: 'chromium',
  product: 'Microsoft Edge',
  path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  profileDir: 'E:/plugin/.browser-profile/edge',
  port: 9222,
  startUrl: '',
  pathExists: true,
  stale: false,
  logPath: 'E:/plugin/.browser-profile/edge/browser-launch.log',
} as const

/** One running instance, as the ledger holds it. */
const RUN = {
  runId: 'br-9f2c-4a1b',
  browserId: 'edge',
  label: 'Microsoft Edge',
  family: 'chromium',
  pid: 222,
  port: 9222,
  profileDir: 'E:/plugin/.browser-profile/edge',
  startedAt: '2026-10-04T10:00:00.000Z',
  endpoint: 'http://127.0.0.1:9222/json/version',
  ready: true,
  alive: 'alive',
} as const

/** What a stop answers. */
const STOP = {
  runId: 'br-9f2c-4a1b',
  removed: true,
  stopped: true,
  method: 'cdp',
} as const

/** The list payload. Only its identity matters here; its shape is `browser-service.spec.ts`'s. */
const LIST = {
  browsers: [VIEW],
  runs: [RUN],
  configPath: '/home/op/.dsh/yon-panel/browser_config.json',
  runsPath: '/home/op/.dsh/yon-panel/browser_runs.json',
  platform: 'win32',
  scanSupported: true,
  complete: true,
} as const

/** The scan payload. */
const SCAN = {
  browsers: [VIEW],
  added: ['edge'],
  updated: [],
  stale: [],
  scannedAt: '2026-10-04T10:00:00.000Z',
} as const

/**
 * A service that records how it was asked and answers with fixed values.
 *
 * The parameters are declared even though the stand-ins ignore them: `vi.fn` types
 * `mock.calls` from the signature it is given, and a zero-argument mock would make every
 * `calls[0]?.[1]` a compile error rather than the assertion this file is built on.
 * @param over - a refusal to raise from every read, for the error-mapping cases.
 */
function browsers(over: { readonly fail?: unknown } = {}) {
  const raise = (): never => { throw over.fail }
  return {
    configPath: LIST.configPath,
    runsPath: LIST.runsPath,
    list: vi.fn(async () => (over.fail === undefined ? LIST : raise())),
    scan: vi.fn(async () => (over.fail === undefined ? SCAN : raise())),
    save: vi.fn(async (_id?: string, _input?: unknown) => (over.fail === undefined ? VIEW : raise())),
    launch: vi.fn(async (_id?: string, _input?: unknown) => (over.fail === undefined ? RUN : raise())),
    stop: vi.fn(async (_runId?: string) => (over.fail === undefined ? STOP : raise())),
  }
}

/** The type of the stand-in above. */
type Browsers = ReturnType<typeof browsers>

/**
 * Mount the API over a stand-in for every service but the browsers.
 * @param service - the browser service under test.
 * @returns the handler `registerYonApi` registered.
 */
function mount(service: Browsers): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const ctx = new Context()
  const register = vi.fn((_route: unknown) => vi.fn())
  ctx.provide('webServer', { register } as never)
  // Everything else throws on use: these cases reach one service, and a stand-in that
  // answers quietly would hide a route dispatching to the wrong one.
  const unused = new Proxy({}, { get: () => () => { throw new Error('wrong service') } })
  registerYonApi(ctx, unused as never, unused as never, unused as never, unused as never,
    unused as never, unused as never, unused as never, unused as never, unused as never,
    service as never)
  const route = register.mock.calls[0]?.[0] as
  { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }
  return route.handler
}

/** Run one request through the route and hand back what was written. */
async function send(
  service: Browsers,
  url: string,
  method: string,
  body?: unknown,
): Promise<Written> {
  const { res, written } = fakeRes()
  await mount(service)(fakeReq(url, method, body), res)
  return written
}

/** The patch a `PUT` handed the service. */
function patchOf(service: Browsers): unknown {
  return service.save.mock.calls[0]?.[1]
}

/** The input a `launch` handed the service. */
function launchOf(service: Browsers): unknown {
  return service.launch.mock.calls[0]?.[1]
}

describe('GET /yon/api/browsers', () => {
  it('answers the list payload itself, with the two document paths in it', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers', 'GET')
    expect(written.status).toBe(200)
    // Not wrapped in a member: the payload already names its two lists, and a wrapper
    // would be a second place to spell "browsers" for the same thing.
    expect(JSON.parse(written.body)).toEqual(LIST)
    expect(service.list).toHaveBeenCalledTimes(1)
  })

  it('refuses a write to the collection itself', async () => {
    const service = browsers()
    expect((await send(service, '/yon/api/browsers', 'POST')).status).toBe(405)
    // A browser row comes from the scanner, never from a caller: registering one by hand
    // is the "手工指定 exe 路径" this feature deliberately does not offer.
    expect(service.scan).not.toHaveBeenCalled()
  })
})

describe('POST /yon/api/browsers/scan', () => {
  it('answers what the scan found, and which rows it added or kept', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers/scan', 'POST')
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual(SCAN)
    expect(service.scan).toHaveBeenCalledTimes(1)
  })

  it('is a POST and nothing else', async () => {
    expect((await send(browsers(), '/yon/api/browsers/scan', 'GET')).status).toBe(405)
    expect((await send(browsers(), '/yon/api/browsers/scan', 'PUT')).status).toBe(405)
  })
})

describe('PUT /yon/api/browsers/<id>', () => {
  it('hands over the four editable members and answers the row as saved', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers/edge', 'PUT', {
      path: 'D:/green/msedge.exe',
      profileDir: 'D:/profiles/edge',
      port: 9223,
      startUrl: 'http://localhost:3000',
    })
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ browser: VIEW })
    expect(service.save.mock.calls[0]?.[0]).toBe('edge')
    expect(patchOf(service)).toEqual({
      path: 'D:/green/msedge.exe',
      profileDir: 'D:/profiles/edge',
      port: 9223,
      startUrl: 'http://localhost:3000',
    })
  })

  it('sends an empty patch for an empty body, not a bag of empty strings', async () => {
    // Load-bearing: `profileDir: ''` means "back to the default" and an absent one means
    // "leave it". Filling in blanks here would reset the row every time the panel saved
    // a form it had only partly loaded.
    const service = browsers()
    expect((await send(service, '/yon/api/browsers/edge', 'PUT', {})).status).toBe(200)
    expect(patchOf(service)).toEqual({})
    expect(Object.keys(patchOf(service) as object)).toEqual([])
  })

  it('passes a blank profile directory through as the reset it is', async () => {
    const service = browsers()
    await send(service, '/yon/api/browsers/edge', 'PUT', { profileDir: '  ' })
    expect(patchOf(service)).toEqual({ profileDir: '  ' })
  })

  it('drops id, family and product rather than refusing them', async () => {
    // They decide the launch arguments and the probe, so a body that changed one would
    // swap the row for another browser while its profile directory stayed where it was.
    const service = browsers()
    await send(service, '/yon/api/browsers/edge', 'PUT', {
      id: 'chrome', family: 'firefox', product: 'Mozilla Firefox', port: 9224,
    })
    expect(patchOf(service)).toEqual({ port: 9224 })
  })

  it('reads a numeric port however the form sent it', async () => {
    const service = browsers()
    await send(service, '/yon/api/browsers/edge', 'PUT', { port: '9223' })
    expect(patchOf(service)).toEqual({ port: 9223 })
  })

  it('refuses a port that is not all digits instead of reading the digits it has', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers/edge', 'PUT', { port: '9222abc' })
    expect(written.status).toBe(400)
    expect((JSON.parse(written.body) as { code: string }).code).toBe('invalid-input')
    // `parseInt` would have made this 9222 — a port the operator did not ask for.
    expect(service.save).not.toHaveBeenCalled()
  })

  it('refuses a path that is not text, rather than letting the service turn it into a 500', async () => {
    const service = browsers()
    for (const body of [{ path: 12 }, { profileDir: {} }, { startUrl: ['http://x'] }]) {
      const written = await send(service, '/yon/api/browsers/edge', 'PUT', body)
      expect(written.status).toBe(400)
      expect((JSON.parse(written.body) as { code: string }).code).toBe('invalid-input')
    }
    expect(service.save).not.toHaveBeenCalled()
  })

  it('refuses the collection route, which has no id to edit', async () => {
    expect((await send(browsers(), '/yon/api/browsers', 'PUT', { port: 9223 })).status).toBe(405)
  })
})

describe('POST /yon/api/browsers/<id>/launch', () => {
  it('answers 201 with the run, and an empty input when the body says nothing', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers/edge/launch', 'POST', {})
    expect(written.status).toBe(201)
    expect(JSON.parse(written.body)).toEqual({ run: RUN })
    expect(service.launch.mock.calls[0]?.[0]).toBe('edge')
    // Every member means "use what the row remembers", so nothing has to be sent.
    expect(launchOf(service)).toEqual({})
  })

  it('treats a request with no body at all the same as an empty one', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers/edge/launch', 'POST')
    expect(written.status).toBe(201)
    expect(launchOf(service)).toEqual({})
  })

  it('passes the three overrides through, port as a number', async () => {
    const service = browsers()
    await send(service, '/yon/api/browsers/edge/launch', 'POST', {
      port: '9333', startUrl: 'http://localhost:3000', profileDir: 'E:/p/edge',
    })
    expect(launchOf(service)).toEqual({
      port: 9333, startUrl: 'http://localhost:3000', profileDir: 'E:/p/edge',
    })
  })

  it('ignores a path in the body: a launch cannot be aimed at another binary', async () => {
    const service = browsers()
    await send(service, '/yon/api/browsers/edge/launch', 'POST', { path: 'D:/evil.exe' })
    expect(launchOf(service)).toEqual({})
  })

  it('refuses a non-POST verb', async () => {
    expect((await send(browsers(), '/yon/api/browsers/edge/launch', 'GET')).status).toBe(405)
  })
})

describe('POST /yon/api/browsers/runs/<runId>/stop', () => {
  it('answers the stop result itself', async () => {
    const service = browsers()
    const written = await send(service, '/yon/api/browsers/runs/br-9f2c-4a1b/stop', 'POST')
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual(STOP)
    expect(service.stop.mock.calls[0]?.[0]).toBe('br-9f2c-4a1b')
  })

  it('reads runs as a branch of its own, never as a browser id', async () => {
    // An id is opaque at this layer, so nothing below could tell the two apart. This is
    // the case that would silently become "no browser named runs" if the branch moved
    // below the id branch.
    const service = browsers()
    await send(service, '/yon/api/browsers/runs/br-9f2c-4a1b/stop', 'POST')
    expect(service.stop).toHaveBeenCalledTimes(1)
    expect(service.save).not.toHaveBeenCalled()
    expect(service.launch).not.toHaveBeenCalled()
  })

  it('refuses a runs path with no run or no stop on it', async () => {
    // `runs` is not a name a browser can have — ids come from the recipe table — so this
    // spelling is a wrong URL rather than a request about a browser called runs.
    expect((await send(browsers(), '/yon/api/browsers/runs', 'POST')).status).toBe(404)
    expect((await send(browsers(), '/yon/api/browsers/runs/br-1', 'POST')).status).toBe(404)
    expect((await send(browsers(), '/yon/api/browsers/runs/br-1/stop', 'GET')).status).toBe(405)
  })
})

describe('a route that is not there, and a refusal from the service', () => {
  it('answers 404 for an unknown tail', async () => {
    const service = browsers()
    expect((await send(service, '/yon/api/browsers/edge/probe', 'POST')).status).toBe(404)
    expect((await send(service, '/yon/api/browsers/edge/launch/now', 'POST')).status).toBe(404)
  })

  it('maps not-found to 404 and every other refusal to 400', async () => {
    const missing = await send(browsers({ fail: new BrowserError('not-found', '没有叫 edge 的浏览器') }),
      '/yon/api/browsers', 'GET')
    expect(missing.status).toBe(404)
    expect((JSON.parse(missing.body) as { code: string }).code).toBe('not-found')

    for (const code of ['invalid-input', 'port-in-use', 'launch-failed', 'profile-unwritable'] as const) {
      const written = await send(browsers({ fail: new BrowserError(code, '不干') }),
        '/yon/api/browsers', 'GET')
      expect(written.status).toBe(400)
      expect((JSON.parse(written.body) as { code: string }).code).toBe(code)
    }
  })

  it('answers 500 for a fault that is not a refusal', async () => {
    const written = await send(browsers({ fail: new Error('disk on fire') }), '/yon/api/browsers', 'GET')
    expect(written.status).toBe(500)
    expect((JSON.parse(written.body) as { code: string }).code).toBe('internal')
  })
})
