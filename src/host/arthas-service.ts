/**
 * The state the arthas tools and the arthas panel both read.
 *
 * ## Why this is a service rather than a closure inside the tools
 *
 * It started as one: `arthas-tools.ts` kept its observation sessions in a map
 * created when the tools were registered, which is enough while the model is the
 * only reader. The panel is a second reader, and it lives in the other half of the
 * plugin — reached over HTTP — so the sessions have to be somewhere both halves
 * can see. That is the whole of what this file is.
 *
 * ## Why the audit is the point rather than a feature
 *
 * The design notes put it as a requirement, not a preference: `ognl` is arbitrary
 * code execution, so **what the model ran inside a serving process has to be
 * visible to a person at a glance**. An event stream carrying only successful
 * `watch` results would carry the harmless half. So every call the tools make is
 * recorded here — command verbatim, target process, and a flag on the risky kind —
 * and the panel puts those rows beside the sessions rather than behind a filter
 * somebody has to think to open.
 *
 * ## What is deliberately not persisted
 *
 * Nothing goes to disk. A session cannot outlive the agent serving it, and the
 * agent cannot outlive the process this plugin runs in, so writing sessions out
 * would only manufacture files that are stale by construction. The audit is
 * bounded in memory for the same reason, and because a log that grows without end
 * during a long debugging session is its own kind of failure — see `AUDIT_LIMIT`.
 */
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { RunSubprocess } from './datasource-probe.ts'
import { ArthasError } from './arthas-errors.ts'
import {
  ARTHAS_HTTP_PORT, classCountOf, execArthas, plainMessage, type ArthasResponse,
  type ArthasResult,
} from './arthas-http.ts'
import {
  agentPid, listJavaProcesses, resolveJps, toTargets, type ArthasTarget,
} from './arthas-targets.ts'
import { ARTHAS_BOOT_JAR, versionOfLibDir } from './arthas-fetch.ts'
import type { ArthasStore, StoredArthas } from './arthas-store.ts'
import type {
  ArthasAuditView, ArthasEnvView, ArthasEventView, ArthasPanelPayload, ArthasSessionDetail,
  ArthasSessionView, ArthasTargetsPayload, ArthasTargetView,
} from '../shared/types.ts'

/**
 * How many audit rows are kept.
 *
 * Five hundred is a morning of debugging, which is longer than any single session
 * of it, and small enough that the panel can render the whole list without paging.
 * The oldest rows fall off the end rather than the buffer growing.
 */
const AUDIT_LIMIT = 500

/** How many audit rows the panel is handed in one payload. */
const AUDIT_PAGE = 120

/**
 * How many times to issue `reset` before giving up on a class reaching zero.
 *
 * Measured: consecutive `reset` calls on one class answered `classCount` 1, 1, 0 —
 * one call is not enough, and a class that never settles would loop for ever.
 */
const MAX_RESET_ROUNDS = 10

/** A `reset` is a short command. */
const RESET_TIMEOUT_MS = 15_000

/** How long an attach is given to bring its port up. */
const ATTACH_WAIT_ROUNDS = 20

/** Where a session is in its life. */
export type ArthasWatchState = 'watching' | 'settled' | 'failed' | 'stopped'

/**
 * One observation session, as the tools drive it.
 *
 * The mutable fields are mutable on purpose: this object *is* the session, and the
 * background request writes its outcome into it as it arrives. The panel never
 * touches it — it reads the immutable `ArthasSessionView` built from it.
 */
export interface ArthasWatchHandle {
  readonly id: string
  readonly pid: number
  readonly port: number
  readonly command: string
  /** The class being observed; absent for a session started by hand. */
  readonly className?: string
  readonly startedAt: number
  /** The `-n` value: how many hits this session will collect at most. */
  readonly expected: number
  /**
   * How many results a reader has already been handed.
   *
   * A read cursor rather than part of the session's own story: `arthas_events`
   * defaults to "only what is new", and something has to remember where the last
   * read stopped. It belongs here rather than in the tool because a session can be
   * read more than once — a retry, a second question about the same run — and a
   * cursor kept in the calling code would silently re-deliver or skip.
   */
  delivered: number
  /** Cancels the in-flight request. Owned by the session, not by a tool call. */
  readonly controller: AbortController
  /** Resolves when the command finishes, however it finishes. */
  settled: Promise<void>
  state: ArthasWatchState
  results: readonly ArthasResult[]
  response?: ArthasResponse
  /** Why it failed, or what `stop` did to it. */
  message?: string
}

