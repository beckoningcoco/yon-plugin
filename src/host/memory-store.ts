/**
 * The disk layer of the project memory: one index document, one markdown file per
 * memory, both under `~/.dsh/yon-panel/memory/`.
 *
 * Shaped after `requirement-store.ts` — same constructor-takes-a-path seam, same
 * `isSafeId` gate before an id becomes a path, same habit of reporting a broken
 * document as a field rather than throwing — with two departures that the memory
 * bank forced:
 *
 * ## 1. The index is a *derived* cache, not a directory card
 *
 * `requirement-store.ts:14-18` keeps `index.json` as a card (id, project, path,
 * createdAt) and pays for it by reading every `entry.md` on a listing. That trade is
 * right there and wrong here, because of how a memory is *read*: the recall path
 * injects titles into tool results, and `docs/yon-memory-design.md` §6 requires that
 * to touch `index.json` only — a listing that opened five files before every
 * `project_read` return would make the plugin's fastest tools slower to say one line.
 *
 * So a record here carries everything a recall needs (title, type, tags, source,
 * timestamps). The cost is duplication: the same facts exist in the file and in the
 * index, and a hand edit to one of them can leave them disagreeing.
 *
 * **Which side wins when they disagree is therefore decided in advance: the file
 * does.** `readEntry` never consults the index, `memory_read` never consults it, and
 * a record whose file is missing or unparseable is reported as broken rather than
 * served as if it were whole. The index may lag; it never becomes the truth. Rebuilding
 * it from the files is `memory_sweep`'s job (P2, `docs/yon-memory-design.md` §9).
 *
 * ## 2. A record is rejected on two fields, and only two
 *
 * id and title. An id-less record cannot be addressed, and a title-less one is a
 * memory with nothing to recall it by. Everything else falls back rather than
 * rejecting, for `iteration-store.ts:110-117`'s reason: this file is hand-editable,
 * and losing the whole record because one enum value was misspelled would lose the
 * memory along with it.
 *
 * ## Never seeded
 *
 * There is no example record and no default. A memory bank whose first entry is
 * fabricated teaches its reader to distrust the whole file.
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { MEMORY_TYPES, type MemoryType } from '../shared/types.ts'
import { parseMemory, serializeMemory, type MemoryDoc } from './memory-doc.ts'

/** One row of `index.json`: everything a recall needs without opening a file. */
export interface MemoryRecord {
  readonly id: string
  readonly projectId: string
  readonly type: MemoryType
  readonly title: string
  readonly tags: readonly string[]
  readonly source: string
  readonly createdAt: string
  readonly updatedAt: string
  /** The markdown file, relative to the root. Kept here so a layout change is a data change. */
  readonly file: string
}

/** What one read of `index.json` found. */
export interface MemoryIndexRead {
  readonly path: string
  readonly records: readonly MemoryRecord[]
  /** False when the document does not exist yet — "nothing recorded". */
  readonly exists: boolean
  /** Rows dropped because they were not usable. Never fatal, but never silent either. */
  readonly skipped: number
  /**
   * Set when the file is there but cannot be used. Mutations must refuse to write
   * while this is set — see `memory-service.ts`. An empty index and an unreadable one
   * look identical otherwise, and one of them is about to be overwritten with a
   * single-record index.
   */
  readonly error?: string
}

/** What one read of a memory file found. */
export interface MemoryEntryRead {
  readonly id: string
  readonly path: string
  readonly exists: boolean
  /** Set when the file is there but does not parse. `doc` stays undefined. */
  readonly error?: string
  readonly doc?: MemoryDoc
}

/** The store half of the memory bank. */
export interface MemoryStore {
  readonly root: string
  readonly indexPath: string
  readIndex(): Promise<MemoryIndexRead>
  writeIndex(records: readonly MemoryRecord[]): Promise<void>
  /** Only call with an id that passed {@link isSafeId}. */
  entryPath(id: string): string
  readEntry(id: string): Promise<MemoryEntryRead>
  writeEntry(doc: MemoryDoc): Promise<void>
  /**
   * Delete one memory's file. A missing file is not an error: the caller is removing
   * a record, and the record is what it checks first.
   */
  removeEntry(id: string): Promise<void>
  /**
   * The ids of every `.md` file in the bank, sorted.
   *
   * The one read that looks at the directory rather than the index, and it exists because
   * the index **is** allowed to lag: a file the records do not mention is a memory no
   * recall can see, and nothing else in this store could notice it. `memory_sweep` is the
   * caller. A missing directory is an empty list, not an error.
   */
  listIds(): Promise<readonly string[]>
}

/** `~/.dsh/yon-panel/memory/`, beside `iteration.json` and `requirements/`. */
export function defaultMemoryRoot(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'memory')
}

/**
 * Whether an id may be turned into a path.
 *
 * Ids are host-generated (`mem-<date>-<time>-<random>`), so this only ever rejects
 * two things: a value the model made up, and a hand-edit gone wrong. Both come back
 * as "no such memory" rather than as a path, which is what the service does with a
 * false here. The shape is `requirement-store.ts:189-191`'s, deliberately identical:
 * one rule for "may this be a file name" is one rule to get right.
 */
export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)
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

/** One member read as a list of non-empty strings. */
function tagsOfTag(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(entry => textOf(entry).trim())
    .filter(entry => entry !== '')
}

/** A message out of an unknown thrown value, for the error field. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Read one index row, or reject it.
 *
 * @param value - one element of the parsed array.
 * @returns the record, or undefined when it cannot be addressed at all.
 */
