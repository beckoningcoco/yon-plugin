/**
 * Answering questions from the knowledge base: which vaults exist, which page
 * answers a term, and what that page says.
 *
 * The work this saves is specific. A model about to write SQL against a YonBIP
 * database has to name a physical table and its columns, and it must not invent
 * either. The knowledge base already holds that mapping for thousands of
 * entities — `物理表`, `domain/服务域`, and a field table per page — but only if
 * something can find the page from a term the model actually has. That term is
 * usually not the URI: it is a Chinese display name, a table name seen in an
 * error message, or an English class name from a stack trace. {@link
 * YonWikiService.lookup} accepts any of them and reports how it matched, so the
 * model can tell an exact hit from a guess.
 *
 * Every answer carries the page's `status` and `last_verified` date. A vault is
 * hand-edited and long-lived, so some of what it holds is verified against a
 * running system and some is only extracted from a document; a lookup that
 * returned both without saying which would be quietly misleading.
 *
 * Indexes are cached in memory per vault for the life of one service instance,
 * and rebuilt only on request — see `wiki-index.ts` for why staleness is the
 * operator's decision rather than something detected behind their back.
 */
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  buildWikiIndex, ensureWikiIndex, entityDirOf, wikiIndexPath, writeWikiIndex,
  type WikiIndex, type WikiPage, type WikiVault,
} from './wiki-index.ts'
import type { WikiStore } from './wiki-store.ts'
import type { WikiVaultView } from '../shared/types.ts'

/** What a knowledge base call can fail with. */
export class WikiError extends Error {
  constructor(
    readonly code: 'not-found' | 'invalid-input' | 'not-configured',
    message: string,
  ) {
    super(message)
    this.name = 'WikiError'
  }
}

/** How a term matched a page, strongest first. */
export type WikiMatch = 'uri' | 'table' | 'page' | 'name' | 'contains'

/** One page a lookup matched. */
export interface WikiHit {
  /** Vault id the page belongs to. */
  readonly vault: string
  /** Human label of that vault. */
  readonly vaultLabel: string
  readonly page: string
  readonly uri: string | null
  readonly name: string
  readonly table?: string
  readonly domain?: string
  readonly app?: string
  readonly version?: string
  readonly status?: string
  readonly verified?: string
  readonly matchedBy: WikiMatch
}

/** The answer to one lookup. */
export interface WikiLookupResult {
  /** The term as it was asked. */
  readonly term: string
  readonly hits: readonly WikiHit[]
  /** When the index behind this answer was built. */
  readonly indexAge: string
  /** How many pages were searched. */
  readonly scanned: number
}

/** One page's full text, with the facts worth reading before the body. */
export interface WikiPageContent {
  readonly vault: string
  readonly vaultLabel: string
  readonly page: string
  readonly uri: string | null
  readonly version?: string
  readonly status?: string
  readonly verified?: string
  readonly text: string
}

/** One vault as the tools see it; the panel's copy is the shared view. */
export type { WikiVaultView }

/** The knowledge base, as the tools and the HTTP face use it. */
export interface YonWikiService {
  /** The registered vaults, with their index state. */
  list(): Promise<readonly WikiVaultView[]>
  /**
   * Find the pages answering one term.
   * @param term - URI, table name, page name, display name, or a fragment of any.
   * @param vaultId - restrict to one vault; all of them when omitted.
   */
  lookup(term: string, vaultId?: string): Promise<WikiLookupResult>
  /**
   * Read one page in full.
   * @param page - page name, with or without the `.md` suffix.
   * @param vaultId - which vault to read from; required when several could match.
   */
  read(page: string, vaultId?: string): Promise<WikiPageContent>
  /** Drop the cached indexes and rebuild them from disk. */
  rebuild(vaultId?: string): Promise<readonly WikiVaultView[]>
  /**
   * Forget what is cached for one vault: on disk and in memory.
   *
   * Called after a write. The page on disk is newer than any index, and a lookup
   * served from the in-memory copy would not see it until the process restarted —
   * which is the difference between "the write worked" and "the write worked and
   * the knowledge base can tell you about it".
   * @param vaultId - the vault that changed; all of them when omitted.
   */
  invalidate(vaultId?: string): Promise<void>
  dispose(): void
}

