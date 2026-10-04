/**
 * The panel's rules, over real documents and a machine that is not there.
 *
 * The two stores are the real ones, writing into a directory this spec made, because the
 * read-modify-write cycles are half of what is being checked — a launch that reports a run
 * and does not write the ledger row would be a browser nothing can stop. Everything that
 * would touch the machine is a fake: no spawn, no `netstat`, no port. The fakes are plain
 * mutable state rather than a mocking library, so a case reads as "the port is answering
 * with this token" instead of as a call-recording.
 *
 * Four properties are the point of this file, each one a thing the service could plausibly
 * get wrong and none of them visible from the outside:
 *
 * 1. **Scanning happens once.** `list()` auto-scans only while the document has no
 *    `scannedAt`, and writes one when it does. That field is the whole of "不用每次都查目录".
 * 2. **A scan merges, never replaces.** A registered browser the scan did not find keeps
 *    its row, its port, its address and its profile directory — the logins in there are the
 *    one thing here that cannot be recreated.
 * 3. **A launch's three outcomes stay three.** Ready, alive-but-slow (a 201 with a note),
 *    and exited-during-the-window (a refusal naming the exit code and the log tail). The
 *    middle one is the one a simpler version reports as a failure.
 * 4. **A stop identifies before it ends anything.** Chromium's token is compared before a
 *    kill, the pid that gets ended is the one *currently holding the port* rather than the
 *    one in the ledger, and a mismatch ends nothing at all.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_BROWSER_PORT,
  type BrowserFamily,
  type SaveBrowserInput,
} from '../src/shared/types.ts'
import type { ScannedBrowser, ScanOutcome } from '../src/host/browser-scan.ts'
import {
  LOG_TAIL_LINES,
  type LaunchRequest,
  type LaunchOutcome,
  type LaunchedProcess,
  type PortOwner,
  type ProbeOutcome,
  type SystemPorts,
} from '../src/host/browser-system.ts'
import {
  createBrowserConfigStore,
  createBrowserRunStore,
  type StoredBrowser,
  type StoredRun,
} from '../src/host/browser-store.ts'
import {
  BrowserError,
  createYonBrowsersService,
  type BrowserDeps,
  type YonBrowsersService,
} from '../src/host/browser-service.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** The plugin root every expected profile path is built from. */
const ROOT = 'E:/plugin'
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const CHROME_PROFILE = `${ROOT}/.browser-profile/chrome`
const TOKEN = 'ws://127.0.0.1:9222/devtools/browser/6a1f-2c'

/** The clock, and the moment a recorded run is stamped with by default. */
const NOW = new Date('2026-10-04T10:00:00.000Z')

/** Two browsers, shaped the way a scan leaves them. */
const CHROME: ScannedBrowser = {
  id: 'chrome', family: 'chromium', product: 'Google Chrome', path: CHROME_PATH,
}
const EDGE: ScannedBrowser = {
  id: 'edge', family: 'chromium', product: 'Microsoft Edge',
  path: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
}

/** Take the next answer, keeping the last one for every call after that. */
function take<T>(queue: T[]): T {
  const value = queue.length > 1 ? queue.shift() : queue[0]
  if (value === undefined) throw new Error('the fake machine was asked more than it was told')
  return value
}

/** One registration, with everything a case does not care about defaulted. */
function browserRow(over: Partial<StoredBrowser> = {}): StoredBrowser {
  return {
    id: 'chrome',
    family: 'chromium',
    product: 'Google Chrome',
    path: CHROME_PATH,
    // Blank, so the row exercises the default under the plugin root rather than a value
    // typed by a case that is not about profile directories.
    profileDir: '',
    port: DEFAULT_BROWSER_PORT,
    startUrl: '',
    lastFoundAt: NOW.toISOString(),
    ...over,
  }
}

/** One ledger row, shaped the way a successful launch leaves one. */
function runRow(over: Partial<StoredRun> = {}): StoredRun {
  return {
    runId: 'br-1',
    browserId: 'chrome',
    label: 'Google Chrome',
    family: 'chromium',
    pid: 111,
    port: DEFAULT_BROWSER_PORT,
    profileDir: CHROME_PROFILE,
    startedAt: NOW.toISOString(),
    endpoint: `http://127.0.0.1:${String(DEFAULT_BROWSER_PORT)}/json/version`,
    ready: true,
    debuggerUrl: TOKEN,
    ...over,
  }
}

