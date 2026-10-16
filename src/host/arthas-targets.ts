/**
 * Which JVMs are on this machine, which of them are NCC, and which classloader
 * holds a given class.
 *
 * ## Two jobs that belong together
 *
 * The first is finding the process: `jps -lv` lists the JVMs, and the one serving
 * an installation is the one carrying `-Dnc.server.location=<HOME>`. Measured on a
 * live NCC 1909 dev box, that argument is the **only** reliable marker — the main
 * class was `com.yonyou.studio.udt.launching.Launcher` (UAP Studio's launcher),
 * not a Tomcat or NC bootstrap, so a main-class match would have found nothing.
 *
 * The second is the classloader hash, and it is the harder one. A class name does
 * not identify a class in a running JVM: the same name may be held by several
 * loaders, and `ognl` resolves against the *system* loader by default, which in
 * NCC cannot see business classes at all. Measured failure:
 *
 * ```
 * ognl "@aidebug.DebugDump@saveText(...)"
 *   → ClassNotFoundException: Unable to resolve class: aidebug.DebugDump
 * ```
 *
 * The fix is `-c <hash>`, and the hash comes from `sc -d`, which this module reads
 * out of the structured response and caches per process.
 *
 * ## Why the cache is keyed by class, not by process
 *
 * One measured JVM held the business class under `URLClassLoader@7c29daf3` and its
 * stack also names `AppClassLoader@18b4aac2` and `ExtClassLoader@4b1c1ea0`. A
 * single hash remembered per PID would therefore be wrong for some classes in
 * that same PID. The key is `(pid, class name)`.
 *
 * ## What is deliberately not cached
 *
 * Port liveness. It changes for reasons this module cannot see (an agent attached
 * or unloaded by someone else), and a stale "attached" would turn into a confusing
 * connection error inside a command instead of an honest "nothing is attached".
 */
import { access } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RunSubprocess } from './datasource-probe.ts'
import { ARTHAS_HTTP_PORT, execArthas, isAgentListening, type ArthasResult } from './arthas-http.ts'
import { ArthasError } from './arthas-errors.ts'

/** How much of `jps`'s output to keep. A busy build machine can have many JVMs. */
const MAX_JPS_BYTES = 4 * 1024 * 1024

/** `jps` answers in well under a second; this is the "it is not going to" line. */
const JPS_TIMEOUT_MS = 15_000

/** Grace before a terminated `jps` is force-killed. */
const JPS_GRACE_MS = 2_000

/** One JVM as `jps` reported it. */
export interface JavaProcess {
  readonly pid: number
  /** The main class, as printed. */
  readonly mainClass: string
  /** The JVM arguments, verbatim and space-joined. */
  readonly args: string
  /**
   * The NCC installation this process serves, when it carries one.
   *
   * Present only for NCC processes — see the module note on why this is the
   * marker and the main class is not.
   */
  readonly home?: string
}

/** One JVM plus what could be learned about an agent on it. */
export interface ArthasTarget {
  readonly pid: number
  readonly mainClass: string
  /** `ncc` when the process serves an installation, `java` otherwise. */
  readonly kind: 'ncc' | 'java'
  readonly home?: string
  /** The JVM arguments, for a caller that wants to show why it guessed. */
  readonly args: string
  /**
   * True when **this** process is the one the agent is running inside.
   *
   * Deliberately not "a port answered somewhere on this machine" — see
   * {@link agentPid} for why that distinction is the entire point of this field.
   */
  readonly attached: boolean
}

/** Where a class was found, and by which loader. */
export interface ClassLocation {
  readonly className: string
  /**
   * The classloader hash to pass as `-c`, when the class was found.
   *
   * Undefined means "`sc -d` matched nothing", which is a real and common answer
   * for a typo and is reported as such rather than as an error — measured, a
   * `sc -d` for a class that does not exist answers `state: "SUCCEEDED"` with a
   * `row_affect.rowCount` of 0 and no failure of any kind.
   */
  readonly hash?: string
  /**
   * The URL the class was loaded from, normalised to a local path.
   *
   * Measured as `/E:/NCProject/.../ncc_scgf_v1909/bin/` — a file-URL path, so it
   * carries a leading slash that has to go before it can be used as a Windows
   * path. This is what makes "drop a helper class where the JVM will load it"
   * possible without asking the operator.
   */
  readonly codeSource?: string
  /** The loader chain, outermost first, as `sc -d` printed it. */
  readonly loaders: readonly string[]
  readonly at: number
}

