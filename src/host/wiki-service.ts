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
  type WikiIndex, type WikiPage, type WikiRefKind, type WikiVault,
} from './wiki-index.ts'
import {
  assessPage, buildGraph, gapsOf, relationsOf, summaryOf,
  type WikiAssessment, type WikiGap, type WikiGraph, type WikiGraphSummary,
  type WikiLevel, type WikiRelations,
} from './wiki-graph.ts'
import type { WikiStore } from './wiki-store.ts'
import {
  createWikiUsageLog,
  type WikiUsageLog, type WikiUsageMiss, type WikiUsageSummary,
} from './wiki-usage.ts'
import type { WikiLogEntry, WikiVaultView } from '../shared/types.ts'

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
  /**
   * What the page can answer, so a hit list sorts itself by usefulness.
   *
   * Carried on every hit rather than only on a full read: a lookup for 销售订单
   * returns 49 pages, and the one that lists columns is worth opening first.
   */
  readonly level: WikiLevel
  /** Fields the page claims to list, when it claims a number. */
  readonly fieldCount?: number
  readonly matchedBy: WikiMatch
}

/** One kind of relation, with a sample of its targets and how many there are. */
export interface WikiRelationGroup {
  readonly kind: WikiRefKind
  /** How many targets of this kind there are in total. */
  readonly total: number
  /**
   * The first few targets, sorted.
   *
   * A sample rather than all of them on purpose: `YhtTenant` is referenced by
   * 2380 pages, and a caller that wants the full list wants a graph tool, not a
   * page read.
   */
  readonly sample: readonly string[]
}

/** A page's relations, both directions, capped to something readable. */
export interface WikiRelationView {
  /** Entities this page points at. */
  readonly outgoing: readonly WikiRelationGroup[]
  /** Pages pointing at this one. */
  readonly incoming: readonly WikiRelationGroup[]
  /**
   * Of the outgoing references, the ones no page in the vault covers.
   *
   * A count plus a sample, because the number is the interesting part and the
   * names only need to be illustrative: a page citing 300 undocumented entities
   * should say so rather than print 300 lines.
   */
  readonly unresolved: { readonly total: number, readonly sample: readonly string[] }
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
  /** What this page can answer, and what it lacks to answer more. */
  readonly assessment: WikiAssessment
  /**
   * Where this page leads, and what leads here.
   *
   * Returned with the page rather than behind a separate tool because the moment
   * a caller wants it is the moment it has finished reading: the next question is
   * almost always "what else is built on this".
   */
  readonly relations: WikiRelationView
  readonly text: string
}

/** One hole in the vault: an entity its pages cite and none of them covers. */
export type { WikiGap }

/** What a page can answer, and what it lacks to answer more. */
export type { WikiAssessment }

/** What a gap report says about one vault. */
export interface WikiGapReport {
  readonly vault: string
  readonly vaultLabel: string
  readonly summary: WikiGraphSummary
  /** The largest holes, most-cited first. */
  readonly gaps: readonly WikiGap[]
  /**
   * Terms that were asked for and came back empty.
   *
   * The other half of the picture, and not a restatement of `gaps`: those are
   * entities the pages cite and no page covers, while these are what a caller
   * wanted and the vault never had. A term can appear here with nothing citing it
   * at all — the case where documentation is missing rather than incomplete.
   *
   * Folded across every vault, because one question can span them.
   */
  readonly misses: readonly WikiUsageMiss[]
  /** How many questions the log holds, so an empty miss list reads correctly. */
  readonly asked: number
}

/** One vault as the tools see it; the panel's copy is the shared view. */
export type { WikiVaultView }

