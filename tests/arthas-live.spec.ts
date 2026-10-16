/**
 * Live end-to-end check of the arthas tools, against an NCC running on this machine.
 *
 * ## Why this spec is unlike every other one here
 *
 * Every other file in `tests/` is self-contained: it injects a stand-in and never
 * touches the operator's machine. This one cannot be, because everything worth
 * checking about this feature **is** the conversation with a real JVM — that a
 * response's shape is what it is, that a class injected into the project's own
 * loader is *invisible* to a watch expression, that a `reset` loop really does
 * reach zero. A stand-in would have to be written from the same assumptions, and
 * the assumptions are precisely what turned out to be wrong:
 * `state: "SUCCEEDED"` does not mean the command worked, `reset` reports
 * `affect.classCount` and not `effect.classCount`, and the whole helper-class
 * approach to capture cannot work at all. None of those would have been caught by
 * a fake.
 *
 * So it runs only on a machine that actually has a live agent, and skips
 * otherwise. Point `ARTHAS_TEST_JDK` at a JDK `bin` directory containing `jps` if
 * the default does not exist here.
 *
 * ## It has side effects, deliberately
 *
 * One small file per run under `~/.dsh/yon-panel/arthas/work/dump/`, and one
 * `watch` on a business class that is reset again before the run ends. Both are
 * exactly what the feature does when a person uses it; the dump files are removed
 * in `afterAll`.
 */
import { spawn } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { execArthas, classCountOf, commandSucceeded, statusOf } from '../src/host/arthas-http.ts'
import {
  agentPid, listJavaProcesses, readClassLocation, resolveJps, scCommand, toTargets,
} from '../src/host/arthas-targets.ts'
import { isAgentListening } from '../src/host/arthas-http.ts'
import type { RunHandle, RunSpawnSpec, RunSubprocess } from '../src/host/datasource-probe.ts'

/** The JDK whose `jps` can see the target JVM. */
const JDK_BIN = process.env.ARTHAS_TEST_JDK
  ?? 'E:\\NCProject\\NCC1909\\shouchuang\\home\\ncc1909new\\ufjdk\\bin'

/** The class the observation steps run against. */
const SUBJECT = 'nc.impl.epmp.bgr.BgrReportSyncServiceImpl'

/** Where captured objects land. */
const DUMP_DIR = 'C:/Users/99558/.dsh/yon-panel/arthas/work/dump'

/** The harness's subprocess service, in the smallest form these modules use. */
function makeSubprocess(): RunSubprocess {
  return {
    async resolveExecutable(command: string): Promise<string> {
      return command
    },
    spawn(spec: RunSpawnSpec): RunHandle {
      const file = spec.argv[0]
      if (file === undefined) throw new Error('argv[0] missing')
      const child = spawn(file, spec.argv.slice(1), { windowsHide: true })
      const out: Buffer[] = []
      const err: Buffer[] = []
      child.stdout?.on('data', (chunk: Buffer) => out.push(chunk))
      child.stderr?.on('data', (chunk: Buffer) => err.push(chunk))
      const done = new Promise<{ exitCode: number | null; signal: string | null }>(resolve => {
        child.on('close', (code, signal) => resolve({ exitCode: code, signal }))
      })
      return {
        done,
        collected: {
          stdout: { readFrom: () => ({ text: Buffer.concat(out).toString('utf8') }) },
          stderr: { readFrom: () => ({ text: Buffer.concat(err).toString('utf8') }) },
        },
        terminate: () => { child.kill() },
      }
    },
  }
}

const subprocess = makeSubprocess()
const jpsExists = existsSync(join(JDK_BIN, process.platform === 'win32' ? 'jps.exe' : 'jps'))
const agentUp = jpsExists && await isAgentListening(8563)

/** The dump files this run produced, removed again afterwards. */
const produced: string[] = []

afterAll(async () => {
  for (const path of produced) await rm(path, { force: true }).catch(() => undefined)
})

const live = agentUp ? describe : describe.skip