/** The fake machine, with every answer a case may want to change. */
interface Machine extends SystemPorts {
  hostRoot: string
  /** Paths that exist. */
  files: Set<string>
  clock: Date
  /** What a scan answers. */
  scanAnswer: ScanOutcome
  scans: number
  /** Answers, in order; the last one repeats. */
  probeAnswers: ProbeOutcome[]
  readyAnswers: ProbeOutcome[]
  /**
   * Make `waitReady` never answer.
   *
   * The real one polls a port for eight seconds, so a browser that dies immediately loses
   * the race in production without anyone having to arrange it. Both fake answers settle
   * in the same microtask here, which would hand the race to whichever was registered
   * first — so a case about an early exit has to take the probe out of the running.
   */
  readyNeverSettles: boolean
  silentAnswers: boolean[]
  probeCalls: { family: BrowserFamily; port: number; timeoutMs: number }[]
  readyCalls: { family: BrowserFamily; port: number; timeoutMs: number }[]
  silentCalls: { family: BrowserFamily; port: number; timeoutMs: number }[]
  /** What currently holds a port, as `netstat` would answer. */
  owners: Map<number, PortOwner>
  ownerCalls: number[]
  killed: number[]
  closes: string[]
  closeAnswer: boolean
  debuggerAvailable: boolean
  /** The launch, when a case wants one other than the default success. */
  launchAnswer?: LaunchOutcome
  releases: number
  launches: LaunchRequest[]
  logTail: string
  withMissingExe: boolean
}

/** Build a machine whose every answer is the boring one. */
function makeMachine(): Machine {
  const machine: Machine = {
    hostRoot: ROOT,
    files: new Set<string>([CHROME_PATH, EDGE.path]),
    clock: NOW,
    scanAnswer: { supported: true, browsers: [CHROME, EDGE] },
    scans: 0,
    probeAnswers: [{ state: 'absent' }],
    readyAnswers: [{ state: 'ready', debuggerUrl: TOKEN }],
    readyNeverSettles: false,
    silentAnswers: [true],
    probeCalls: [],
    readyCalls: [],
    silentCalls: [],
    owners: new Map<number, PortOwner>(),
    ownerCalls: [],
    killed: [],
    closes: [],
    closeAnswer: true,
    debuggerAvailable: true,
    releases: 0,
    launches: [],
    logTail: 'DevTools listening on ws://127.0.0.1:9222/devtools/browser/6a1f-2c',
    withMissingExe: false,
    now: () => machine.clock,

    async scan(): Promise<ScanOutcome> {
      machine.scans += 1
      return machine.scanAnswer
    },

    launcher: {
      async launch(request: LaunchRequest): Promise<LaunchOutcome> {
        machine.launches.push(request)
        if (machine.withMissingExe) {
          return { ok: false, code: 'spawn-failed', message: `找不到 ${request.executable}。` }
        }
        if (machine.launchAnswer !== undefined) return machine.launchAnswer
        const handle: LaunchedProcess = {
          pid: 4321,
          // Never settles: the happy path is a browser that stays up, and the service's
          // race is against this and the readiness probe.
          exited: new Promise(() => undefined),
          release: () => { machine.releases += 1 },
        }
        return { ok: true, handle }
      },
      async readLogTail(): Promise<string> {
        return machine.logTail
      },
    },

    probe: {
      async probe(request): Promise<ProbeOutcome> {
        machine.probeCalls.push(request)
        return take(machine.probeAnswers)
      },
      async waitReady(request): Promise<ProbeOutcome> {
        machine.readyCalls.push(request)
        if (machine.readyNeverSettles) return await new Promise<ProbeOutcome>(() => undefined)
        return take(machine.readyAnswers)
      },
      async waitSilent(request): Promise<boolean> {
        machine.silentCalls.push(request)
        return take(machine.silentAnswers)
      },
    },

    processes: {
      async owner(port: number): Promise<PortOwner | undefined> {
        machine.ownerCalls.push(port)
        return machine.owners.get(port)
      },
      async kill(pid: number): Promise<void> {
        machine.killed.push(pid)
      },
    },

    debugger: {
      available: true,
      async close(debuggerUrl: string): Promise<boolean> {
        machine.closes.push(debuggerUrl)
        return machine.closeAnswer
      },
    },
  }
  // `available` is read off the port object at call time, so a case can only change it if
  // the object's own getter is the one being replaced.
  Object.defineProperty(machine.debugger, 'available', {
    get: () => machine.debuggerAvailable,
    enumerable: true,
  })
  return machine
}

/** A service over a machine that is not there, plus the two real documents. */
interface Harness {
  readonly machine: Machine
  readonly service: YonBrowsersService
  readonly dir: string
  readonly configPath: string
  readonly runsPath: string
  register(rows: readonly StoredBrowser[], scannedAt?: string): Promise<void>
  runs(rows: readonly StoredRun[]): Promise<void>
  storedConfig(): Promise<readonly StoredBrowser[]>
  storedRuns(): Promise<readonly StoredRun[]>
}