/** One log line; the panel's copy is the shared view. */
export type { WikiLogEntry }

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
  /**
   * The vault's own history: the tail of its `log.md`.
   *
   * Every write appends a line there, so this answers "what has this knowledge base
   * been told lately" from a file that is already being maintained — without a new
   * store, and without the model having to guess its way in page by page.
   * @param vaultId - which vault; all of them when omitted.
   * @param limit - how many entries, newest first; 20 when omitted.
   */
  recent(vaultId?: string, limit?: number): Promise<readonly WikiLogEntry[]>
  /**
   * The vault's own holes: entities its pages cite and none of them covers.
   *
   * Unlike a usage log, this needs nothing to accumulate — the evidence is
   * already in the pages, which name 23,052 references to entities the vault does
   * not hold. Those citations are the demand; the absence of a page is the supply.
   * @param vaultId - which vault; all of them when omitted.
   * @param limit - how many gaps per vault, most-cited first; 15 when omitted.
   */
  gaps(vaultId?: string, limit?: number): Promise<readonly WikiGapReport[]>
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

/**
 * How many relation targets a page read lists per kind.
 *
 * Enough to show the shape of a page's neighbourhood, few enough that a hub does
 * not flood the answer with names. The total is reported alongside, so nothing is
 * hidden by the cap — only shortened.
 */
const RELATION_SAMPLE = 8

/** Turn a page and a match into a hit. */
function toHit(vault: WikiVault, page: WikiPage, matchedBy: WikiMatch, graph: WikiGraph): WikiHit {
  const verdict = assessPage(page, graph)
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
    level: verdict.level,
    ...(verdict.fieldCount === undefined ? {} : { fieldCount: verdict.fieldCount }),
    matchedBy,
  }
}

/**
 * Reduce one page's relations to what a page read can carry.
 *
 * Each kind keeps only a sample, because the interesting number is usually the
 * total: a page referenced by 2380 others is a hub, and listing 2380 names would
 * bury that fact rather than state it.
 *
 * @param relations - the full relation set.
 * @param sample - how many targets to keep per kind.
 * @returns the grouped view.
 */
function toRelationView(relations: WikiRelations, sample: number): WikiRelationView {
  const group = (source: ReadonlyMap<WikiRefKind, readonly string[]>): WikiRelationGroup[] =>
    [...source]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([kind, targets]) => ({ kind, total: targets.length, sample: targets.slice(0, sample) }))
  return {
    outgoing: group(relations.outgoing),
    incoming: group(relations.incoming),
    unresolved: relations.unresolved,
  }
}

/**
 * Build the knowledge base service over one store.
 * @param store - where the vault list lives.
 * @param usage - where queries are logged; the default log when omitted.
 * @returns the service.
 */
