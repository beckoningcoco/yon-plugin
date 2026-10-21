/**
 * The registered front-end source projects: what the panel edits and the tools
 * read.
 *
 * The service owns the read-modify-write cycle over the store, for the same
 * reason `home-service.ts` does: set a default and the previous default has to be
 * cleared, remove the default and something else has to become it. The store
 * serialises its own writes, but two mutations that each read first would still
 * both act on the state before either wrote, so the whole cycle is queued here as
 * well.
 *
 * ## The one rule that spans more than this file
 *
 * **One version is one source project.** The operator asked for this explicitly:
 * the same version registered twice would only be a choice the model cannot make
 * — two directories, one version number, and no way to tell which is the real
 * one. Refusing the second registration says so at the moment the operator can
 * still fix it, and names the row it clashed with.
 *
 * ## Ids
 *
 * `fe-<产品线>-<版本>` — `fe-ncc-2005`. Derived rather than counted, and prefixed
 * so an id from `ncc_home_list` cannot be passed to `ncc_fe_read` by accident
 * without the mismatch being visible at the call site.
 *
 * Paths in and out are the operator's; ids are the model's. `ncc_fe_find` and
 * `ncc_fe_read` take an id and never a path, so a prompt-injected instruction
 * cannot aim them at a directory nobody registered.
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { findIn, readIn, resolveInside, type ReadOptions } from './home-files.ts'
import { isDir, probeFrontend } from './frontend-probe.ts'
import { grepProject, type GrepQuery } from './frontend-grep.ts'
import {
  frontendIndexPath, readPageIndex, removePageIndex, scanProject, writePageIndex,
  type FrontendPageIndex, type FrontendPageNode,
} from './frontend-pages.ts'
import type { FrontendStore, StoredFrontend } from './frontend-store.ts'
import {
  frontendLabelOf, type FrontendDirEntryView, type FrontendDirPayload, type FrontendFindPayload,
  type FrontendGrepPayload, type FrontendListPayload, type FrontendPageIndexView,
  type FrontendPageNodeView, type FrontendPagesPayload, type FrontendPageStatusView,
  type FrontendProduct, type FrontendReadPayload, type FrontendView, type SaveFrontendInput,
} from '../shared/types.ts'

/** What a caller may ask `find` for; `limit` is clamped by the file layer. */
export interface FrontendFindQuery {
  readonly name?: string
  readonly ext?: string
  readonly under?: string
  readonly limit?: number
}

/** What a caller may ask `pages` for. Every filter is a case-insensitive substring. */
export interface FrontendPageQuery {
  readonly domain?: string
  readonly module?: string
  readonly node?: string
  /** Matched against `领域/模块/节点`. */
  readonly term?: string
  /** How many nodes to return; defaults to 100, capped at 500. */
  readonly limit?: number
}

/**
 * The directories a search never descends into.
 *
 * Kept here rather than in the tool, because the panel's own file browsing has to
 * skip the same ones — a second list would eventually disagree with this one
 * about what counts as source.
 */
export const FRONTEND_SKIP_DIRS: readonly string[] = ['src/platform', 'node_modules', 'dist', '.git']

/** Directory names the panel's file list does not show. */
const HIDDEN_DIRS = new Set(['node_modules', 'dist', '.git'])

/** Default and ceiling for `pages`' node limit. */
const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGE_LIMIT = 500

