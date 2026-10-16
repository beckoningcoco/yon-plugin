/**
 * Offline replay: run a captured call again, outside the container, against the real
 * code.
 *
 * ## Why this exists
 *
 * `arthas_capture` gets a live object onto disk; on its own that is a souvenir. What
 * makes it worth having is the loop it closes — change a business method, run it
 * again against the same captured argument, look at the diff. Measured: **about four
 * seconds**, against a restart of NCC plus re-driving the screen. See
 * `docs/yon-arthas-design.md`, section 6.
 *
 * ## The classpath is the whole problem, and it has three parts
 *
 * A replay has to load the project's classes, so it needs the target JVM's
 * classpath. Measured on a live NCC 1909:
 *
 * 1. **5,481 entries.** Taken from the JVM (`classloader -c <hash>`), never guessed
 *    from the installation layout — NCC assembles most of it by reflection at
 *    startup, so what is on disk is not what is loaded.
 * 2. **They do not fit on a command line.** 519,842 bytes joined, against a Windows
 *    limit near 32 KB. JDK 8 has no `@argfile` — that arrived in JDK 9.
 * 3. **So the classpath travels in a jar's manifest.** A 519 KB manifest zips to
 *    **59,596 bytes**, and `-cp` then names one file.
 *
 * ## Two ways the manifest is easy to get wrong
 *
 * Both were hit while building this, and both fail the same way — a
 * `ClassNotFoundException` that says nothing about the real cause:
 *
 * - **A line may not exceed 72 bytes, continuation included.** URLs here run to 150
 *   bytes, so a line is not "one URL"; it is a byte budget.
 * - **A fold that lands on the separator space loses it.** A manifest continuation
 *   is `CRLF` + one space, and the parser deletes that space — so
 *   `…/a.jar␍␊␠…/b.jar` reads back as `…/a.jar…/b.jar`, one entry that exists
 *   nowhere. The fold therefore takes the separator into the *previous* line, which
 *   is why the budget below is 71/70 rather than 72/71.
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { RunSubprocess } from './datasource-probe.ts'
import { ArthasError } from './arthas-errors.ts'
import { ARTHAS_HTTP_PORT, execArthas, failureText } from './arthas-http.ts'
import { readClassLocation, scCommand } from './arthas-targets.ts'
import { defaultArthasWorkDir } from './arthas-store.ts'
import { fileURLToPath } from 'node:url'
import type {
  ReplayDiff, ReplayDiffLine, ReplayDump, ReplayEnvironment, ReplayRun,
} from '../shared/types.ts'

export type { ReplayDiff, ReplayDiffLine, ReplayDump, ReplayEnvironment, ReplayRun }

/** Where the pre-compiled offline runner lives in this package. */
const REPLAY_CLASS = fileURLToPath(new URL('../../resources/replay/Replay.class', import.meta.url))

/** The class name the runner is compiled under; it has no package. */
const REPLAY_MAIN = 'Replay'

/** How long one `classloader -c` may take; it answers with 600 KB of JSON. */
const CLASSPATH_TIMEOUT_MS = 120_000

/** How long `jar` is given to build the classpath jar. */
const JAR_TIMEOUT_MS = 120_000

/**
 * How long one replay may take.
 *
 * Generous, because the offline code under test is real business logic and may do
 * real work. It is a hang-catcher, not a performance budget.
 */
const RUN_TIMEOUT_MS = 180_000

/** What the host gives this service that it cannot reach itself. */
export interface ReplayServiceDeps {
  /** `ufjdk/bin` candidates, best first — `java` and `jar` come from one of them. */
  readonly jdkBins: () => Promise<readonly string[]>
  readonly subprocess: () => RunSubprocess | undefined
}