live('arthas live (needs a running NCC with an agent attached)', () => {
  /** The first JVM carrying an NCC Home, whatever its PID happens to be today. */
  const findTarget = async (): Promise<{ pid: number; home: string } | undefined> => {
    const jps = await resolveJps(subprocess, JDK_BIN)
    for (const candidate of await listJavaProcesses(subprocess, jps)) {
      if (candidate.home !== undefined) return { pid: candidate.pid, home: candidate.home }
    }
    return undefined
  }

  it('lists JVMs and recognises the NCC process by its Home argument', async () => {
    const target = await findTarget()
    expect(target, 'no JVM with -Dnc.server.location= was found').toBeDefined()
    expect(target?.home.toLowerCase()).toContain('ncc')
  })

  it('marks only the PID the agent actually runs inside', async () => {
    const target = await findTarget()
    expect(target).toBeDefined()
    const jps = await resolveJps(subprocess, JDK_BIN)
    const processes = await listJavaProcesses(subprocess, jps)
    // Asked of the agent rather than inferred from the port. The port is global —
    // an agent serves it from inside one JVM — so probing it once per process is
    // what made Eclipse and two language servers come back as "attached".
    const holder = await agentPid(8563)
    expect(holder, 'an agent answered the port but would not name its PID').toBeDefined()

    const targets = toTargets(processes, holder)
    const mine = targets.find(one => one.pid === target?.pid)
    expect(mine?.kind).toBe('ncc')
    expect(mine?.attached).toBe(true)
    // And nothing else may claim it.
    for (const other of targets) {
      if (other.pid !== holder) expect(other.attached, `PID ${other.pid} claimed the agent`).toBe(false)
    }
  })

  it('reads the classloader hash out of the structured sc response', async () => {
    const target = await findTarget()
    expect(target).toBeDefined()
    const response = await execArthas({ port: 8563, command: scCommand(SUBJECT), timeoutMs: 20_000 })
    // The command worked, and the way to know that is statusCode, not `state`.
    expect(commandSucceeded(response)).toBe(true)
    expect(statusOf(response)?.statusCode).toBe(0)

    const location = readClassLocation(response.results, SUBJECT)
    expect(location.hash).toBeTruthy()
    // The leading slash of a file-URL path must be gone by now.
    expect(location.codeSource?.startsWith('/')).toBe(false)
  })

  it('reports a readable classCount from reset', async () => {
    const target = await findTarget()
    expect(target).toBeDefined()
    const response = await execArthas({ port: 8563, command: `reset ${SUBJECT}`, timeoutMs: 15_000 })
    // The measured shape is `reset.affect.classCount`. Reading `effect.classCount`
    // instead returns undefined, which a cleanup loop would mistake for "clean".
    expect(typeof classCountOf(response)).toBe('number')
  })

  it('captures a live object with a plain java.io watch expression', async () => {
    const target = await findTarget()
    expect(target).toBeDefined()
    const sc = await execArthas({ port: 8563, command: scCommand(SUBJECT), timeoutMs: 20_000 })
    const location = readClassLocation(sc.results, SUBJECT)
    expect(location.hash).toBeTruthy()

    // The expression `arthas_capture` composes, run for real. Note what is **not**
    // here: a helper class. A watch expression is evaluated by OGNL through the
    // *system* classloader, and the loader holding this project's `bin/` is its
    // child — a parent cannot see a child's classes. Every earlier version of this
    // test injected a helper and every such call died with a NullPointerException
    // (the static reference resolves to null, then calling a method on it NPEs).
    // `java.io` needs no injection and is visible from anywhere.
    const file = `${DUMP_DIR}/live_${Date.now()}.ser`
    produced.push(file)
    const expression = [
      `{(#d=new java.io.File("${DUMP_DIR}"),`,
      '#d.mkdirs(),',
      `#f=new java.io.FileOutputStream("${file}"),`,
      '#o=new java.io.ObjectOutputStream(#f),',
      '#o.writeObject(returnObj),',
      '#o.flush(),',
      '#o.close(),',
      `"DUMP_OK ${file}"`,
      ')}',
    ].join('')
    const watch = `watch ${SUBJECT} now '${expression}' -n 1 --timeout 30`

    // Started and **not** awaited: the HTTP request stays open until the watch
    // fires, and that open request is the whole async design. `--timeout` is what
    // keeps a miss from hanging the test for ever.
    const pending = execArthas({ port: 8563, command: watch, timeoutMs: 45_000 })
    await new Promise(resolve => setTimeout(resolve, 2_000))

    // Nothing else drives this JVM, so the watched method is called through `ognl`
    // — which is also the one path that needs `-c`, and the reason `arthas_sc`
    // exists as a tool of its own.
    await execArthas({
      port: 8563,
      command: `ognl -c ${location.hash} 'new ${SUBJECT}().now()'`,
      timeoutMs: 20_000,
    })

    const response = await pending
    const said = response.results.map(entry => String(entry.value ?? '')).join('\n')
    expect(said, `the watch said: ${said}`).toContain('DUMP_OK')
    const written = await stat(file).then(one => one, () => undefined)
    expect(written?.isFile(), `no file at ${file}`).toBe(true)
    expect(written?.size ?? 0).toBeGreaterThan(0)

    // Leave the class as it was found: an enhancement outlives the command.
    await execArthas({ port: 8563, command: `reset ${SUBJECT}`, timeoutMs: 15_000 })
  })
})