/** The cache of `(pid, class)` → where that class lives. */
export interface ClassLoaderCache {
  get(pid: number, className: string): ClassLocation | undefined
  put(pid: number, location: ClassLocation): void
  forget(pid: number): void
  clear(): void
  /** How many entries are held, for a status line. */
  size(): number
}

/**
 * Build the cache.
 *
 * Plain `Map`s with no expiry. A classloader's identity is fixed for the life of
 * the JVM that owns it, so an entry is valid until the process goes away — and
 * `forget(pid)` is called when a target disappears, which is the only event that
 * invalidates anything. A TTL would only add a way to be slow for no reason.
 */
export function createClassLoaderCache(): ClassLoaderCache {
  /** pid → (class name → location) */
  const byPid = new Map<number, Map<string, ClassLocation>>()

  return {
    get(pid, className) {
      return byPid.get(pid)?.get(className)
    },
    put(pid, location) {
      let forPid = byPid.get(pid)
      if (forPid === undefined) {
        forPid = new Map<string, ClassLocation>()
        byPid.set(pid, forPid)
      }
      forPid.set(location.className, location)
    },
    forget(pid) {
      byPid.delete(pid)
    },
    clear() {
      byPid.clear()
    },
    size() {
      let total = 0
      for (const forPid of byPid.values()) total += forPid.size
      return total
    },
  }
}

/**
 * Split one `jps -lv` line.
 *
 * The format is `<pid> <main class> <arguments…>`, and a process whose details
 * the caller may not see prints `<pid> -- process information unavailable` — that
 * placeholder is skipped rather than reported as a JVM called `--`.
 *
 * Arguments are kept as one string rather than split on spaces. Splitting looks
 * tidier and is wrong: an argument value can contain spaces, and the only thing
 * this module reads out of the string is a single-argument regex match that does
 * not care.
 */
function parseJpsLine(line: string): JavaProcess | undefined {
  const trimmed = line.trim()
  if (trimmed === '') return undefined
  const match = /^(\d+)\s+(\S+)\s*(.*)$/.exec(trimmed)
  if (match === null) return undefined
  const rawPid = match[1]
  const mainClass = match[2]
  const rest = match[3]
  // The pattern has three groups, so all three are present — but the compiler
  // cannot know that under `noUncheckedIndexedAccess`, and neither can a reader,
  // so they are checked rather than asserted away.
  if (rawPid === undefined || mainClass === undefined || rest === undefined) return undefined
  const pid = Number(rawPid)
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  if (mainClass === '--') return undefined
  const args = rest.trim()
  const home = homeOf(args)
  return { pid, mainClass, args, ...home === undefined ? {} : { home } }
}

/**
 * The `-Dnc.server.location=` value, if the argument string carries one.
 *
 * Both separators are accepted in the value and it is returned as found: this is
 * the operator's own path, and rewriting it here would make the answer disagree
 * with what `jps` printed, in the one place a person goes to check the guess.
 */