/** The service, as the tools and the HTTP routes use it. */
export interface YonReplayService {
  /** Where captures and results live, for a screen that has to name it. */
  readonly workDir: string
  prepare(input: { pid: number; className: string; port?: number; signal?: AbortSignal }): Promise<ReplayEnvironment>
  environments(): Promise<readonly ReplayEnvironment[]>
  dumps(): Promise<readonly ReplayDump[]>
  runs(): Promise<readonly ReplayRun[]>
  read(runId: string): Promise<ReplayRun>
  run(input: {
    env: string
    dump: string
    className: string
    methodName: string
    signal?: AbortSignal
  }): Promise<ReplayRun>
  diff(leftId: string, rightId: string): Promise<ReplayDiff>
}

/**
 * Split one manifest attribute value into lines that satisfy the 72-byte rule.
 *
 * Exported for its own test: this is the part that fails silently. A manifest that
 * violates either rule still gets written, still produces a jar, and still fails
 * later with a `ClassNotFoundException` that names a class that is plainly on disk.
 *
 * @param value - the whole attribute line, `Class-Path: …` included.
 * @returns the lines, continuations already prefixed with their space.
 */
export function manifestLines(value: string): string[] {
  const lines: string[] = []
  let text = value
  let first = true
  while (text.length > 0) {
    // The reservation of one byte is what lets the next branch take a separator
    // space without pushing the line over the limit.
    const limit = first ? 71 : 70
    let take = 0
    let width = 0
    while (take < text.length) {
      const size = Buffer.byteLength(text[take] ?? '', 'utf8')
      if (width + size > limit) break
      width += size
      take += 1
    }
    if (take === 0) take = 1
    // A fold landing on the separator space would have that space eaten by the
    // continuation marker, welding two entries together. Take it into this line.
    if (take < text.length && text[take] === ' ' && width + 1 <= 72) take += 1
    lines.push((first ? '' : ' ') + text.slice(0, take))
    text = text.slice(take)
    first = false
  }
  return lines
}

/** The id an environment is known by. */
function envIdOf(hash: string): string {
  return `cp-${hash}`
}

/** Read the `# cost=…` header a replay writes. */
function costOf(output: string): number | undefined {
  const found = /^# cost=(\d+)ms$/m.exec(output)
  const raw = found?.[1]
  return raw === undefined ? undefined : Number(raw)
}

/** A path that is safe as a file name. */
function safeName(text: string): string {
  return text.replace(/[^A-Za-z0-9_.-]/g, '_')
}

/**
 * Build the service.
 * @param deps - the JDK candidates and the subprocess service.
 * @returns the service.
 */