export function createYonWikiService(
  store: WikiStore,
  usage: WikiUsageLog = createWikiUsageLog(),
): YonWikiService {
  /** Indexes already read or built, keyed by vault path. */
  const indexes = new Map<string, WikiIndex>()

  /**
   * Reference graphs, keyed the same way.
   *
   * Kept beside the index rather than inside it: a graph is a pure function of an
   * index, so it costs nothing to drop when the index is replaced. Storing it
   * would mean two things to invalidate instead of one.
   */
  const graphs = new Map<string, WikiGraph>()

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
    graphs.delete(vault.path)
    return index
  }

  /** One vault's reference graph, derived from whatever index is current. */
  const graphFor = async (vault: WikiVault): Promise<WikiGraph> => {
    await indexFor(vault)
    const cached = graphs.get(vault.path)
    if (cached !== undefined) return cached
    const built = buildGraph(await indexFor(vault))
    graphs.set(vault.path, built)
    return built
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
      const asked = asTerm(term, 'term')
      const needle = asked.toLowerCase()
      const selected = await select(vaultId)
      const hits: WikiHit[] = []
      let scanned = 0
      let age = ''

      for (const vault of selected) {
        const index = await indexFor(vault)
        const graph = await graphFor(vault)
        scanned += index.entities.length
        if (age === '' || index.builtAt > age) age = index.builtAt
        for (const page of index.entities) {
          const matched = matchOf(page, needle)
          if (matched !== undefined) hits.push(toHit(vault, page, matched, graph))
        }
      }

      hits.sort((a, b) => {
        const byMatch = MATCH_RANK[a.matchedBy] - MATCH_RANK[b.matchedBy]
        return byMatch !== 0 ? byMatch : a.page.localeCompare(b.page, 'zh')
      })

      await usage.record({
        tool: 'wiki_lookup',
        term: asked,
        hits: hits.length,
        ...(vaultId === undefined ? {} : { vault: vaultId }),
        ...(hits[0] === undefined ? {} : { top: hits[0].page }),
      })
      return { term: asked, hits, indexAge: age, scanned }
    },

    async read(page, vaultId) {
      const wanted = asTerm(page, 'page').replace(/\.md$/, '')
      const selected = await select(vaultId)

      for (const vault of selected) {
        const index = await indexFor(vault)
        const found = index.entities.find(entry => entry.page === wanted)
        if (found === undefined) continue
        const graph = await graphFor(vault)
        const full = path.join(vault.path, found.file)
        const text = await readFile(full, 'utf8').catch(() => undefined)
        if (text === undefined) {
          throw new WikiError('not-found', `页面文件读不到：${full}`)
        }
        await usage.record({
          tool: 'wiki_read',
          term: wanted,
          hits: 1,
          ...(vaultId === undefined ? {} : { vault: vaultId }),
          top: found.page,
        })
        return {
          vault: vault.id,
          vaultLabel: vault.label,
          page: found.page,
          uri: found.uri,
          ...(found.version === undefined ? {} : { version: found.version }),
          ...(found.status === undefined ? {} : { status: found.status }),
          ...(found.verified === undefined ? {} : { verified: found.verified }),
          assessment: assessPage(found, graph),
          relations: toRelationView(relationsOf(found.page, graph), RELATION_SAMPLE),
          text,
        }
      }

      // A miss is the entry worth keeping. This is a caller who wanted a page and
      // the vault did not have one — evidence no static measure of the vault can
      // produce, because it is about demand rather than supply.
      await usage.record({
        tool: 'wiki_read',
        term: wanted,
        hits: 0,
        ...(vaultId === undefined ? {} : { vault: vaultId }),
      })
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
        graphs.delete(vault.path)
      }
      return this.list()
    },

    async recent(vaultId, limit) {
      const selected = await select(vaultId)
      const wanted = limit === undefined ? 20 : Math.min(Math.max(Math.floor(limit), 1), 200)
      const entries: WikiLogEntry[] = []
      for (const vault of selected) {
        const log = await readFile(path.join(vault.path, 'log.md'), 'utf8').catch(() => undefined)
        if (log === undefined) continue
        for (const line of log.split(/\r?\n/)) {
          const m = /^-\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(line.trim())
          if (m === null) continue
          entries.push({
            date: m[1] ?? '',
            text: (m[2] ?? '').trim(),
            vault: vault.id,
            vaultLabel: vault.label,
          })
        }
      }
      // `log.md` is append-only, so the newest lines are at the end. Reversing gives
      // newest-first without parsing timestamps the format does not carry — a line
      // knows its day, not its minute.
      return entries.reverse().slice(0, wanted)
    },

    async gaps(vaultId, limit) {
      const selected = await select(vaultId)
      const wanted = limit === undefined ? 15 : Math.min(Math.max(Math.floor(limit), 1), 500)
      const reports: WikiGapReport[] = []
      const folded: WikiUsageSummary = await usage.summary(wanted)
      for (const vault of selected) {
        const index = await indexFor(vault)
        const graph = await graphFor(vault)
        reports.push({
          vault: vault.id,
          vaultLabel: vault.label,
          summary: summaryOf(index, graph),
          gaps: gapsOf(graph, wanted),
          misses: folded.misses,
          asked: folded.total,
        })
      }
      return reports
    },

    async invalidate(vaultId) {
      const selected = await select(vaultId)
      for (const vault of selected) {
        indexes.delete(vault.path)
        graphs.delete(vault.path)
        await rm(wikiIndexPath(vault.path), { force: true }).catch(() => undefined)
      }
    },

    dispose() {
      indexes.clear()
      graphs.clear()
    },
  }
}

/** The index path a vault would cache to, for the panel and for diagnostics. */
export function wikiIndexLocation(vault: WikiVault): string {
  return wikiIndexPath(vault.path)
}
