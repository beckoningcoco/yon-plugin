/**
 * Where the model's notes about this plugin's own shortcomings are kept.
 *
 * The shape is `home-store.ts`'s, and for the same reason: it is a JSON document
 * under `~/.dsh/yon-panel/` that only this plugin and its panel ever touch, and the
 * operator can open it in an editor. So one document, `read()`/`write()`, one
 * promise chain for the writes, and a tmp sibling renamed over the target so a
 * crash mid-write cannot leave half a ledger behind.
 *
 * ## Why not `digest-log.ts`'s append-only JSONL
 *
 * `digest-log.ts:19-25` states its own shape's reasons, and every one of them is
 * wrong here. It is append-only, which suits a stream of finished runs that are
 * never revised. A ledger row **is** revised — its status moves from open to fixed
 * and that is the whole point of keeping it — and an append-only file cannot say
 * what a row is now, only what was said about it over time.
 *
 * Its second reason is worse for this use: it **swallows its own write errors**
 * (`digest-log.ts:211`), because a missing audit row is a lesser harm than failing
 * the audit. Here the opposite holds. A model that recorded a shortcoming and was
 * told nothing believes it is on the record; if the write failed, the note is gone
 * and nobody will ever know to look. So this store reports, and the tool surfaces
 * the failure rather than answering "已记下".
 *
 * ## Two departures from `home-store.ts`, both deliberate
 *
 * **A bad row is dropped, the rest survive.** Same call as `home-store.ts:81-107`
 * and for the same reason: this file is hand-editable, and losing every note
 * because one line lost its quoting is a worse outcome than losing that line.
 *
 * **A bad row reports itself in the read.** Unlike a Home, where a dropped
 * registration is visible as a missing row, a dropped note is invisible — the
 * operator never knew it existed. {@link IterationStoreRead.skipped} carries the
 * count so the panel can say "N 条读不出来" instead of quietly showing fewer notes.
 *
 * ## Never guessed, never seeded
 *
 * There is no default row and no example. A ledger that starts with a fabricated
 * entry teaches its reader to distrust the whole file.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ITERATION_KINDS, ITERATION_SEVERITIES, ITERATION_STATUSES,
  type IterationKind, type IterationRowView, type IterationSeverity, type IterationStatus,
} from '../shared/types.ts'

/**
 * One row as the document stores it.
 *
 * Same fields as {@link IterationRowView} and declared separately on purpose: this
 * shape may gain a field for the store's own reasons without the contract both
 * halves share moving. `home-store.ts:44` makes the same split.
 */
export interface IterationRow {
  readonly id: string
  readonly at: string
  readonly kind: IterationKind
  readonly severity: IterationSeverity
  readonly scene: string
  readonly symptom: string
  readonly suggestion: string
  readonly target: string
  readonly context: string
  readonly status: IterationStatus
}

/** The document on disk. Every field is optional: it is hand-editable. */
export interface IterationConfig {
  readonly rows?: readonly IterationRow[]
}

/** One read of the document, with the reason it came back short when it did. */
export interface IterationStoreRead {
  readonly path: string
  readonly rows: readonly IterationRow[]
  /** False when the document does not exist yet — "nothing recorded". */
  readonly exists: boolean
  /** How many stored rows could not be read back. Dropped, not fatal. */
  readonly skipped: number
  /** Set only when the document exists and could not be used as written. */
  readonly error?: string
}

/** The document, as the rest of the host uses it. */
export interface IterationStore {
  readonly path: string
  read(): Promise<IterationStoreRead>
  write(rows: readonly IterationRow[]): Promise<void>
}

/** Where the ledger lives. */
export function defaultIterationStorePath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'iteration.json')
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
 * Read one row, or reject it.
 *
 * The two fields that make a row addressable at all are `id` and `symptom` — an
 * id-less row cannot be edited or removed, and a symptom-less row is a status with
 * nothing behind it. Everything else falls back rather than rejecting, because a
 * hand-edited file that lost one enum value should still yield the note.
 */
function asRow(value: unknown): IterationRow | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  const id = textOf(entry.id).trim()
  const symptom = textOf(entry.symptom).trim()
  if (id === '' || symptom === '') return undefined
  return {
    id,
    at: textOf(entry.at),
    kind: oneOf(entry.kind, ITERATION_KINDS, 'gap'),
    severity: oneOf(entry.severity, ITERATION_SEVERITIES, 'medium'),
    scene: textOf(entry.scene),
    symptom,
    suggestion: textOf(entry.suggestion),
    target: textOf(entry.target),
    context: textOf(entry.context),
    status: oneOf(entry.status, ITERATION_STATUSES, 'open'),
  }
}

/**
 * Open the ledger document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export function createIterationStore(path = defaultIterationStorePath()): IterationStore {
  // Writes only, exactly as `home-store.ts:118-124`: reads mutate nothing, and the
  // service keeps its own line for the read-modify-write cycles, which is where a
  // lost update could actually happen.
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  const writeNow = async (rows: readonly IterationRow[]): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify({ rows }, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  return {
    path,

    async read(): Promise<IterationStoreRead> {
      // The read and the parse are separate failures: ENOENT means "nothing
      // recorded yet", anything else means the document is there but unusable.
      const text = await readFile(path, 'utf8').catch(() => undefined)
      if (text === undefined) return { path, rows: [], exists: false, skipped: 0 }
      try {
        // Stripped by code point rather than by a pattern, for `home-store.ts:142-145`'s
        // reason: the escape sequence is invisible in the source, and an editor that
        // drops it would leave a rule matching the four letters F-E-F-F.
        const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
        const parsed = JSON.parse(body) as IterationConfig
        const raw = Array.isArray(parsed.rows) ? parsed.rows : []
        const rows = raw.map(asRow).filter((row): row is IterationRow => row !== undefined)
        return { path, rows, exists: true, skipped: raw.length - rows.length }
      } catch {
        return {
          path,
          rows: [],
          exists: true,
          skipped: 0,
          error: `无法解析 ${path}：它不是合法的 JSON。请修正该文件；在它修好之前，面板不会往里写。`,
        }
      }
    },

    write(rows: readonly IterationRow[]): Promise<void> {
      // Copied before it is queued: `write()` may be called with an array the caller
      // goes on to mutate, and the chain would then serialise a value that changed
      // while it waited (`home-store.ts:160-166`).
      const snapshot = [...rows]
      return inLine(() => writeNow(snapshot))
    },
  }
}
