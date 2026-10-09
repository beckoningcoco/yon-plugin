/**
 * The requirement ledger's rules: what a create has to check first, what a change
 * has to leave behind, and what a reader gets to see.
 *
 * Four rules carry most of the design, and each one is a thing a naive version
 * gets wrong:
 *
 * 1. **Nothing is written into a document that cannot be read.** Every mutation
 *    reads `index.json` first and refuses if it did not come back cleanly. A
 *    corrupt index is otherwise indistinguishable from an empty one, so the
 *    mutation would write a one-entry index over the operator's whole ledger.
 *    (`iteration-service.ts` states the same rule for the same reason.)
 * 2. **Appending never interrupts; changing does.** `annotate` adds a note and
 *    stops there. `update` changes a fact, so the fact it replaced is struck
 *    through in a note the operator can read back, and the frontmatter is
 *    rewritten without ceremony. An update that changes nothing appends nothing —
 *    see `update` for why that is not merely an optimisation.
 * 3. **A name is not permission to overwrite.** `create` with `dedupe` returns the
 *    entry it collided with and writes nothing. Who asks the user is the caller's
 *    business: the tools turn that answer into an explicit acknowledgement, and the
 *    panel never turns dedupe on at all, because a person typing a second
 *    similar-sounding name knows what they meant.
 * 4. **The model cannot delete.** One status (`dropped`) is the model's; removing a
 *    directory is `store.removeEntry`, reachable only from the panel.
 * 5. **An attachment is not a fact about the entry.** Listing, reading, importing and
 *    deleting files never touch `entry.md`. Appending a trace line for every upload
 *    would turn the operator's own material into noise in the one place the entry's
 *    history is supposed to be readable, and the folders already carry the record:
 *    what is in `user/` is what was given, what is in `generated/` is what was made.
 *    It also means the file operations are outside the `queue` for reads and inside
 *    it for writes, exactly like every other operation here.
 *
 * The clock is injected and never read from the caller. `IterationRowView.at` sets
 * the precedent: the session's own sense of time is not a trustworthy input, and
 * notes are stamped by the host for the same reason.
 */

import {
  REQUIREMENT_STATUSES,
  type CreateRequirementInput,
  type RequirementCreated,
  type RequirementDir,
  type RequirementFile,
  type RequirementFileGroup,
  type RequirementFileImport,
  type RequirementFileList,
  type RequirementFileRead,
  type RequirementListPayload,
  type RequirementStatus,
  type RequirementSummary,
  type RequirementView,
} from '../shared/types.ts'
import {
  REQUIREMENT_STATUS_TEXT,
  bodyText,
  localDate,
  normalizeName,
  traceLine,
  withNote,
  type RequirementEntryDoc,
} from './requirement-doc.ts'
import {
  MAX_ATTACHMENT_BYTES,
  MAX_FILE_READ_BYTES,
  MAX_FILE_READ_CHARS,
  attachmentText,
  classifyFile,
  freeName,
  sizeOf,
} from './requirement-files.ts'
import {
  REQUIREMENT_SUBDIRS,
  isSafeArtifactName,
  MAX_ARTIFACT_NAME,
  type RequirementArtifactKind,
  type RequirementRecord,
  type RequirementStore,
} from './requirement-store.ts'

/** How a caller's mistake comes back. Mapped to 400 / 404 by the HTTP layer. */
export type RequirementErrorCode = 'invalid-input' | 'not-found'

export class RequirementError extends Error {
  readonly code: RequirementErrorCode

  constructor(code: RequirementErrorCode, message: string) {
    super(message)
    this.name = 'RequirementError'
    this.code = code
  }
}

/** Longest name accepted, in characters. Long enough for 「H1-00 固定资产接口对接（华科）· 追加预算校验」. */
const MAX_NAME = 120
/** Longest body accepted. This is a description, not an archive — attachments go in `user/`. */
const MAX_BODY = 20000
/** Longest single appended note. */
const MAX_NOTE = 4000
/** Longest one artifact accepted, in characters. This is a patch or a note, not a build output. */
const MAX_ARTIFACT = 200000