/** Build one harness. The `configure` callback runs before the service is created. */
async function harness(configure: (machine: Machine) => void = () => undefined): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-browser-service-'))
  temporary.push(dir)
  const machine = makeMachine()
  configure(machine)
  const configPath = join(dir, 'browser_config.json')
  const runsPath = join(dir, 'browser_runs.json')
  const config = createBrowserConfigStore(configPath)
  const ledger = createBrowserRunStore(runsPath)
  const deps: BrowserDeps = { ...machine, exists: (path: string) => machine.files.has(path) }
  return {
    machine,
    dir,
    configPath,
    runsPath,
    service: createYonBrowsersService(config, ledger, deps),
    register: async (rows, scannedAt) => { await config.write(rows, scannedAt) },
    runs: async (rows) => { await ledger.write(rows) },
    storedConfig: async () => (await config.read()).rows,
    storedRuns: async () => (await ledger.read()).rows,
  }
}

/** The refusal a call raises, with its code. Fails the case if the call succeeds. */
async function refusal(work: () => Promise<unknown>): Promise<BrowserError> {
  try {
    await work()
  } catch (error) {
    if (error instanceof BrowserError) return error
    throw error
  }
  throw new Error('expected the call to be refused, but it succeeded')
}

/** Run `work` with `process.platform` reporting something else, then put it back. */
async function withPlatform<T>(platform: string, work: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return await work()
  } finally {
    if (original === undefined) Reflect.deleteProperty(process, 'platform')
    else Object.defineProperty(process, 'platform', original)
  }
}

describe('list', () => {
  it('scans once, records when, and never looks at the directories again', async () => {
    const testing = await harness()
    const first = await testing.service.list()
    expect(testing.machine.scans).toBe(1)
    expect(first.browsers.map(browser => browser.id)).toEqual(['chrome', 'edge'])
    expect(first.scannedAt).toBe(NOW.toISOString())
    expect(first.complete).toBe(true)
    expect(first.scanSupported).toBe(true)
    // Stored, not merely reported: the field is what the next call reads instead of
    // enumerating the machine a second time.
    expect((await createBrowserConfigStore(testing.configPath).read()).scannedAt).toBe(NOW.toISOString())

    await testing.service.list()
    await testing.service.list()
    expect(testing.machine.scans).toBe(1)
    // The port is what keeps the panel from offering a start button that always fails.
    expect((await testing.storedConfig()).every(row => row.path.length > 0)).toBe(true)
  })

  it('keeps a browser the scan did not find, and says the path is not there', async () => {
    const testing = await harness(machine => {
      // A second scan that no longer sees Chrome — an uninstalled browser, or one whose
      // registration was never there to begin with.
      machine.scanAnswer = { supported: true, browsers: [EDGE] }
    })
    await testing.register([
      browserRow(),
      browserRow({ id: 'edge', product: 'Microsoft Edge', path: EDGE.path }),
    ], NOW.toISOString())
    testing.machine.files.delete(CHROME_PATH)

    const payload = await testing.service.scan()
    expect(payload.browsers.map(browser => browser.id)).toEqual(['edge', 'chrome'])
    expect(payload.stale).toEqual(['chrome'])
    expect(payload.added).toEqual([])
    const kept = payload.browsers[1]
    expect(kept?.pathExists).toBe(false)
    expect(kept?.stale).toBe(true)
    // Not removed from the document either: the logins in that profile directory are the
    // one thing here that a later scan cannot put back.
    expect((await testing.storedConfig()).map(row => row.id)).toEqual(['edge', 'chrome'])
  })

  it('reports the profile directory a launch will use when the row left it blank', async () => {
    const testing = await harness()
    await testing.register([browserRow({ profileDir: '   ' })], NOW.toISOString())
    const view = (await testing.service.list()).browsers[0]
    // Not blank: the panel is showing what will actually be created, and the log lives
    // inside the same directory.
    expect(view?.profileDir).toBe(CHROME_PROFILE)
    expect(view?.logPath).toBe(`${CHROME_PROFILE}/browser-launch.log`)
  })

  it('refuses to paper over an unreadable document with an empty list', async () => {
    const testing = await harness()
    await writeFile(testing.configPath, '{ not json', 'utf8')
    const payload = await testing.service.list()
    expect(payload.complete).toBe(false)
    expect(payload.error).toContain(testing.configPath)
    expect(payload.browsers).toEqual([])
    // "Nothing registered yet" and "the file is broken" must not look alike, and a broken
    // document is not something to scan on top of.
    expect(testing.machine.scans).toBe(0)
    expect(await readFile(testing.configPath, 'utf8')).toBe('{ not json')
  })

  it('reports a recorded browser as alive, and asks with a timeout that cannot stall the panel', async () => {
    const testing = await harness(machine => { machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }] })
    await testing.register([browserRow()], NOW.toISOString())
    await testing.runs([runRow()])
    const payload = await testing.service.list()
    expect(payload.runs[0]?.alive).toBe('alive')
    expect(payload.runs[0]?.endpoint).toBe(`http://127.0.0.1:9222/json/version`)
    expect(testing.machine.probeCalls[0]?.timeoutMs).toBe(400)
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('clears a ledger row whose port went quiet, without killing anything', async () => {
    const testing = await harness(machine => { machine.probeAnswers = [{ state: 'absent' }] })
    // Older than the startup margin: a run that never opened its port by now is not slow,
    // it is gone.
    await testing.runs([runRow({ startedAt: '2026-10-04T09:00:00.000Z' })])
    const payload = await testing.service.list()
    expect(payload.runs).toEqual([])
    expect(await testing.storedRuns()).toEqual([])
    // Bookkeeping, not an ending: the row is only a record.
    expect(testing.machine.killed).toEqual([])
    expect(testing.machine.closes).toEqual([])
  })

  it('gives a run that has only just started the benefit of the doubt', async () => {
    const testing = await harness(machine => { machine.probeAnswers = [{ state: 'absent' }] })
    await testing.runs([runRow({ startedAt: NOW.toISOString() })])
    const payload = await testing.service.list()
    // Present, because a launch is recorded before its port is confirmed and a slow start
    // looks exactly like this.
    expect(payload.runs[0]?.alive).toBe('unknown')
    expect(payload.runs[0]?.note).toContain('还没起来')
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('calls a probe that could not finish unknown rather than gone', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'unknown', note: '探测超时' }]
    })
    await testing.runs([runRow({ startedAt: '2026-10-04T09:00:00.000Z' })])
    const payload = await testing.service.list()
    // The whole three-state distinction: a timeout is evidence about the probe, and a
    // refused connection is evidence about the port. Only the second means "gone".
    expect(payload.runs[0]?.alive).toBe('unknown')
    expect(payload.runs[0]?.note).toBe('探测超时')
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('says so instead of scanning when the platform is not Windows', async () => {
    const testing = await harness(machine => {
      machine.scanAnswer = { supported: false, browsers: [], note: '自动扫描目前只支持 Windows；当前系统是 darwin。' }
    })
    const payload = await withPlatform('darwin', () => testing.service.list())
    expect(payload.scanSupported).toBe(false)
    expect(payload.note).toContain('darwin')
    expect(payload.platform).toBe('darwin')
    // Nothing was looked at, so nothing was written — not even a scan time, which would
    // permanently convince the panel that a scan had already happened.
    expect(await readFile(testing.configPath, 'utf8').catch(() => '')).toBe('')
  })
})

