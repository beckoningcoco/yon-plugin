/**
 * The two documents' promises, which are `home-store.ts`'s: a write is atomic, a
 * document that exists but cannot be parsed is reported rather than replaced, and one
 * bad row costs that row rather than the whole file.
 *
 * Two things are checked here that the other stores do not need. The first is that the
 * **two** documents share one mechanism without sharing a file — the config and the
 * ledger have separate paths, separate top-level keys, and a write to one must never
 * touch the other. The second is that `scannedAt` is optional and means something: a
 * registration document with no scan time in it is how "never scanned" is spelled, and
 * if a write ever started emitting the field unconditionally, `list()` would stop
 * scanning a fresh install and the panel would show an empty dropdown forever.
 *
 * The default paths are not exercised for content, only for shape: they are the
 * operator's own files, and a case that wrote them would be editing the machine running
 * the suite.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createBrowserConfigStore,
  createBrowserRunStore,
  defaultBrowserConfigPath,
  defaultBrowserProfileRoot,
  defaultBrowserRunsPath,
  type StoredBrowser,
  type StoredRun,
} from '../src/host/browser-store.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** Make one empty directory for a case. */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-browser-store-'))
  temporary.push(dir)
  return dir
}

/** One registration, shaped the way a scan leaves one. */
const CHROME: StoredBrowser = {
  id: 'chrome',
  family: 'chromium',
  product: 'Google Chrome',
  path: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  profileDir: 'E:/plugin/.browser-profile/chrome',
  port: 9222,
  startUrl: '',
  lastFoundAt: '2026-10-04T00:00:00.000Z',
}

/** One launch, shaped the way a launch leaves one. */
const RUN: StoredRun = {
  runId: 'br-test-1',
  browserId: 'chrome',
  label: 'Google Chrome',
  family: 'chromium',
  pid: 4321,
  port: 9222,
  profileDir: 'E:/plugin/.browser-profile/chrome',
  startedAt: '2026-10-04T00:00:00.000Z',
  endpoint: 'http://127.0.0.1:9222/json/version',
  ready: true,
  debuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/abc',
}