/** What one artifact write did: enough to report it, and to find the file afterwards. */
export interface RequirementArtifactWrite {
  readonly id: string
  /** The entry's name, so the caller can report it without a second read. */
  readonly entry: string
  readonly kind: RequirementArtifactKind
  /** `<id>/<kind>/<name>`, root-relative — the same shape the index card uses for `file`. */
  readonly file: string
  readonly path: string
  readonly bytes: number
}

export interface RequirementQuery {
  readonly projectId?: string
  readonly status?: RequirementStatus
}

export interface RequirementReadOptions {
  /**
   * Ask for the human's copy: the whole text as written (`raw`), and the same text
   * split into the entry's own paragraph (`prose`) and the notes (`notes`).
   *
   * Off by default because all three are the *reader's* view, not the worker's: they
   * carry the struck-through claims back in, and a model that asks for the current
   * text would be reading retracted statements as if they still held.
   */
  readonly history?: boolean
}

export interface RequirementCreateOptions {
  /**
   * Refuse to create a second entry with the same name in the same project.
   *
   * Off by default, and the default is the panel's behaviour — see rule 3 in the
   * file header. The tools turn it on, because a model creating a duplicate is
   * usually the model having lost track rather than a deliberate act.
   */
  readonly dedupe?: boolean
  /**
   * The id of the entry this create was already acknowledged to duplicate. Only
   * meaningful together with `dedupe`.
   *
   * The check still runs with this set, and it is the reason this is an id rather
   * than a flag: the create proceeds only when the entry that *actually* conflicts
   * is the one named here. A stale acknowledgement — the model answering about an
   * entry that has since been renamed, or naming one that never was the twin —
   * comes back as `created: false` with the real conflict, instead of quietly
   * ordering a second entry the operator was never shown. Asserting equality
   * rather than mere presence is the same discipline `previewWrite` applies to the
   * project it is about to change.
   */
  readonly acknowledged?: string
}

export interface RequirementDeps {
  /** Injected so tests do not depend on the wall clock. */
  readonly now?: () => Date
}

export interface YonRequirementsService {
  readonly root: string
  readonly indexPath: string
  list(query?: RequirementQuery): Promise<RequirementListPayload>
  read(ref: string, options?: RequirementReadOptions): Promise<RequirementView>
  create(input: CreateRequirementInput, options?: RequirementCreateOptions): Promise<RequirementCreated>
  annotate(ref: string, text: string): Promise<RequirementView>
  update(
    ref: string,
    patch: { readonly name?: string; readonly status?: RequirementStatus },
  ): Promise<RequirementView>
  /** Set `dropped` and record why. The model's only way to retire an entry. */
  archive(ref: string, reason?: string): Promise<RequirementView>
  /**
   * Delete an entry outright: its directory, its files, and its row.
   *
   * The model has no tool for this — `archive` is the model's way to retire an
   * entry — so the only caller is the panel, behind a second confirmation. It
   * returns the name it removed so the caller can say what is gone.
   */
  remove(ref: string): Promise<{ readonly id: string; readonly name: string; readonly path: string }>
  /**
   * Write one text file into an entry's `generated/` or `patches/`.
   *
   * Resolution lives here rather than in the tool for the reason `resolve` exists
   * at all: turning a ref into an id is this service's question, and a caller that
   * answered it itself would be a second implementation of the cross-project
   * ambiguity rule — the one place where guessing writes into the wrong record.
   */
  artifactWrite(
    ref: string,
    kind: RequirementArtifactKind,
    name: string,
    content: string,
  ): Promise<RequirementArtifactWrite>
  /**
   * Every attachment of an entry, folder by folder.
   * @param only - when given, just that one folder.
   */
  fileList(ref: string, only?: string): Promise<RequirementFileList>
  /**
   * Read one attachment as text, or say why it cannot be read as text.
   *
   * Never throws for "it is a PDF" or "it is a binary": an answer with an empty
   * `text` and a `note` is what the panel draws and what the model reports, and a
   * refusal shaped like an error would make both of them special-case the same three
   * situations. The only errors are "no such entry" and "no such file".
   */
  fileRead(ref: string, dir: string, name: string, version?: number): Promise<RequirementFileRead>
  /**
   * Put an operator's file into one of the entry's folders.
   *
   * This is the *only* path into `user/`, and it is deliberately not reachable from
   * any model tool — see `artifactWrite`, which is the model's side of the same
   * boundary. A name that is already taken is kept by adding `-2` rather than by
   * overwriting: the folder is the operator's own material, and losing a file they
   * handed over is the one outcome nothing here may produce silently.
   */
  importFile(ref: string, dir: string, name: string, bytes: Buffer): Promise<RequirementFileImport>
  /** Delete one attachment. Human-only, like `remove` — the model has no tool for it. */
  removeFile(
    ref: string,
    dir: string,
    name: string,
  ): Promise<{ readonly id: string; readonly entry: string; readonly file: RequirementFile }>
}