describe('scan', () => {
  it('keeps what it did not find, after the rows it did', async () => {
    const testing = await harness(machine => {
      machine.scanAnswer = {
        supported: true,
        browsers: [EDGE, { ...CHROME, path: 'D:/chrome/chrome.exe' }],
      }
    })
    await testing.register([
      // Everything the operator chose on this row has to survive a re-scan.
      browserRow({ port: 9333, startUrl: 'http://localhost:3000', profileDir: 'D:/profiles/chrome' }),
      browserRow({ id: 'firefox', family: 'firefox', product: 'Mozilla Firefox', path: 'C:/gone/firefox.exe' }),
    ], NOW.toISOString())

    const payload = await testing.service.scan()
    expect(payload.added).toEqual(['edge'])
    // A moved executable counts as an update: the row the operator had is not the row they
    // have now, even though the id is the same.
    expect(payload.updated).toEqual(['chrome'])
    expect(payload.stale).toEqual(['firefox'])
    expect(payload.browsers.map(browser => browser.id)).toEqual(['edge', 'chrome', 'firefox'])

    const moved = payload.browsers[1]
    expect(moved?.path).toBe('D:/chrome/chrome.exe')
    expect(moved?.port).toBe(9333)
    expect(moved?.startUrl).toBe('http://localhost:3000')
    expect(moved?.profileDir).toBe('D:/profiles/chrome')
  })

  it('gives a newly found browser the default directory and port', async () => {
    const testing = await harness()
    const payload = await testing.service.scan()
    expect(payload.browsers[0]?.profileDir).toBe(CHROME_PROFILE)
    expect(payload.browsers[0]?.port).toBe(DEFAULT_BROWSER_PORT)
    expect(payload.browsers[0]?.lastFoundAt).toBe(NOW.toISOString())
  })

  it('writes nothing when the platform cannot be scanned', async () => {
    const testing = await harness(machine => {
      machine.scanAnswer = { supported: false, browsers: [], note: '只支持 Windows。' }
    })
    // No `lastFoundAt`: a row the operator typed, which no scan has ever confirmed.
    const { lastFoundAt: _stamp, ...handTyped } = browserRow({ path: 'D:/typed/by/hand.exe' })
    await testing.register([handTyped])
    const payload = await testing.service.scan()
    // Marking a hand-typed row stale because a scan could not run would be a claim this
    // call is in no position to make.
    expect(payload.note).toBe('只支持 Windows。')
    expect(payload.stale).toEqual([])
    const stored = await testing.storedConfig()
    expect(stored[0]?.path).toBe('D:/typed/by/hand.exe')
    expect(stored[0]?.lastFoundAt).toBeUndefined()
  })

  it('refuses to scan on top of a document it could not read', async () => {
    const testing = await harness()
    await writeFile(testing.configPath, 'oops', 'utf8')
    const error = await refusal(() => testing.service.scan())
    expect(error.code).toBe('invalid-input')
    // A scan only finds browsers that are still installed, so writing its result over a
    // hand-edited document would delete registrations the operator typed.
    expect(await readFile(testing.configPath, 'utf8')).toBe('oops')
    expect(testing.machine.scans).toBe(0)
  })
})