/** What {@link YonArthasService.startWatch} needs. */
export interface StartWatchInput {
  readonly pid: number
  readonly port: number
  readonly command: string
  readonly className?: string
  readonly expected: number
}

/** One audit row to record. */
export interface AuditInput {
  readonly kind: string
  readonly pid: number
  readonly port: number
  readonly command: string
  /** True for the arbitrary-code-execution kind. */
  readonly risky?: boolean
  readonly outcome?: string
}

/** What the host gives this service that it cannot reach itself. */
export interface ArthasServiceDeps {
  readonly store: ArthasStore
  /** `ufjdk/bin` candidates, best first. */
  readonly jdkBins: () => Promise<readonly string[]>
  /** The subprocess service, when this deployment has one. */
  readonly subprocess: () => RunSubprocess | undefined
}

/** The service, as the tools and the HTTP routes use it. */
export interface YonArthasService {
  /** The registration document, for a screen that has to name it. */
  readonly storePath: string
  // ── driven by the tools ──
  startWatch(input: StartWatchInput): ArthasWatchHandle
  watch(id: string): ArthasWatchHandle | undefined
  audit(input: AuditInput): void
  // ── read by the panel ──
  panel(): Promise<ArthasPanelPayload>
  detail(id: string): ArthasSessionDetail | undefined
  targets(port?: number): Promise<ArthasTargetsPayload>
  attach(pid: number, port?: number, signal?: AbortSignal): Promise<ArthasTargetsPayload>
  stop(id: string, signal?: AbortSignal): Promise<ArthasSessionDetail>
}

/** The service and the disposer that ends its sessions. */
export interface YonArthasHandle {
  readonly service: YonArthasService
  dispose(): void
}

/** How many `watch` results a session has collected. */
function hitsOf(handle: ArthasWatchHandle): number {
  return handle.results.filter(result => result.type === 'watch').length
}

/** One session as the panel sees it. */
function sessionView(handle: ArthasWatchHandle): ArthasSessionView {
  return {
    id: handle.id,
    pid: handle.pid,
    port: handle.port,
    command: handle.command,
    ...handle.className === undefined ? {} : { className: handle.className },
    startedAt: handle.startedAt,
    expected: handle.expected,
    state: handle.state,
    hits: hitsOf(handle),
    ...handle.message === undefined ? {} : { message: handle.message },
  }
}

/** The `classCount`/`methodCount` a result carries, whichever field holds them. */
function countsOf(result: ArthasResult): { classCount?: number; methodCount?: number } {
  // `enhancer` puts them under `effect`, `reset` under `affect` — measured, and the
  // two are not interchangeable. Reading only one of them makes half the results
  // look like they registered nothing.
  const source = result.effect ?? result.affect
  if (source === null || typeof source !== 'object') return {}
  const fields = source as Record<string, unknown>
  return {
    ...typeof fields.classCount === 'number' ? { classCount: fields.classCount } : {},
    ...typeof fields.methodCount === 'number' ? { methodCount: fields.methodCount } : {},
  }
}

/**
 * One `results` entry as the panel sees it.
 *
 * A union of every field any `type` has been measured to carry, rather than a
 * discriminated union: the set of types belongs to Arthas, and a reply this file
 * has never seen should render as an unfamiliar row rather than fail to parse.
 */
function eventView(result: ArthasResult): ArthasEventView {
  const value = typeof result.value === 'string' ? result.value : undefined
  return {
    type: result.type,
    ...typeof result.ts === 'string' ? { ts: result.ts } : {},
    ...typeof result.className === 'string' ? { className: result.className } : {},
    ...typeof result.methodName === 'string' ? { methodName: result.methodName } : {},
    ...typeof result.accessPoint === 'string' ? { accessPoint: result.accessPoint } : {},
    ...typeof result.cost === 'number' ? { cost: result.cost } : {},
    ...value === undefined ? {} : { value },
    ...typeof result.success === 'boolean' ? { success: result.success } : {},
    ...countsOf(result),
    ...typeof result.statusCode === 'number' ? { statusCode: result.statusCode } : {},
    ...typeof result.message === 'string' ? { message: plainMessage(result.message) } : {},
  }
}