export function createYonReplayService(deps: ReplayServiceDeps): YonReplayService {
  const workDir = join(defaultArthasWorkDir(), '..', 'replay')
  const dumpDir = join(defaultArthasWorkDir(), 'dump')
  const outDir = join(defaultArthasWorkDir(), 'out')

  /** A JDK `bin` directory, or a refusal that says what is missing. */
  const jdkBin = async (): Promise<string> => {
    for (const candidate of await deps.jdkBins()) {
      const found = await stat(join(candidate, process.platform === 'win32' ? 'java.exe' : 'java'))
        .then(one => one.isFile(), () => false)
      if (found) return candidate
    }
    throw new ArthasError(
      'unavailable',
      '找不到 JDK。回放要跑真实的 java 进程，所以需要一个带 java/jar 的 JDK —— '
      + '先登记一个 NCC Home，它的 ufjdk/bin 会被自动使用。',
    )
  }

  const needSubprocess = (): RunSubprocess => {
    const subprocess = deps.subprocess()
    if (subprocess === undefined) {
      throw new ArthasError('unavailable', '这个部署没有 subprocess 服务，无法启动 java 或 jar。')
    }
    return subprocess
  }

  /** Run one process to completion and hand back its output. */
  const runProcess = async (
    argv: readonly string[],
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> => {
    const subprocess = needSubprocess()
    const handle = subprocess.spawn({
      argv,
      cwd: workDir,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 8 * 1024 * 1024 },
        stderr: { maxBytes: 8 * 1024 * 1024 },
      },
      graceMs: 3_000,
      ...signal === undefined ? {} : { signal },
    })
    const timer = setTimeout(() => { handle.terminate() }, timeoutMs)
    try {
      const outcome = await handle.done
      return {
        code: outcome.exitCode,
        stdout: handle.collected.stdout?.readFrom(0).text ?? '',
        stderr: handle.collected.stderr?.readFrom(0).text ?? '',
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** The classpath entries a loader holds, asked of the JVM. */
  const classpathOf = async (port: number, hash: string, signal?: AbortSignal): Promise<readonly string[]> => {
    const response = await execArthas({
      port,
      command: `classloader -c ${hash}`,
      timeoutMs: CLASSPATH_TIMEOUT_MS,
      ...signal === undefined ? {} : { signal },
    })
    const failure = failureText(response)
    if (failure !== undefined) throw new ArthasError('command-failed', `取 classpath 失败：${failure}`)
    for (const result of response.results) {
      const urls = result.urls
      if (Array.isArray(urls)) {
        return urls.filter((one): one is string => typeof one === 'string' && one !== '')
      }
    }
    throw new ArthasError(
      'bad-response',
      `classloader -c ${hash} 没有给出 URL 列表。这个加载器可能不持有任何路径。`,
    )
  }

  const environmentOf = async (id: string): Promise<ReplayEnvironment> => {
    const dir = join(workDir, id)
    const meta = await readFile(join(dir, 'env.json'), 'utf8').catch(() => undefined)
    if (meta === undefined) {
      throw new ArthasError('not-found', `没有这个回放环境：${id}。先跑 replay_prepare 建一个。`)
    }
    return JSON.parse(meta) as ReplayEnvironment
  }

  const readOut = async (path: string): Promise<string> => await readFile(path, 'utf8').catch(() => '')

  /** Every `.ser` a capture left behind. */
  const dumpList = async (): Promise<readonly ReplayDump[]> => {
    const entries = await readdir(dumpDir, { withFileTypes: true }).catch(() => [])
    const dumps: ReplayDump[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ser')) continue
      const path = join(dumpDir, entry.name)
      const info = await stat(path).catch(() => undefined)
      if (info === undefined) continue
      // The sidecar `arthas_capture` writes beside it, when there is one. Its absence
      // is normal (an older capture, or a file dropped in by hand) and is not an
      // error: the dump is still replayable, it just has to be named by hand.
      const sidecar = await readFile(`${path}.json`, 'utf8').catch(() => undefined)
      let origin: ReplayDump['origin']
      if (sidecar !== undefined) {
        try {
          const fields = JSON.parse(sidecar) as Record<string, unknown>
          if (typeof fields.className === 'string' && typeof fields.methodName === 'string') {
            origin = {
              className: fields.className,
              methodName: fields.methodName,
              expression: typeof fields.expression === 'string' ? fields.expression : '',
              accessPoint: typeof fields.accessPoint === 'string' ? fields.accessPoint : '',
              pid: typeof fields.pid === 'number' ? fields.pid : 0,
            }
          }
        } catch {
          // A corrupt sidecar costs the one-click replay, not the dump.
        }
      }
      dumps.push({
        name: entry.name,
        path,
        bytes: info.size,
        at: info.mtimeMs,
        ...origin === undefined ? {} : { origin },
      })
    }
    // Newest first: the one just captured is the one being replayed.
    return dumps.sort((left, right) => right.at - left.at)
  }

  /** Parse one result file's name back into its parts. */
  const runFromPath = async (name: string): Promise<ReplayRun | undefined> => {
    // `<dump>__<class>__<method>__<epoch>.txt`
    const parts = name.replace(/\.txt$/, '').split('__')
    if (parts.length !== 4) return undefined
    const [dump, className, methodName, stamp] = parts
    if (dump === undefined || className === undefined || methodName === undefined || stamp === undefined) return undefined
    const outPath = join(outDir, name)
    const info = await stat(outPath).catch(() => undefined)
    if (info === undefined) return undefined
    const output = await readOut(outPath)
    return {
      id: name,
      dump,
      className,
      methodName,
      outPath,
      // A result whose body is a failure message is not a success, and the file is
      // the only place that is recorded — the exit code was the process's.
      ok: !output.startsWith('REPLAY_FAIL'),
      ...costOf(output) === undefined ? {} : { costMs: costOf(output) as number },
      at: info.mtimeMs,
      output,
    }
  }

  const runList = async (): Promise<readonly ReplayRun[]> => {
    const entries = await readdir(outDir, { withFileTypes: true }).catch(() => [])
    const runs: ReplayRun[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.txt')) continue
      const run = await runFromPath(entry.name)
      if (run !== undefined) runs.push(run)
    }
    return runs.sort((left, right) => right.at - left.at)
  }

  /**
   * One run by id, or a refusal.
   *
   * A free function rather than a method called through `this`, because the service
   * is handed around as an object and destructuring it (`const { diff } = service`)
   * is a perfectly ordinary thing for a caller to do — and would silently break a
   * `this`-bound call.
   */
  const readRun = async (runId: string): Promise<ReplayRun> => {
    const run = await runFromPath(runId)
    if (run === undefined) throw new ArthasError('not-found', `没有这次回放记录：${runId}。`)
    return run
  }

  return {
    workDir,

    async prepare({ pid, className, port = ARTHAS_HTTP_PORT, signal }): Promise<ReplayEnvironment> {
      const bin = await jdkBin()
      await mkdir(workDir, { recursive: true })

      // The hash has to come from the running JVM: it is what identifies the loader
      // whose URLs we are about to copy, and it differs per process.
      const sc = await execArthas({
        port,
        command: scCommand(className, true),
        timeoutMs: 30_000,
        ...signal === undefined ? {} : { signal },
      })
      const location = readClassLocation(sc.results, className)
      if (location.hash === undefined) {
        throw new ArthasError(
          'not-found',
          `PID ${pid} 的任何加载器都加载不到 ${className}，所以取不到它的 classpath。先确认类名与 PID。`,
        )
      }
      const hash = location.hash
      const urls = await classpathOf(port, hash, signal)
      if (urls.length === 0) {
        throw new ArthasError('failed', `${className} 的加载器不持有任何 classpath 条目。`)
      }

      const id = envIdOf(hash)
      const dir = join(workDir, id)
      const empty = join(dir, 'empty')
      await mkdir(empty, { recursive: true })

      const manifestPath = join(dir, 'manifest.mf')
      const lines = manifestLines(`Class-Path: ${urls.join(' ')}`)
      const manifest = ['Manifest-Version: 1.0', 'Created-By: yon-panel replay', ...lines, ''].join('\r\n')
      await writeFile(manifestPath, manifest, 'utf8')

      const jarPath = join(dir, 'cp.jar')
      await rm(jarPath, { force: true })
      const built = await runProcess(
        [join(bin, process.platform === 'win32' ? 'jar.exe' : 'jar'),
          'cfm', jarPath, manifestPath, '-C', empty, '.'],
        JAR_TIMEOUT_MS,
        signal,
      )
      if (built.code !== 0) {
        throw new ArthasError('failed', `jar 生成 classpath jar 失败（出口码 ${String(built.code)}）：${built.stderr.trim()}`)
      }

      // The runner ships compiled, for the same reason the capture helper did not:
      // compiling it here would mean requiring a JDK on the machine that matches the
      // target's — while the class is already the right shape (measured major 52).
      await copyFile(REPLAY_CLASS, join(dir, `${REPLAY_MAIN}.class`))

      const info = await stat(jarPath)
      const environment: ReplayEnvironment = {
        id,
        className,
        hash,
        jarPath,
        jarBytes: info.size,
        entries: urls.length,
        dir,
        builtAt: Date.now(),
      }
      await writeFile(join(dir, 'env.json'), `${JSON.stringify(environment, null, 2)}\n`, 'utf8')
      return environment
    },

    async environments(): Promise<readonly ReplayEnvironment[]> {
      const entries = await readdir(workDir, { withFileTypes: true }).catch(() => [])
      const found: ReplayEnvironment[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const meta = await readFile(join(workDir, entry.name, 'env.json'), 'utf8').catch(() => undefined)
        if (meta === undefined) continue
        try {
          found.push(JSON.parse(meta) as ReplayEnvironment)
        } catch {
          // A half-written environment is skipped rather than failing the listing:
          // the panel is the place someone notices it, not the place it breaks.
        }
      }
      return found.sort((left, right) => right.builtAt - left.builtAt)
    },

    dumps: dumpList,
    runs: runList,

    async read(runId: string): Promise<ReplayRun> {
      return await readRun(runId)
    },

    async run({ env, dump, className, methodName, signal }): Promise<ReplayRun> {
      const environment = await environmentOf(env)
      const bin = await jdkBin()
      await mkdir(outDir, { recursive: true })

      // `dump` may be a name or a path; a name is resolved against the capture
      // directory so a caller never has to type the plugin's own layout.
      const dumpPath = dump.includes('/') || dump.includes('\\') ? dump : join(dumpDir, dump)
      const dumpInfo = await stat(dumpPath).catch(() => undefined)
      if (dumpInfo === undefined) {
        throw new ArthasError('not-found', `找不到这个现场文件：${dumpPath}。用 replay_list 看有哪些。`)
      }

      const dumpName = basename(dumpPath)
      const outName = `${safeName(dumpName.replace(/\.ser$/, ''))}__${safeName(className)}__${safeName(methodName)}__${Date.now()}.txt`
      const outPath = join(outDir, outName)

      const java = join(bin, process.platform === 'win32' ? 'java.exe' : 'java')
      // The environment directory comes first so `Replay` itself is found; the jar
      // second, and its manifest does the rest.
      const outcome = await runProcess(
        [java, '-cp', `${environment.dir}${process.platform === 'win32' ? ';' : ':'}${environment.jarPath}`,
          REPLAY_MAIN, dumpPath, className, methodName, outPath],
        RUN_TIMEOUT_MS,
        signal,
      )

      const produced = await readOut(outPath)
      if (produced === '') {
        // No file means the runner died before it could write one. That is the one
        // failure the file itself cannot carry, so it goes into the file here.
        await writeFile(
          outPath,
          `REPLAY_FAIL exit=${String(outcome.code)}\n${outcome.stdout}\n${outcome.stderr}\n`,
          'utf8',
        )
      }
      const run = await runFromPath(outName)
      if (run === undefined) throw new ArthasError('failed', `回放没有产出结果文件：${outName}`)
      return run
    },

    async diff(leftId, rightId): Promise<ReplayDiff> {
      const left = await readRun(leftId)
      const right = await readRun(rightId)
      const ignored: string[] = []
      /** The lines that count: the per-run cost header is not a result. */
      const meaningful = (run: ReplayRun): string[] => run.output.split('\n').filter(line => {
        if (line.startsWith('# cost=')) { ignored.push(line); return false }
        return true
      })
      const a = meaningful(left)
      const b = meaningful(right)
      const rows: ReplayDiffLine[] = []
      const height = Math.max(a.length, b.length)
      let changed = 0
      for (let index = 0; index < height; index += 1) {
        const one = a[index]
        const two = b[index]
        if (one === two) {
          rows.push({ kind: 'same', text: one ?? '' })
          continue
        }
        changed += 1
        if (one !== undefined) rows.push({ kind: 'left', text: one })
        if (two !== undefined) rows.push({ kind: 'right', text: two })
      }
      return { left, right, lines: rows, changed, ignored: [...new Set(ignored)] }
    },
  }
}