describe('save', () => {
  it('changes the four fields the panel owns and nothing else', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    const view = await testing.service.save('chrome', {
      port: 9333, startUrl: 'http://localhost:3000', profileDir: 'D:/profiles/chrome',
      // Smuggled through as an HTTP body could: the row must not become a different
      // browser while its profile directory stays where it was.
      id: 'edge', family: 'firefox', product: 'Mozilla Firefox',
    } as unknown as SaveBrowserInput)

    expect(view.id).toBe('chrome')
    expect(view.family).toBe('chromium')
    expect(view.port).toBe(9333)
    expect(view.startUrl).toBe('http://localhost:3000')
    expect(view.profileDir).toBe('D:/profiles/chrome')
    expect(view.lastFoundAt).toBe(NOW.toISOString())
    // The answer carries the stored value, so the panel can show it without a second read.
    expect((await testing.storedConfig())[0]).toEqual({
      ...browserRow(),
      port: 9333,
      startUrl: 'http://localhost:3000',
      profileDir: 'D:/profiles/chrome',
    })
  })

  it('treats a blank directory as "back to the default"', async () => {
    const testing = await harness()
    await testing.register([browserRow({ profileDir: 'D:/profiles/chrome' })], NOW.toISOString())
    expect((await testing.service.save('chrome', { profileDir: '  ' })).profileDir).toBe(CHROME_PROFILE)
  })

  it('names what is registered when the id is not', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.save('edge', { port: 9333 }))
    expect(error.code).toBe('not-found')
    // Naming what is there turns a dead end into the next click.
    expect(error.message).toContain('chrome')
  })

  it('points at the scan when nothing is registered at all', async () => {
    const testing = await harness()
    const error = await refusal(() => testing.service.save('chrome', { port: 9333 }))
    expect(error.code).toBe('not-found')
    expect(error.message).toContain('重新扫描')
  })

  it('refuses a path with nothing on it, without touching the stored row', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.save('chrome', { path: 'D:/nope/chrome.exe' }))
    expect(error.code).toBe('path-missing')
    expect(error.message).toContain('D:/nope/chrome.exe')
    // Left as it was: the operator is mid-edit and may be about to fix it.
    expect((await testing.storedConfig())[0]?.path).toBe(CHROME_PATH)
  })

  it('refuses a blank path with the advice that fits', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.save('chrome', { path: '   ' }))
    expect(error.code).toBe('invalid-input')
    expect(error.message).toContain('重新扫描')
  })

  it('refuses a port outside the range, quoting the default', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    for (const port of [80, 0, 65_536, 9222.5, Number.NaN]) {
      const error = await refusal(() => testing.service.save('chrome', { port }))
      expect(error.code).toBe('port-out-of-range')
    }
    const error = await refusal(() => testing.service.save('chrome', { port: 80 }))
    expect(error.message).toContain('9222')
  })

  it('refuses an address without a scheme instead of opening a search for it', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.save('chrome', { startUrl: 'localhost:3000' }))
    // Parsed as the scheme `localhost`, so handing it on unchanged opens a search — a
    // failure that looks like the input was accepted.
    expect(error.code).toBe('invalid-input')
    expect(error.message).toContain('http://localhost:3000')
    // And the blank that means "the browser's own start page" is not an error.
    expect((await testing.service.save('chrome', { startUrl: '  ' })).startUrl).toBe('')
  })

  it('accepts a port that is busy, because a stored port is a preference', async () => {
    const testing = await harness(machine => {
      machine.owners.set(9333, { pid: 4242, imageName: 'node.exe' })
    })
    await testing.register([browserRow()], NOW.toISOString())
    // What is free now says nothing about what will be free at launch; refusing here would
    // block remembering the port the operator wants.
    expect((await testing.service.save('chrome', { port: 9333 })).port).toBe(9333)
  })

  it('refuses to write over a document it could not read', async () => {
    const testing = await harness()
    await writeFile(testing.configPath, 'broken', 'utf8')
    const error = await refusal(() => testing.service.save('chrome', { port: 9333 }))
    expect(error.code).toBe('invalid-input')
    expect(await readFile(testing.configPath, 'utf8')).toBe('broken')
  })
})

