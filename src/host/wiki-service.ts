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
 *
 * ## The two calls that write
 *
 * {@link YonWikiService.saveVault} and {@link YonWikiService.removeVault} are the
 * only things here that change the registration, and what they change is this
 * panel's own document — the list of which directories count as knowledge bases.
 * They are on this interface rather than in a module of their own because the store
 * is already here and the HTTP face takes one service per surface. Neither writes a
 * page and neither deletes anything inside a vault, so registering and unregistering
 * cannot damage the operator's repository. One qualification, because the difference
 * matters: a save answers with the same view `list()` builds, so on a directory that
 * already *is* a vault the answer materialises the derived `wiki/.yon-index.json`
 * exactly the way a read does. Page writes are a different act with a different gate,
 * and they live in `wiki-write.ts`.
 */
import { readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  buildWikiIndex, ensureWikiIndex, entityDirOf, isVault, unindexedDirsOf, wikiIndexPath, writeWikiIndex,
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
import type { SaveVaultInput, WikiLogEntry, WikiVaultView } from '../shared/types.ts'
import type {
  WikiCardView, WikiGraphView, WikiHealthReport, WikiLevelStat,
  WikiRelationGroupView, WikiUnindexedDir, WikiUsageView,
} from '../shared/types.ts'

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
  /** How many pages were searched — entity pages, which is all a search can read. */
  readonly scanned: number
  /**
   * Pages in the searched vaults that no search can reach.
   *
   * Carried on every answer, not only the empty ones: a term that missed is
   * exactly when a caller needs to know the vault holds pages this tool cannot
   * see, and a term that hit still benefits from knowing the corpus is wider.
   */
  readonly unindexed: readonly WikiUnindexedDir[]
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
  /**
   * One vault's health, for the panel's overview and gap tabs.
   *
   * Everything the panel draws about a vault's state, in one answer: the page
   * count, the level breakdown, the reference tallies, the largest holes and the
   * query activity. Assembled here rather than by three panel calls, so that two
   * tabs cannot show figures from two different moments.
   * @param vaultId - which vault; all of them when omitted.
   * @param gapLimit - how many holes to include; 20 when omitted.
   */
  health(vaultId?: string, gapLimit?: number): Promise<readonly WikiHealthReport[]>
  /**
   * One page as a card: what it is good for and where it leads.
   *
   * Answered from the index and the graph alone — the page body is never read,
   * because a card is what the panel shows *before* deciding to open anything.
   * @param page - page name, with or without the `.md` suffix.
   * @param vaultId - which vault; required when several could match.
   */
  card(page: string, vaultId?: string): Promise<WikiCardView>
  /**
   * The pages citing one entity URI.
   *
   * Expands a gap: knowing `bip-usercenter.bip_user_ref` is cited 818 times is a
   * number, and knowing which 818 pages cite it is a to-do list.
   * @param uri - the entity URI, as a page writes it.
   * @param vaultId - which vault; all of them when omitted.
   */
  citers(uri: string, vaultId?: string): Promise<readonly string[]>
  /** Drop the cached indexes and rebuild them from disk. */
  rebuild(vaultId?: string): Promise<readonly WikiVaultView[]>
  /**
   * Register a vault, or edit one that is already registered.
   *
   * The registration is the panel's own bookkeeping, so this writes the panel's
   * document and nothing else — a vault's files, its index cache included, belong
   * to the operator's own repository and are not this service's to touch.
   * @param input - the label and the directory.
   * @param id - the registration to edit; absent to add a new one. Immutable.
   * @returns the stored vault, with its readiness.
   */
  saveVault(input: SaveVaultInput, id?: string): Promise<WikiVaultView>
  /**
   * Drop one registration.
   *
   * The directory is left exactly as it is, `wiki/.yon-index.json` included: the
   * index is derived and will be rebuilt if the vault is registered again, and
   * deleting a file inside somebody's Obsidian repository to unlist it would be
   * this panel reaching outside what it owns.
   * @param id - the registration to remove.
   */
  removeVault(id: string): Promise<void>
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
 * A vault root as it is stored: forward slashes, no trailing separator.
 *
 * Both separators are accepted because people paste from Explorer and the host's
 * folder chooser returns whichever the platform uses; the stored form is one
 * spelling so the document reads the same on either platform, and so a vault
 * cannot be registered twice under two spellings of one directory.
 * @param input - the path as it arrived.
 * @returns the stored form.
 */
function normaliseRoot(input: string): string {
  return input.trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

/** A short, readable id built from the directory the vault would live in. */
function slugOf(text: string): string {
  return text
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * An id no other vault holds, derived from the directory's own name.
 *
 * Nothing else about a vault is stable enough to name it by: the label is
 * whatever the operator calls it and changes, the page count changes, and the
 * path is the one fact that has to be unique anyway. A directory named entirely
 * in Chinese slugs to nothing, so there is a fallback rather than an empty id —
 * `WikiVault.id` is documented as matching `/^[a-zA-Z0-9_-]+$/` and is used as a
 * record key.
 * @param vaults - the registrations already stored.
 * @param root - the normalised root being registered.
 * @returns an unused id.
 */
function uniqueId(vaults: readonly WikiVault[], root: string): string {
  const base = slugOf(root.split('/').filter(part => part !== '').pop() ?? '') || 'vault'
  const taken = new Set(vaults.map(vault => vault.id))
  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    if (!taken.has(`${base}-${suffix}`)) return `${base}-${suffix}`
  }
  return `${base}-${Date.now()}`
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

/** The levels in the order the panel lists them, strongest first. */
const LEVEL_ORDER: readonly WikiLevel[] = ['query-ready', 'locatable', 'concept']

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

  /**
   * Serialises the read-modify-write rounds of the two registration calls.
   *
   * The store already serialises its own writes, which is a different thing: two
   * rounds interleaved would each read the list before the other wrote, and the
   * second write would drop the first one's vault — silently, since both would
   * report success. `home-service` holds the same queue for the same reason.
   */
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  /**
   * The registrations, refusing to write over a document that could not be read.
   *
   * `store.read()` answers an unreadable document with an empty list, which is the
   * right answer to "what is registered" and the wrong one to "what should I write
   * back" — the second would replace a list somebody can repair with the single
   * vault being added.
   */
  const readable = async (): Promise<readonly WikiVault[]> => {
    const read = await store.read()
    if (read.error !== undefined) throw new WikiError('invalid-input', read.error)
    return read.vaults
  }

  /** Drop one path's cached index and graph. Memory only — the files stay. */
  const forget = (vaultPath: string): void => {
    indexes.delete(vaultPath)
    graphs.delete(vaultPath)
  }

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

  /**
   * One vault as both halves read it: the registration plus what is behind it.
   *
   * Shared by the list and by the two registration calls, so that a vault the
   * panel has just saved is described by the same code as one it read from the
   * document — a save answering with a hand-built view would be a second
   * definition of "ready" waiting to drift from this one.
   * @param vault - the registration.
   * @returns the view.
   */
  const viewOf = async (vault: WikiVault): Promise<WikiVaultView> => {
    const ready = entityDirOf(vault.path) !== undefined
    if (!ready) return { ...vault, pages: 0, ready: false }
    const index = await indexFor(vault)
    return { ...vault, pages: index.entities.length, indexedAt: index.builtAt, ready: true }
  }

  return {
    async list() {
      return Promise.all((await vaults()).map(viewOf))
    },

    async saveVault(input, id) {
      return await inLine(async () => {
        const stored = await readable()
        const root = normaliseRoot(input.path)
        const label = input.label.trim()
        if (root === '') throw new WikiError('invalid-input', '路径不能为空')
        if (!/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(root)) {
          throw new WikiError('invalid-input',
            `路径要写完整，从盘符或 / 开始（例如 D:/yon-bip-obsidian/yon-bip-obsidian）；收到的是「${input.path}」`)
        }
        if (label === '') throw new WikiError('invalid-input', '名称不能为空：列表里那一行就是它。')

        const existing = id === undefined ? undefined : stored.find(vault => vault.id === id)
        if (id !== undefined && existing === undefined) {
          throw new WikiError('not-found', `没有登记这个知识库：${id}。已登记：${stored.map(v => v.id).join(', ')}`)
        }

        // One directory, one registration. Two rows over one vault would be two
        // indexes of the same pages, and a lookup against both would return every
        // hit twice under two different vault names.
        const clash = stored.find(vault => vault.path === root && vault.id !== existing?.id)
        if (clash !== undefined) {
          throw new WikiError('invalid-input',
            `这个目录已经登记过了：「${clash.label}」（${clash.id}）。一个目录只需要登记一次。`)
        }

        const updated: WikiVault = { id: existing?.id ?? uniqueId(stored, root), label, path: root }
        // Rebuilt in place rather than appended-then-sorted: editing a row must not
        // move it in the list, because the operator is looking at that list.
        const next = existing === undefined
          ? [...stored, updated]
          : stored.map(vault => (vault.id === updated.id ? updated : vault))
        await store.write(next)
        // The caches are keyed by path, and a save can move one: an index left behind
        // under the old root would be handed straight back if that directory were ever
        // registered again, describing a vault nobody had looked at since.
        if (existing !== undefined && existing.path !== updated.path) forget(existing.path)

        // Reported rather than refused: a directory the operator picked and named is a
        // real registration even when it is not yet a vault, and the row says 路径不可用
        // until it is. What matters is that the answer does not claim it is ready.
        return await viewOf(updated)
      })
    },

    async removeVault(id) {
      await inLine(async () => {
        const stored = await readable()
        const found = stored.find(vault => vault.id === id)
        if (found === undefined) {
          throw new WikiError('not-found',
            `没有登记这个知识库：${id}。已登记：${stored.map(v => v.id).join(', ') || '（还没有）'}`)
        }
        await store.write(stored.filter(vault => vault.id !== id))
        // Nothing is deleted from the vault itself — not the pages, not the index
        // cache it carries. Only the cache held in memory here goes, so that
        // re-registering the same directory cannot answer from an index built
        // before it was unlisted.
        forget(found.path)
      })
    },

    async lookup(term, vaultId) {
      const asked = asTerm(term, 'term')
      const needle = asked.toLowerCase()
      const selected = await select(vaultId)
      const hits: WikiHit[] = []
      const unindexed: WikiUnindexedDir[] = []
      let scanned = 0
      let age = ''

      for (const vault of selected) {
        const index = await indexFor(vault)
        const graph = await graphFor(vault)
        scanned += index.entities.length
        unindexed.push(...await unindexedDirsOf(vault))
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
      return { term: asked, hits, indexAge: age, scanned, unindexed }
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
      // 「没有名为 X 的页面」 is the same confident wrong conclusion `lookup` guards
      // against, one step later: a page that lives under `wiki/topics` is not
      // *missing*, it is outside what this index can open. Say so, and give the
      // directory, so the reader goes and looks instead of reporting it absent.
      const outside = (await Promise.all(selected.map(vault => unindexedDirsOf(vault)))).flat()
      throw new WikiError('not-found', [
        `没有名为「${wanted}」的页面。先用 wiki_lookup 按表名或中文名找到确切的页面名。`,
        ...(outside.length === 0 ? [] : [
          '注意：索引只读实体页目录。这几处还有页面不在索引里，你要找的可能是其中之一：'
            + outside.map(entry => `${entry.dir} —— ${entry.pages} 页，${entry.path}`).join('；'),
        ]),
      ].join('\n'))
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
          // Two shapes carry a date, and both are in live use: a hand-kept log runs
          // `## 2026-06-17 ingest | 标题` down from its title, while `recordWrite`
          // appends the same date-first line as a list item. Reading only the second
          // made this answer "nothing was ever written here" over a log.md holding
          // twenty-odd entries.
          const m = /^(?:#{2,4}|-)\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/.exec(line.trim())
          if (m === null) continue
          entries.push({
            date: m[1] ?? '',
            text: (m[2] ?? '').trim(),
            vault: vault.id,
            vaultLabel: vault.label,
          })
        }
      }
      // Newest first by the date an entry carries, not by where it sits in the file.
      // Position says nothing here — the two writers disagree about direction, one
      // prepending and one appending — so reversing the file returned the *oldest*
      // entries as "recent". The sort is stable, so entries sharing a day keep the
      // order they were read in.
      return entries
        .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
        .slice(0, wanted)
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

    async health(vaultId, gapLimit) {
      const selected = await select(vaultId)
      const wanted = gapLimit === undefined ? 20 : Math.min(Math.max(Math.floor(gapLimit), 1), 200)
      // Folded once and shared by every vault's report: the log is not partitioned
      // by vault — one question can span them all — so folding it per vault would
      // repeat identical work and invite the copies to disagree.
      const activity: WikiUsageView = await usage.summary(wanted)
      const reports: WikiHealthReport[] = []
      for (const vault of selected) {
        const index = await indexFor(vault)
        const graph = await graphFor(vault)
        const tally = new Map<WikiLevel, number>()
        for (const page of index.entities) {
          const level = assessPage(page, graph).level
          tally.set(level, (tally.get(level) ?? 0) + 1)
        }
        const levels: WikiLevelStat[] = LEVEL_ORDER.map(level => ({ level, pages: tally.get(level) ?? 0 }))
        const tallies: WikiGraphView = summaryOf(index, graph)
        // Reported because a rebuild of this vault takes seconds, and an operator
        // waiting on it deserves to know what it is writing.
        const bytes = await stat(wikiIndexPath(vault.path)).then(info => info.size).catch(() => undefined)
        reports.push({
          vault: vault.id,
          vaultLabel: vault.label,
          pages: index.entities.length,
          unindexed: await unindexedDirsOf(vault),
          indexedAt: index.builtAt,
          ...(bytes === undefined ? {} : { indexBytes: bytes }),
          graph: tallies,
          levels,
          gaps: gapsOf(graph, wanted),
          usage: activity,
        })
      }
      return reports
    },

    async card(page, vaultId) {
      const wanted = asTerm(page, 'page').replace(/\.md$/, '')
      const selected = await select(vaultId)

      for (const vault of selected) {
        const index = await indexFor(vault)
        const found = index.entities.find(entry => entry.page === wanted)
        if (found === undefined) continue
        const graph = await graphFor(vault)
        const verdict = assessPage(found, graph)
        const relations = toRelationView(relationsOf(found.page, graph), RELATION_SAMPLE)
        await usage.record({
          tool: 'wiki_card',
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
          name: found.name,
          ...(found.table === undefined ? {} : { table: found.table }),
          ...(found.app === undefined ? {} : { app: found.app }),
          ...(found.version === undefined ? {} : { version: found.version }),
          ...(found.status === undefined ? {} : { status: found.status }),
          level: verdict.level,
          ...(verdict.fieldCount === undefined ? {} : { fieldCount: verdict.fieldCount }),
          lacks: verdict.lacks,
          refs: verdict.refs,
          incoming: verdict.incoming,
          outgoing: relations.outgoing,
          incomingGroups: relations.incoming,
          unresolved: relations.unresolved,
        }
      }

      throw new WikiError(
        'not-found',
        `没有名为「${wanted}」的页面。先用搜索按表名或中文名找到确切的页面名。`,
      )
    },

    async citers(uri, vaultId) {
      const wanted = asTerm(uri, 'uri')
      const selected = await select(vaultId)
      const pages: string[] = []
      for (const vault of selected) {
        const index = await indexFor(vault)
        for (const page of index.entities) {
          if ((page.refs ?? []).some(ref => ref.uri === wanted)) pages.push(page.page)
        }
      }
      return pages.sort((a, b) => a.localeCompare(b, 'zh'))
    },

    async invalidate(vaultId) {
      const selected = await select(vaultId)
      for (const vault of selected) {
        // The registered half of the pair above, which also drops the file: this is
        // the one caller that means it (a page was written, so the cached index is
        // known to be behind).
        forget(vault.path)
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
