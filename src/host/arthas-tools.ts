/**
 * The Arthas tools: attach to a running NCC, look at what a class is doing, and
 * put a live object on disk.
 *
 * ## What this layer is for
 *
 * The measurements behind it are in `docs/yon-arthas-design.md`, and the shape of
 * every response read here was taken from a live agent rather than inferred. Two
 * of those measurements decided how these tools are shaped, and both are things a
 * reasonable person would get wrong:
 *
 * 1. **`state: "SUCCEEDED"` does not mean the command worked.** A failed `watch`,
 *    an `ognl` that cannot resolve its class, and a `sc -d` for a class that does
 *    not exist all answer `SUCCEEDED`. Success lives in `status.statusCode`.
 * 2. **`exec` is atomic.** A `watch -n 5` does not stream: the HTTP request stays
 *    open until all five hits have happened and then returns everything at once.
 *    So `arthas_events` is not a poll of an event queue — it is "wait for the
 *    command to finish, then take what it produced". The tool descriptions say so
 *    in as many words, because the alternative is a model that keeps asking for
 *    increments that cannot exist.
 *
 * ## Why there is an attach tool when the design notes list none
 *
 * The notes list `arthas_detach` but no counterpart, which is an oversight: every
 * other tool here needs an agent already running in the target JVM, and without a
 * way to start one the acceptance criterion — "the model can go from listing
 * processes to having bytes on disk unaided" — is not reachable.
 *
 * ## Why the dangerous commands are refused rather than gated
 *
 * `redefine`, `stop` and `shutdown` are turned away with a message naming why, and
 * there is no argument that unlocks them here. The unlock belongs in the panel
 * (P1), where a person does it deliberately and where the event stream can show
 * what happened afterwards. A tool argument would let the model unlock itself,
 * which is the one thing the measure exists to prevent.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { ArthasError } from './arthas-errors.ts'
import {
  ARTHAS_HTTP_PORT, commandSucceeded, enhancerOf, execArthas, failureText,
  plainMessage, statusOf, traceHits, valueOf, type ArthasResponse, type ArthasResult,
} from './arthas-http.ts'
import { appendBaseline, baselinePath, summarise } from './arthas-baseline.ts'
import {
  agentPid, createClassLoaderCache, readClassLocation, scCommand,
  type ClassLoaderCache, type ClassLocation,
} from './arthas-targets.ts'
import {
  ARTHAS_BOOT_JAR, downloadBootJar, isBootJarShaped, probeArthasPath, versionOfLibDir,
} from './arthas-fetch.ts'
import { defaultArthasWorkDir, type ArthasStore, type StoredArthas } from './arthas-store.ts'
import type { YonArthasService } from './arthas-service.ts'
import type { ArthasTargetView } from '../shared/types.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns. */
export const ARTHAS_TOOL_NAMES = [
  'arthas_env_list',
  'arthas_env_add',
  'arthas_env_download',
  'arthas_targets',
  'arthas_attach',
  'arthas_exec',
  'arthas_sc',
  'arthas_watch_start',
  'arthas_events',
  'arthas_watch_stop',
  'arthas_capture',
  'arthas_catch',
  'arthas_trace',
] as const

/**
 * Commands refused outright.
 *
 * `redefine` rewrites a class in a running JVM, where a mistake can only be
 * undone by a restart; `stop` and `shutdown` kill the agent or the server. All
 * three are one keystroke away from a working environment becoming an outage, and
 * none of them is on the path to observing anything.
 */
const REFUSED_COMMANDS = ['redefine', 'stop', 'shutdown'] as const

/** How long a short command may take inside a tool call. */
const SHORT_TIMEOUT_MS = 20_000

/** The default `-n` for a watch: fire once and stop. */
const DEFAULT_WATCH_COUNT = 1

/**
 * The default `-n` for a trace.
 *
 * Five rather than one because a trace is a measurement: a single call tells you what one
 * call cost, which may be the first call of the day with a cold class and a cold cache.
 * Measured on NCC 1909, the same method answered 222.9 ms on its first call and 47.8 ms on
 * its second — five samples is the smallest number that makes that visible instead of
 * being the only number you have.
 */
const DEFAULT_TRACE_COUNT = 5

/**
 * How long `arthas_trace` waits for the calls to happen before giving the caller back.
 *
 * A trace ends when it has seen `-n` calls, so a method nobody calls would otherwise hold
 * the tool call open indefinitely. On timeout nothing is lost: the trace is still running
 * and its session can be read again, which is what makes a longer observation possible
 * without a tool call that lives for an hour.
 */
const DEFAULT_TRACE_WAIT_MS = 60_000

/** The longest `arthas_events` will hold a tool call open. */
const MAX_EVENT_WAIT_MS = 300_000

/** The default `arthas_events` wait, when the caller does not say. */
const DEFAULT_EVENT_WAIT_MS = 30_000

/**
 * The OGNL a capture watch runs, built out of nothing but JDK classes.
 *
 * ## Why there is no helper class
 *
 * The design notes describe capture as "inject a small helper class, then call it
 * from the watch expression". **Measured on a live NCC 1909, that does not work**,
 * for a classloader reason that is easy to miss:
 *
 * > A `watch` expression is evaluated by OGNL through the **system** classloader.
 * > The business classloader holding the project's `bin/` is its *child*, and a
 * > parent cannot see a child's classes.
 *
 * Three experiments pinned it down. `{@java.lang.String@valueOf(returnObj)}`
 * succeeded (a JDK class), `returnObj` itself was readable, and every expression
 * naming an injected `aidebug.DebugDump*` failed with
 * `watch failed ... java.lang.NullPointerException` — the static reference
 * resolves to null and calling a method on it NPEs. `-c <hash>` does **not** help:
 * that option picks which loader to *enhance*, not which one evaluates the
 * expression (verified with `-c` both before and after the expression).
 *
 * Injecting somewhere the system loader *can* see was the other candidate, and it
 * is possible — `classloader -c <app> -u` shows NCC adds many
 * `modules/<mod>/META-INF/classes/` directories to the app loader by reflection
 * after startup, which is why `java.class.path` (the single entry
 * `…/eclipse/uaplauncher.jar`) is misleading. It was rejected anyway: it means
 * writing into the operator's installation, and a JVM never reloads a class, so
 * each injected name is consumed by its first use.
 *
 * ## What replaced it
 *
 * Serialisation needs nothing but `java.io`, so a capture is one OGNL sequence —
 * parentheses, commas, `#` variables — which Arthas evaluates as a **single**
 * element of the watch expression list. Measured working, writing a real 26-byte
 * `.ser`:
 *
 * ```text
 * {(#d=new java.io.File("<dir>"),#d.mkdirs(),#f=new java.io.FileOutputStream("<file>"),
 *   #o=new java.io.ObjectOutputStream(#f),#o.writeObject(returnObj),#o.flush(),
 *   #o.close(),"DUMP_OK <file>")}
 * → @ArrayList[ @String[DUMP_OK-PURE-JDK] ]
 * ```
 *
 * Strictly better than injecting a class: nothing is written into the operator's
 * installation, no class name is consumed, and the expression says what it does.
 *
 * Two limits, both real. A value that is not `Serializable` fails inside
 * `writeObject` and leaves a truncated file behind; Arthas reports the
 * `NotSerializableException` in the watch's status message, which is where the
 * caller reads it. And the file name is decided on this side rather than inside
 * the JVM, so two captures in the same millisecond with the same tag would collide
 * — the id in the name is the plugin's clock, not the server's.
 *
 * @param value - the OGNL for the object to capture, e.g. `returnObj` or `params[0]`.
 * @param file - the absolute forward-slash path to write; quoted verbatim.
 * @param dir - the directory to create first, also forward-slash.
 * @returns one OGNL expression, braces included, with no spaces in it.
 */
function serialiseExpression(value: string, file: string, dir: string): string {
  // No spaces anywhere: nothing here is shell-quoted, so they would be harmless,
  // but a command that reads the same however it is quoted is one less thing to
  // get wrong when it is copied out of a transcript and re-run by hand.
  return [
    '{(',
    `#d=new java.io.File("${dir}"),`,
    '#d.mkdirs(),',
    `#f=new java.io.FileOutputStream("${file}"),`,
    '#o=new java.io.ObjectOutputStream(#f),',
    `#o.writeObject(${value}),`,
    '#o.flush(),',
    '#o.close(),',
    `"DUMP_OK ${file}"`,
    ')}',
  ].join('')
}