/** The registered projects, as the host and the tools use them. */
export interface YonFrontendsService {
  /** The document the registrations live in, for the panel to name. */
  readonly storePath: string
  list(): Promise<FrontendListPayload>
  save(input: SaveFrontendInput, id?: string): Promise<FrontendView>
  remove(id: string): Promise<void>
  setDefault(id: string): Promise<FrontendView>
  probe(id: string): Promise<FrontendView>
  find(id: string, query: FrontendFindQuery): Promise<FrontendFindPayload>
  read(id: string, requested: string, options: ReadOptions): Promise<FrontendReadPayload>
  /** Search the project's text files for a literal string or a regular expression. */
  grep(id: string, query: GrepQuery): Promise<FrontendGrepPayload>
  /**
   * The project's page nodes, from the stored index — built on first ask.
   *
   * Lazy rather than on save: the index costs a walk of the whole project, and a
   * registration that is only being looked at should not pay for it. The answer
   * says when it was built, so a stale one is visible.
   */
  pages(id: string, query?: FrontendPageQuery): Promise<FrontendPagesPayload>
  /** What is stored, or undefined when nothing is. */
  pageStatus(id: string): Promise<FrontendPageStatusView | undefined>
  /** Walk the project again and replace the index. */
  rebuildPages(id: string): Promise<FrontendPageStatusView>
  /** Drop the index; the next `pages` call rebuilds it. */
  removePages(id: string): Promise<boolean>
  /** One directory level, for the panel's page tree. */
  dir(id: string, requested: string): Promise<FrontendDirPayload>
  /** The version to fall back on when a caller names none. */
  defaultVersion(): Promise<string | undefined>
}

/** The service and the disposer that drops its state. */
export interface YonFrontendsHandle {
  readonly service: YonFrontendsService
  dispose(): void
}

/** One failure a front-end call reports. */
export class FrontendError extends Error {
  constructor(
    readonly code: 'not-found' | 'invalid-input',
    message: string,
  ) {
    super(message)
    this.name = 'FrontendError'
  }
}

/** A short, readable id built from what the entry is. */
function slugOf(text: string): string {
  return text
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_\u4e00-\u9fa5-]/g, '')
    .slice(0, 40)
}

/**
 * An id no other registration holds.
 *
 * `<产品线>-<版本>` under the `fe-` prefix, which is exactly the identity the
 * clash rule enforces — so the id the model passes to `ncc_fe_read` reads as the
 * thing it names. A collision is broken by a number rather than by a timestamp,
 * so the second one stays typeable; it can only happen when the document was
 * hand-edited, because the clash rule refuses the second registration first.
 */