describe('launch', () => {
  it('hands the launcher exactly the switches the browser is started with', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    const run = await testing.service.launch('chrome', {})

    expect(testing.machine.launches[0]).toEqual({
      executable: CHROME_PATH,
      family: 'chromium',
      port: DEFAULT_BROWSER_PORT,
      profileDir: CHROME_PROFILE,
      startUrl: '',
      logPath: `${CHROME_PROFILE}/browser-launch.log`,
    })
    expect(run.ready).toBe(true)
    // `alive`, not `ready`: a browser up with no debugging port is still one the panel has
    // to be able to stop, so the two questions are answered separately.
    expect(run.alive).toBe('alive')
    expect(run.endpoint).toBe('http://127.0.0.1:9222/json/version')
    expect(run.debuggerUrl).toBe(TOKEN)
    expect(run.pid).toBe(4321)
    expect(run.runId).toMatch(/^br-[0-9a-z]+-[0-9a-z]{4}$/)
    expect(run.startedAt).toBe(NOW.toISOString())
    expect(testing.machine.readyCalls[0]?.timeoutMs).toBe(8_000)
    // The child is unobserved from here on: it is the ledger's business now, and a
    // listener left on a detached process is a handle the host does not need.
    expect(testing.machine.releases).toBe(1)
  })

  it('writes both documents, so a later session can stop what this one started', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    await testing.service.launch('chrome', { port: 9333, startUrl: 'http://localhost:3000' })

    // The launch remembers what it was actually given, so a retry starts from there.
    const stored = (await testing.storedConfig())[0]
    expect(stored?.port).toBe(9333)
    expect(stored?.startUrl).toBe('http://localhost:3000')
    expect(stored?.path).toBe(CHROME_PATH)
    const ledger = await testing.storedRuns()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]?.browserId).toBe('chrome')
    expect(ledger[0]?.label).toBe('Google Chrome')
    expect(ledger[0]?.port).toBe(9333)
    expect(ledger[0]?.ready).toBe(true)
    expect(ledger[0]?.debuggerUrl).toBe(TOKEN)
  })

  it('appends to the ledger rather than replacing it', async () => {
    const testing = await harness()
    await testing.register([browserRow()], NOW.toISOString())
    await testing.runs([runRow({ runId: 'br-old', port: 9444 })])
    const run = await testing.service.launch('chrome', {})
    const ledger = await testing.storedRuns()
    expect(ledger.map(row => row.runId)).toEqual(['br-old', run.runId])
  })

  it('calls a slow start a slow start, not a failure', async () => {
    const testing = await harness(machine => {
      machine.readyAnswers = [{ state: 'unknown', note: '连接被拒绝' }]
    })
    await testing.register([browserRow()], NOW.toISOString())
    const run = await testing.service.launch('chrome', {})
    expect(run.ready).toBe(false)
    expect(run.alive).toBe('alive')
    // The message has to say where to look, because the port is the browser's own business
    // and the log is the only thing that can explain it.
    expect(run.note).toContain('8 秒')
    expect(run.note).toContain('连接被拒绝')
    expect(run.note).toContain('4321')
    expect(run.note).toContain(`${CHROME_PROFILE}/browser-launch.log`)
    // Recorded all the same: a browser that is up but not listening must still be stoppable.
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('calls an exit during the window a failure, with the log tail', async () => {
    const testing = await harness(machine => {
      machine.readyNeverSettles = true
      machine.launchAnswer = {
        ok: true,
        handle: {
          pid: 4321,
          exited: Promise.resolve({ exitCode: 21, signal: null }),
          release: () => { machine.releases += 1 },
        },
      }
      machine.logTail = 'Cannot open profile directory'
    })
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.launch('chrome', {}))
    expect(error.code).toBe('launch-failed')
    expect(error.message).toContain('21')
    // The browser's own words, not just an exit code.
    expect(error.message).toContain('Cannot open profile directory')
    expect(await testing.storedRuns()).toEqual([])
    expect(testing.machine.releases).toBe(1)
  })

  it('says what the profile directory cost when it cannot be created', async () => {
    const testing = await harness(machine => {
      machine.launchAnswer = {
        ok: false,
        code: 'profile-unwritable',
        message: `建不出目录 ${CHROME_PROFILE}。`,
      }
    })
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.launch('chrome', {}))
    expect(error.code).toBe('profile-unwritable')
    // Both halves of the trade, spelled out: where else it can go, and what that place
    // costs. Never a bare EACCES, and never a silent fallback either.
    expect(error.message).toContain('browser-profiles')
    expect(error.message).toContain('重装')
  })

  it('passes a spawn failure through as the launch failure it is', async () => {
    const testing = await harness(machine => { machine.withMissingExe = true })
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.launch('chrome', {}))
    expect(error.code).toBe('launch-failed')
    expect(error.message).toContain(CHROME_PATH)
  })

  it('names what holds a busy port instead of starting a browser without a debugger', async () => {
    const testing = await harness(machine => {
      machine.owners.set(9222, { pid: 4242, imageName: 'node.exe' })
    })
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.launch('chrome', {}))
    expect(error.code).toBe('port-in-use')
    expect(error.message).toContain('4242')
    expect(error.message).toContain('node.exe')
    // With the next thing to try, rather than "pick another port".
    expect(error.message).toContain('9223')
    // Nothing was started and nothing was remembered.
    expect(testing.machine.launches).toEqual([])
    expect((await testing.storedConfig())[0]?.port).toBe(DEFAULT_BROWSER_PORT)
  })

  it('refuses a browser whose executable is gone, pointing at the scan', async () => {
    const testing = await harness(machine => { machine.files.delete(CHROME_PATH) })
    await testing.register([browserRow()], NOW.toISOString())
    const error = await refusal(() => testing.service.launch('chrome', {}))
    expect(error.code).toBe('path-missing')
    expect(error.message).toContain('重新扫描')
  })

  it('refuses an unregistered browser', async () => {
    const testing = await harness()
    const error = await refusal(() => testing.service.launch('chrome', {}))
    expect(error.code).toBe('not-found')
  })

  it('does not remember anything from a launch that failed', async () => {
    const testing = await harness(machine => {
      machine.launchAnswer = { ok: false, code: 'spawn-failed', message: '起不来。' }
    })
    await testing.register([browserRow({ port: 9222 })], NOW.toISOString())
    await refusal(() => testing.service.launch('chrome', { port: 9333, startUrl: 'http://localhost:3000' }))
    // A retry starts from the values the operator had, not from the ones that did not work.
    const stored = (await testing.storedConfig())[0]
    expect(stored?.port).toBe(9222)
    expect(stored?.startUrl).toBe('')
  })

  it('starts a Firefox with its own switches and no HTTP endpoint', async () => {
    const testing = await harness(machine => {
      machine.files.add('C:/Program Files/Mozilla Firefox/firefox.exe')
      machine.readyAnswers = [{ state: 'ready' }]
    })
    await testing.register([browserRow({
      id: 'firefox', family: 'firefox', product: 'Mozilla Firefox',
      path: 'C:/Program Files/Mozilla Firefox/firefox.exe',
    })], NOW.toISOString())

    const run = await testing.service.launch('firefox', { startUrl: 'about:blank' })
    expect(testing.machine.launches[0]?.family).toBe('firefox')
    expect(testing.machine.launches[0]?.startUrl).toBe('about:blank')
    // No `/json/version` to ask: a debug Firefox is a TCP listener and nothing more.
    expect(run.endpoint).toBe('tcp://127.0.0.1:9222')
    expect(run.debuggerUrl).toBeUndefined()
    expect(run.ready).toBe(true)
  })
})