/** One target as the panel sees it. */
function targetView(target: ArthasTarget): ArthasTargetView {
  return {
    pid: target.pid,
    mainClass: target.mainClass,
    kind: target.kind,
    ...target.home === undefined ? {} : { home: target.home },
    attached: target.attached,
  }
}

/** One registered Arthas as the panel sees it. */
function envView(entry: StoredArthas, version: string | undefined): ArthasEnvView {
  return {
    id: entry.id,
    path: entry.path,
    // The stored version wins; the one on disk is a fallback for an entry that was
    // registered before Arthas had ever run here.
    version: entry.version === '' ? version ?? '' : entry.version,
    jdk: entry.jdk,
    isDefault: entry.isDefault,
    managed: entry.managed,
  }
}

/**
 * Build the service.
 * @param deps - the store, the JDK candidates, and the subprocess service.
 * @returns the service and its disposer.
 */
export function createYonArthasService(deps: ArthasServiceDeps): YonArthasHandle {
  const sessions = new Map<string, ArthasWatchHandle>()
  const auditRows: ArthasAuditView[] = []
  let nextId = 1

  /** A JDK `bin` directory that exists, if any is known. */
  const firstJdkBin = async (): Promise<string | undefined> => {
    for (const candidate of await deps.jdkBins()) {
      const found = await stat(join(candidate, process.platform === 'win32' ? 'java.exe' : 'java'))
        .then(one => one.isFile(), () => false)
      if (found) return candidate
    }
    return undefined
  }

  /** The registered Arthas to launch with, preferring the default. */
  const chosenArthas = async (): Promise<StoredArthas | undefined> => {
    const read = await deps.store.read()
    return read.arthas.find(one => one.isDefault) ?? read.arthas[0]
  }

  /** The boot jar of the chosen Arthas, verified to be there. */
  const needBootJar = async (): Promise<string> => {
    const chosen = await chosenArthas()
    if (chosen === undefined) {
      throw new ArthasError(
        'unavailable',
        '还没有可用的 Arthas。先跑 arthas_env_download 下载一个（或 arthas_env_add 登记本机已有的），'
        + '然后再 attach。',
      )
    }
    const isJar = chosen.path.toLowerCase().endsWith('.jar')
    const jar = isJar ? chosen.path : join(chosen.path, ARTHAS_BOOT_JAR)
    const exists = await stat(jar).then(one => one.isFile(), () => false)
    if (!exists) throw new ArthasError('not-found', `登记里说 Arthas 在 ${jar}，但这个文件不在了。`)
    return jar
  }

  /** The JDK that launched this process, when it can be worked out. */
  const jdkBinForTarget = async (subprocess: RunSubprocess, pid: number): Promise<string | undefined> => {
    const jps = await resolveJps(subprocess, await firstJdkBin())
    const processes = await listJavaProcesses(subprocess, jps)
    const target = processes.find(one => one.pid === pid)
    if (target?.home === undefined) return undefined
    const candidate = join(target.home, 'ufjdk', 'bin')
    const found = await stat(join(candidate, process.platform === 'win32' ? 'java.exe' : 'java'))
      .then(one => one.isFile(), () => false)
    return found ? candidate : undefined
  }

  const targetsNow = async (port: number): Promise<ArthasTargetsPayload> => {
    const subprocess = deps.subprocess()
    if (subprocess === undefined) {
      return {
        port,
        jps: '',
        targets: [],
        error: '这个部署没有 subprocess 服务，无法运行 jps，所以列不出可 attach 的进程。',
      }
    }
    try {
      const jps = await resolveJps(subprocess, await firstJdkBin())
      const processes = await listJavaProcesses(subprocess, jps)
      // Asked once, not once per process — the port is global and only one process
      // can hold it. See `agentPid`.
      const holder = await agentPid(port)
      return {
        port,
        jps,
        targets: toTargets(processes, holder).map(targetView),
        ...holder === undefined ? {} : { agentPid: holder },
      }
    } catch (error) {
      return {
        port,
        jps: '',
        targets: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const startWatch = (input: StartWatchInput): ArthasWatchHandle => {
    const handle: ArthasWatchHandle = {
      id: String(nextId),
      pid: input.pid,
      port: input.port,
      command: input.command,
      ...input.className === undefined ? {} : { className: input.className },
      startedAt: Date.now(),
      expected: input.expected,
      controller: new AbortController(),
      state: 'watching',
      results: [],
      delivered: 0,
      // Replaced on the next line; declared first so the object exists before the
      // request that writes into it is started.
      settled: Promise.resolve(),
    }
    nextId += 1
    handle.settled = execArthas({
      port: handle.port,
      command: handle.command,
      // No timeout: an observation must be allowed to wait for something that has
      // not happened yet, and the request ending *is* the notification.
      signal: handle.controller.signal,
    }).then(response => {
      handle.state = 'settled'
      handle.response = response
      handle.results = response.results
    }).catch((error: unknown) => {
      if (handle.controller.signal.aborted) {
        handle.state = 'stopped'
        handle.message = '会话已被停止。'
        return
      }
      handle.state = 'failed'
      handle.message = error instanceof Error ? error.message : String(error)
    })
    sessions.set(handle.id, handle)
    return handle
  }

  const stop = async (id: string, signal?: AbortSignal): Promise<ArthasSessionDetail> => {
    const handle = sessions.get(id)
    if (handle === undefined) throw new ArthasError('not-found', `没有这个观测会话：${id}。`)
    const className = handle.className
    if (className === undefined) {
      throw new ArthasError(
        'invalid-input',
        `会话 #${id} 没记下要 reset 的类名（可能是手工用 arthas_exec 挂的），无法清理。`,
      )
    }

    // Abandoned first: while the request is open the server is still enhancing, and
    // a `reset` racing a registration is how the count fails to reach zero.
    if (handle.state === 'watching') handle.controller.abort()

    const rounds: Array<{ round: number; classCount: number | undefined }> = []
    let cleaned = false
    for (let round = 1; round <= MAX_RESET_ROUNDS; round += 1) {
      const response = await execArthas({
        port: handle.port,
        command: `reset ${className}`,
        timeoutMs: RESET_TIMEOUT_MS,
        ...signal === undefined ? {} : { signal },
      })
      const count = classCountOf(response)
      rounds.push({ round, classCount: count })
      if (count === 0) { cleaned = true; break }
      // A count that cannot be read is not treated as zero: assuming success would
      // leave the enhancement installed and report it as cleaned.
      if (count === undefined) break
    }
    // Both outcomes are recorded, not just the bad one. "Did the cleanup work" is
    // the first thing anyone asks about a session they just stopped, and a silent
    // success is indistinguishable from a stop that never reached the agent.
    if (cleaned) {
      handle.message = `已停止并清理（reset 到 classCount=0，共 ${rounds.length} 轮）。`
    } else if (handle.message === undefined) {
      handle.message = `已停止，但 reset ${className} 未能在 ${MAX_RESET_ROUNDS} 轮内归零 —— 增强可能还在。`
    }
    return { session: sessionView(handle), events: handle.results.map(eventView) }
  }

  return {
    service: {
      storePath: deps.store.path,

      startWatch,
      watch(id) { return sessions.get(id) },
      audit(input) {
        auditRows.unshift({
          at: Date.now(),
          kind: input.kind,
          pid: input.pid,
          port: input.port,
          command: input.command,
          risky: input.risky === true,
          ...input.outcome === undefined ? {} : { outcome: input.outcome },
        })
        if (auditRows.length > AUDIT_LIMIT) auditRows.length = AUDIT_LIMIT
      },

      async panel(): Promise<ArthasPanelPayload> {
        const read = await deps.store.read()
        const diskVersion = await versionOfLibDir()
        return {
          storePath: read.path,
          env: read.arthas.map(entry => envView(entry, diskVersion)),
          agents: await targetsNow(ARTHAS_HTTP_PORT),
          sessions: [...sessions.values()].map(sessionView),
          audit: auditRows.slice(0, AUDIT_PAGE),
          // P1: there is no unlock yet, and the design notes are firm that the model
          // must not be able to grant itself one. The field exists so the panel can
          // say "disabled" truthfully instead of looking like it forgot to ask.
          unlocked: false,
        }
      },

      detail(id) {
        const handle = sessions.get(id)
        if (handle === undefined) return undefined
        return { session: sessionView(handle), events: handle.results.map(eventView) }
      },

      targets(port = ARTHAS_HTTP_PORT) { return targetsNow(port) },

      async attach(pid, port = ARTHAS_HTTP_PORT, signal): Promise<ArthasTargetsPayload> {
        const subprocess = deps.subprocess()
        if (subprocess === undefined) {
          throw new ArthasError('unavailable', '这个部署没有 subprocess 服务，无法启动 java。')
        }
        const jar = await needBootJar()
        // The target's own JDK first: a JDK 8 attach needs the *target* JDK's
        // lib/tools.jar, and on a machine with several registered Homes "the first
        // one we know about" is frequently another project's.
        const jdkBin = await jdkBinForTarget(subprocess, pid) ?? await firstJdkBin()
        const java = jdkBin === undefined
          ? await subprocess.resolveExecutable('java').catch(() => {
            throw new ArthasError(
              'unavailable',
              '找不到 java。请先登记一个 NCC Home（它的 ufjdk/bin 会被自动使用）。',
            )
          })
          : join(jdkBin, process.platform === 'win32' ? 'java.exe' : 'java')

        // The port is not decoration. An agent's HTTP and telnet ports are
        // machine-wide, so two JVMs cannot share them, and measured, a second attach
        // with the defaults is refused by arthas-boot itself: "The telnet port 3658 is
        // used by process 45076 instead of target process 39492, you will connect to
        // an unexpected process". So a non-default port is passed through, and the
        // telnet port is moved along with it (to http+1) rather than switched off —
        // measured, `--telnet-port -1` does NOT disable it: arthas-boot then tries to
        // detect the process over that port and dies with "The telnet port -1 is used,
        // but process detection error". The default path is left exactly as P0
        // measured it.
        const portArgs = port === ARTHAS_HTTP_PORT
          ? []
          : ['--http-port', String(port), '--telnet-port', String(port + 1)]

        // `-c` with a harmless command, so the launcher attaches, does its work and
        // exits. Without it the process would sit in the interactive console, which
        // is a child process this plugin would then have to own for no reason.
        const handle = subprocess.spawn({
          argv: [java, '-jar', jar, '-c', 'version', ...portArgs, String(pid)],
          cwd: dirname(jar),
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: 2 * 1024 * 1024 },
            stderr: { maxBytes: 2 * 1024 * 1024 },
          },
          graceMs: 3_000,
          ...signal === undefined ? {} : { signal },
        })
        const timer = setTimeout(() => { handle.terminate() }, 90_000)
        try {
          await handle.done
        } finally {
          clearTimeout(timer)
        }

        // The launcher's exit code is not the answer: it returns as soon as the
        // command it was given finished, and "already attached" is a success with no
        // work done. What says an agent is there is the port.
        const { isAgentListening } = await import('./arthas-http.ts')
        let up = false
        for (let attempt = 0; attempt < ATTACH_WAIT_ROUNDS && !up; attempt += 1) {
          up = await isAgentListening(port, 1_000)
          if (!up) await new Promise(resolve => setTimeout(resolve, 500))
        }
        if (!up) {
          throw new ArthasError(
            'not-attached',
            `PID ${pid} 的 agent 端口（${port}）没有起来。常见原因：目标不是这个 JDK 起的，`
            + '或端口被别的进程占用。',
          )
        }
        return await targetsNow(port)
      },

      stop,
    },
    dispose() {
      for (const handle of sessions.values()) {
        if (handle.state === 'watching') handle.controller.abort()
      }
      sessions.clear()
    },
  }
}
