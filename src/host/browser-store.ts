/**
 * Where the browser panel keeps its two documents.
 *
 * The mechanism is `home-store.ts`'s — one JSON document under `~/.dsh/yon-panel/`
 * that only this plugin and its panel touch, `read()`/`write()`, one promise chain
 * for the writes, and a tmp sibling renamed over the target so a crash mid-write
 * cannot leave half a document behind. This module is where that mechanism is
 * written **once** for two documents, because unlike the store pairs elsewhere in
 * this directory these two are the same kind of thing and were written on the same
 * day: duplicating thirty lines would not buy either of them a clearer reason.
 *
 * ## Why two documents rather than one
 *
 * A registration is small, rarely changes, and is the operator's to hand-edit. A run
 * is written on every launch and every stop, and prunes itself as browsers exit.
 * Sharing one document would mean a stop rewrites the file the operator may be
 * editing, and that a field they added by hand sits in the blast radius of a routine
 * bookkeeping write. `digest-log.ts` + `digest-config.ts` split on the same axis.
 *
 * ## Reported, never swallowed
 *
 * Both reads carry the reason they came back short: `exists: false` means "nothing
 * recorded yet", `error` means the document is there and unusable, and `skipped`
 * counts rows that were dropped. A browser list that silently lost a row would be
 * indistinguishable from one that never had it — the operator would just find their
 * browser gone and no explanation. `iteration-store.ts:25-34` states the same case.
 *
 * ## No seeding, no guessing
 *
 * Neither document has a default row. A fabricated registration would be a path the
 * panel offers to launch, which is a promise this plugin cannot keep.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BROWSER_FAMILIES, DEFAULT_BROWSER_PORT, MAX_BROWSER_PORT, MIN_BROWSER_PORT,
  type BrowserFamily,
} from '../shared/types.ts'

/**
 * One registered browser as the document stores it.
 *
 * The same fields as the view minus what is derived by looking at the disk
 * (`pathExists`, `stale`, `logPath`). Declared separately rather than reusing
 * `BrowserView`, as `home-store.ts:44` does and for the same reason: this shape may
 * gain a field for the store's own reasons without the contract both halves share
 * moving, and a derived field that got persisted would be a second truth about the
 * filesystem that is wrong from the moment it is written.
 */
export interface StoredBrowser {
  readonly id: string
  readonly family: BrowserFamily
  readonly product: string
  readonly path: string
  readonly profileDir: string
  readonly port: number
  readonly startUrl: string
  /** When this path was last seen by a scan. Absent on a row added by hand. */
  readonly lastFoundAt?: string
}

/**
 * One launch as the ledger stores it.
 *
 * Mirrors `BrowserRunView` minus `alive` and `note`: liveness is a question asked of
 * the machine at read time, and a persisted answer to it would be a claim about a
 * process that may have exited while the file sat there. `pid` is stored because it
 * is a useful clue, but see `BrowserView`'s note on the view for why nothing is
 * decided by it.
 */
export interface StoredRun {
  readonly runId: string
  readonly browserId: string
  readonly label: string
  readonly family: BrowserFamily
  readonly pid?: number
  readonly port: number
  readonly profileDir: string
  readonly startedAt: string
  readonly endpoint: string
  readonly ready: boolean
  /** Chromium's identity token. Absent for Firefox, which has no such endpoint. */
  readonly debuggerUrl?: string
}

/** One read of a document, with the reason it came back short when it did. */
export interface DocumentRead<Row> {
  readonly path: string
  readonly rows: readonly Row[]
  /** False when the document does not exist yet — "nothing recorded". */
  readonly exists: boolean
  /** How many stored rows could not be read back. Dropped, not fatal. */
  readonly skipped: number
  /** Only the registration document has one: when it was last scanned. */
  readonly scannedAt?: string
  /** Set only when the document exists and could not be used as written. */
  readonly error?: string
}

/** A document, as the rest of the host uses it. */
export interface JsonDocument<Row> {
  readonly path: string
  read(): Promise<DocumentRead<Row>>
  /**
   * @param rows - the rows to store, in order.
   * @param scannedAt - written alongside them when present. Passing `undefined`
   *   omits the field, which is how "never scanned" is spelled.
   */
  write(rows: readonly Row[], scannedAt?: string): Promise<void>
}