describe('stop', () => {
  it('clears a run whose port has already gone quiet', async () => {
    const testing = await harness(machine => { machine.probeAnswers = [{ state: 'absent' }] })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(result).toEqual({
      runId: 'br-1', removed: true, stopped: false, method: 'none',
      note: '这个实例已经不在运行了，已从列表里清掉。',
    })
    expect(await testing.storedRuns()).toEqual([])
  })

  it('ends nothing when the port cannot be identified', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'unknown', note: '探测超时' }]
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(result.stopped).toBe(false)
    expect(result.method).toBe('none')
    expect(result.note).toContain('探测超时')
    // Kept, because it is the only trace of a browser this plugin started and cannot now
    // account for.
    expect(await testing.storedRuns()).toHaveLength(1)
    expect(testing.machine.killed).toEqual([])
  })

  it('ends nothing when the token on the port belongs to another browser', async () => {
    const testing = await harness(machine => {
      machine.closeAnswer = false
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/other' }]
      machine.owners.set(9222, { pid: 222, imageName: 'chrome.exe' })
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    // The token is the browser's own name for the endpoint. A different one means a
    // different browser has the port, and tidying a list is not worth killing a stranger.
    expect(result.note).toContain('令牌对不上')
    expect(result.stopped).toBe(false)
    expect(testing.machine.killed).toEqual([])
    expect(testing.machine.closes).toEqual([])
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('ends nothing when the ledger has no token to compare against', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
    })
    const { debuggerUrl: _token, ...bare } = runRow()
    await testing.runs([bare])
    const result = await testing.service.stop('br-1')
    expect(result.note).toContain('身份令牌')
    expect(result.stopped).toBe(false)
    expect(testing.machine.killed).toEqual([])
  })

  it('asks the browser to close itself, which is the way that keeps its profile intact', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(result).toEqual({ runId: 'br-1', removed: true, stopped: true, method: 'cdp' })
    expect(testing.machine.closes).toEqual([TOKEN])
    // No `/F` needed, so no profile lock is left behind for the next launch to trip over.
    expect(testing.machine.killed).toEqual([])
    expect(await testing.storedRuns()).toEqual([])
  })

  it('ends the process holding the port, not the pid the ledger recorded', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
      // The graceful close is refused, so this is the forceful path.
      machine.closeAnswer = false
      // Deliberately a different pid from the ledger's 111: `spawn` may hand back a stub
      // that passes the request to an existing instance and exits, and pids get recycled.
      machine.owners.set(9222, { pid: 222, imageName: 'chrome.exe' })
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(testing.machine.killed).toEqual([222])
    expect(result.stopped).toBe(true)
    expect(result.method).toBe('taskkill')
    // The cost of this path, said rather than implied.
    expect(result.note).toContain('用户数据目录锁')
  })

  it('never ends a process of another family that happens to hold the port', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
      machine.closeAnswer = false
      machine.owners.set(9222, { pid: 333, imageName: 'node.exe' })
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(result.stopped).toBe(false)
    expect(result.note).toContain('node.exe')
    expect(result.note).toContain('333')
    expect(testing.machine.killed).toEqual([])
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('keeps the record when a killed browser leaves something still answering', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
      machine.closeAnswer = false
      machine.owners.set(9222, { pid: 222, imageName: 'chrome.exe' })
      machine.silentAnswers = [false]
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(testing.machine.killed).toEqual([222])
    expect(result.stopped).toBe(false)
    expect(result.note).toContain('子进程')
    expect(await testing.storedRuns()).toHaveLength(1)
  })

  it('falls back to what the port says when the close was sent but the wait timed out', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
      // The close was accepted, but the port had not gone quiet inside the window.
      machine.silentAnswers = [false]
      // And by now nothing holds the port, so there is nothing left to end.
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(result.removed).toBe(true)
    expect(result.stopped).toBe(true)
    expect(result.method).toBe('cdp')
    expect(testing.machine.killed).toEqual([])
  })

  it('clears a run whose port answered but which nothing holds any more', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready', debuggerUrl: TOKEN }]
      machine.closeAnswer = false
    })
    await testing.runs([runRow()])
    const result = await testing.service.stop('br-1')
    expect(result.removed).toBe(true)
    expect(result.stopped).toBe(false)
    expect(result.note).toContain('端口上没有进程')
  })

  it('ends a Firefox by its image and says how much that proved', async () => {
    const testing = await harness(machine => {
      machine.probeAnswers = [{ state: 'ready' }]
      machine.owners.set(9222, { pid: 222, imageName: 'firefox.exe' })
    })
    const { debuggerUrl: _token, ...bare } = runRow({ family: 'firefox', browserId: 'firefox', label: 'Mozilla Firefox' })
    await testing.runs([bare])
    const result = await testing.service.stop('br-1')

    // Firefox has no identity token to compare, so the graceful path is not available to
    // it at all — even though this runtime has a WebSocket.
    expect(testing.machine.closes).toEqual([])
    expect(testing.machine.killed).toEqual([222])
    expect(result.method).toBe('taskkill')
    // The caveat lands on the path a Firefox stop actually finishes on, and travels
    // alongside the profile-lock warning rather than replacing it.
    expect(result.note).toContain('Firefox')
    expect(result.note).toContain('监听者')
    expect(result.note).toContain('用户数据目录锁')
  })

  it('refuses a run id that is not in the ledger', async () => {
    const testing = await harness()
    const error = await refusal(() => testing.service.stop('br-nope'))
    expect(error.code).toBe('not-found')
    expect(error.message).toContain('br-nope')
  })

  it('refuses to work from a ledger it could not read', async () => {
    const testing = await harness()
    await writeFile(testing.runsPath, 'nope', 'utf8')
    const error = await refusal(() => testing.service.stop('br-1'))
    expect(error.code).toBe('invalid-input')
    expect(await readFile(testing.runsPath, 'utf8')).toBe('nope')
  })
})

describe('the two paths the panel names', () => {
  it('reports them without touching either', async () => {
    const testing = await harness()
    expect(testing.service.configPath).toBe(testing.configPath)
    expect(testing.service.runsPath).toBe(testing.runsPath)
  })
})