function uniqueId(frontends: readonly StoredFrontend[], product: FrontendProduct, version: string): string {
  const base = ['fe', product, slugOf(version)].filter(part => part !== '').join('-').toLowerCase() || 'fe'
  const taken = new Set(frontends.map(row => row.id))
  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`
  }
  return `${base}-${Date.now()}`
}

/**
 * A registration's path as it is stored: forward slashes, no trailing separator.
 *
 * Both separators are accepted because people paste from Explorer; the stored form
 * is one spelling so the document reads the same on either platform.
 */
function normalisePath(input: string): string {
  return input.trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

/** One stored registration as the panel and the model read it. */
async function viewOf(row: StoredFrontend, pageIndex?: FrontendPageIndexView): Promise<FrontendView> {
  // A stored profile describes the last probe, not the directory as it is now, so
  // the cheap check decides whether the row is live and the profile decides
  // whether it ever looked like a source project.
  const ready = await isDir(row.path) && row.profile?.shape !== 'not-found'
  return {
    id: row.id,
    // Computed here rather than stored, so every reader sees the same name and a
    // hand-edited `version` cannot leave the surface showing a name that describes
    // a version the row no longer has.
    label: frontendLabelOf(row.product, row.version),
    path: row.path,
    product: row.product,
    version: row.version,
    isDefault: row.isDefault,
    ready,
    ...row.profile === undefined ? {} : { profile: row.profile },
    ...pageIndex === undefined ? {} : { pageIndex },
  }
}

/**
 * Open the service over a store.
 * @param store - the registration document.
 * @param indexDir - where page-index documents live; defaults to the operator's
 *   own directory. The seam exists so a test can exercise the lazy build without
 *   writing into the machine that runs it.
 * @returns the service and its disposer.
 */
export function createYonFrontendsService(store: FrontendStore, indexDir?: string): YonFrontendsHandle {
  let queue: Promise<unknown> = Promise.resolve()
  let disposed = false

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  /** Read the registrations, refusing to act on a document that is unreadable. */
  const readAll = async (): Promise<readonly StoredFrontend[]> => {
    const read = await store.read()
    if (read.error !== undefined) throw new FrontendError('invalid-input', read.error)
    return read.frontends
  }

  const requireFrontend = async (id: string): Promise<StoredFrontend> => {
    const frontends = await readAll()
    const found = frontends.find(row => row.id === id)
    if (found !== undefined) return found
    const known = frontends.map(row => row.id).join('、')
    throw new FrontendError('not-found',
      `没有登记这个前端源码工程：${id}。先调 ncc_fe_list 拿 id。已登记：${known === '' ? '（还没有）' : known}`)
  }

  /** One index node as the panel and the tools read it. */
  const pageView = (node: FrontendPageNode): FrontendPageNodeView => ({
    domain: node.domain,
    module: node.module,
    node: node.node,
    dir: node.dir,
    entries: node.entries.map(entry => ({ kind: entry.kind, rel: entry.rel, bytes: entry.bytes })),
    files: node.files,
    bytes: node.bytes,
  })

  /** Walk the project and store what it found. */
  const scanAndStore = async (row: StoredFrontend): Promise<FrontendPageIndex> => {
    const scan = await scanProject(row.path)
    const index: FrontendPageIndex = {
      version: row.version,
      root: row.path,
      builtAt: new Date().toISOString(),
      nodes: scan.pageNodes,
    }
    await writePageIndex(row.id, index, indexDir)
    return index
  }

  /**
   * The stored index, or a fresh one.
   *
   * A stale index — the registration's path was edited since the walk — is
   * rebuilt rather than served: its nodes describe a directory that is no longer
   * the one the operator registered, and a tree of pages that do not exist is
   * worse than waiting two seconds.
   */
  const ensurePageIndex = async (row: StoredFrontend): Promise<FrontendPageIndex> => {
    const read = await readPageIndex(row.id, row.path, indexDir)
    if (read.index !== undefined && !read.stale) return read.index
    return await scanAndStore(row)
  }

  /** The index summary a list row carries, or undefined when nothing is stored. */
  const indexViewOf = async (row: StoredFrontend): Promise<FrontendPageIndexView | undefined> => {
    const read = await readPageIndex(row.id, row.path, indexDir)
    if (read.index === undefined) return undefined
    return {
      builtAt: read.index.builtAt,
      nodes: read.index.nodes.length,
      pages: read.index.nodes.reduce((sum, node) => sum + node.entries.length, 0),
      stale: read.stale,
    }
  }

  const service: YonFrontendsService = {
    storePath: store.path,

    async list(): Promise<FrontendListPayload> {
      const read = await store.read()
      const frontends = await Promise.all(read.frontends.map(async (row) =>
        await viewOf(row, await indexViewOf(row))))
      return {
        frontends,
        configPath: store.path,
        complete: read.error === undefined,
        ...read.error === undefined ? {} : { error: read.error },
      }
    },

    async save(input: SaveFrontendInput, id?: string): Promise<FrontendView> {
      return await inLine(async () => {
        const frontends = await readAll()
        const root = normalisePath(input.path)
        const version = input.version.trim()
        if (root === '') throw new FrontendError('invalid-input', '路径不能为空')
        if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(root)) {
          throw new FrontendError('invalid-input',
            `路径要写完整，从盘符或 / 开始（例如 E:/NCProject/NCC2005/touziwuye/hotwebs）；收到的是「${input.path}」`)
        }
        if (version === '') {
          throw new FrontendError('invalid-input', '版本不能为空：一个版本一份源码，版本就是这条登记的身份。')
        }
        // Only one product line is implemented. Refusing the other explicitly beats
        // reading it as NCC and answering a question about the wrong product.
        if (input.product !== 'ncc') {
          throw new FrontendError('invalid-input',
            '这一版只支持 NCC 前端源码（hotwebs 多页脚手架）；旗舰版的前端是另一套结构，不在这条登记里。')
        }

        const existing = id === undefined ? undefined : frontends.find(row => row.id === id)
        if (id !== undefined && existing === undefined) {
          throw new FrontendError('not-found', `没有登记这个前端源码工程：${id}`)
        }

        const clash = frontends.find(row =>
          row.version === version && row.product === input.product && row.id !== existing?.id)
        if (clash !== undefined) {
          throw new FrontendError('invalid-input',
            `版本 ${version} 已经由「${frontendLabelOf(clash.product, clash.version)}」登记过了。`
            + '一个版本只留一份源码，否则模型拿到两个目录却分不出哪份是真的；要换成另一份，请先删掉那一条。')
        }

        const isDefault = input.isDefault ?? existing?.isDefault ?? frontends.length === 0
        const profile = await probeFrontend(root)
        const updated: StoredFrontend = {
          id: existing?.id ?? uniqueId(frontends, input.product, version),
          path: root,
          product: input.product,
          version,
          isDefault,
          profile,
        }

        // Rebuilt in place rather than appended-then-sorted: editing an entry must
        // not move it in the list, because the operator is looking at that list.
        const next = frontends.map(row => row.id === updated.id
          ? updated
          : { ...row, isDefault: isDefault ? false : row.isDefault })
        if (existing === undefined) next.push(updated)

        await store.write(next)
        return await viewOf(updated)
      })
    },

    async remove(id: string): Promise<void> {
      await inLine(async () => {
        const frontends = await readAll()
        const found = frontends.find(row => row.id === id)
        if (found === undefined) throw new FrontendError('not-found', `没有登记这个前端源码工程：${id}`)
        const next = frontends.filter(row => row.id !== id)
        // A list with no default has no answer for "which source" — the model would
        // fall back to the first row, which is a guess. So the first survivor takes
        // over, exactly as the Home list does.
        const promoted = found.isDefault && next.length > 0
          ? next.map((row, position) => position === 0 ? { ...row, isDefault: true } : row)
          : next
        await store.write(promoted)
      })
    },

    async setDefault(id: string): Promise<FrontendView> {
      return await inLine(async () => {
        const frontends = await readAll()
        const found = frontends.find(row => row.id === id)
        if (found === undefined) throw new FrontendError('not-found', `没有登记这个前端源码工程：${id}`)
        const next = frontends.map(row => ({ ...row, isDefault: row.id === id }))
        await store.write(next)
        return await viewOf({ ...found, isDefault: true })
      })
    },

    async probe(id: string): Promise<FrontendView> {
      return await inLine(async () => {
        const frontends = await readAll()
        const found = frontends.find(row => row.id === id)
        if (found === undefined) throw new FrontendError('not-found', `没有登记这个前端源码工程：${id}`)
        const probed: StoredFrontend = { ...found, profile: await probeFrontend(found.path) }
        await store.write(frontends.map(row => row.id === id ? probed : row))
        return await viewOf(probed)
      })
    },

    async find(id: string, query: FrontendFindQuery): Promise<FrontendFindPayload> {
      const frontend = await requireFrontend(id)
      const found = await findIn(frontend.path, {
        limit: query.limit === undefined || !Number.isFinite(query.limit) ? 50 : Math.max(1, Math.min(200, Math.floor(query.limit))),
        ...query.name === undefined ? {} : { name: query.name },
        ...query.ext === undefined ? {} : { ext: query.ext },
        ...query.under === undefined ? {} : { under: query.under },
        skip: FRONTEND_SKIP_DIRS,
      })
      return {
        frontend: id,
        matches: found.matches,
        scanned: found.scanned,
        capped: found.capped,
        skipped: FRONTEND_SKIP_DIRS,
      }
    },

    async read(id: string, requested: string, options: ReadOptions): Promise<FrontendReadPayload> {
      const frontend = await requireFrontend(id)
      const found = await readIn(frontend.path, requested, options)
      return {
        frontend: id,
        rel: found.rel,
        encoding: found.encoding,
        bytes: found.bytes,
        totalLines: found.totalLines,
        from: found.from,
        to: found.to,
        truncated: found.truncated,
        masked: found.masked,
        text: found.text,
      }
    },

    async grep(id: string, query: GrepQuery): Promise<FrontendGrepPayload> {
      const row = await requireFrontend(id)
      const result = await grepProject(row.path, query)
      return {
        frontend: id,
        pattern: query.pattern,
        matches: result.matches,
        filesScanned: result.filesScanned,
        filesMatched: result.filesMatched,
        capped: result.capped,
        timedOut: result.timedOut,
        skipped: result.skipped,
      }
    },

    async pages(id: string, query: FrontendPageQuery = {}): Promise<FrontendPagesPayload> {
      const row = await requireFrontend(id)
      // The walk is inside the queue because it ends in a write: two callers asking
      // at once would otherwise both walk the project and one would overwrite the
      // other's identical document.
      const index = await inLine(() => ensurePageIndex(row))
      const needle = (query.term ?? '').trim().toLowerCase()
      const has = (value: string, filter?: string): boolean =>
        filter === undefined || filter.trim() === '' || value.toLowerCase().includes(filter.trim().toLowerCase())
      const matched = index.nodes.filter(node =>
        has(node.domain, query.domain)
        && has(node.module, query.module)
        && has(node.node, query.node)
        && (needle === '' || `${node.domain}/${node.module}/${node.node}`.toLowerCase().includes(needle)))
      const requested = query.limit === undefined || !Number.isFinite(query.limit)
        ? DEFAULT_PAGE_LIMIT
        : Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.floor(query.limit)))
      return {
        frontend: id,
        builtAt: index.builtAt,
        totalNodes: index.nodes.length,
        totalPages: index.nodes.reduce((sum, node) => sum + node.entries.length, 0),
        matched: matched.length,
        nodes: matched.slice(0, requested).map(pageView),
      }
    },

    async pageStatus(id: string): Promise<FrontendPageStatusView | undefined> {
      const row = await requireFrontend(id)
      const read = await readPageIndex(id, row.path, indexDir)
      if (read.index === undefined) return undefined
      return {
        builtAt: read.index.builtAt,
        nodes: read.index.nodes.length,
        pages: read.index.nodes.reduce((sum, node) => sum + node.entries.length, 0),
        stale: read.stale,
        path: read.path,
      }
    },

    async rebuildPages(id: string): Promise<FrontendPageStatusView> {
      return await inLine(async () => {
        const row = await requireFrontend(id)
        const index = await scanAndStore(row)
        return {
          builtAt: index.builtAt,
          nodes: index.nodes.length,
          pages: index.nodes.reduce((sum, node) => sum + node.entries.length, 0),
          stale: false,
          path: frontendIndexPath(id, indexDir),
        }
      })
    },

    async removePages(id: string): Promise<boolean> {
      await requireFrontend(id)
      return await removePageIndex(id, indexDir)
    },

    async dir(id: string, requested: string): Promise<FrontendDirPayload> {
      const row = await requireFrontend(id)
      const target = await resolveInside(row.path, requested.trim() === '' ? '.' : requested)
      const info = await stat(target).catch(() => undefined)
      if (info === undefined || !info.isDirectory()) {
        throw new FrontendError('invalid-input', `${requested} 不是这个工程里的目录。`)
      }
      const entries = await readdir(target, { withFileTypes: true }).catch(() => [])
      const rows: FrontendDirEntryView[] = []
      for (const entry of entries) {
        if (entry.isDirectory() && (HIDDEN_DIRS.has(entry.name) || entry.name.startsWith('.'))) continue
        const full = path.join(target, entry.name)
        const rel = path.relative(row.path, full).split(path.sep).join('/')
        // The runtime library is a directory nobody browses: it is 65–207 MB of
        // react/axios in every project, and its contents are not this project's work.
        if (entry.isDirectory() && FRONTEND_SKIP_DIRS.includes(rel)) continue
        rows.push({
          name: entry.name,
          rel,
          directory: entry.isDirectory(),
          bytes: entry.isFile() ? await stat(full).then(found => found.size).catch(() => 0) : 0,
        })
      }
      rows.sort((left, right) =>
        Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name))
      return { frontend: id, dir: requested.trim(), entries: rows }
    },

    async defaultVersion(): Promise<string | undefined> {
      if (disposed) return undefined
      const read = await store.read()
      const chosen = read.frontends.find(row => row.isDefault) ?? read.frontends[0]
      const version = chosen?.version ?? ''
      return version === '' ? undefined : version
    },
  }

  return {
    service,
    dispose() {
      disposed = true
    },
  }
}