function homeOf(args: string): string | undefined {
  const match = /-Dnc\.server\.location=([^\s"]+)/.exec(args)
  if (match === null) return undefined
  const found = match[1]
  if (found === undefined) return undefined
  const value = found.replace(/[\\/]+$/, '')
  return value === '' ? undefined : value
}

/**
 * Is this the `jps` process's own row?
 *
 * Without this the list contains `sun.tools.jps.Jps`, which is a JVM that will
 * have exited by the time anybody looks at it and is never a target.
 */
function isJpsItself(process: JavaProcess): boolean {
  return process.mainClass.endsWith('sun.tools.jps.Jps')
    || process.mainClass.includes('jdk.jcmd')
}

/**
 * Where `jps` lives.
 *
 * A registered Home's own `ufjdk` is preferred over whatever is on `PATH` when
 * one is named: the JDK that launched the target is the one guaranteed to be able
 * to attach to it, and `jps` from a different major version can list nothing at
 * all while reporting no error.
 *
 * @param subprocess - the subprocess service, for `PATH` lookup.
 * @param jdkBin - a JDK's `bin` directory, when the caller knows one.
 * @returns the executable to run.
 */
export async function resolveJps(subprocess: RunSubprocess, jdkBin?: string): Promise<string> {
  if (jdkBin !== undefined && jdkBin.trim() !== '') {
    const candidate = join(jdkBin, process.platform === 'win32' ? 'jps.exe' : 'jps')
    const found = await access(candidate).then(() => true, () => false)
    if (found) return candidate
  }
  try {
    return await subprocess.resolveExecutable('jps')
  } catch {
    throw new ArthasError(
      'unavailable',
      '找不到 jps。请在已登记的 NCC Home 上跑（它的 ufjdk/bin 里有 jps），'
      + '或把 JDK 的 bin 目录配置进 PATH —— 没有它就无法列出可 attach 的进程。',
    )
  }
}

/**
 * List the JVMs `jps` can see.
 *
 * @param subprocess - the subprocess service.
 * @param jpsPath - the executable, from {@link resolveJps}.
 * @param signal - cancellation from the tool call.
 * @returns every JVM, `jps`'s own row excluded, in the order reported.
 */
export async function listJavaProcesses(
  subprocess: RunSubprocess,
  jpsPath: string,
  signal?: AbortSignal,
): Promise<readonly JavaProcess[]> {
  const handle = subprocess.spawn({
    argv: [jpsPath, '-lv'],
    // Not the working directory: `jps` reads nothing from it, and a deleted
    // process working directory would turn a working call into a spawn failure.
    cwd: tmpdir(),
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: MAX_JPS_BYTES },
      stderr: { maxBytes: MAX_JPS_BYTES },
    },
    graceMs: JPS_GRACE_MS,
    ...signal === undefined ? {} : { signal },
  })

  const timer = setTimeout(() => { handle.terminate() }, JPS_TIMEOUT_MS)
  try {
    const outcome = await handle.done
    const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
    const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
    if (outcome.exitCode !== 0 && stdout.trim() === '') {
      throw new ArthasError(
        'failed',
        `jps 退出码 ${outcome.exitCode ?? 'null'}，没有输出。${stderr.trim() === '' ? '' : `它说：${stderr.trim()}`}`,
      )
    }
    const processes: JavaProcess[] = []
    for (const line of stdout.split(/\r?\n/)) {
      const parsed = parseJpsLine(line)
      if (parsed !== undefined && !isJpsItself(parsed)) processes.push(parsed)
    }
    return processes
  } finally {
    clearTimeout(timer)
  }
}

/** How long the agent gets to say which PID it is running inside. */
const AGENT_PROBE_TIMEOUT_MS = 15_000

/**
 * Which PID is the agent on this port running inside?
 *
 * **This exists because of the worst bug this feature had.** An Arthas agent
 * serves its HTTP API from *inside* the target JVM, so port 8563 is global: only
 * one process on a machine can hold it. The first implementation probed that one
 * port once per process and therefore reported **every JVM on the machine** as
 * attached — measured on this machine, Eclipse, two language servers and the NCC
 * all came back "✅ 已挂载".
 *
 * Showing that was merely wrong. Acting on it was not: `arthas_exec(pid=36496)`
 * would have sent the command to whichever agent held 8563 (the NCC, PID 45076)
 * and returned the answer as though it came from Eclipse — a model would have read
 * one process's variables and attributed them to another, with nothing in the
 * output to suggest it.
 *
 * The answer has to come from the agent, because nothing outside it knows: the
 * HTTP response carries no PID. Inside the JVM,
 * `ManagementFactory.getRuntimeMXBean().getName()` is `"<pid>@<host>"` (measured:
 * `@String[45076@Zhang]`). It touches only JDK classes, so the default system
 * classloader resolves it and no `-c` is needed.
 *
 * @param port - the agent's HTTP port.
 * @param signal - cancellation from the tool call.
 * @returns the PID the agent runs inside, or undefined when nothing is attached.
 */
export async function agentPid(port: number, signal?: AbortSignal): Promise<number | undefined> {
  if (!await isAgentListening(port)) return undefined
  const response = await execArthas({
    port,
    command: "ognl '@java.lang.management.ManagementFactory@getRuntimeMXBean().getName()'",
    timeoutMs: AGENT_PROBE_TIMEOUT_MS,
    ...signal === undefined ? {} : { signal },
  })
  for (const result of response.results) {
    const value = result.value
    if (typeof value !== 'string') continue
    const found = /(\d+)@/.exec(value)
    if (found?.[1] !== undefined) return Number(found[1])
  }
  // A port that answers but will not name its PID is not usable as a target: the
  // caller would be guessing exactly where its command lands.
  return undefined
}