function recordOf(value: unknown): MemoryRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  const id = textOf(entry.id).trim()
  const title = textOf(entry.title).trim()
  if (id === '' || !isSafeId(id) || title === '') return undefined
  return {
    id,
    projectId: textOf(entry.projectId).trim(),
    type: oneOf(entry.type, MEMORY_TYPES, 'lesson'),
    title,
    tags: tagsOfTag(entry.tags),
    source: textOf(entry.source),
    createdAt: textOf(entry.createdAt),
    updatedAt: textOf(entry.updatedAt),
    // Derived from the id, never read back from the row: a hand-edited `file` would
    // otherwise be the one field that decides where a memory is read from, which is
    // how a record starts naming a file it does not own. The field stays in the
    // document so that a future layout change is a data change.
    file: `${id}.md`,
  }
}

/** The index row one document contributes. */
export function recordOfDoc(doc: MemoryDoc): MemoryRecord {
  return {
    id: doc.id,
    projectId: doc.projectId,
    type: doc.type,
    title: doc.title,
    tags: doc.tags,
    source: doc.source,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    file: `${doc.id}.md`,
  }
}

/**
 * Open the memory bank.
 * @param root - the directory to read and write; defaults to the operator's own.
 * @returns the store, bound to that one root.
 */
export function createMemoryStore(root: string = defaultMemoryRoot()): MemoryStore {
  const indexPath = join(root, 'index.json')

  // One chain for the whole store, as `requirement-store.ts:217-228`: reads never
  // queue, and every write goes through here so a burst of `memory_write` calls
  // cannot interleave two read-modify-write cycles. The service keeps its own chain
  // as well, because the cycle spans the store's two documents.
  let inLine: Promise<unknown> = Promise.resolve()
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = inLine.then(work, work)
    inLine = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  const entryPath = (id: string): string => join(root, `${id}.md`)

  const writeAtomically = async (path: string, text: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    // A sibling temporary then a rename, so a reader never sees a half-written file
    // and an interrupted write leaves nothing where the document was.
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, path)
  }

  return {
    root,
    indexPath,

    async readIndex(): Promise<MemoryIndexRead> {
      let text: string
      try {
        text = await readFile(indexPath, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { path: indexPath, records: [], exists: false, skipped: 0 }
        }
        return {
          path: indexPath,
          records: [],
          exists: true,
          skipped: 0,
          error: `无法读取记忆索引 ${indexPath}：${messageOf(error)}`,
        }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
      } catch {
        return {
          path: indexPath,
          records: [],
          exists: true,
          skipped: 0,
          error: `无法解析 ${indexPath}：它不是合法的 JSON。修好它或删掉它再试——在这一刻写下去会把里面还认得出来的记录覆盖掉。`,
        }
      }

      if (!Array.isArray(parsed)) {
        return {
          path: indexPath,
          records: [],
          exists: true,
          skipped: 0,
          error: `无法使用 ${indexPath}：它应该是一个数组。`,
        }
      }

      const records: MemoryRecord[] = []
      const seen = new Set<string>()
      let skipped = 0
      for (const row of parsed) {
        const record = recordOf(row)
        // A repeated id is a hand-edit mistake; keeping the later one would show the
        // same memory twice in every recall.
        if (record === undefined || seen.has(record.id)) {
          skipped += 1
          continue
        }
        seen.add(record.id)
        records.push(record)
      }
      return { path: indexPath, records, exists: true, skipped }
    },

    writeIndex(records: readonly MemoryRecord[]): Promise<void> {
      // Snapshotted before it is queued, for `iteration-store.ts:191-194`'s reason:
      // the caller may go on to mutate the array, and the chain would then serialise
      // a value that changed while it waited.
      const snapshot = records.map(record => ({ ...record, tags: [...record.tags] }))
      return queue(() => writeAtomically(indexPath, `${JSON.stringify(snapshot, null, 2)}\n`))
    },

    entryPath,

    async readEntry(id: string): Promise<MemoryEntryRead> {
      const path = entryPath(id)
      let text: string
      try {
        text = await readFile(path, 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { id, path, exists: false }
        }
        return { id, path, exists: true, error: `无法读取 ${path}：${messageOf(error)}` }
      }
      const doc = parseMemory(text)
      if (doc === undefined) {
        return {
          id,
          path,
          exists: true,
          error: `无法解析 ${path}：它不是一条记忆（frontmatter 里至少要有 id 与 title）。`,
        }
      }
      return { id, path, exists: true, doc }
    },

    writeEntry(doc: MemoryDoc): Promise<void> {
      return queue(() => writeAtomically(entryPath(doc.id), serializeMemory(doc)))
    },

    removeEntry(id: string): Promise<void> {
      return queue(async () => {
        // `force` so a file that is already gone is a completed deletion rather than
        // an ENOENT the caller has to interpret: this method's contract is "the file
        // is not there afterwards", and it is, either way.
        await rm(entryPath(id), { force: true })
      })
    },

    async listIds(): Promise<readonly string[]> {
      const entries = await readdir(root, { withFileTypes: true }).catch(() => undefined)
      // A bank that does not exist yet is empty, not broken: `memory_sweep` runs on a
      // fresh installation too, and reporting ENOENT as a fault would make the first run
      // of the check look like a failure.
      if (entries === undefined) return []
      return entries
        // Files only, and only the ones this store writes. A directory somebody left
        // inside is not a memory, and a `.tmp-…` sibling is a write that did not finish —
        // naming either of them as an id would turn a stray path into a "broken entry".
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => entry.name.slice(0, -'.md'.length))
        .filter(isSafeId)
        .sort()
    },
  }
}
