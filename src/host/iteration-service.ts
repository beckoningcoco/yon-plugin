/**
 * The ledger the model writes and the panel reads.
 *
 * The service owns the read-modify-write cycle over the store, for the reason
 * `home-service.ts:1-9` gives: the store serialises its own writes, but two
 * mutations that each read first would both act on the state before either wrote.
 * Here that is not hypothetical — a model and an operator routinely act in the
 * same minute, and the model's append landing between the panel's read and its
 * write would be lost silently. So the whole cycle is queued here as well.
 *
 * It also owns the two rules that make the ledger trustworthy:
 *
 * **Nothing is written into a document that cannot be read.** If `iteration.json`
 * does not parse, every mutation refuses and says so. The alternative — reading
 * it as empty and writing one row back — would replace whatever the operator had
 * written by hand with a single new note, which is the worst outcome available
 * here. The panel's reads still work: `list()` reports the error rather than
 * throwing, because a reader that cannot see the file should at least be told why.
 *
 * **A model's repeat is not a second row.** `create(..., { dedupe: true })` refuses
 * to append a row whose `(target, symptom)` already sits in the ledger as `open`.
 * A model that hits the same shortcoming twice in one session would otherwise file
 * it twice, and a ledger with twenty copies of one complaint is a ledger nobody
 * reads. The match is exact and trimmed — deliberately dumb, because a fuzzy one
 * would need a threshold nobody could justify. `target` must be non-empty for the
 * match to apply at all: two notes with no target in common are not the same note,
 * and treating them as one would swallow real distinct findings.
 *
 * Dedupe is off for the panel. A person may record two similar things and knows
 * why.
 */
import {
  ITERATION_KINDS, ITERATION_SEVERITIES, ITERATION_STATUSES,
  type IterationKind, type IterationListPayload, type IterationRowView, type IterationSeverity,
  type IterationStatus, type SaveIterationInput, type UpdateIterationInput,
} from '../shared/types.ts'
import type { IterationRow, IterationStore } from './iteration-store.ts'

/** Longest text accepted in one free-text field, in characters. */
const MAX_TEXT = 2000

/** Why a ledger operation could not be carried out. */
export class IterationError extends Error {
  constructor(
    /** `invalid-input` answers 400, `not-found` answers 404. */
    readonly code: 'invalid-input' | 'not-found',
    message: string,
  ) {
    super(message)
    this.name = 'IterationError'
  }
}

/** What `list` may be narrowed to. */
export interface IterationQuery {
  /** `all`, or absent, lists every status. */
  readonly status?: IterationStatus | 'all'
  readonly kind?: IterationKind
}

/** One filing's outcome: the row as it now stands, and whether it is new. */
export interface IterationCreated {
  readonly row: IterationRowView
  /** False when an identical open row already existed. */
  readonly created: boolean
}

/** The ledger, as the tools, the routes and the panel use it. */
export interface YonIterationService {
  /** The document the notes live in, for the panel to name. */
  readonly storePath: string
  list(query?: IterationQuery): Promise<IterationListPayload>
  create(input: SaveIterationInput, options?: { readonly dedupe?: boolean }): Promise<IterationCreated>
  update(id: string, patch: UpdateIterationInput): Promise<IterationRowView>
  remove(id: string): Promise<string>
}

/** Both halves read the row through this one shape, so they cannot drift. */
function viewOf(row: IterationRow): IterationRowView {
  return { ...row }
}

