/**
 * The Chrome DevTools Protocol, spoken from Node.
 *
 * WHY THIS FILE EXISTS
 * The panel already starts a browser with a debugging port (`browser-system.ts`) and
 * already remembers how to reach it (`BrowserRunView.endpoint`). What it never had was
 * a client: everything up to the port was ours, and the port itself was handed to
 * whatever tool the operator pointed at it. This module is that client — the smallest
 * thing that can ask an endpoint who it is, then carry CDP commands over a socket.
 *
 * WHY NO DEPENDENCY
 * `WebSocket` is a global from Node 22 on, and the host this plugin runs inside is
 * Electron 43 (Node 22+) — measured on this machine, not assumed. Adding `ws` would put
 * a second, older implementation of the same protocol into a package whose whole
 * dependency list is `zod` plus the harness's storage packages.
 *
 * IDENTITY, NOT JUST REACHABILITY
 * `probeEndpoint` returns the `webSocketDebuggerUrl` the browser reports for *itself*.
 * `browser-service.ts` already uses that string as the token that tells one browser
 * apart from another on a port; keeping the same evidence here means the tool layer and
 * the panel's stop path agree on what "the browser on this port" means. A port that
 * answers with something that is not a CDP identity is reported as such rather than
 * being driven as if it were one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not launch, close or restart a browser. Those are `browser-system.ts`'s
 * decisions, made by a person through the panel. A drop is a drop: this layer reports
 * it and stops, because a client that reconnects on its own would be a second owner of
 * a process it did not start.
 *
 * @module yon-panel/cdp-client
 */

/** How long the HTTP identity probe may take. */
const PROBE_TIMEOUT_MS = 5_000

/** How long one CDP command may take before it is abandoned. */
const COMMAND_TIMEOUT_MS = 30_000

/** How long the socket may take to open. */
const OPEN_TIMEOUT_MS = 10_000

/** What went wrong, as a value the tool layer can branch on. */
export type CdpErrorCode =
  /** Nothing answered on the port, or the answer was not HTTP. */
  | 'unreachable'
  /** Something answered, but it is not a CDP endpoint. */
  | 'not-cdp'
  /** The endpoint named a socket we could not open. */
  | 'socket-failed'
  /** The connection is closed — the browser was closed by a person, most likely. */
  | 'closed'
  /** A command outlived its budget. */
  | 'timeout'
  /** The browser answered a command with an error. */
  | 'protocol'

/** One CDP failure, carrying its own code so callers stop matching on prose. */
export class CdpError extends Error {
  constructor(
    readonly code: CdpErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CdpError'
  }
}

/**
 * A debugging endpoint, and the browser's own name for it.
 *
 * `token` is the identity evidence: it changes when a different browser takes the port,
 * which is exactly what `browser-service.ts` checks before it will end a run.
 */
export interface CdpEndpoint {
  /** The HTTP face, forward-slashed and without a trailing slash. */
  readonly http: string
  /** The socket the browser told us to use. */
  readonly webSocket: string
  /** `webSocketDebuggerUrl`, verbatim — the identity token. */
  readonly token: string
  /** The browser's product string, e.g. `Edg/154.0.4258.62`. */
  readonly product: string
}

/** One event the browser pushed at us. */
export interface CdpEvent {
  readonly method: string
  readonly params: Record<string, unknown>
  /** Present when the event came from a session we attached to. */
  readonly sessionId?: string
}

/** A JSON value, as CDP answers are shaped. */
export type CdpMessage = Record<string, unknown>

/** An unsubscriber, so callers can stop listening without closing the socket. */
export type CdpUnsubscribe = () => void

/**
 * Ask an HTTP debug endpoint who it is.
 *
 * The answer is the same evidence `browser-system.ts` uses on its stop path, so a run
 * that is "alive" to the panel is connectable here and vice versa.
 * @param http - a URL such as `http://127.0.0.1:9222`, with or without `/json/version`.
 * @param signal - the caller's cancellation.
 * @returns the endpoint and its identity token.
 * @throws CdpError `unreachable` when nothing answers, `not-cdp` when the answer is not CDP.
 */