/**
 * The OGNL that keeps an exception scene: the throwable, and optionally the arguments that caused it.
 *
 * ## Why the file names are decided here, and not inside the JVM
 *
 * An earlier version let the JVM's clock name every file, on the reasoning that several failures
 * must not overwrite one another. It cost the caller the paths: measured, OGNL evaluates `{(a, b)}`
 * as an array of ONE element — the value of the sequence, which is its last term — so a leading
 * `"DUMP_OK "+#b` term is evaluated and then dropped, never reaching the event stream. The name is
 * therefore only inside the JVM when a run is long enough to need it:
 *
 *  - `count: 1` (the default) fixes the WHOLE name here, so the tool can state both paths before
 *    the watch ever fires.
 *  - a longer run fixes a unique PREFIX here and lets the JVM's clock finish it, so nothing
 *    overwrites anything; the paths are found by listing that prefix, which the tool also reports.
 *
 * Either way the expression returns the throwable, because that is what a person reads in the event
 * stream to find out what went wrong — a `DUMP_OK` line would say only that some file appeared.
 *
 * ## Why the throwable is written first
 *
 * OGNL has no try/catch, so a statement that throws ends the whole expression. The arguments are the
 * part that can realistically fail to serialise (the throwable itself almost never does), so writing
 * them second means a failure still leaves the exception on disk instead of nothing at all.
 *
 * @param input.dir - the directory to create first, forward-slash.
 * @param input.prefix - the sanitised, plugin-stamped head of each file name.
 * @param input.withArgs - whether to also write `params`, the shape `replay_run` replays.
 * @param input.uniqueNames - whether the JVM must add its clock to keep several hits apart.
 * @returns one OGNL expression, braces included, with no spaces in it.
 */
export function catchExpression(input: {
  readonly dir: string
  readonly prefix: string
  readonly withArgs: boolean
  readonly uniqueNames: boolean
}): string {
  const base = input.uniqueNames
    ? `"${input.dir}/${input.prefix}_"+@System@currentTimeMillis()`
    : `"${input.dir}/${input.prefix}"`
  const parts = [
    '{(',
    `#d=new java.io.File("${input.dir}"),`,
    '#d.mkdirs(),',
    `#b=${base},`,
    '#f=new java.io.FileOutputStream(#b+".thrown.ser"),',
    '#o=new java.io.ObjectOutputStream(#f),',
    '#o.writeObject(throwExp),',
    '#o.flush(),',
    '#o.close(),',
  ]
  if (input.withArgs) {
    parts.push(
      '#g=new java.io.FileOutputStream(#b+".args.ser"),',
      '#p=new java.io.ObjectOutputStream(#g),',
      '#p.writeObject(params),',
      '#p.flush(),',
      '#p.close(),',
    )
  }
  parts.push('throwExp', ')}')
  return parts.join('')
}

/**
 * Wait for a promise, giving up at a deadline or on cancellation.
 *
 * @returns true when the promise settled by itself, false when the deadline or the caller's
 * abort won the race. A rejection counts as settled: either way the command is over, and
 * what it did is read from the session rather than from the promise.
 */
async function waitFor(
  promise: Promise<unknown>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })
  let onAbort: (() => void) | undefined
  const cancelled = new Promise<boolean>(resolve => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    onAbort = () => resolve(false)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([promise.then(() => true, () => true), expired, cancelled])
  } finally {
    // Both are left behind whatever the outcome: a live timer would keep the process
    // awake, and a live listener would accumulate one per trace.
    if (timer !== undefined) clearTimeout(timer)
    if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
  }
}

/** Microseconds as milliseconds, for display. Arthas reports every cost in microseconds. */
function msOf(microseconds: number): string {
  return `${(microseconds / 1000).toFixed(3)} ms`
}

/** The pending-state card a UI renders for one call. */
function card(title: string, kind: 'read' | 'other' = 'other'): YonToolCallView {
  return { card: 'generic', title, kind }
}