/** The registration document. */
export type BrowserConfigStore = JsonDocument<StoredBrowser>

/** The run ledger. */
export type BrowserRunStore = JsonDocument<StoredRun>

/** Where the registrations live. */
export function defaultBrowserConfigPath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'browser_config.json')
}

/** Where the launch ledger lives. */
export function defaultBrowserRunsPath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'browser_runs.json')
}

/**
 * The alternative profile root, under the operator's DSH data directory.
 *
 * Exported because it is **offered**, not used: the default profile directory sits in
 * the plugin root, which the operator chose, and this is what the panel offers when that
 * turns out not to be writable. The trade is real and goes both ways — this one survives
 * a reinstall but is no longer next to the plugin it belongs to — so it stays an offer
 * rather than a fallback that happens quietly.
 */
export function defaultBrowserProfileRoot(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'browser-profiles')
}

/**
 * The plugin's own root, which is where the default profile directory hangs off.
 *
 * Both profile roots are named side by side here rather than one here and one at the
 * call site, because which one is in force is a single decision the panel's hint and the
 * design document both have to state the same way.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works for the
 * compiled plugin and for a spec running against the sources — the same reasoning
 * `knowledge-tools.ts:39-45` records for its shipped library.
 */
export function pluginRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url))
}

/** One member read as a string, defaulting to the empty string. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** One member read as a declared member of `allowed`, or `fallback`. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback
}

/**
 * One member read as a usable debugging port, or `fallback`.
 *
 * Out of range falls back rather than rejecting the row: a hand-edited document that
 * lost a digit should still yield the browser, and the panel is the place where the
 * operator can see and fix the number. A port of `0` — which is what a truncated
 * edit usually leaves — is not a port this feature can do anything with.
 */
function portOf(value: unknown, fallback = DEFAULT_BROWSER_PORT): number {
  const port = typeof value === 'number' ? value : Number.NaN
  if (!Number.isInteger(port)) return fallback
  return port >= MIN_BROWSER_PORT && port <= MAX_BROWSER_PORT ? port : fallback
}

/**
 * Read one registration, or reject it.
 *
 * `id` and `path` are the two fields that make a row usable — an id-less row cannot
 * be addressed by the panel, and a path-less row cannot be launched — so their
 * absence rejects the row outright. Everything else falls back, because dropping a
 * whole registration over one bad enum value loses more than it protects.
 * `home-store.ts:89-107` makes the same call.
 */
function asBrowser(value: unknown): StoredBrowser | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  const id = textOf(entry.id).trim()
  const path = textOf(entry.path).trim()
  if (id === '' || path === '') return undefined
  const lastFoundAt = textOf(entry.lastFoundAt)
  return {
    id,
    family: oneOf(entry.family, BROWSER_FAMILIES, 'chromium'),
    product: textOf(entry.product),
    path,
    profileDir: textOf(entry.profileDir),
    port: portOf(entry.port),
    startUrl: textOf(entry.startUrl),
    ...lastFoundAt === '' ? {} : { lastFoundAt },
  }
}

/**
 * Read one run, or reject it.
 *
 * `runId` and `port` are what make a run addressable and stoppable; without either
 * there is nothing the panel could do with the row. The rest falls back, so a
 * ledger written by an older build still yields its runs.
 */
function asRun(value: unknown): StoredRun | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  const runId = textOf(entry.runId).trim()
  if (runId === '') return undefined
  const port = typeof entry.port === 'number' && Number.isInteger(entry.port) ? entry.port : Number.NaN
  if (!Number.isInteger(port) || port <= 0) return undefined
  const pid = typeof entry.pid === 'number' && Number.isInteger(entry.pid) && entry.pid > 0
    ? entry.pid
    : undefined
  const debuggerUrl = textOf(entry.debuggerUrl)
  return {
    runId,
    browserId: textOf(entry.browserId),
    label: textOf(entry.label),
    family: oneOf(entry.family, BROWSER_FAMILIES, 'chromium'),
    ...pid === undefined ? {} : { pid },
    port,
    profileDir: textOf(entry.profileDir),
    startedAt: textOf(entry.startedAt),
    endpoint: textOf(entry.endpoint),
    ready: entry.ready === true,
    ...debuggerUrl === '' ? {} : { debuggerUrl },
  }
}