describe('createBrowserConfigStore', () => {
  it('round-trips a registration and its scan time', async () => {
    const path = join(await scratch(), 'nested', 'browser_config.json')
    const store = createBrowserConfigStore(path)
    await store.write([CHROME], '2026-10-04T01:02:03.000Z')
    const read = await store.read()
    expect(read.exists).toBe(true)
    expect(read.path).toBe(path)
    expect(read.rows).toEqual([CHROME])
    expect(read.scannedAt).toBe('2026-10-04T01:02:03.000Z')
    expect(read.skipped).toBe(0)
    expect(read.error).toBeUndefined()
  })

  it('omits the scan time when none is given, which is how "never scanned" is spelled', async () => {
    const path = join(await scratch(), 'browser_config.json')
    await createBrowserConfigStore(path).write([CHROME])
    const read = await createBrowserConfigStore(path).read()
    expect(read.scannedAt).toBeUndefined()
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ browsers: [CHROME] })
  })

  it('answers an absent document with an empty list, not an error', async () => {
    const read = await createBrowserConfigStore(join(await scratch(), 'browser_config.json')).read()
    expect(read.exists).toBe(false)
    expect(read.rows).toEqual([])
    // "Nothing registered yet" and "the file is broken" must not look alike, so only the
    // second carries a message. `read.scannedAt` is what sends the caller off to scan.
    expect(read.error).toBeUndefined()
    expect(read.scannedAt).toBeUndefined()
  })

  it('creates the directory and leaves no temporary sibling behind', async () => {
    const parent = join(await scratch(), 'deep', 'deeper')
    await createBrowserConfigStore(join(parent, 'browser_config.json')).write([CHROME])
    expect(await readdir(parent)).toEqual(['browser_config.json'])
  })

  it('writes parseable JSON that ends in a newline', async () => {
    const path = join(await scratch(), 'browser_config.json')
    await createBrowserConfigStore(path).write([CHROME])
    const text = await readFile(path, 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(JSON.parse(text)).toEqual({ browsers: [CHROME] })
  })

  it('reports an unparseable document instead of overwriting it', async () => {
    const path = join(await scratch(), 'browser_config.json')
    await writeFile(path, '{ not json', 'utf8')
    const read = await createBrowserConfigStore(path).read()
    expect(read.exists).toBe(true)
    expect(read.error).toContain(path)
    expect(read.rows).toEqual([])
    expect(await readFile(path, 'utf8')).toBe('{ not json')
  })

  it('reads a file that a hand-edit left a BOM on', async () => {
    const path = join(await scratch(), 'browser_config.json')
    await writeFile(path, `\uFEFF${JSON.stringify({ browsers: [CHROME] })}`, 'utf8')
    const read = await createBrowserConfigStore(path).read()
    expect(read.error).toBeUndefined()
    expect(read.rows).toEqual([CHROME])
  })

  it('drops a registration with no id or no path, counts it, and keeps the rest', async () => {
    const path = join(await scratch(), 'browser_config.json')
    const edge = { ...CHROME, id: 'edge', product: 'Microsoft Edge' }
    await writeFile(path, JSON.stringify({
      browsers: [CHROME, { path: 'C:/no-id.exe' }, { id: 'no-path' }, 'not an object', edge],
    }), 'utf8')
    const read = await createBrowserConfigStore(path).read()
    expect(read.rows.map(row => row.id)).toEqual(['chrome', 'edge'])
    // Counted rather than merely dropped: a row that disappeared silently is
    // indistinguishable from one that was never there.
    expect(read.skipped).toBe(3)
  })

  it('fills in what a hand-written registration left out', async () => {
    const path = join(await scratch(), 'browser_config.json')
    await writeFile(path, JSON.stringify({
      browsers: [{ id: 'custom', path: 'D:/chrome/chrome.exe' }],
    }), 'utf8')
    const read = await createBrowserConfigStore(path).read()
    const row = read.rows[0]
    // The family decides which switches are used and how readiness is confirmed, so a
    // missing one has to land somewhere; Chromium is the only defensible default.
    expect(row?.family).toBe('chromium')
    expect(row?.product).toBe('')
    expect(row?.profileDir).toBe('')
    expect(row?.port).toBe(9222)
    expect(row?.startUrl).toBe('')
    expect(row).not.toHaveProperty('lastFoundAt')
  })

  it('falls back to the default port for a number a hand-edit truncated', async () => {
    const path = join(await scratch(), 'browser_config.json')
    await writeFile(path, JSON.stringify({
      browsers: [
        { ...CHROME, port: 0 },
        { ...CHROME, id: 'b', port: 70_000 },
        { ...CHROME, id: 'c', port: '9222' },
        { ...CHROME, id: 'd', port: 9223 },
      ],
    }), 'utf8')
    const read = await createBrowserConfigStore(path).read()
    // Out of range falls back rather than rejecting: the browser is still launchable,
    // and the panel is where the operator can see and fix the number.
    expect(read.rows.map(row => row.port)).toEqual([9222, 9222, 9222, 9223])
  })
})