/**
 * Mark which entry in a process list is the one holding the agent.
 *
 * The agent is asked **once**, not once per process (see {@link agentPid}): the
 * port is global, so the per-process probing this replaced was not merely slow —
 * it was the bug.
 *
 * @param processes - what {@link listJavaProcesses} returned.
 * @param holder - the PID {@link agentPid} reported, or undefined for none.
 * @returns one target per process, in the same order.
 */
export function toTargets(
  processes: readonly JavaProcess[],
  holder: number | undefined,
): readonly ArthasTarget[] {
  return processes.map((entry): ArthasTarget => ({
    pid: entry.pid,
    mainClass: entry.mainClass,
    kind: entry.home === undefined ? 'java' : 'ncc',
    ...entry.home === undefined ? {} : { home: entry.home },
    args: entry.args,
    attached: entry.pid === holder,
  }))
}

/** One `sc -d` response's interesting slice, in the terms this module thinks in. */
function locationFromSc(results: ScResults, className: string): ClassLocation {
  const at = Date.now()
  for (const result of results) {
    if (result.type !== 'sc') continue
    const classInfo = result.classInfo
    if (classInfo === null || typeof classInfo !== 'object') continue
    const fields = classInfo as Record<string, unknown>
    const hash = typeof fields.classLoaderHash === 'string' && fields.classLoaderHash !== ''
      ? fields.classLoaderHash
      : undefined
    const codeSource = normaliseCodeSource(fields.codeSource)
    const loaders = Array.isArray(fields.classloader)
      ? fields.classloader.filter((one): one is string => typeof one === 'string')
      : []
    return {
      className,
      ...hash === undefined ? {} : { hash },
      ...codeSource === undefined ? {} : { codeSource },
      loaders,
      at,
    }
  }
  // No `sc` result: `row_affect.rowCount` was 0, which means the class is not on
  // any classpath this JVM can see. Not an error — see `ClassLocation.hash`.
  return { className, loaders: [], at }
}

/**
 * Turn `sc -d`'s `codeSource` into a path that can be opened.
 *
 * Measured value: `/E:/NCProject/NCC1909/shouchuang/ncc_scgf_v1909/bin/`. It is a
 * file URL's path component, so it begins with a slash in front of a Windows
 * drive letter and ends with the separator. Both are removed for a Windows path,
 * and a trailing slash is dropped everywhere so the same value can be `join`ed.
 *
 * A `jar:` source (`jar:file:/…/x.jar!/`) is not converted: a class loaded from a
 * jar cannot be accompanied by a new class file, so there is nothing useful to do
 * with that answer and guessing at a directory would be worse than saying so.
 */
function normaliseCodeSource(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  if (text === '') return undefined
  if (text.startsWith('jar:')) return undefined
  let path = text
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
  path = path.replace(/[\\/]+$/, '')
  if (path === '') return undefined
  // A relative `codeSource` would be resolved against whatever directory the
  // target JVM happens to have, which this module cannot know; it is reported as
  // no answer rather than as a path that would then be used to write a file.
  if (!isAbsolute(path) && !/^[A-Za-z]:/.test(path)) return undefined
  return path
}

/** What {@link readClassLocation} reads. */
export type ScResults = readonly ArthasResult[]

/**
 * Read a class's location out of an already-fetched `sc -d` response.
 *
 * Split from running the command so the cache, the tool layer and the capture
 * path all read the shape through one function — the shape was measured once and
 * should be written down once.
 */
export function readClassLocation(results: ScResults, className: string): ClassLocation {
  return locationFromSc(results, className)
}

/**
 * The command that asks for a class's loader.
 *
 * `-d` is what makes it detailed; without it there is no `classLoaderHash` and
 * the answer is useless for `-c`.
 */
export function scCommand(className: string, detailed = true): string {
  return detailed ? `sc -d ${className}` : `sc ${className}`
}

/** A one-line identity for a target, for logs and diagnoses. */
export function describeTarget(target: ArthasTarget, port = ARTHAS_HTTP_PORT): string {
  const state = target.attached ? `agent 已挂载（${port}）` : '未挂载'
  return `PID ${target.pid} ${target.mainClass} · ${state}`
}