export function createYonRequirementsService(
  store: RequirementStore,
  deps: RequirementDeps = {},
): YonRequirementsService {
  const now = deps.now ?? (() => new Date())

  // Serialises whole read-modify-write cycles, not just writes. The store has its
  // own chain, but that one only orders individual files; two annotates in flight
  // would still both read the same document and the second would drop the first's
  // note. This chain is the one that makes the cycle atomic.
  let inLine: Promise<unknown> = Promise.resolve()
  const queue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = inLine.then(work, work)
    inLine = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  const readIndexOrThrow = async () => {
    const index = await store.readIndex()
    if (index.error !== undefined) throw new RequirementError('invalid-input', index.error)
    return index
  }

  const summaryOf = (record: RequirementRecord, doc: RequirementEntryDoc): RequirementSummary => ({
    id: record.id,
    projectId: record.projectId,
    name: doc.name,
    status: doc.status,
    createdAt: record.createdAt,
    updatedAt: doc.updated,
    file: record.file,
  })

  const viewOf = (
    record: RequirementRecord,
    doc: RequirementEntryDoc,
    history = false,
  ): RequirementView => ({
    ...summaryOf(record, doc),
    body: bodyText(doc),
    // The readable original, not the literal file: the frontmatter's values are
    // already fields on this object, and repeating them as text would invite the
    // two copies to disagree. `prose` and `notes` are that same text handed over
    // already split — the panel draws the entry and its trace as two blocks, and
    // splitting it there would be a second copy of `parseEntry`'s two rules (what
    // the notes heading is, and that a blank line separates paragraphs).
    ...(history
      ? {
        raw: bodyText(doc, { keepStrikethrough: true }),
        prose: doc.body,
        notes: doc.notes,
      }
      : {}),
  })

  /** Load one record's document, or fail with the reason it could not be loaded. */
  const load = async (record: RequirementRecord): Promise<RequirementEntryDoc> => {
    const read = await store.readEntry(record.id)
    if (read.doc !== undefined) return read.doc
    if (!read.exists) {
      throw new RequirementError(
        'not-found',
        `台账里有 ${record.id}，但 ${read.path} 不见了。它在列表里会显示为「读不出来」。`,
      )
    }
    throw new RequirementError('invalid-input', read.error ?? `${read.path} 读不出来。`)
  }

  /**
   * Find the entry a reference points at: an id first, then a name.
   *
   * Name lookup spans every project, because the tools' callers rarely know the
   * project and paying an extra round trip to make them say it would push the model
   * toward inventing an id. Two projects holding the same name is therefore a real
   * case, and it comes back as an error naming both ids rather than as a guess.
   */
  const resolve = async (ref: string): Promise<RequirementRecord> => {
    const index = await readIndexOrThrow()
    const wanted = ref.trim()
    if (wanted === '') {
      throw new RequirementError('invalid-input', '要指定一条需求条目：给 id，或给它的名称。')
    }

    const direct = index.records.find(record => record.id === wanted)
    if (direct !== undefined) return direct

    const key = normalizeName(wanted)
    const matched: { record: RequirementRecord; summary: RequirementSummary }[] = []
    const broken: string[] = []
    for (const record of index.records) {
      const read = await store.readEntry(record.id)
      if (read.doc === undefined) {
        broken.push(record.id)
        continue
      }
      if (normalizeName(read.doc.name) === key) {
        matched.push({ record, summary: summaryOf(record, read.doc) })
      }
    }

    const only = matched.length === 1 ? matched[0] : undefined
    if (only !== undefined) return only.record
    if (matched.length > 1) {
      const ids = matched.map(hit => `${hit.summary.id}（${hit.summary.projectId}）`).join('、')
      throw new RequirementError(
        'invalid-input',
        `「${wanted}」在多个项目下都有：${ids}。改用 id 指定是哪一条。`,
      )
    }
    throw new RequirementError(
      'not-found',
      broken.length === 0
        ? `没有名为「${wanted}」的需求条目。`
        : `没有名为「${wanted}」的条目；另有 ${broken.length} 条读不出来（${broken.join('、')}），它可能在其中。`,
    )
  }

  /** `rq-<yyyymmdd>-<random>`, with the date taken from the local day for readability. */
  const uniqueId = (records: readonly RequirementRecord[], date: Date): string => {
    const stamp = localDate(date).replace(/-/g, '')
    const taken = new Set(records.map(record => record.id))
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = `rq-${stamp}-${Math.random().toString(36).slice(2, 6)}`
      if (!taken.has(candidate)) return candidate
    }
    // 26^4 collisions in one day is not a thing that happens; if it somehow does,
    // a deterministic fallback beats a loop that never ends.
    return `rq-${stamp}-${records.length.toString(36)}`
  }

  const requireText = (value: unknown, label: string, max: number): string => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text === '') throw new RequirementError('invalid-input', `${label}不能为空。`)
    if (text.length > max) {
      throw new RequirementError('invalid-input', `${label}最多 ${max} 个字，现在有 ${text.length} 个。`)
    }
    return text
  }

  const requireStatus = (value: unknown): RequirementStatus => {
    const found = REQUIREMENT_STATUSES.find(status => status === value)
    if (found === undefined) {
      throw new RequirementError(
        'invalid-input',
        `状态只能是 ${REQUIREMENT_STATUSES.join(' / ')} 之一，收到的是「${String(value)}」。`,
      )
    }
    return found
  }

  /**
   * A file name that is safe to turn into a path, or a sentence saying why not.
   *
   * Shared by the model's artifact write and the panel's import because it is the
   * same question with the same answer, and because the *message* is the part the
   * caller acts on: two copies would drift into two different sets of rules.
   */
  const requireFileName = (value: unknown): string => {
    const name = typeof value === 'string' ? value.trim() : ''
    if (!isSafeArtifactName(name)) {
      throw new RequirementError(
        'invalid-input',
        `「${name}」不能用作文件名：不许含路径分隔符或 \\ / : * ? " < > |，不许以点或空格开头结尾，最长 ${MAX_ARTIFACT_NAME} 个字。`,
      )
    }
    return name
  }

  /** One of the three folders, checked at runtime because the caller is a URL. */
  const requireDir = (value: unknown): RequirementDir => {
    const found = REQUIREMENT_SUBDIRS.find(dir => dir === value)
    if (found === undefined) {
      throw new RequirementError(
        'invalid-input',
        `附件目录只能是 ${REQUIREMENT_SUBDIRS.join(' / ')} 之一，收到的是「${String(value)}」。`,
      )
    }
    return found
  }

  /**
   * One folder's files, as the panel and the model should see them.
   *
   * `readable` here is the extension's prediction only — `fileRead` has the bytes
   * and can correct it. The listing is one `readdir` + one `stat` per file, and it
   * must not open anything: a listing that reads files is a listing that costs a
   * gigabyte on a folder with a video in it.
   */
  const filesIn = async (id: string, dir: RequirementDir): Promise<readonly RequirementFile[]> => {
    const rows = await store.statFiles(id, dir)
    return rows.map(row => ({
      dir,
      name: row.name,
      file: `${id}/${dir}/${row.name}`,
      bytes: row.bytes,
      modifiedAt: row.modifiedAt,
      ...classifyFile(row.name),
    }))
  }

  return {
    root: store.root,
    indexPath: store.indexPath,

    list: async (query = {}) => {
      const index = await store.readIndex()
      const rows: RequirementSummary[] = []
      const unreadable: string[] = []
      for (const record of index.records) {
        if (query.projectId !== undefined && record.projectId !== query.projectId) continue
        const read = await store.readEntry(record.id)
        if (read.doc === undefined) {
          unreadable.push(record.id)
          continue
        }
        if (query.status !== undefined && read.doc.status !== query.status) continue
        rows.push(summaryOf(record, read.doc))
      }
      // Newest first by when it last changed, not by when it was filed: an entry
      // being worked on right now is the one the operator wants at the top.
      rows.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0))
      return {
        rows,
        root: store.root,
        ...(index.error === undefined ? {} : { error: index.error }),
        unreadable,
      }
    },

    read: async (ref, options = {}) => {
      const record = await resolve(ref)
      const doc = await load(record)
      return viewOf(record, doc, options.history === true)
    },

    create: (input, options = {}) =>
      queue(async () => {
        const index = await readIndexOrThrow()
        const projectId = requireText(input.projectId, '所属项目', 200)
        const name = requireText(input.name, '名称', MAX_NAME)
        // An empty description is a caller saying "none", not a caller making a
        // mistake; only a non-empty one has a length worth checking.
        const rawBody = typeof input.body === 'string' ? input.body.trim() : ''
        const body = rawBody === '' ? '' : requireText(rawBody, '描述', MAX_BODY)
        const status = input.status === undefined ? 'proposed' : requireStatus(input.status)

        if (options.dedupe === true) {
          const key = normalizeName(name)
          for (const record of index.records) {
            if (record.projectId !== projectId) continue
            const read = await store.readEntry(record.id)
            if (read.doc === undefined || normalizeName(read.doc.name) !== key) continue
            // The one thing that clears this refusal is an acknowledgement naming
            // *this* entry. Checked under the same queue turn as the write, so two
            // creates racing on one name cannot both find the field empty.
            if ((options.acknowledged ?? '').trim() !== record.id) {
              return { created: false, conflict: summaryOf(record, read.doc) } as const
            }
            break
          }
        }

        const at = now()
        const iso = at.toISOString()
        const id = uniqueId(index.records, at)
        const doc: RequirementEntryDoc = {
          name,
          status,
          created: iso,
          updated: iso,
          body,
          notes: [],
        }

        // The directory and its document first, the index row second. A crash in
        // between leaves an orphaned folder, which is invisible; the other order
        // would leave a listed entry with nothing behind it, which the operator
        // would see as a broken row and could do nothing about.
        await store.createEntryDir(id)
        await store.writeEntry(id, doc)
        await store.writeIndex([
          ...index.records,
          { id, projectId, file: `${id}/entry.md`, createdAt: iso },
        ])

        return { created: true, requirement: viewOf({ id, projectId, file: `${id}/entry.md`, createdAt: iso }, doc) } as const
      }),

    annotate: (ref, text) =>
      queue(async () => {
        const record = await resolve(ref)
        const doc = await load(record)
        const note = requireText(text, '要追加的内容', MAX_NOTE)
        const at = now()
        // The date is the host's, and the tool description says so, so the model
        // does not write a second one in its own words.
        const next = withNote(doc, `${localDate(at)} ${note}`, at.toISOString())
        await store.writeEntry(record.id, next)
        return viewOf(record, next)
      }),

    update: (ref, patch) =>
      queue(async () => {
        const record = await resolve(ref)
        const doc = await load(record)
        const at = now()
        const stamp = localDate(at)

        const notes: string[] = []
        let name = doc.name
        let status = doc.status

        if (patch.name !== undefined) {
          const next = requireText(patch.name, '名称', MAX_NAME)
          if (next !== doc.name) {
            notes.push(traceLine(stamp, 'name', doc.name, next))
            name = next
          }
        }
        if (patch.status !== undefined) {
          const next = requireStatus(patch.status)
          if (next !== doc.status) {
            notes.push(traceLine(stamp, 'status', REQUIREMENT_STATUS_TEXT[doc.status], REQUIREMENT_STATUS_TEXT[next]))
            status = next
          }
        }

        // A patch that changes nothing writes nothing. It is not an optimisation:
        // writing an identical file would move `updated` forward and append a trace
        // line reading 「旧 → 旧」, which is a change history that lies. Reporting
        // success is still right — the caller asked for a state the entry is in.
        if (notes.length === 0) return viewOf(record, doc)

        const next: RequirementEntryDoc = { ...doc, name, status, updated: at.toISOString(), notes: [...doc.notes, ...notes] }
        await store.writeEntry(record.id, next)
        return viewOf(record, next)
      }),

    archive: (ref, reason) =>
      queue(async () => {
        const record = await resolve(ref)
        const doc = await load(record)
        const at = now()
        const stamp = localDate(at)

        // Archiving is `update` plus a memory of why, kept in one write cycle so a
        // half-applied archive cannot exist.
        const notes: string[] = []
        if (doc.status !== 'dropped') {
          notes.push(traceLine(stamp, 'status', REQUIREMENT_STATUS_TEXT[doc.status], REQUIREMENT_STATUS_TEXT.dropped))
        } else {
          throw new RequirementError('invalid-input', `${doc.name} 已经是「已废弃」了，不必再废弃一次。`)
        }
        if (reason !== undefined) {
          notes.push(`${stamp} 废弃原因：${requireText(reason, '废弃原因', MAX_NOTE)}`)
        }

        const next: RequirementEntryDoc = { ...doc, status: 'dropped', updated: at.toISOString(), notes: [...doc.notes, ...notes] }
        await store.writeEntry(record.id, next)
        return viewOf(record, next)
      }),

    remove: ref =>
      queue(async () => {
        const index = await readIndexOrThrow()
        const record = await resolve(ref)
        const doc = await load(record)
        // The row goes first, the directory second. A crash in between leaves an
        // orphaned folder, which is invisible; the other order would leave a row
        // pointing at nothing, which the operator sees as a broken entry and cannot
        // clean up from the panel. (`create` writes in the same order, for the same
        // reason.)
        await store.writeIndex(index.records.filter(row => row.id !== record.id))
        await store.removeEntry(record.id)
        return { id: record.id, name: doc.name, path: store.dirPath(record.id) }
      }),

    artifactWrite: (ref, kind, name, content) =>
      queue(async () => {
        const record = await resolve(ref)
        const doc = await load(record)

        if (kind !== 'generated' && kind !== 'patches') {
          throw new RequirementError(
            'invalid-input',
            `产物只能写进 generated 或 patches，收到的是「${String(kind)}」。user/ 是使用者放材料的地方，模型不能写。`,
          )
        }
        // Named here rather than left to the store's guard so the caller gets a
        // sentence it can act on, instead of a refusal with no way forward.
        const file = requireFileName(name)
        const body = typeof content === 'string' ? content : ''
        if (body.trim() === '') throw new RequirementError('invalid-input', '产物内容不能为空。')
        if (body.length > MAX_ARTIFACT) {
          throw new RequirementError(
            'invalid-input',
            `产物内容最多 ${MAX_ARTIFACT} 个字，现在有 ${body.length} 个。大的文件放进去之前先想想它是不是该由使用者提供。`,
          )
        }

        const written = await store.writeArtifact(record.id, kind, file, body)
        return {
          id: record.id,
          entry: doc.name,
          kind,
          file: `${record.id}/${kind}/${file}`,
          path: written.path,
          bytes: written.bytes,
        }
      }),

    fileList: async (ref, only) => {
      const record = await resolve(ref)
      const doc = await load(record)
      const dirs: readonly RequirementDir[] =
        only === undefined ? REQUIREMENT_SUBDIRS : [requireDir(only)]
      const groups: RequirementFileGroup[] = []
      for (const dir of dirs) {
        const files = await filesIn(record.id, dir)
        // 每个文件带上「被覆盖过几次」。历史藏在子目录里，只有这里知道它有多少版；
        // `user/` 不覆盖，所以那一格连问都不用问。
        const counted = await Promise.all(files.map(async file => {
          if (dir === 'user') return file
          const history = await store.statHistory(record.id, dir, file.name)
          return history.length === 0 ? file : { ...file, history }
        }))
        groups.push({
          dir,
          files: counted,
          bytes: counted.reduce((sum, file) => sum + file.bytes, 0),
        })
      }
      return { id: record.id, entry: doc.name, dir: store.dirPath(record.id), groups }
    },

    fileRead: async (ref, dir, name, version) => {
      const record = await resolve(ref)
      const folder = requireDir(dir)
      const file = requireFileName(name)
      // 带 version 就是读历史里那一版；`user/` 不覆盖，也就没有历史可读。
      const fromHistory = version !== undefined && Number.isInteger(version) && folder !== 'user'
      const head = fromHistory
        ? await store.readHistoryHead(record.id, folder, file, version, MAX_FILE_READ_BYTES)
        : await store.readFileHead(record.id, folder, file, MAX_FILE_READ_BYTES)
      if (head === undefined) {
        throw new RequirementError(
          'not-found',
          fromHistory
            ? `${record.id} 的 ${folder}/「${file}」没有第 ${String(version)} 版。`
            : `${record.id} 的 ${folder}/ 里没有「${file}」。`,
        )
      }

      const predicted = classifyFile(file)
      // The extension decides whether it is worth opening at all. Everything the
      // model would do with a docx is "say it cannot be read", and that answer is
      // already known — reading a megabyte of zip to reach it is pure cost.
      const body = predicted.readable
        ? attachmentText(head.data, MAX_FILE_READ_CHARS)
        : { text: '', encoding: '', truncated: false, note: predicted.note }

      // Two limits can both bite on one file — the byte cap when it is read, and the
      // character cap when it is decoded — so the note is a list, not a choice.
      const reasons: string[] = []
      if (body.note !== undefined) reasons.push(body.note)
      if (head.bytes > head.data.length) {
        reasons.push(`文件共 ${sizeOf(head.bytes)}，上面只是开头 ${sizeOf(head.data.length)}。`)
      }
      const note = reasons.length === 0 ? undefined : reasons.join('')
      return {
        file: {
          dir: folder,
          name: head.name,
          file: `${record.id}/${folder}/${head.name}`,
          bytes: head.bytes,
          modifiedAt: head.modifiedAt,
          // The bytes get the last word: a name that promised text over a file that
          // is not text comes back unreadable, not as a screenful of mojibake.
          readable: predicted.readable && body.encoding !== '',
          ...(fromHistory ? { version } : {}),
          ...(note === undefined ? {} : { note }),
        },
        text: body.text,
        encoding: body.encoding,
        truncated: body.truncated || head.bytes > head.data.length,
        ...(note === undefined ? {} : { note }),
      }
    },

    importFile: (ref, dir, name, bytes) =>
      queue(async () => {
        const record = await resolve(ref)
        const doc = await load(record)
        const folder = requireDir(dir)
        const wanted = requireFileName(name)

        if (bytes.length === 0) {
          throw new RequirementError('invalid-input', `「${wanted}」是 0 字节，没有可归档的内容。`)
        }
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
          throw new RequirementError(
            'invalid-input',
            `一个附件最多 ${sizeOf(MAX_ATTACHMENT_BYTES)}，「${wanted}」有 ${sizeOf(bytes.length)}。这么大的东西别拷进库里——在条目描述里写清它在哪台机器、哪个共享盘上。`,
          )
        }

        const taken = (await store.statFiles(record.id, folder)).map(row => row.name)
        const file = freeName(wanted, taken)
        if (file === undefined) {
          throw new RequirementError(
            'invalid-input',
            `${folder}/ 里叫「${wanted}」的已经堆了 99 个，换个名字再放。`,
          )
        }

        await store.writeFileBytes(record.id, folder, file, bytes)
        // Read the size and the timestamp back off the file rather than reporting
        // the buffer's length and the wall clock: they are the same numbers here,
        // and only one of them stays true when something else touches the file.
        const written = await store.readFileHead(record.id, folder, file, 0)
        return {
          entry: doc.name,
          file: {
            dir: folder,
            name: file,
            file: `${record.id}/${folder}/${file}`,
            bytes: written?.bytes ?? bytes.length,
            modifiedAt: written?.modifiedAt ?? now().toISOString(),
            ...classifyFile(file),
          },
          ...(file === wanted ? {} : { renamedFrom: wanted }),
        }
      }),

    removeFile: (ref, dir, name) =>
      queue(async () => {
        const record = await resolve(ref)
        const doc = await load(record)
        const folder = requireDir(dir)
        const file = requireFileName(name)

        const rows = await store.statFiles(record.id, folder)
        const found = rows.find(row => row.name === file)
        if (found === undefined) {
          throw new RequirementError('not-found', `${record.id} 的 ${folder}/ 里没有「${file}」。`)
        }
        try {
          await store.removeFile(record.id, folder, file)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new RequirementError('not-found', `${folder}/${file} 刚刚被别的地方删掉了。`)
          }
          throw error
        }
        return {
          id: record.id,
          entry: doc.name,
          file: {
            dir: folder,
            name: file,
            file: `${record.id}/${folder}/${file}`,
            bytes: found.bytes,
            modifiedAt: found.modifiedAt,
            ...classifyFile(file),
          },
        }
      }),
  }
}