/** One tool definition over the registry's contract. */
function defineTool<V>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  render(value: V): string
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<V>
  presentCall(args: Record<string, unknown>): YonToolCallView
}): YonToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => [{ type: 'text', text: spec.render(value as V) }] as YonTextBlock[],
    },
    async execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown> {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new ArthasError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new ArthasError('cancelled', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ArthasError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/** Read a positive integer argument. */
function asPositiveInt(value: unknown, argument: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ArthasError('invalid-input', `${argument} 必须是正整数，收到的是 ${JSON.stringify(value)}`)
  }
  return value
}

/** The agent's HTTP port from an argument, or the default. */
function portOf(value: unknown): number {
  if (value === undefined) return ARTHAS_HTTP_PORT
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new ArthasError('invalid-input', `port 必须是 1-65535 的整数，收到的是 ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Refuse a command that must not be run from here.
 *
 * The first word is what is compared, because that is what Arthas dispatches on:
 * `stop` and `stop ` are the same command, and `redefine -c abc Foo` is a
 * `redefine`. Anything before a leading `#` is ignored, since Arthas treats that
 * as a comment marker on some builds.
 */
function assertCommandAllowed(command: string): void {
  const first = command.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? ''
  if ((REFUSED_COMMANDS as readonly string[]).includes(first)) {
    throw new ArthasError(
      'invalid-input',
      `「${first}」被默认禁用：它要么热替换运行中的类（改错了只能重启），要么直接卸载 agent 或服务。`
      + '这两个动作要由人在 Yon 面板里解锁后再做，模型不能自己放开。'
      + '如果想停止观测，用 arthas_watch_stop —— 它发的是 reset，不是 stop。',
    )
  }
}

/** Render one `watch` result as the lines a person reads. */
function watchLines(result: ArthasResult): string[] {
  const where = typeof result.className === 'string' ? result.className : '?'
  const method = typeof result.methodName === 'string' ? result.methodName : '?'
  const at = typeof result.accessPoint === 'string' ? result.accessPoint : ''
  const cost = typeof result.cost === 'number' ? `${result.cost} ms` : ''
  const ts = typeof result.ts === 'string' ? result.ts : ''
  const head = [ts, `${where}#${method}`, at, cost].filter(part => part !== '').join(' · ')
  const value = valueOf(result)
  return value === undefined ? [head] : [head, ...value.split('\n').map(line => `    ${line}`)]
}

/**
 * Register the Arthas tools.
 *
 * The observation sessions are **not** here: they live in `arthas-service.ts`,
 * because the panel is a second reader of them and lives in the other half of the
 * plugin. What stays is everything only a tool call needs — argument validation,
 * the classloader-hash cache, the PID check, and the rendering.
 *
 * @param ctx - host context carrying the tool registry.
 * @param arthas - the sessions, the audit ledger, and the process scan.
 * @param store - where the operator's Arthas registrations live.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonArthasTools(ctx: Context, arthas: YonArthasService, store: ArthasStore): () => void {
  const disposers: Array<() => void> = []
  const cache: ClassLoaderCache = createClassLoaderCache()

  /**
   * Which PID the agent on each port turned out to be inside.
   *
   * Cached because it cannot change without the agent being unloaded and attached
   * somewhere else — not something a command does behind this module's back — and
   * because asking costs a round trip that every tool call would otherwise pay.
   * `arthas_targets` refreshes it; a failed check clears it.
   */
  const holderCache = new Map<number, number>()

  /**
   * Make sure the agent a command will reach is the one the caller named.
   *
   * **This is the real fix for the mislabelled-target bug.** An agent runs inside
   * one JVM and serves a global port, so a command carries no PID at all: the
   * `pid` argument is only ever a label this plugin checks. Without the check,
   * `arthas_exec(pid=36496)` would run happily against the NCC's agent and return
   * its answer as though Eclipse had produced it, with nothing in the output to
   * say otherwise.
   *
   * @param pid - the process the caller says it is talking to.
   * @param port - the agent port the command would go to.
   * @param signal - cancellation from the tool call.
   * @throws ArthasError when nothing is attached, or the agent is somewhere else.
   */
  const assertAgentFor = async (pid: number, port: number, signal: AbortSignal): Promise<void> => {
    if (holderCache.get(port) === pid) return
    const actual = await agentPid(port, signal)
    if (actual === undefined) {
      holderCache.delete(port)
      throw new ArthasError(
        'not-attached',
        `端口 ${port} 上没有可用的 Arthas agent。先用 arthas_targets 看哪个进程挂着 agent，`
        + '或对目标 PID 跑 arthas_attach。',
      )
    }
    holderCache.set(port, actual)
    if (actual !== pid) {
      throw new ArthasError(
        'invalid-input',
        `端口 ${port} 上的 agent 在 PID ${actual} 里，不是你要的 ${pid} —— 命令没有发出去。`
        + 'Arthas agent 挂在某个 JVM 内部，端口是全局的，所以「指定 PID」实际只有一个 PID 是真的。'
        + `要操作 ${pid}，先对它 arthas_attach；要操作 ${actual}，就把 pid 改成 ${actual}。`,
      )
    }
  }

  /**
   * The classloader hash for one class in one process, from the cache or a probe.
   *
   * This is the whole reason `arthas_sc` exists as a tool of its own rather than
   * being left to `arthas_exec`: `ognl` resolves against the system loader and
   * cannot see business classes, so nearly every interesting command needs `-c`,
   * and the hash is a thing to look up rather than to know.
   */
  const locateClass = async (
    pid: number,
    port: number,
    className: string,
    signal: AbortSignal,
    refresh = false,
  ): Promise<ClassLocation> => {
    if (!refresh) {
      const hit = cache.get(pid, className)
      if (hit !== undefined) return hit
    }
    const response = await execArthas({
      port,
      command: scCommand(className, true),
      timeoutMs: SHORT_TIMEOUT_MS,
      signal,
    })
    const failure = failureText(response)
    if (failure !== undefined) throw new ArthasError('command-failed', `sc -d ${className} 失败：${failure}`)
    const location = readClassLocation(response.results, className)
    cache.put(pid, location)
    return location
  }

  // ── registrations ───────────────────────────────────────────────────────────

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_env_list',
    description: 'List the Arthas distributions this plugin can use: the one it downloaded itself and any '
      + 'the operator registered. Shows the id, the path, the JDK to launch it with, the version found on '
      + 'disk (Arthas unpacks itself into ~/.arthas/lib/<version>/ on first attach, so this is empty until '
      + 'it has run here once), and which entry is the default. Call this first when anything Arthas-related '
      + 'is needed — if the list is empty, arthas_env_download comes before anything else.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      required: ['configPath', 'count', 'entries'],
      properties: {
        configPath: { type: 'string' },
        count: { type: 'number' },
        error: { type: 'string' },
        entries: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute() {
      const read = await store.read()
      const version = await versionOfLibDir()
      return {
        configPath: read.path,
        count: read.arthas.length,
        entries: read.arthas as unknown as readonly StoredArthas[],
        ...read.error === undefined ? {} : { error: read.error },
        ...version === undefined ? {} : { diskVersion: version },
      }
    },
    render(value) {
      const result = value as {
        configPath: string
        count: number
        entries: readonly StoredArthas[]
        error?: string
        diskVersion?: string
      }
      const lines: string[] = []
      if (result.error !== undefined) lines.push(`⚠ ${result.error}`, '')
      if (result.count === 0) {
        lines.push(
          '还没有可用的 Arthas。',
          '',
          '用 arthas_env_download 让插件自己下载一个（约 148 KB，来自 arthas.aliyun.com），',
          '或用 arthas_env_add 登记本机已有的 arthas-boot.jar。',
        )
        return lines.join('\n')
      }
      lines.push(`${result.count} 个可用的 Arthas（登记文件：${result.configPath}）：`, '')
      for (const entry of result.entries) {
        const marks = [entry.isDefault ? '默认' : '', entry.managed ? '插件下载' : '手工登记']
          .filter(part => part !== '').join(' · ')
        lines.push(`  ${entry.id}  ${entry.path}`)
        lines.push(`      ${marks}${entry.jdk === '' ? ' · JDK 用目标 Home 的 ufjdk' : ` · JDK ${entry.jdk}`}`)
      }
      if (result.diskVersion !== undefined) {
        lines.push('', `磁盘上已解出的 Arthas 版本（~/.arthas/lib）：${result.diskVersion}`)
      } else {
        lines.push('', '版本还没探到：Arthas 首次 attach 时才会把自己解压到 ~/.arthas/lib/<版本>/。')
      }
      return lines.join('\n')
    },
    presentCall: () => card('列出可用的 Arthas', 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_env_add',
    description: 'Register an Arthas distribution that already exists on this machine, by path. The path may '
      + 'be the arthas-boot.jar itself, the directory holding it, or a directory holding an arthas-bin/ '
      + 'subdirectory (which is how a downloaded distribution unpacks). Sets it as the default when it is '
      + 'the only one. Use this instead of arthas_env_download when the machine has no route to '
      + 'arthas.aliyun.com, or when the operator keeps a specific version.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'A path to arthas-boot.jar, or to a directory containing it.',
        },
        id: {
          type: 'string',
          description: 'Optional short id; derived from the path when omitted.',
        },
        jdk: {
          type: 'string',
          description: 'Optional JDK bin directory to launch it with. Leave empty to use the target Home\'s '
            + 'own ufjdk, which is almost always right.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['id', 'path', 'count'],
      properties: {
        id: { type: 'string' },
        path: { type: 'string' },
        count: { type: 'number' },
        version: { type: 'string' },
      },
    },
    async execute(args) {
      const path = asString(args.path, 'path')
      const probe = await probeArthasPath(path)
      if (!probe.exists) throw new ArthasError('not-found', `这个路径不存在：${path}`)
      if (probe.bootJar === undefined) {
        throw new ArthasError(
          'invalid-input',
          `${path} 里没找到 ${ARTHAS_BOOT_JAR}。如果是压缩包，请先解压；`
          + '如果路径就是 jar，请直接指向它。',
        )
      }
      if (!await isBootJarShaped(probe.bootJar)) {
        throw new ArthasError(
          'invalid-input',
          `${probe.bootJar} 不是 zip/jar 格式（开头不是 PK 魔数）。`
          + `常见原因：那其实是一个 HTML 错误页，或被改过后缀名。`,
        )
      }
      const read = await store.read()
      const derived = typeof args.id === 'string' && args.id.trim() !== ''
        ? args.id.trim()
        : `arthas-${read.arthas.length + 1}`
      const jdk = typeof args.jdk === 'string' && args.jdk.trim() !== '' ? args.jdk.trim().replace(/\\/g, '/') : ''
      const entry: StoredArthas = {
        id: derived,
        path: probe.bootJar.replace(/\\/g, '/'),
        version: probe.version ?? await versionOfLibDir() ?? '',
        jdk,
        // First one wins the default: a second registration is a second option,
        // not a reason to move the one already in use.
        isDefault: read.arthas.length === 0,
        managed: false,
      }
      const kept = read.arthas.filter(one => one.id !== derived)
      await store.write([...kept, entry])
      return { id: entry.id, path: entry.path, count: kept.length + 1, version: entry.version }
    },
    render(value) {
      const added = value as { id: string; path: string; count: number; version: string }
      return [
        `已登记 Arthas：${added.id}`,
        `  ${added.path}`,
        added.version === '' ? '  版本还没探到（首次 attach 后可从 ~/.arthas/lib 读到）' : `  版本 ${added.version}`,
        '',
        `现在共有 ${added.count} 个。下一步用 arthas_targets 找进程。`,
      ].join('\n')
    },
    presentCall: args => card(`登记 Arthas：${String(args.path ?? '')}`, 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_env_download',
    description: 'Download arthas-boot.jar from arthas.aliyun.com into this plugin\'s own data directory and '
      + 'register it. Roughly 148 KB. The bytes are verified before they are kept: a jar is a zip, so the '
      + 'response has to start with the PK magic and be more than 50 KB, which is what catches a proxy or '
      + 'captive portal answering with an HTML page. Call this once per machine, before the first attach.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      required: ['id', 'path', 'bytes', 'count'],
      properties: {
        id: { type: 'string' },
        path: { type: 'string' },
        bytes: { type: 'number' },
        count: { type: 'number' },
      },
    },
    async execute(_args, signal) {
      const downloaded = await downloadBootJar(signal)
      const read = await store.read()
      const id = 'arthas-downloaded'
      const entry: StoredArthas = {
        id,
        path: downloaded.path.replace(/\\/g, '/'),
        version: await versionOfLibDir() ?? '',
        jdk: '',
        isDefault: true,
        managed: true,
      }
      // The download is the plugin's own artefact and there is only ever one of
      // them, so it replaces its own previous entry and is made the default —
      // registering it is not a reason to leave a stale path behind.
      const kept = read.arthas.filter(one => one.id !== id).map(one => ({ ...one, isDefault: false }))
      await store.write([...kept, entry])
      return { id, path: entry.path, bytes: downloaded.bytes, count: kept.length + 1 }
    },
    render(value) {
      const result = value as { id: string; path: string; bytes: number; count: number }
      return [
        `下载完成：${result.bytes} 字节`,
        `  ${result.path}`,
        `  已登记为 ${result.id}（默认），当前共有 ${result.count} 个。`,
        '',
        '下一步用 arthas_targets 列出可 attach 的进程。',
      ].join('\n')
    },
    presentCall: () => card('下载 Arthas'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_targets',
    description: 'List the JVMs on this machine that Arthas can attach to, with each one\'s PID, main class, '
      + 'and whether an Arthas agent is already attached (HTTP port 8563 answering). NCC processes are '
      + 'marked by the -Dnc.server.location= argument, which is the only reliable marker — measured, the '
      + 'main class is com.yonyou.studio.udt.launching.Launcher, not a Tomcat or NC bootstrap. Use the PID '
      + 'it returns in every other arthas tool. Do not ask the operator for a PID.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        port: {
          type: 'number',
          description: `The agent HTTP port to probe; defaults to ${ARTHAS_HTTP_PORT}.`,
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['count', 'targets'],
      properties: {
        count: { type: 'number' },
        jps: { type: 'string' },
        port: { type: 'number' },
        agentPid: { type: 'number' },
        targets: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute(args) {
      const port = portOf(args.port)
      // The PID check is stateful and this call is what refreshes it — the panel's
      // own refresh goes through the same service method, so the two readers can
      // never disagree about who holds the agent.
      const payload = await arthas.targets(port)
      if (payload.agentPid === undefined) holderCache.delete(port)
      else holderCache.set(port, payload.agentPid)
      return {
        count: payload.targets.length,
        jps: payload.jps,
        port,
        ...payload.agentPid === undefined ? {} : { agentPid: payload.agentPid },
        ...payload.error === undefined ? {} : { error: payload.error },
        targets: payload.targets,
      }
    },
    render(value) {
      const result = value as {
        count: number
        jps: string
        port: number
        agentPid?: number
        error?: string
        targets: readonly ArthasTargetView[]
      }
      if (result.error !== undefined) return `列进程失败：${result.error}`
      if (result.count === 0) {
        return `jps（${result.jps}）没有列出任何 JVM。如果 NCC 明明在跑，多半是 jps 与目标 JVM 版本或用户不一致。`
      }
      const lines = [`${result.count} 个 JVM（jps: ${result.jps}）：`, '']
      for (const target of result.targets) {
        const kind = target.kind === 'ncc' ? 'NCC' : '其他'
        lines.push(`  PID ${target.pid}  [${kind}]  ${target.attached ? '✅ agent 在这里' : '— 未挂载'}`)
        lines.push(`      ${target.mainClass}`)
        if (target.home !== undefined) lines.push(`      HOME: ${target.home}`)
      }
      lines.push('')
      if (result.agentPid === undefined) {
        lines.push(
          `端口 ${result.port} 上没有任何 agent，所以上面每个进程都是未挂载。`,
          '用 arthas_attach 对目标 PID 挂一个，之后再执行命令。',
        )
      } else {
        lines.push(
          `agent 挂在 PID ${result.agentPid} 里（端口 ${result.port}）。`,
          '**agent 运行在某个 JVM 内部，端口是全局的**——同一时刻只有一个进程持有它。',
          `给别的 PID 传命令会被拒绝，不会悄悄打到 ${result.agentPid} 上。`,
        )
      }
      return lines.join('\n')
    },
    presentCall: () => card('列出可 attach 的 JVM', 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_attach',
    description: 'Attach an Arthas agent to a running JVM, then wait until its HTTP port answers. Attaching '
      + 'is safe to repeat: an agent already there makes the launcher print "already listen port 3658, skip '
      + 'attach" and exit. The launcher is started with the target Home\'s own ufjdk, which is the JDK that '
      + 'can certainly attach to it (JDK 8 attach needs that JDK\'s lib/tools.jar). After this, every other '
      + 'arthas tool can drive the process over HTTP — no process is kept alive by this plugin.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid'],
      properties: {
        pid: {
          type: 'number',
          description: 'The target PID, as arthas_targets returned it.',
        },
        port: {
          type: 'number',
          description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}. An agent's ports are `
            + 'machine-wide, so a SECOND JVM cannot use the defaults — measured, arthas-boot refuses with '
            + '"The telnet port 3658 is used by process N instead of target process M, you will connect to '
            + 'an unexpected process". Pass a free port (8565, say) to attach another process; the telnet '
            + 'port moves to http+1 along with it, because only HTTP is used here. Every later call for '
            + 'that process must pass the same port.',
        },
        jdk: {
          type: 'string',
          description: 'A JDK bin directory to launch the agent with. Omit to use a registered Home\'s '
            + 'ufjdk, which is right in every normal case.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['pid', 'attached', 'output'],
      properties: {
        pid: { type: 'number' },
        attached: { type: 'boolean' },
        launcher: { type: 'string' },
        output: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const port = portOf(args.port)
      // Everything this needs — the JDK that launched the target, the boot jar, the
      // wait for the port — lives in the service, because the panel's own attach
      // button has to do exactly the same thing.
      const payload = await arthas.attach(pid, port, signal)
      const attached = payload.agentPid === pid
      arthas.audit({
        kind: 'attach',
        pid,
        port,
        command: `java -jar arthas-boot.jar -c version ${pid}`,
        outcome: attached ? `agent 已挂载，端口 ${port}` : `端口起来了，但 agent 报的是 PID ${payload.agentPid ?? '未知'}`,
      })
      return {
        pid,
        port,
        attached,
        ...payload.agentPid === undefined ? {} : { agentPid: payload.agentPid },
      }
    },
    render(value) {
      const result = value as { pid: number; port: number; attached: boolean; agentPid?: number }
      const lines = [result.attached
        ? `PID ${result.pid} 已挂上 agent（端口 ${result.port}），可以执行命令了。`
        : `PID ${result.pid} 的 agent 端口起来了，但里面的 agent 报的是 PID ${result.agentPid ?? '未知'}。`]
      if (!result.attached) {
        lines.push(
          '',
          '常见原因：',
          '  · 目标进程不是这个 JDK 起的 —— 先登记它的 NCC Home，ufjdk/bin 会被自动使用；',
          '  · 端口被别的进程占用 —— 用 arthas_targets 看 agent 到底在谁那里。',
          '  · 8563 已经被另一个 JVM 的 agent 占着（agent 端口是机器级的）——换一个空闲端口重试，',
          '    例如 port=8565，之后给这个进程的每条命令都要带同一个 port。',
        )
      }
      return lines.join('\n')
    },
    presentCall: args => card(`挂载 Arthas 到 PID ${String(args.pid ?? '?')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_exec',
    description: 'Run any Arthas command against an attached agent and return its structured results. This '
      + 'is the escape hatch: the other arthas tools exist only because they add something (a classloader '
      + 'hash, session handling, a reset loop), and everything else goes through here. '
      + 'IMPORTANT: state "SUCCEEDED" does not mean the command worked — a failed command still reports '
      + 'SUCCEEDED. Read statusCode (0 = ok, -1 = failed) or the success flag on an enhancer result. '
      + 'redefine, stop and shutdown are refused here by design; they need a person to unlock them in the panel.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'command'],
      properties: {
        pid: {
          type: 'number',
          description: 'The target PID, as arthas_targets returned it.',
        },
        command: {
          type: 'string',
          description: 'The Arthas command line, exactly as it would be typed at the Arthas prompt.',
        },
        port: {
          type: 'number',
          description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}.`,
        },
        timeoutMs: {
          type: 'number',
          description: `Deadline in milliseconds; defaults to ${SHORT_TIMEOUT_MS}. For a command that waits `
            + 'for something to happen (watch/trace), prefer arthas_watch_start, which does not time out.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['command', 'state', 'ok', 'results'],
      properties: {
        command: { type: 'string' },
        state: { type: 'string' },
        ok: { type: 'boolean' },
        failure: { type: 'string' },
        results: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const command = asString(args.command, 'command')
      assertCommandAllowed(command)
      const port = portOf(args.port)
      const timeoutMs = args.timeoutMs === undefined
        ? SHORT_TIMEOUT_MS
        : asPositiveInt(args.timeoutMs, 'timeoutMs')
      // Refused rather than silently redirected — see `assertAgentFor`.
      await assertAgentFor(pid, port, signal)
      const response = await execArthas({ port, command, timeoutMs, signal })
      const failure = failureText(response)
      // Recorded whether it worked or not, and with the command verbatim: this is
      // the row a person reads to find out what the model ran inside a serving
      // process. `ognl` is flagged because it is arbitrary code execution, and the
      // design notes make seeing those a requirement rather than a nicety.
      arthas.audit({
        kind: 'exec',
        pid,
        port,
        command,
        risky: /^\s*ognl\b/.test(command),
        outcome: failure ?? '成功',
      })
      // `pid` is carried for the render, which names what it ran against.
      return {
        command: response.command,
        state: response.state,
        ok: commandSucceeded(response),
        pid,
        results: response.results as unknown as readonly ArthasResult[],
        ...failure === undefined ? {} : { failure },
      }
    },
    render(value) {
      const result = value as {
        command: string
        state: string
        ok: boolean
        failure?: string
        results: readonly ArthasResult[]
      }
      const lines = [`$ ${result.command}`, `state=${result.state} · ${result.ok ? '命令成功' : '命令失败'}`, '']
      if (result.failure !== undefined) lines.push(`失败原因：${result.failure}`, '')
      for (const entry of result.results) {
        if (entry.type === 'watch') {
          lines.push(...watchLines(entry))
        } else if (entry.type === 'status') {
          const code = typeof entry.statusCode === 'number' ? entry.statusCode : '?'
          lines.push(`[status] statusCode=${code}`)
        } else if (entry.type === 'enhancer') {
          const effect = entry.effect as Record<string, unknown> | undefined
          lines.push(`[enhancer] success=${String(entry.success)} classCount=${String(effect?.classCount ?? '?')}`
            + ` methodCount=${String(effect?.methodCount ?? '?')}`)
        } else {
          lines.push(`[${entry.type}] ${JSON.stringify(entry).slice(0, 600)}`)
        }
      }
      if (result.results.length === 0) lines.push('(没有任何结果)')
      return lines.join('\n')
    },
    presentCall: args => card(`执行 Arthas 命令：${String(args.command ?? '')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_sc',
    description: 'Find a class in a running JVM and return the classloader hash needed to reach it. This is '
      + 'the NCC-specific trap made into a tool: `ognl` resolves against the system classloader and cannot '
      + 'see business classes at all (measured: ClassNotFoundException: Unable to resolve class), so nearly '
      + 'every interesting command needs -c <hash>. It also reports codeSource, which is the directory the '
      + 'JVM actually loaded the class from — measured as the UAP Studio project\'s bin/, not '
      + 'HOME/modules. Answers "not found" honestly when the class is not on any classpath: measured, '
      + 'sc -d for a missing class reports SUCCEEDED with rowCount 0 and no error of any kind.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'className'],
      properties: {
        pid: { type: 'number', description: 'The target PID.' },
        className: {
          type: 'string',
          description: 'Fully-qualified class name, e.g. nc.impl.epmp.bgr.BgrReportSyncServiceImpl.',
        },
        port: { type: 'number', description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}.` },
        refresh: {
          type: 'boolean',
          description: 'Ignore the cache and probe again. Use after a class has been reloaded.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['className', 'found'],
      properties: {
        className: { type: 'string' },
        found: { type: 'boolean' },
        hash: { type: 'string' },
        codeSource: { type: 'string' },
        loaders: { type: 'array', items: { type: 'string' } },
        cached: { type: 'boolean' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const className = asString(args.className, 'className')
      const port = portOf(args.port)
      await assertAgentFor(pid, port, signal)
      const wasCached = cache.get(pid, className) !== undefined
      const location = await locateClass(pid, port, className, signal, args.refresh === true)
      arthas.audit({
        kind: 'sc',
        pid,
        port,
        command: scCommand(className),
        outcome: location.hash === undefined ? '没有找到这个类' : `classLoaderHash=${location.hash}`,
      })
      return {
        className,
        found: location.hash !== undefined,
        cached: wasCached && args.refresh !== true,
        ...location.hash === undefined ? {} : { hash: location.hash },
        ...location.codeSource === undefined ? {} : { codeSource: location.codeSource },
        loaders: location.loaders,
      }
    },
    render(value) {
      const result = value as {
        className: string
        found: boolean
        hash?: string
        codeSource?: string
        loaders: readonly string[]
        cached: boolean
      }
      if (!result.found) {
        return `${result.className} 没有找到 —— 这个 JVM 的任何 classloader 都加载不到它。\n`
          + '  · 确认类名拼写（含包名）；\n'
          + '  · 确认这个类属于当前这个进程（换一个 PID 试试）；\n'
          + '  · 类可能是懒加载的，还没被用到。'
      }
      const lines = [
        `${result.className}`,
        `  classLoaderHash: ${result.hash ?? ''}${result.cached ? '（缓存）' : ''}`,
      ]
      if (result.codeSource !== undefined) lines.push(`  code-source:     ${result.codeSource}`)
      if (result.loaders.length > 0) lines.push(`  加载器链:        ${result.loaders.join(' → ')}`)
      lines.push(
        '',
        `要用 ognl 访问它时，必须带上：-c ${result.hash ?? ''}`,
        '（watch/trace 用的是被增强类的加载器，通常不需要 -c。）',
      )
      return lines.join('\n')
    },
    presentCall: args => card(`定位类：${String(args.className ?? '')}`, 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_watch_start',
    description: 'Start observing a method and return a session handle immediately. This does NOT wait for a '
      + 'hit — measured, an Arthas watch command makes the HTTP request stay open until it fires, and that '
      + 'open request is exactly the async notification the panel needs. The workflow is: start the watch, '
      + 'trigger the business action some other way (the browser tools), then read the result with '
      + 'arthas_events. Do not try to confirm the registration right after starting: the enhancer result '
      + 'that says whether it took only arrives in the same response as the hit, so "did it register" is '
      + 'unanswerable until then. Always stop the session with arthas_watch_stop when done.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'className', 'methodName'],
      properties: {
        pid: { type: 'number', description: 'The target PID.' },
        className: { type: 'string', description: 'Fully-qualified class name to watch.' },
        methodName: {
          type: 'string',
          description: 'Method name to watch. Use <init> for a constructor.',
        },
        expression: {
          type: 'string',
          description: 'The OGNL expression Arthas evaluates at the observation point. Defaults to '
            + '"{params, returnObj}" (arguments and return value). Examples: "{params[0]}" for the first '
            + 'argument, "{target}" for the instance, "{throwExp}" for an exception. Must not contain a '
            + 'single quote. IMPORTANT: the expression is evaluated through the *system* classloader, so it '
            + 'can use the injected names (params, returnObj, target, throwExp, clazz, method, #cost) and '
            + 'any JDK class, but it CANNOT reference a class of the project under debug — '
            + '`@some.business.Class@…` resolves to null and the watch dies with a NullPointerException, '
            + 'and the `-c` option does not change that (measured). Stick to the injected names and JDK '
            + 'classes. The exception variable is `throwExp`, NOT `throw` — measured: `{throw}` fails with '
            + '`ognl.NoSuchPropertyException: ...Advice.throw`, because that is the field name on Arthas\'s '
            + 'own Advice class.',
        },
        count: {
          type: 'number',
          description: `How many hits to collect before the session ends (-n); defaults to ${DEFAULT_WATCH_COUNT}. `
            + 'The whole result arrives at once when the last hit happens, not incrementally.',
        },
        depth: {
          type: 'number',
          description: 'Object expansion depth (-x). Increase to see deeper into nested objects; the default '
            + 'of 1 keeps output readable.',
        },
        accessPoint: {
          type: 'string',
          enum: ['after', 'before', 'exception', 'finish'],
          description: 'When to observe: after (return, the default), before (entry), exception, or finish. '
            + 'Use "before" to see arguments that a failed call never returned.',
        },
        port: { type: 'number', description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}.` },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['session', 'pid', 'command', 'state'],
      properties: {
        session: { type: 'string' },
        pid: { type: 'number' },
        command: { type: 'string' },
        state: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const className = asString(args.className, 'className')
      const methodName = asString(args.methodName, 'methodName')
      const expression = args.expression === undefined
        ? '{params, returnObj}'
        : asString(args.expression, 'expression')
      if (expression.includes("'")) {
        throw new ArthasError(
          'invalid-input',
          'expression 里不能有单引号：Arthas 用它包裹表达式本身，带进去会把命令行拆坏。'
          + '需要字符串常量时用双引号，例如 {@java.lang.String@valueOf(params[0])}。',
        )
      }
      const count = args.count === undefined ? DEFAULT_WATCH_COUNT : asPositiveInt(args.count, 'count')
      const depth = args.depth === undefined ? undefined : asPositiveInt(args.depth, 'depth')
      const flags = accessPointFlags(args.accessPoint)
      const command = [
        'watch', className, methodName, `'${expression}'`,
        ...flags,
        ...depth === undefined ? [] : ['-x', String(depth)],
        '-n', String(count),
      ].join(' ')

      const port = portOf(args.port)
      // A watch that lands on the wrong JVM is worse than no watch: it would report
      // another process's calls as this one's. See `assertAgentFor`.
      await assertAgentFor(pid, port, signal)
      const session = arthas.startWatch({ pid, port, command, className, expected: count })
      arthas.audit({
        kind: 'watch_start',
        pid,
        port,
        command,
        outcome: `会话 #${session.id} 已挂上`,
      })
      return { session: session.id, pid, command, state: session.state }
    },
    render(value) {
      const result = value as { session: string; pid: number; command: string; state: string }
      return [
        `观测会话 #${result.session} 已挂上（PID ${result.pid}）。`,
        `  ${result.command}`,
        '',
        '现在去触发业务动作（浏览器工具点按钮/提交），然后：',
        `  arthas_events session="${result.session}"   ← 读结果，可以等`,
        '',
        '注意：注册成功与否此刻无法确认 —— enhancer 结果会和命中结果一起返回。',
        '用完务必 arthas_watch_stop，否则增强会一直留在类上。',
      ].join('\n')
    },
    presentCall: args => card(`挂观测：${String(args.className ?? '')}#${String(args.methodName ?? '')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_events',
    description: 'Read what an observation session has produced, waiting up to waitMs for it to finish. '
      + 'This is not a poll of a live stream: measured, an Arthas exec is atomic, so a watch -n 5 returns '
      + 'nothing until all five hits have happened and then returns everything at once. Calling this while '
      + 'the observation is still running therefore waits rather than reporting an increment, and that is '
      + 'the intended use — start the watch, trigger the action, then ask for the result.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['session'],
      properties: {
        session: {
          type: 'string',
          description: 'The session id arthas_watch_start returned.',
        },
        waitMs: {
          type: 'number',
          description: `How long to wait for the command to finish before reporting what is there so far; `
            + `defaults to ${DEFAULT_EVENT_WAIT_MS}, capped at ${MAX_EVENT_WAIT_MS}.`,
        },
        onlyNew: {
          type: 'boolean',
          description: 'Return only results not returned by an earlier arthas_events call for this session '
            + '(default true).',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['session', 'state', 'results', 'finished'],
      properties: {
        session: { type: 'string' },
        state: { type: 'string' },
        finished: { type: 'boolean' },
        command: { type: 'string' },
        failure: { type: 'string' },
        waitedMs: { type: 'number' },
        results: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute(args, signal) {
      const id = asString(args.session, 'session')
      const session = arthas.watch(id)
      if (session === undefined) {
        throw new ArthasError(
          'not-found',
          `没有这个观测会话：${id}。会话只存在于当前这一次插件进程里；`
          + `如果插件重启过，请重新 arthas_watch_start。`,
        )
      }
      const waitMs = args.waitMs === undefined
        ? DEFAULT_EVENT_WAIT_MS
        : Math.min(asPositiveInt(args.waitMs, 'waitMs'), MAX_EVENT_WAIT_MS)
      const started = Date.now()

      if (session.state === 'watching' && waitMs > 0) {
        await Promise.race([
          session.settled,
          new Promise<void>(resolve => {
            const timer = setTimeout(resolve, waitMs)
            // The tool call's own cancellation ends the wait early; the session
            // keeps running, because it belongs to the agent rather than to the
            // call that started it.
            signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
          }),
        ])
      }

      const onlyNew = args.onlyNew !== false
      const fresh = onlyNew ? session.results.slice(session.delivered) : session.results
      if (onlyNew) session.delivered = session.results.length
      // Two sources, one field. `failureText` reads the command's own complaint out
      // of the response; `session.message` is set when the request never completed
      // at all. The session's own account wins when both exist, because "the
      // connection dropped" explains more than a status code from a response that
      // never arrived. (An earlier version spread both into the object, so one
      // silently overwrote the other depending on spread order.)
      const failure = session.response === undefined ? undefined : failureText(session.response)
      const problem = session.message ?? failure
      return {
        session: id,
        state: session.state,
        finished: session.state !== 'watching',
        command: session.command,
        waitedMs: Date.now() - started,
        results: fresh as unknown as readonly ArthasResult[],
        ...problem === undefined ? {} : { failure: problem },
      }
    },
    render(value) {
      const result = value as {
        session: string
        state: string
        finished: boolean
        command: string
        waitedMs: number
        failure?: string
        results: readonly ArthasResult[]
      }
      const lines = [
        `会话 #${result.session} · ${result.state} · 等待 ${result.waitedMs} ms`,
        `  ${result.command}`,
        '',
      ]
      if (result.failure !== undefined) lines.push(`失败：${result.failure}`, '')
      const watchers = result.results.filter(entry => entry.type === 'watch')
      const enhancers = result.results.filter(entry => entry.type === 'enhancer')
      for (const enhancer of enhancers) {
        const effect = enhancer.effect as Record<string, unknown> | undefined
        if (enhancer.success === true) {
          lines.push(`观测已注册：classCount=${String(effect?.classCount ?? '?')} `
            + `methodCount=${String(effect?.methodCount ?? '?')}`)
        } else {
          lines.push(`⚠ 观测没有注册成功：${plainMessage(String(enhancer.message ?? ''))}`)
        }
      }
      if (watchers.length === 0) {
        lines.push(result.finished
          ? '这次会话已经结束，但没有命中任何一次调用 —— 目标方法没有被执行到。'
          : `还没有命中。命令还在挂着（等了 ${result.waitedMs} ms）——触发业务动作后再读一次。`)
      } else {
        lines.push(`命中 ${watchers.length} 次：`, '')
        for (const watcher of watchers) lines.push(...watchLines(watcher), '')
      }
      if (result.finished && watchers.length > 0) {
        lines.push('会话已结束。用 arthas_watch_stop 做 reset 清理。')
      }
      return lines.join('\n')
    },
    presentCall: args => card(`读观测结果：会话 #${String(args.session ?? '?')}`, 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_watch_stop',
    description: 'End an observation session and clean up the enhancement it left behind. Cleanup is a '
      + 'loop, not a single call: measured, three consecutive `reset` on one class answered with '
      + 'classCount 1, 1, 0, so the enhancement persists past the first reset. This tool resets until the '
      + 'count reaches 0 (up to 10 rounds) and reports what each round said. Use it for every session — '
      + 'a leftover enhancement keeps costing the running server performance. Note it sends `reset`, never '
      + '`stop`: `stop` would unload the whole agent and take the HTTP port with it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['session'],
      properties: {
        session: { type: 'string', description: 'The session id to stop.' },
        className: {
          type: 'string',
          description: 'Override the class to reset. Defaults to the class the session was started on; '
            + 'pass an explicit name if the watch was started by hand.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['session', 'className', 'message'],
      properties: {
        session: { type: 'string' },
        className: { type: 'string' },
        message: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const id = asString(args.session, 'session')
      const session = arthas.watch(id)
      if (session === undefined) {
        throw new ArthasError('not-found', `没有这个观测会话：${id}。`)
      }
      const className = args.className === undefined
        ? session.className
        : asString(args.className, 'className')
      if (className === undefined) {
        throw new ArthasError(
          'invalid-input',
          `会话 #${id} 没记下要 reset 的类名（可能是手工用 arthas_exec 挂的），请在 className 里明确给出。`,
        )
      }

      // The cleanup goes to whatever agent holds the port, so it has to be the one
      // this session was started against: a `reset` sent elsewhere would clear
      // enhancements on a class nobody was observing and leave this one installed.
      await assertAgentFor(session.pid, session.port, signal)

      // The reset loop itself lives in the service now. The panel's own stop button
      // performs exactly the same cleanup, and two copies of "loop until zero" is
      // two places for the rule to drift.
      const detail = await arthas.stop(id, signal)
      const outcome = detail.session.message ?? '已停止'
      arthas.audit({
        kind: 'watch_stop',
        pid: session.pid,
        port: session.port,
        command: `reset ${className}`,
        outcome,
      })
      return { session: id, className, message: outcome }
    },
    render(value) {
      const result = value as { session: string; className: string; message: string }
      return [
        `会话 #${result.session} 已停止（reset ${result.className}）。`,
        '',
        result.message === '' ? '（服务没有报告清理结果。）' : result.message,
      ].join('\n')
    },
    presentCall: args => card(`停止观测：会话 #${String(args.session ?? '?')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_capture',
    description: 'Capture a live object to disk so it can be replayed offline later. Starts a watch that '
      + 'serialises the chosen value using plain java.io classes — no helper class is injected, because a '
      + 'watch expression is evaluated through the *system* classloader and cannot see classes that the '
      + 'project\'s own loader holds (measured: every such call dies with a NullPointerException, and the '
      + '`-c` option does not change it — that picks which loader to enhance, not which one evaluates). '
      + 'Returns a session handle: trigger the business action, then read it with arthas_events. The value '
      + 'must be Serializable; anything else fails inside writeObject, leaves a truncated file, and Arthas '
      + 'names the exception in the session\'s failure text.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'className', 'methodName'],
      properties: {
        pid: { type: 'number', description: 'The target PID.' },
        className: { type: 'string', description: 'Fully-qualified class name to watch.' },
        methodName: { type: 'string', description: 'Method name to watch.' },
        expression: {
          type: 'string',
          description: 'The OGNL for the value to capture — a single value, NOT wrapped in braces. '
            + 'Defaults to "params[0]". Use "target" for the instance, "returnObj" for the return value '
            + '(only meaningful at the after access point), or "params[0].<getter>" for part of an '
            + 'argument. Note "target" evaluates to null for <init>, so constructors cannot be captured '
            + 'this way — watch a method instead.',
        },
        tag: {
          type: 'string',
          description: 'Label used in the file name, so several captures can be told apart. Defaults to '
            + '"dump". Only letters, digits, dash and underscore survive into the name.',
        },
        count: {
          type: 'number',
          description: `How many hits to capture (-n); defaults to ${DEFAULT_WATCH_COUNT}.`,
        },
        accessPoint: {
          type: 'string',
          enum: ['after', 'before', 'exception', 'finish'],
          description: 'When to capture; defaults to "before", which is what makes arguments capturable '
            + 'even when the call later fails.',
        },
        port: { type: 'number', description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}.` },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['session', 'pid', 'command', 'file', 'dumpDir', 'state'],
      properties: {
        session: { type: 'string' },
        pid: { type: 'number' },
        command: { type: 'string' },
        file: { type: 'string' },
        dumpDir: { type: 'string' },
        state: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const className = asString(args.className, 'className')
      const methodName = asString(args.methodName, 'methodName')
      const expression = args.expression === undefined ? 'params[0]' : asString(args.expression, 'expression')
      const rawTag = args.tag === undefined ? 'dump' : asString(args.tag, 'tag')
      const tag = rawTag.replace(/[^A-Za-z0-9_-]/g, '_')
      const count = args.count === undefined ? DEFAULT_WATCH_COUNT : asPositiveInt(args.count, 'count')
      const port = portOf(args.port)
      const accessPoint = args.accessPoint === undefined ? 'before' : String(args.accessPoint)

      const dumpDir = join(defaultArthasWorkDir(), 'dump')
      await mkdir(dumpDir, { recursive: true })

      // A capture that ran against the wrong JVM would write a file belonging to
      // another process's call. See `assertAgentFor`.
      await assertAgentFor(pid, port, signal)

      // Windows paths go into the expression as forward slashes: a backslash is an
      // escape inside OGNL's string literal, and doubling every one of them is a
      // mistake waiting to happen.
      const dir = dumpDir.replace(/\\/g, '/')
      const file = `${dir}/${tag}_${Date.now()}.ser`
      // A sidecar recording what this dump *is*: which method produced it, and the
      // expression that chose the value. Without it a replay has to be told the class
      // and method all over again by someone who remembers, which is the retyping the
      // offline loop exists to avoid — and it is what lets the panel replay in one
      // click rather than in four fields.
      await writeFile(`${file}.json`, `${JSON.stringify({
        className, methodName, expression, accessPoint, tag, pid, at: Date.now(),
      }, null, 2)}\n`, 'utf8')
      const watchExpression = serialiseExpression(expression, file, dir)
      const flags = accessPointFlags(accessPoint)
      const command = [
        'watch', className, methodName, `'${watchExpression}'`,
        ...flags,
        '-n', String(count),
      ].join(' ')

      const session = arthas.startWatch({ pid, port, command, className, expected: count })
      arthas.audit({
        kind: 'capture',
        pid,
        port,
        command,
        outcome: `会话 #${session.id}，目标文件 ${file}`,
      })
      return { session: session.id, pid, command, file, dumpDir, state: session.state }
    },
    render(value) {
      const result = value as {
        session: string
        pid: number
        command: string
        file: string
        dumpDir: string
        state: string
      }
      return [
        `落盘会话 #${result.session} 已挂上（PID ${result.pid}）。`,
        `  目标文件：${result.file}`,
        '',
        `  ${result.command}`,
        '',
        '下一步：触发业务动作，然后',
        `  arthas_events session="${result.session}"`,
        `命中后 value 里会是一行 DUMP_OK ${result.file}，那个 .ser 就是抓到的现场，可直接拿去离线回放。`,
        '',
        '对象必须可序列化 —— 不可序列化的值会在 writeObject 里抛异常（Arthas 把异常名写在失败信息里），',
        '并留下一个写了一半的文件。',
        '',
        '用完记得 arthas_watch_stop。',
      ].join('\n')
    },
    presentCall: args => card(`落盘对象：${String(args.className ?? '')}#${String(args.methodName ?? '')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_catch',
    description: 'Catch a failing call where it happens and keep the whole scene: the throwable AND, by '
      + 'default, the arguments that caused it — both written to disk inside the target JVM. This is '
      + '`arthas_capture` with `-e`, and the difference is what earns it a tool of its own: a capture is a '
      + 'value on its way INTO a method, while this is the input of a call that FAILED — the one thing '
      + 'nobody can reconstruct afterwards, because the request is gone and the log kept only the stack '
      + 'trace. The arguments go out as the raw `params` array, which is exactly the shape `replay_run` '
      + 'passes as a parameter list, so a failure seen in production can be re-run offline against the real '
      + 'code. Nothing is serialised through a helper class: a watch expression is evaluated through the '
      + 'system classloader and cannot see the project\'s own classes. Both files must be Serializable, and '
      + 'an argument that is not fails inside writeObject and leaves a truncated file. Note the exception '
      + 'variable is `throwExp`, not `throw`.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'className', 'methodName'],
      properties: {
        pid: { type: 'number', description: 'The target PID.' },
        className: { type: 'string', description: 'Fully-qualified class name to watch.' },
        methodName: { type: 'string', description: 'Method name to watch.' },
        tag: {
          type: 'string',
          description: 'Label at the head of the file names, so several catches can be told apart. '
            + 'Defaults to "catch". Only letters, digits, dash and underscore survive into the name.',
        },
        count: {
          type: 'number',
          description: 'How many failing calls to catch before the session ends (-n); defaults to '
            + `${DEFAULT_WATCH_COUNT}. Each hit writes its own pair of files, named with the target JVM's `
            + 'clock.',
        },
        captureArgs: {
          type: 'boolean',
          description: 'Also write the failing call\'s arguments (`params`), as the file replay_run reads. '
            + 'Defaults to true. Turn it off when an argument is known not to be Serializable: writing it '
            + 'would fail, and because OGNL has no try/catch the throwable would not be written either.',
        },
        port: { type: 'number', description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}.` },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['session', 'pid', 'command', 'catchDir', 'fileBase', 'single', 'captureArgs', 'state'],
      properties: {
        session: { type: 'string' },
        pid: { type: 'number' },
        command: { type: 'string' },
        catchDir: { type: 'string' },
        fileBase: { type: 'string' },
        single: { type: 'boolean' },
        captureArgs: { type: 'boolean' },
        state: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const className = asString(args.className, 'className')
      const methodName = asString(args.methodName, 'methodName')
      const rawTag = args.tag === undefined ? 'catch' : asString(args.tag, 'tag')
      const tag = rawTag.replace(/[^A-Za-z0-9_-]/g, '_')
      const count = args.count === undefined ? DEFAULT_WATCH_COUNT : asPositiveInt(args.count, 'count')
      const captureArgs = args.captureArgs === undefined ? true : args.captureArgs === true
      const port = portOf(args.port)

      const catchDir = join(defaultArthasWorkDir(), 'catch')
      await mkdir(catchDir, { recursive: true })

      // A catch that landed on the wrong JVM would file another process's failure as this one's.
      await assertAgentFor(pid, port, signal)

      // Forward slashes: a backslash is an escape inside OGNL's string literal.
      const dir = catchDir.replace(/\\/g, '/')
      // One hit can be named outright, because nothing about it depends on the JVM; several
      // cannot, because they do not exist yet. So a single catch owns the whole name and a
      // longer run owns only the prefix, which is what the render reports.
      const single = count === 1
      const prefix = `${tag}_${Date.now()}`
      const expression = catchExpression({ dir, prefix, withArgs: captureArgs, uniqueNames: !single })

      // The sidecar the panel and `replay_run` pair with a dump, so a caught failure can be
      // replayed in one click. Written before the watch fires, exactly as `arthas_capture` does —
      // and only when the name is known here: for a multi-hit run the dump's path does not exist
      // yet, and a sidecar that can never be paired with one is just litter in the directory.
      if (single && captureArgs) {
        await writeFile(`${dir}/${prefix}.args.ser.json`, `${JSON.stringify({
          className, methodName, expression: 'params', accessPoint: 'exception', tag, pid, at: Date.now(),
        }, null, 2)}\n`, 'utf8')
      }

      const command = [
        'watch', className, methodName, `'${expression}'`, '-e', '-n', String(count),
      ].join(' ')

      const session = arthas.startWatch({ pid, port, command, className, expected: count })
      arthas.audit({
        kind: 'catch',
        pid,
        port,
        command,
        outcome: `会话 #${session.id}，目录 ${catchDir}`,
      })
      return {
        session: session.id,
        pid,
        command,
        catchDir,
        fileBase: `${dir}/${prefix}`,
        single,
        captureArgs,
        state: session.state,
      }
    },
    render(value) {
      const result = value as {
        session: string
        pid: number
        command: string
        catchDir: string
        fileBase: string
        single: boolean
        captureArgs: boolean
        state: string
      }
      const tail = result.single ? '' : '_<jvm-clock>'
      const lines = [
        `异常捕获会话 #${result.session} 已挂上（PID ${result.pid}，只抓抛异常的调用）。`,
        `  落盘目录：${result.catchDir}`,
        result.single
          ? '  命中时写下这两个文件（名字现在就定好了）：'
          : '  命中时写文件 —— 前缀已定，尾巴用目标 JVM 的时钟，这样多次命中不会互相覆盖：',
        `    ${result.fileBase}${tail}.thrown.ser   异常对象（含堆栈）`,
      ]
      if (result.captureArgs) {
        lines.push(`    ${result.fileBase}${tail}.args.ser     当时入参，可直接喂 replay_run`)
      }
      lines.push(
        '',
        `  ${result.command}`,
        '',
        '下一步：重放那个会失败的业务动作，然后',
        `  arthas_events session="${result.session}"`,
        '命中后事件流里会直接显示异常本身 —— 不用打开 .ser 就能看是什么错。',
        '',
      )
      if (!result.single) {
        lines.push(
          '要抓多次，所以尾巴在目标 JVM 里生成，路径得列目录取：',
          `  列 ${result.fileBase}_* 即可。`,
          '',
        )
      }
      if (result.captureArgs) {
        lines.push(
          '复现这次失败：把 .args.ser 交给 replay_run —— 它就是 params 数组，正好是 replay 要的参数列表。',
          `  replay_run dump="${result.fileBase}${tail}.args.ser" className="…" methodName="…"`,
        )
        if (result.single) {
          lines.push('已写好侧车，所以面板里可以直接一键重放。')
        } else {
          lines.push('多次捕获没有侧车（名字要等命中才知道），面板里要手填类名与方法名。')
        }
        lines.push('实测：这样抓到的入参喂给 Replay，会复现出同一个异常并 exit 1。', '')
      }
      lines.push(
        '两个限制：落盘的值必须可序列化，不可序列化会在 writeObject 里失败并留下半截文件；',
        '表达式先写异常再写入参 —— OGNL 没有 try/catch，入参写失败时至少异常还在。',
        '',
        '用完记得 arthas_watch_stop。',
      )
      return lines.join('\n')
    },
    presentCall: args => card(`捕获异常：${String(args.className ?? '')}#${String(args.methodName ?? '')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'arthas_trace',
    description: 'Measure a method and keep the number: how long each of its next calls took, plus an '
      + 'average compared against the previous run of the same method. This is the perf half of the '
      + 'debugging loop — `replay_run` answers "is it still correct", and this answers "did it get slower", '
      + 'against a baseline that survives between sessions. The result is structured, not text: measured, '
      + 'Arthas answers one `{"type":"trace","root":{…}}` result per hit, where `root` is the thread and the '
      + 'traced method sits in `root.children` with its cost in MICROSECONDS. Nothing here parses a rendered '
      + 'tree. The command ends by itself after `count` calls and the tool waits that long — but a method '
      + 'nobody calls would wait for ever, so it gives up at `timeoutMs` and hands back a session that can '
      + 'still be read. Note the enhancement outlives the command (measured: a `reset` straight afterwards '
      + 'reported classCount=1), so the session is worth stopping once the numbers are in.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'className', 'methodName'],
      properties: {
        pid: { type: 'number', description: 'The target PID.' },
        className: { type: 'string', description: 'Fully-qualified class name to measure.' },
        methodName: { type: 'string', description: 'Method name, or <init> for a constructor.' },
        count: {
          type: 'number',
          description: `How many calls to measure (-n); defaults to ${DEFAULT_TRACE_COUNT}. The first call `
            + 'of a method is often much slower than the rest (cold class, cold cache) — measured on NCC '
            + '1909: 222.9 ms then 47.8 ms for the same method — so one sample is rarely the answer.',
        },
        timeoutMs: {
          type: 'number',
          description: 'How long to wait for those calls before handing back; defaults to '
            + `${DEFAULT_TRACE_WAIT_MS}. On timeout the trace keeps running and the session can be read with `
            + 'arthas_events, which is how a longer observation is done without a call that lives for hours.',
        },
        port: { type: 'number', description: `The agent HTTP port; defaults to ${ARTHAS_HTTP_PORT}.` },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['session', 'pid', 'command', 'waited', 'hits', 'costsUs', 'baselinePath', 'state'],
      properties: {
        session: { type: 'string' },
        pid: { type: 'number' },
        command: { type: 'string' },
        waited: { type: 'boolean' },
        hits: { type: 'number' },
        costsUs: { type: 'array', items: { type: 'number' } },
        avgUs: { type: 'number' },
        minUs: { type: 'number' },
        maxUs: { type: 'number' },
        baselinePath: { type: 'string' },
        previousAvgUs: { type: 'number' },
        previousMinUs: { type: 'number' },
        delta: { type: 'number' },
        minDelta: { type: 'number' },
        state: { type: 'string' },
        message: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const className = asString(args.className, 'className')
      const methodName = asString(args.methodName, 'methodName')
      const count = args.count === undefined ? DEFAULT_TRACE_COUNT : asPositiveInt(args.count, 'count')
      const timeoutMs = args.timeoutMs === undefined
        ? DEFAULT_TRACE_WAIT_MS
        : asPositiveInt(args.timeoutMs, 'timeoutMs')
      const port = portOf(args.port)

      // A trace that landed on the wrong JVM would report another process's timings as this one's.
      await assertAgentFor(pid, port, signal)

      const command = ['trace', '-n', String(count), className, methodName].join(' ')

      // The session table is reused rather than bypassed, for two reasons. It is what makes
      // this stoppable — a trace leaves its enhancement installed after the last hit, and
      // `arthas_watch_stop` is the one place that knows how to take an enhancement off — and
      // it puts the trace in front of the panel, which is where somebody notices that a
      // measurement they started is still running.
      const session = arthas.startWatch({ pid, port, command, className, expected: count })
      arthas.audit({ kind: 'trace', pid, port, command, outcome: `会话 #${session.id}` })

      const waited = await waitFor(session.settled, timeoutMs, signal)

      const hits = traceHits(session.results)
      const costsUs = hits.flatMap(hit => hit.calls.map(call => call.costUs))
      const sample = summarise(costsUs, hits[0]?.thread ?? '')
      const path = baselinePath(className, methodName)
      const shift = sample === undefined ? undefined : await appendBaseline(path, sample)
      return {
        session: session.id,
        pid,
        command,
        waited,
        hits: hits.length,
        costsUs,
        ...sample === undefined ? {} : { avgUs: sample.avgUs, minUs: sample.minUs, maxUs: sample.maxUs },
        baselinePath: path,
        ...shift === undefined
          ? {}
          : {
            previousAvgUs: shift.previous.avgUs,
            delta: shift.delta,
            previousMinUs: shift.previous.minUs,
            minDelta: shift.minDelta,
          },
        state: session.state,
        ...session.message === undefined ? {} : { message: session.message },
      }
    },
    render(value) {
      const result = value as {
        session: string
        pid: number
        command: string
        waited: boolean
        hits: number
        costsUs: readonly number[]
        avgUs?: number
        minUs?: number
        maxUs?: number
        baselinePath: string
        previousAvgUs?: number
        previousMinUs?: number
        delta?: number
        minDelta?: number
        state: string
        message?: string
      }
      const lines = [`测量会话 #${result.session}（PID ${result.pid}）：`, `  ${result.command}`, '']
      // Keyed on the calls rather than on the hit count: a trace result can arrive with no
      // usable method node in it, and "no numbers" is what the reader has to be told.
      if (result.costsUs.length === 0) {
        lines.push(result.waited
          ? '命令结束了，但一次调用都没有命中 —— 目标方法在这段时间里没有被执行到。'
          : `还没等到调用。trace 仍在会话 #${result.session} 里跑：继续触发业务动作，`
            + '再用 arthas_events 读，或者用 arthas_watch_stop 停掉。')
        return lines.join('\n')
      }
      lines.push(`命中 ${result.hits} 次：`)
      const shown = result.costsUs.slice(0, 20)
      shown.forEach((cost, index) => {
        lines.push(`  ${index + 1}) ${msOf(cost)}`)
      })
      if (result.costsUs.length > shown.length) {
        lines.push(`  …（还有 ${result.costsUs.length - shown.length} 次）`)
      }
      lines.push(
        '',
        `平均 ${msOf(result.avgUs ?? 0)} · 最小 ${msOf(result.minUs ?? 0)} · 最大 ${msOf(result.maxUs ?? 0)}`,
        '',
        `基线：${result.baselinePath}`,
      )
      if (result.delta === undefined || result.previousAvgUs === undefined) {
        lines.push('  这是这个方法的第一次记录，下次再测就有对照了。')
      } else {
        const sign = result.delta >= 0 ? '+' : ''
        lines.push(`  平均 ${sign}${(result.delta * 100).toFixed(1)}%（上次 ${msOf(result.previousAvgUs)}）`)
        if (result.minDelta !== undefined && result.previousMinUs !== undefined) {
          const minSign = result.minDelta >= 0 ? '+' : ''
          lines.push(
            `  最小 ${minSign}${(result.minDelta * 100).toFixed(1)}%`
            + `（上次 ${msOf(result.previousMinUs)}）← 热态，不会被偶发的慢调用带偏`,
          )
        }
        // A batch whose slowest call is several times its fastest cannot support a conclusion
        // drawn from the average. Measured, that is exactly how a "+24.5% slower" appeared for
        // a method nothing had changed: one outlier in the second batch of five.
        const fastest = result.minUs ?? 0
        const slowest = result.maxUs ?? 0
        if (fastest > 0 && slowest / fastest >= 2) {
          lines.push(
            `  ⚠ 这批样本波动大（最大 ${msOf(slowest)} / 最小 ${msOf(fastest)}）：`
            + '平均会被离群值带偏，结论优先看最小。',
          )
        }
      }
      lines.push('')
      if (!result.waited) {
        lines.push(
          `⚠ 没等满就交回来了，trace 仍在会话 #${result.session} 里跑 —— `
          + 'arthas_events 可以继续读，arthas_watch_stop 停掉。',
        )
      }
      lines.push(
        '⚠ trace 结束后增强还装着（实测随后 reset 会报 classCount=1）—— '
        + `用 arthas_watch_stop session="${result.session}" 撤掉。`,
      )
      return lines.join('\n')
    },
    presentCall: args => card(`测量：${String(args.className ?? '')}#${String(args.methodName ?? '')}`),
  })))

  return () => {
    // The sessions belong to the service, which disposes its own when the plugin
    // unmounts; what is this module's is the cache and the tool registrations.
    cache.clear()
    for (const dispose of disposers) dispose()
  }
}

/** The OGNL flags for an access point, as Arthas spells them. */
function accessPointFlags(point: unknown): string[] {
  switch (point) {
    case 'before': return ['-b']
    case 'exception': return ['-e']
    case 'finish': return ['-f']
    // `after` is Arthas's default, and passing nothing is the same as passing it.
    case 'after': return []
    case undefined: return []
    default:
      throw new ArthasError(
        'invalid-input',
        `accessPoint 只能是 after / before / exception / finish，收到的是「${String(point)}」。`,
      )
  }
}