describe('createBrowserRunStore', () => {
  it('round-trips a launch under its own key', async () => {
    const path = join(await scratch(), 'browser_runs.json')
    await createBrowserRunStore(path).write([RUN])
    const read = await createBrowserRunStore(path).read()
    expect(read.rows).toEqual([RUN])
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ runs: [RUN] })
  })

  it('drops a launch with no id, and one whose port is not a port', async () => {
    const path = join(await scratch(), 'browser_runs.json')
    await writeFile(path, JSON.stringify({
      runs: [RUN, { ...RUN, runId: '' }, { ...RUN, runId: 'x', port: 0 }, { ...RUN, runId: 'y', port: '9222' }],
    }), 'utf8')
    const read = await createBrowserRunStore(path).read()
    // Unlike a registration's port, a run's port is what the stop path addresses, so a
    // row without a usable one is a row nothing can be done with.
    expect(read.rows.map(row => row.runId)).toEqual([RUN.runId])
    expect(read.skipped).toBe(3)
  })

  it('keeps a launch that a hand-edit left without a pid or a token', async () => {
    const path = join(await scratch(), 'browser_runs.json')
    const { pid: _pid, debuggerUrl: _url, ...bare } = RUN
    await writeFile(path, JSON.stringify({ runs: [{ ...bare, browserId: 'firefox', family: 'firefox' }] }), 'utf8')
    const read = await createBrowserRunStore(path).read()
    // Both are optional by design: Firefox never has a token, and the pid may be a stub.
    expect(read.rows[0]?.browserId).toBe('firefox')
    expect(read.rows[0]).not.toHaveProperty('pid')
    expect(read.rows[0]).not.toHaveProperty('debuggerUrl')
    expect(read.rows[0]?.ready).toBe(true)
  })

  it('reports its own unparseable document with its own hint', async () => {
    const configPath = join(await scratch(), 'browser_config.json')
    const runsPath = join(await scratch(), 'browser_runs.json')
    await writeFile(runsPath, 'nope', 'utf8')
    expect((await createBrowserRunStore(runsPath).read()).error).toContain(runsPath)
    // The two hints differ because what the operator should do next differs: a ledger can
    // be deleted and rebuilt, a registration cannot be re-derived from anywhere.
    const configHint = (await (async () => {
      await writeFile(configPath, 'nope', 'utf8')
      return await createBrowserConfigStore(configPath).read()
    })()).error ?? ''
    const runHint = (await createBrowserRunStore(runsPath).read()).error ?? ''
    expect(configHint).not.toBe(runHint)
  })

  it('shares no file with the registration document', async () => {
    const dir = await scratch()
    const config = createBrowserConfigStore(join(dir, 'browser_config.json'))
    const runs = createBrowserRunStore(join(dir, 'browser_runs.json'))
    await config.write([CHROME])
    await runs.write([RUN])
    // A stop rewrites the ledger on every call. If the two shared a document, that
    // routine bookkeeping would be sitting in the blast radius of the operator's edits.
    expect((await config.read()).rows).toEqual([CHROME])
    expect((await runs.read()).rows).toEqual([RUN])
    expect((await readdir(dir)).sort()).toEqual(['browser_config.json', 'browser_runs.json'])
  })
})

describe('the browser documents\' write discipline', () => {
  it('serialises concurrent writes instead of interleaving them', async () => {
    const path = join(await scratch(), 'browser_config.json')
    const store = createBrowserConfigStore(path)
    await Promise.all([
      store.write([CHROME]),
      store.write([{ ...CHROME, id: 'other' }]),
    ])
    expect((await store.read()).rows).toHaveLength(1)
  })

  it('snapshots the array at call time, not at write time', async () => {
    const path = join(await scratch(), 'browser_config.json')
    const store = createBrowserConfigStore(path)
    const rows: StoredBrowser[] = [CHROME]
    const pending = store.write(rows)
    rows.push({ ...CHROME, id: 'late' })
    await pending
    expect((await store.read()).rows.map(row => row.id)).toEqual(['chrome'])
  })

  it('keeps a rejection from poisoning the writes that follow it', async () => {
    const path = join(await scratch(), 'browser_config.json')
    const store = createBrowserConfigStore(path)
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(store.write([circular as never])).rejects.toThrow()
    await store.write([CHROME])
    expect((await store.read()).rows).toEqual([CHROME])
  })
})

describe('the default paths', () => {
  it('puts both documents and the alternative profile root under the operator DSH directory', () => {
    const asSlash = (value: string): string => value.replace(/\\/g, '/')
    expect(asSlash(defaultBrowserConfigPath())).toContain('/.dsh/yon-panel/browser_config.json')
    expect(asSlash(defaultBrowserRunsPath())).toContain('/.dsh/yon-panel/browser_runs.json')
    // The alternative offered when the plugin root is not writable. A profile holds real
    // login state, so it lives beside the other state, never inside the package.
    expect(asSlash(defaultBrowserProfileRoot())).toContain('/.dsh/yon-panel/browser-profiles')
  })
})