/**
 * Open one JSON document.
 *
 * The same three decisions `home-store.ts:114-168` makes, factored once because both
 * documents here want them identically: writes only are queued, the array is copied
 * before it is queued so a caller that mutates it afterwards cannot change what gets
 * serialised, and the tmp file is a sibling so the rename is atomic on one volume.
 *
 * @param path - the document to read and write.
 * @param key - the top-level field the rows live under.
 * @param parseRow - reads one stored row, or rejects it.
 * @param fixHint - the tail of the unreadable-document message, which differs
 *   between the two documents because what the operator should do next differs.
 * @returns the document, bound to that one path.
 */
function openJsonDocument<Row>(
  path: string,
  key: string,
  parseRow: (value: unknown) => Row | undefined,
  fixHint: string,
): JsonDocument<Row> {
  // Writes only: reads mutate nothing, and the service keeps its own line for the
  // read-modify-write cycles, which is where a lost update could actually happen.
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  const writeNow = async (rows: readonly Row[], scannedAt: string | undefined): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
    const body = scannedAt === undefined ? { [key]: rows } : { [key]: rows, scannedAt }
    await writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  return {
    path,

    async read(): Promise<DocumentRead<Row>> {
      // The read and the parse are separate failures: ENOENT means "nothing
      // recorded yet", anything else means the document is there but unusable.
      const text = await readFile(path, 'utf8').catch(() => undefined)
      if (text === undefined) return { path, rows: [], exists: false, skipped: 0 }
      try {
        // Stripped by code point rather than by a pattern, for `home-store.ts:142-145`'s
        // reason: the escape sequence is invisible in the source, and an editor that
        // drops it would leave behind a rule matching the four letters F-E-F-F.
        const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
        const parsed = JSON.parse(body) as Record<string, unknown>
        const raw = Array.isArray(parsed[key]) ? parsed[key] as unknown[] : []
        const rows = raw.map(parseRow).filter((row): row is Row => row !== undefined)
        const scannedAt = textOf(parsed.scannedAt)
        return {
          path,
          rows,
          exists: true,
          skipped: raw.length - rows.length,
          ...scannedAt === '' ? {} : { scannedAt },
        }
      } catch {
        return {
          path,
          rows: [],
          exists: true,
          skipped: 0,
          error: `无法解析 ${path}：它不是合法的 JSON。${fixHint}`,
        }
      }
    },

    write(rows: readonly Row[], scannedAt?: string): Promise<void> {
      // Copied before it is queued: `write()` may be called with an array the caller
      // goes on to mutate, and the chain would then serialise a value that changed
      // while it waited (`home-store.ts:160-166`).
      const snapshot = [...rows]
      return inLine(() => writeNow(snapshot, scannedAt))
    },
  }
}

/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export function createBrowserConfigStore(path = defaultBrowserConfigPath()): BrowserConfigStore {
  // The hint names what is at stake: a registration the operator cannot re-derive
  // from anywhere, because a scan only finds browsers that are still installed.
  return openJsonDocument(
    path,
    'browsers',
    asBrowser,
    '请修正该文件；在它修好之前，面板不会往里写，也不会启动任何浏览器。',
  )
}

/**
 * Open the launch ledger.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export function createBrowserRunStore(path = defaultBrowserRunsPath()): BrowserRunStore {
  // The hint is weaker here, and deliberately so: this document is bookkeeping, and
  // the worst case is that a running browser becomes one the panel cannot name. It
  // must still be reported, because that is also how the operator learns to stop it
  // by hand.
  return openJsonDocument(
    path,
    'runs',
    asRun,
    '请修正该文件，或直接删掉它重建——它只记着本面板启动过哪些浏览器。',
  )
}