/** An id no other row holds. */
function uniqueId(rows: readonly IterationRow[]): string {
  const taken = new Set(rows.map(row => row.id))
  for (let attempt = 0; attempt < 100; attempt += 1) {
    // Base-36 time, then four random characters. The timestamp alone is not
    // enough: two rows filed in the same millisecond — which is exactly what a
    // model retrying its own call produces — would collide, and a colliding id
    // makes one of them un-editable and un-removable.
    const candidate = `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    if (!taken.has(candidate)) return candidate
  }
  return `it-${Date.now().toString(36)}-${rows.length.toString(36)}`
}

/** One enum member, or a refusal naming what was allowed. */
function requireMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new IterationError('invalid-input',
    `${field} 只能是 ${allowed.join(' / ')}；收到的是「${String(value)}」`)
}

/** One free-text member, trimmed and bounded. */
function requireText(value: unknown, field: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new IterationError('invalid-input', `${field} 要是一段文字`)
  }
  const text = value.trim()
  if (text.length > MAX_TEXT) {
    throw new IterationError('invalid-input',
      `${field} 太长了（${text.length} 字，上限 ${MAX_TEXT}）：台账是一条一条看的，请把这一条压到能读的长度。`)
  }
  return text
}

/**
 * Newest first, with the file's own order as the tie-break.
 *
 * A ledger is read from the top, and what was recorded last is what the reader
 * has not seen yet. `at` is sorted as a string rather than parsed: every value
 * this service writes is an ISO timestamp, and a hand-edited one that is not
 * simply sorts where its text lands instead of throwing.
 */
function newestFirst(rows: readonly IterationRow[]): readonly IterationRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.at === b.row.at ? a.index - b.index : (a.row.at < b.row.at ? 1 : -1))
    .map(entry => entry.row)
}

/**
 * Open the service over a store.
 *
 * No disposer, unlike `createYonHomesService`: that one holds a `disposed` flag
 * because a mount can be torn down between two of its own awaits, and it still
 * owes `defaultVersion()` an answer. Nothing here outlives the call that made it —
 * the queue drains and the flag would have nothing to guard.
 *
 * @param store - the ledger document.
 * @returns the service.
 */
export function createYonIterationService(store: IterationStore): YonIterationService {
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  /**
   * Read the ledger, refusing to act on a document that is unreadable.
   *
   * Mutations go through here, never through `store.read()` directly: writing one
   * row on top of a file that could not be read would delete the operator's notes.
   */
  const readAll = async (): Promise<readonly IterationRow[]> => {
    const read = await store.read()
    if (read.error !== undefined) throw new IterationError('invalid-input', read.error)
    return read.rows
  }

  /** Whether an open row already says this. */
  const duplicateOf = (rows: readonly IterationRow[], target: string, symptom: string): IterationRow | undefined => {
    // A note with no target is not compared: two such notes share nothing that
    // would let a match be more than a coincidence.
    if (target === '') return undefined
    return rows.find(row => row.status === 'open' && row.target === target && row.symptom === symptom)
  }

  const service: YonIterationService = {
    storePath: store.path,

    async list(query: IterationQuery = {}): Promise<IterationListPayload> {
      const read = await store.read()
      const status = query.status ?? 'all'
      const rows = newestFirst(read.rows).filter(row =>
        (status === 'all' || row.status === status)
        && (query.kind === undefined || row.kind === query.kind))
      return {
        rows: rows.map(viewOf),
        path: store.path,
        ...read.error === undefined ? {} : { error: read.error },
      }
    },

    async create(input: SaveIterationInput, options: { readonly dedupe?: boolean } = {}): Promise<IterationCreated> {
      return await inLine(async () => {
        const rows = await readAll()
        const kind = requireMember(input.kind, ITERATION_KINDS, 'kind')
        const symptom = requireText(input.symptom, 'symptom')
        if (symptom === '') {
          throw new IterationError('invalid-input', 'symptom 不能为空：没有症状就没有可改的东西')
        }
        const target = requireText(input.target, 'target')
        const severity = input.severity === undefined
          ? 'medium'
          : requireMember(input.severity, ITERATION_SEVERITIES, 'severity')

        if (options.dedupe === true) {
          const existing = duplicateOf(rows, target, symptom)
          // The existing row comes back rather than an error, so the caller can say
          // 「这条已经记过了」 with the id in hand instead of filing a twin.
          if (existing !== undefined) return { row: viewOf(existing), created: false }
        }

        const row: IterationRow = {
          id: uniqueId(rows),
          at: new Date().toISOString(),
          kind,
          severity,
          scene: requireText(input.scene, 'scene'),
          symptom,
          suggestion: requireText(input.suggestion, 'suggestion'),
          target,
          context: requireText(input.context, 'context'),
          // Always open. Nobody — model or panel — may file a row that is already
          // triaged: `update` is the only door to any other status.
          status: 'open',
        }
        await store.write([...rows, row])
        return { row: viewOf(row), created: true }
      })
    },

    async update(id: string, patch: UpdateIterationInput): Promise<IterationRowView> {
      return await inLine(async () => {
        const rows = await readAll()
        const found = rows.find(row => row.id === id)
        if (found === undefined) throw new IterationError('not-found', `台账里没有这一条：${id}`)
        const status = patch.status === undefined
          ? found.status
          : requireMember(patch.status, ITERATION_STATUSES, 'status')
        const severity = patch.severity === undefined
          ? found.severity
          : requireMember(patch.severity, ITERATION_SEVERITIES, 'severity')
        const updated: IterationRow = { ...found, status, severity }
        await store.write(rows.map(row => row.id === id ? updated : row))
        return viewOf(updated)
      })
    },

    async remove(id: string): Promise<string> {
      return await inLine(async () => {
        const rows = await readAll()
        if (!rows.some(row => row.id === id)) {
          throw new IterationError('not-found', `台账里没有这一条：${id}`)
        }
        await store.write(rows.filter(row => row.id !== id))
        return id
      })
    },
  }

  return service
}