export async function probeEndpoint(http: string, signal?: AbortSignal): Promise<CdpEndpoint> {
  const base = http.replace(/\/+$/, '').replace(/\/json\/version$/, '')
  const url = `${base}/json/version`
  const budget = AbortSignal.timeout(PROBE_TIMEOUT_MS)
  const composite = signal === undefined ? budget : AbortSignal.any([signal, budget])

  let response: Response
  try {
    response = await fetch(url, { signal: composite, headers: { accept: 'application/json' } })
  } catch (error) {
    throw new CdpError('unreachable',
      `连不上 ${url}：${error instanceof Error ? error.message : String(error)}。`
      + '浏览器可能已经关掉了，或者那个端口上没有东西。')
  }
  if (!response.ok) {
    throw new CdpError('unreachable', `${url} 回答了 HTTP ${String(response.status)}。`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new CdpError('not-cdp',
      `${url} 应答的内容不是 JSON。这个端口后面多半不是 Chromium 的调试端口。`)
  }
  if (body === null || typeof body !== 'object') {
    throw new CdpError('not-cdp', `${url} 应了一个 JSON，但它不是一个对象。`)
  }

  const record = body as Record<string, unknown>
  const socket = record['webSocketDebuggerUrl']
  if (typeof socket !== 'string' || !/^wss?:\/\//i.test(socket)) {
    throw new CdpError('not-cdp',
      `${url} 没有给出 webSocketDebuggerUrl，所以后面不是一个可驱动的 CDP 端点。`
      + '（Firefox 的调试端口就是这样：它的协议不是 CDP。）')
  }

  const product = record['Browser']
  return {
    http: base,
    webSocket: socket,
    token: socket,
    product: typeof product === 'string' ? product : 'unknown',
  }
}

/** What a pending command is waiting for. */
interface Pending {
  readonly resolve: (value: CdpMessage) => void
  readonly reject: (error: CdpError) => void
  readonly timer: ReturnType<typeof setTimeout>
}

/**
 * One open CDP socket.
 *
 * A connection is cheap and disposable: the tool layer opens one per call rather than
 * holding a long-lived one, so a browser that was closed between two calls produces a
 * plain `closed` error instead of a stale socket nobody noticed.
 */
export class CdpConnection {
  #socket: WebSocket
  #nextId = 1
  #pending = new Map<number, Pending>()
  #listeners = new Set<(event: CdpEvent) => void>()
  #closedReason: string | undefined
  #disposed = false

  private constructor(socket: WebSocket) {
    this.#socket = socket
    socket.addEventListener('message', (event) => { this.#onMessage(event) })
    socket.addEventListener('close', () => { this.#failAll('closed', '调试连接已关闭。') })
    socket.addEventListener('error', () => { this.#failAll('socket-failed', '调试连接出错。') })
  }

  /**
   * Open a socket to an endpoint.
   * @param endpoint - as `probeEndpoint` returned it.
   * @param signal - the caller's cancellation.
   * @returns the open connection.
   * @throws CdpError `socket-failed` when it never opens.
   */
  static async open(endpoint: CdpEndpoint, signal?: AbortSignal): Promise<CdpConnection> {
    if (typeof WebSocket === 'undefined') {
      throw new CdpError('socket-failed',
        '这个宿主没有全局 WebSocket（需要 Node 22 以上），所以没法连 CDP。')
    }
    const socket = new WebSocket(endpoint.webSocket)
    const connection = new CdpConnection(socket)

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CdpError('socket-failed', `${endpoint.webSocket} 在 ${String(OPEN_TIMEOUT_MS)}ms 内没有打开。`))
      }, OPEN_TIMEOUT_MS)
      const done = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        done()
        reject(new CdpError('socket-failed', '连接在建立过程中被取消。'))
      }
      socket.addEventListener('open', () => {
        done()
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        done()
        reject(new CdpError('socket-failed', `${endpoint.webSocket} 打不开。`))
      }, { once: true })
      if (signal?.aborted === true) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })

    return connection
  }

  /** Whether this connection has been closed, by us or by the browser. */
  get closed(): boolean {
    return this.#disposed
  }

  /** Why it closed, when the reason is known. */
  get closedReason(): string | undefined {
    return this.#closedReason
  }

  /**
   * Send one command and wait for its answer.
   * @param method - the CDP method, e.g. `Target.createTarget`.
   * @param params - its parameters.
   * @param sessionId - the attached session, when the command is session-scoped.
   * @returns the command's `result` object.
   * @throws CdpError `closed`, `timeout` or `protocol`.
   */
  async send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<CdpMessage> {
    if (this.#disposed) {
      throw new CdpError('closed',
        this.#closedReason ?? '调试连接已经关闭；浏览器可能被人关掉了，重新打开一个再试。')
    }
    const id = this.#nextId++
    const payload: Record<string, unknown> = { id, method }
    if (params !== undefined) payload['params'] = params
    if (sessionId !== undefined) payload['sessionId'] = sessionId

    const answer = new Promise<CdpMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new CdpError('timeout', `${method} 超过 ${String(COMMAND_TIMEOUT_MS)}ms 没有回应。`))
      }, COMMAND_TIMEOUT_MS)
      this.#pending.set(id, { resolve, reject, timer })
    })

    try {
      this.#socket.send(JSON.stringify(payload))
    } catch (error) {
      const pending = this.#pending.get(id)
      if (pending !== undefined) {
        clearTimeout(pending.timer)
        this.#pending.delete(id)
      }
      throw new CdpError('closed',
        `发不出去 ${method}：${error instanceof Error ? error.message : String(error)}。`)
    }

    return await answer
  }

  /**
   * Listen for browser-pushed events.
   * @param listener - called once per event.
   * @returns the unsubscriber.
   */
  on(listener: (event: CdpEvent) => void): CdpUnsubscribe {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Close the socket. Safe to call twice; pending commands fail with `closed`. */
  close(): void {
    if (this.#disposed) return
    this.#closedReason = '连接由本插件主动关闭。'
    this.#failAll('closed', this.#closedReason)
    try {
      this.#socket.close()
    } catch {
      // Closing a socket that is already gone is not a failure worth reporting.
    }
  }

  /** Refuse every waiting command and mark the socket dead. */
  #failAll(code: CdpErrorCode, message: string): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#closedReason ??= message
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer)
      pending.reject(new CdpError(code, message))
    }
    this.#pending.clear()
  }

  /** Route one socket frame to whoever is waiting for it. */
  #onMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(event.data)
    } catch {
      return
    }
    if (parsed === null || typeof parsed !== 'object') return
    const frame = parsed as Record<string, unknown>

    const id = frame['id']
    if (typeof id === 'number') {
      const pending = this.#pending.get(id)
      if (pending === undefined) return
      clearTimeout(pending.timer)
      this.#pending.delete(id)

      const failure = frame['error']
      if (failure !== null && typeof failure === 'object') {
        const detail = failure as Record<string, unknown>
        const text = typeof detail['message'] === 'string' ? detail['message'] : JSON.stringify(detail)
        pending.reject(new CdpError('protocol', text))
        return
      }
      const result = frame['result']
      pending.resolve(result !== null && typeof result === 'object' ? result as CdpMessage : {})
      return
    }

    const method = frame['method']
    if (typeof method !== 'string') return
    const params = frame['params']
    const sessionId = frame['sessionId']
    const delivered: CdpEvent = {
      method,
      params: params !== null && typeof params === 'object' ? params as Record<string, unknown> : {},
      ...(typeof sessionId === 'string' ? { sessionId } : {}),
    }
    for (const listener of this.#listeners) {
      try {
        listener(delivered)
      } catch {
        // One listener's failure must not stop the others or the socket.
      }
    }
  }
}