/** Read one required argument as a non-empty string. */
function asTerm(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WikiError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/**
 * How a page matches a term, or undefined when it does not.
 *
 * Exact hits are tried across every identity a page carries before any substring
 * is considered, so that a query for `voucher.order.Order` prefers the page whose
 * URI is exactly that over one merely containing it.
 *
 * @param page - the page to test.
 * @param needle - the term, already lower-cased and trimmed.
 * @returns the strongest match, or undefined.
 */
function matchOf(page: WikiPage, needle: string): WikiMatch | undefined {
  const uri = page.uri?.toLowerCase()
  const table = page.table?.toLowerCase()
  const name = page.name.toLowerCase()
  const id = page.page.toLowerCase()

  if (uri === needle) return 'uri'
  if (table === needle) return 'table'
  if (id === needle) return 'page'
  if (name === needle) return 'name'
  if (uri?.includes(needle) === true || table?.includes(needle) === true) return 'contains'
  if (name.includes(needle) || id.includes(needle)) return 'contains'
  return undefined
}

/** How strongly a match ranks; lower sorts first. */
const MATCH_RANK: Record<WikiMatch, number> = {
  uri: 0, table: 1, page: 2, name: 3, contains: 4,
}

/** Turn a page and a match into a hit. */
function toHit(vault: WikiVault, page: WikiPage, matchedBy: WikiMatch): WikiHit {
  return {
    vault: vault.id,
    vaultLabel: vault.label,
    page: page.page,
    uri: page.uri,
    name: page.name,
    ...(page.table === undefined ? {} : { table: page.table }),
    ...(page.domain === undefined ? {} : { domain: page.domain }),
    ...(page.app === undefined ? {} : { app: page.app }),
    ...(page.version === undefined ? {} : { version: page.version }),
    ...(page.status === undefined ? {} : { status: page.status }),
    ...(page.verified === undefined ? {} : { verified: page.verified }),
    matchedBy,
  }
}

/**
 * Build the knowledge base service over one store.
 * @param store - where the vault list lives.
 * @returns the service.
 */
export function createYonWikiService(store: WikiStore): YonWikiService {
  /** Indexes already read or built, keyed by vault path. */
  const indexes = new Map<string, WikiIndex>()

  /**
   * The vaults, freshly read.
   *
   * Read per call rather than cached: the list is one small file, and the
   * operator editing it in the panel should take effect on the next question
   * rather than on the next restart.
   */
  const vaults = async (): Promise<readonly WikiVault[]> => (await store.read()).vaults

  /** One vault by id, or every vault when no id is given. */
  const select = async (vaultId: string | undefined): Promise<readonly WikiVault[]> => {
    const all = await vaults()
    if (all.length === 0) {
      throw new WikiError(
        'not-configured',
        '还没有登记任何知识库。请在 Yon 面板的「知识库」里添加 Obsidian vault 路径。',
      )
    }
    if (vaultId === undefined) return all
    const wanted = all.filter(vault => vault.id === vaultId)
    if (wanted.length === 0) {
      throw new WikiError(
        'not-found',
        `没有 id 为「${vaultId}」的知识库。已登记：${all.map(v => v.id).join(', ')}`,
      )
    }
    return wanted
  }

  /** One vault's index, from the cache, disk, or a fresh build. */
  const indexFor = async (vault: WikiVault, refresh = false): Promise<WikiIndex> => {
    if (!refresh) {
      const cached = indexes.get(vault.path)
      if (cached !== undefined) return cached
    }
    if (entityDirOf(vault.path) === undefined) {
      throw new WikiError(
        'not-found',
        `知识库「${vault.label}」的目录结构无法识别：${vault.path}`,
      )
    }
    const index = refresh ? await buildWikiIndex(vault.path) : await ensureWikiIndex(vault.path)
    indexes.set(vault.path, index)
    return index
  }

  return {
    async list() {
      const all = await vaults()
      return Promise.all(all.map(async (vault): Promise<WikiVaultView> => {
        const ready = entityDirOf(vault.path) !== undefined
        if (!ready) return { ...vault, pages: 0, ready: false }
        const index = await indexFor(vault)
        return { ...vault, pages: index.entities.length, indexedAt: index.builtAt, ready: true }
      }))
    },

    async lookup(term, vaultId) {
      const needle = asTerm(term, 'term').toLowerCase()
      const selected = await select(vaultId)
      const hits: WikiHit[] = []
      let scanned = 0
      let age = ''

      for (const vault of selected) {
        const index = await indexFor(vault)
        scanned += index.entities.length
        if (age === '' || index.builtAt > age) age = index.builtAt
        for (const page of index.entities) {
          const matched = matchOf(page, needle)
          if (matched !== undefined) hits.push(toHit(vault, page, matched))
        }
      }

      hits.sort((a, b) => {
        const byMatch = MATCH_RANK[a.matchedBy] - MATCH_RANK[b.matchedBy]
        return byMatch !== 0 ? byMatch : a.page.localeCompare(b.page, 'zh')
      })

      return { term: asTerm(term, 'term'), hits, indexAge: age, scanned }
    },

    async read(page, vaultId) {
      const wanted = asTerm(page, 'page').replace(/\.md$/, '')
      const selected = await select(vaultId)

      for (const vault of selected) {
        const index = await indexFor(vault)
        const found = index.entities.find(entry => entry.page === wanted)
        if (found === undefined) continue
        const full = path.join(vault.path, found.file)
        const text = await readFile(full, 'utf8').catch(() => undefined)
        if (text === undefined) {
          throw new WikiError('not-found', `页面文件读不到：${full}`)
        }
        return {
          vault: vault.id,
          vaultLabel: vault.label,
          page: found.page,
          uri: found.uri,
          ...(found.version === undefined ? {} : { version: found.version }),
          ...(found.status === undefined ? {} : { status: found.status }),
          ...(found.verified === undefined ? {} : { verified: found.verified }),
          text,
        }
      }

      throw new WikiError(
        'not-found',
        `没有名为「${wanted}」的页面。先用 wiki_lookup 按表名或中文名找到确切的页面名。`,
      )
    },

    async rebuild(vaultId) {
      const selected = await select(vaultId)
      for (const vault of selected) {
        const index = await indexFor(vault, true)
        // A rebuilt index is written back, or the next process would read the
        // very file this call was meant to replace.
        await writeWikiIndex(index)
        indexes.set(vault.path, index)
      }
      return this.list()
    },

    async invalidate(vaultId) {
      const selected = await select(vaultId)
      for (const vault of selected) {
        indexes.delete(vault.path)
        await rm(wikiIndexPath(vault.path), { force: true }).catch(() => undefined)
      }
    },

    dispose() {
      indexes.clear()
    },
  }
}

/** The index path a vault would cache to, for the panel and for diagnostics. */
export function wikiIndexLocation(vault: WikiVault): string {
  return wikiIndexPath(vault.path)
}
