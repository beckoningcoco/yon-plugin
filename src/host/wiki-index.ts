/**
 * The knowledge base behind the `wiki_` tools: where a vault lives, how its
 * entity pages are read, and the index that keeps a lookup cheap.
 *
 * A vault is a plain directory of markdown files. Obsidian is one possible
 * viewer of it, and nothing here needs Obsidian installed or running.
 *
 * The layout read here is the one a vault's own `.wiki-schema.md` describes:
 * entity pages sit under `wiki/entities/`, and each carries its identity in its
 * title line —
 *
 *     # 显示名 (`voucher.order.Order`)
 *
 * — while `## 基本信息` holds the physical table and the owning application, and
 * the frontmatter holds the platform version and the verification state. Those
 * five facts are what a lookup is for: a model about to write SQL needs the table
 * name, and needs to know whether the page it found was verified or merely
 * inferred.
 *
 * The index lives **inside the vault** (`wiki/.yon-index.json`) rather than in
 * the plugin's own data directory, so that copying or moving a vault carries its
 * index along. It is a derived file, so it belongs in the vault's `.gitignore`.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * How one page points at another entity.
 *
 * These are not invented categories: they are the eight section kinds this
 * vault's pages actually use to name another entity, in both of its writing
 * styles. Keeping the kind matters because the same target means different
 * things — a `composition` is a child table you can join to, an `implements` is
 * an interface whose fields this entity already carries.
 */
export type WikiRefKind =
  /** `关联属性` / `Reference Fields` / `All Fields`: a foreign key to another entity. */
  | 'reference'
  /** `关联引用` / `Suppliers`: the reference type a field is typed by. */
  | 'refType'
  /** `继承接口`: an interface this entity implements. */
  | 'implements'
  /** `子表` / `Child Tables`: a child entity this one composes. */
  | 'composition'
  /** `依赖接口`: an interface this entity depends on. */
  | 'depends'
  /** The `superUri` the page's own Basic Info names. */
  | 'extends'
  /** The `parent_entity` the page's frontmatter names. */
  | 'parent'

/** One entity a page points at. */
export interface WikiRef {
  /** The target's entity URI, as the page writes it. */
  readonly uri: string
  readonly kind: WikiRefKind
}

/** One entity page, reduced to the facts a lookup answers with. */
export interface WikiPage {
  /** Entity URI from the title line, or null when the page has none. */
  readonly uri: string | null
  /** Page name without the `.md` suffix; this is what `[[links]]` refer to. */
  readonly page: string
  /** Path relative to the vault root, always with forward slashes. */
  readonly file: string
  /** Display name from the title line, falling back to the page name. */
  readonly name: string
  readonly table?: string
  readonly domain?: string
  readonly app?: string
  readonly version?: string
  readonly status?: string
  readonly verified?: string
  /**
   * Entities this page points at, deduplicated by target and kind.
   *
   * A page states its relationships in tables — `关联属性` lists a 目标实体 per
   * field, `子表` lists child URIs, `继承接口` lists interfaces — but never as an
   * Obsidian `[[link]]`. Measured on the BIP vault: 93.5% of pages point at
   * something, and 23,052 of those 52,580 edges name an entity no page covers.
   * That gap is only visible if the edges are read, which is why they are here.
   *
   * Absent when the page names nothing.
   */
  readonly refs?: readonly WikiRef[]
  /**
   * How many fields the page says it lists, when it says so.
   *
   * Read from the heading (`直接属性（30个）`, `All Fields (30)`) or from the
   * lead line of the grouped style (`> 共 26 个直连字段`), so that a caller can
   * tell "this page can answer a column-name question" from "this page only
   * knows which table to look in" without reading 70 KB of markdown.
   */
  readonly fieldCount?: number
}

/** A built index: every entity page a vault holds, as of one moment. */
export interface WikiIndex {
  readonly version: 2
  readonly vault: string
  readonly builtAt: string
  readonly entities: readonly WikiPage[]
}

/** A vault the operator has registered, or one this module guessed at. */
export interface WikiVault {
  /** Stable short id, matching `/^[a-zA-Z0-9_-]+$/` so it can be a record key. */
  readonly id: string
  /** Human label for the panel. */
  readonly label: string
  /** Absolute vault root. */
  readonly path: string
}

/**
 * Where entity pages may live, in the order they are tried.
 *
 * The Chinese names are not hypothetical: `yon-ncc-obsidian` was initialised with
 * `wiki/实体`, `wiki/来源`, `wiki/模块`, so a reader that only knows the English
 * convention silently finds nothing there.
 */
const ENTITY_DIRS = ['wiki/entities', 'wiki/实体', 'entities', '实体'] as const

/** The file name the index is cached under, relative to the vault root. */
const INDEX_FILE = 'wiki/.yon-index.json'

/**
 * Vaults looked for when the operator has registered none.
 *
 * Guessing is worth it: the two vaults live side by side under one parent, and a
 * fresh install that has to be told their absolute paths before it can answer
 * anything is a fresh install nobody uses.
 */
const GUESSED: readonly WikiVault[] = [
  { id: 'bip', label: 'BIP 知识库', path: 'D:/yon-bip-obsidian/yon-bip-obsidian' },
  { id: 'ncc', label: 'NCC 知识库', path: 'D:/yon-bip-obsidian/yon-ncc-obsidian' },
  { id: 'ncc', label: 'NCC 知识库', path: 'D:/yon-ncc-obsidian/yon-ncc-obsidian' },
]

/** Whether a directory looks like a vault this module can read. */
export function isVault(root: string): boolean {
  return entityDirOf(root) !== undefined
}

/**
 * The directory holding a vault's entity pages.
 * @param root - absolute vault root.
 * @returns the absolute directory, or undefined when none of the known layouts fit.
 */
export function entityDirOf(root: string): string | undefined {
  for (const candidate of ENTITY_DIRS) {
    const full = path.join(root, candidate)
    if (existsSync(full)) return full
  }
  return undefined
}

/**
 * The vaults present on this machine, in the order {@link GUESSED} lists them.
 *
 * Duplicates by path are dropped, so a vault reachable at two guessed locations
 * is offered once.
 * @returns the vaults that exist; an empty list when none do.
 */
export function guessVaults(): readonly WikiVault[] {
  const seen = new Set<string>()
  const found: WikiVault[] = []
  for (const vault of GUESSED) {
    if (seen.has(vault.path) || !isVault(vault.path)) continue
    seen.add(vault.path)
    found.push(vault)
  }
  return found
}

/** Where one vault's index is cached. */
export function wikiIndexPath(root: string): string {
  return path.join(root, INDEX_FILE)
}

/** The first capture of a pattern, or undefined. */
function capture(text: string, pattern: RegExp): string | undefined {
  const found = pattern.exec(text)
  const value = found?.[1]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/**
 * Strip the decoration a page wraps a value in.
 *
 * YAML frontmatter quotes a version (`platform_version: "BIP V5"`) while a table
 * cell wraps an identifier in backticks (`| 物理表 | \`orders\` |`). Both are
 * noise once the value is out of its page, so both come off here.
 *
 * @param value - the raw capture, or undefined.
 * @returns the bare value, or undefined when there was nothing but decoration.
 */
function bare(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.replace(/`/g, '').replace(/^["']|["']$/g, '').trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * The section a table sits under decides what its references mean.
 *
 * Names are matched after their parenthesised count is stripped, because a page
 * writes `关联引用 (4个)` and another writes `Child Tables (45)` — the count is
 * part of the heading, not part of the name.
 *
 * @param heading - the raw `##` heading.
 * @returns the kind of reference this section holds, or undefined for a section
 *   that carries none.
 */
function refKindOf(heading: string): WikiRefKind | undefined {
  const family = heading.replace(/[（(].*?[）)]/g, '').replace(/\s+/g, ' ').trim()
  if (/子表|Child Tables|子实体/.test(family)) return 'composition'
  if (/继承接口/.test(family)) return 'implements'
  if (/依赖接口/.test(family)) return 'depends'
  if (/关联引用|Suppliers/.test(family)) return 'refType'
  if (/关联属性|Reference Fields|All Fields|全部直接属性|全部属性|属性/.test(family)) return 'reference'
  return undefined
}

/**
 * Column headers whose cells hold a reference to another entity.
 *
 * This is the whole trick, and it exists because guessing column positions does
 * not survive this vault. Two writing styles coexist and do not overlap: 4992
 * pages use the Chinese headings and 382 use the English ones, and within each,
 * the reference column lands at a different index per section — `关联属性` puts
 * it fourth, `子表` second, `依赖接口` third, `Child Tables` fourth again. All of
 * them, however, *name* the column: `URI`, `typeUri`, `目标实体`, `引用类型`.
 * Reading the header instead of counting pipes covers every one of the 44
 * section-and-header combinations this vault contains, including the ones that
 * appear on a single page.
 */
const REF_HEADER = /typeuri|^uri$|目标实体|引用类型|entityuri|targeturi/i

/** Strip the decoration a table cell or list item wraps a value in. */
function cellOf(value: string): string {
  return value.replace(/`/g, '').replace(/^["']|["']$/g, '').trim()
}

/**
 * Whether a cell holds an entity URI rather than prose.
 *
 * A URI is a dotted identifier: `voucher.order.Order`, `bip-usercenter.bip_user_ref`.
 * The test is deliberately loose about spelling — hyphens and underscores both
 * occur — and strict about whitespace, which is what separates a URI from a
 * display name that happens to contain a full stop.
 *
 * @param value - the undecorated cell.
 * @returns whether it can be treated as a URI.
 */
function looksLikeUri(value: string): boolean {
  return value.length > 2 && value.length < 200
    && !/\s/.test(value)
    && /^[A-Za-z_][A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]+$/.test(value)
}

/**
 * Every entity one page points at.
 *
 * Two shapes are read. Tables are read by header, so a reference column is found
 * wherever it sits. The `继承接口` sections are read as lists instead, because
 * they write their targets as `- **审计信息** (\`iuap.busiObj.IAuditInfo\`)`
 * rather than as a table. A page's own `superUri` and `parent_entity` are read
 * too: both name an entity, and both are easy to miss because they are stated
 * once rather than in a list.
 *
 * @param text - the page's full markdown.
 * @returns the references, deduplicated by target and kind.
 */
function parseRefs(text: string): readonly WikiRef[] {
  const refs: WikiRef[] = []
  let kind: WikiRefKind | undefined
  let header: readonly string[] | undefined

  for (const raw of text.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(raw)
    if (heading !== null) {
      kind = refKindOf(heading[1] ?? '')
      header = undefined
      continue
    }
    if (kind === undefined) continue
    const line = raw.trim()

    if (!line.startsWith('|')) {
      if (kind === 'implements') {
        for (const match of line.matchAll(/\(([^()]+)\)/g)) {
          const uri = cellOf(match[1] ?? '')
          if (looksLikeUri(uri)) refs.push({ uri, kind })
        }
      }
      continue
    }
    if (/^\|[\s\-:|]+\|$/.test(line)) continue

    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(part => part.trim())
    if (header === undefined) {
      header = cells
      continue
    }
    for (let i = 0; i < cells.length; i++) {
      const column = header[i]
      if (column === undefined || !REF_HEADER.test(column)) continue
      const uri = cellOf(cells[i] ?? '')
      if (looksLikeUri(uri)) refs.push({ uri, kind })
    }
  }

  const superUri = cellOf(capture(text, /^\|\s*superUri\s*\|\s*(.+?)\s*\|/m) ?? '')
  if (looksLikeUri(superUri)) refs.push({ uri: superUri, kind: 'extends' })
  const parent = cellOf(capture(text, /^parent_entity:\s*(.+?)\s*$/m) ?? '')
  if (looksLikeUri(parent)) refs.push({ uri: parent, kind: 'parent' })

  const seen = new Set<string>()
  return refs.filter(ref => {
    const key = `${ref.uri}|${ref.kind}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * How many fields a page claims to list.
 *
 * Two styles state this differently and neither is guessable from the other: the
 * flat style puts the count in the heading (`直接属性（30个）`, `All Fields (30)`)
 * while the grouped style puts it in a lead line under the heading
 * (`> 共 26 个直连字段`). Both are read here so that the count does not depend on
 * which batch a page came from.
 *
 * @param text - the page's full markdown.
 * @returns the count, or undefined when the page states none.
 */
function parseFieldCount(text: string): number | undefined {
  for (const match of text.matchAll(/^##\s+(.+?)\s*$/gm)) {
    const heading = match[1] ?? ''
    // `All Fields` is named exactly, and the bare word `Fields` is not accepted:
    // this vault also has `Reference Fields`, `Number Fields`, `Date Fields` and
    // `Enum Fields`, whose counts are of one group or of references rather than of
    // fields. Matching the loose word made a page with 38 reference fields claim
    // 38 fields it did not list.
    if (!/字段列表|直接属性|全部属性|全部字段|All Fields/.test(heading)) continue
    const counted = /[（(]\s*(?:共\s*)?(\d+)\s*个?\s*[）)]/.exec(heading) ?? /\((\d+)\)/.exec(heading)
    const value = counted?.[1]
    if (value !== undefined) return Number(value)
  }
  const grouped = capture(text, /共\s*(\d+)\s*个直连字段/)
  return grouped === undefined ? undefined : Number(grouped)
}

/**
 * Read the facts one entity page carries.
 *
 * Every field past the name is optional on purpose: a VO or an enum has no
 * physical table, and a page written by hand may have no frontmatter at all.
 * Reporting what is there beats refusing to read what is not.
 *
 * @param text - the page's full markdown.
 * @param file - its path relative to the vault root, forward-slashed.
 * @param page - its name without the `.md` suffix.
 * @returns the page, with absent facts simply absent.
 */
export function parseEntityPage(text: string, file: string, page: string): WikiPage {
  const heading = capture(text, /^#\s+(.+?)\s*(?:\(|$)/m)
  const uri = bare(capture(text, /^#\s+.*?\((.+?)\)\s*$/m))
  const table = bare(capture(text, /^\|\s*(?:物理表|tableName)\s*\|\s*(.+?)\s*\|/m))
  // Both writing styles are read, and neither is a rarity: 4992 pages label these
  // rows `物理表` / `domain/服务域` / `所属应用`, and 382 label them `tableName` /
  // `domain` / `applicationCode`. Reading only the Chinese labels left all 382
  // English pages looking like conceptual entities with no table — which is
  // exactly what the level badge then reported about them.
  // `数据库 schema` is accepted too because the vault's own schema document names
  // that spelling, though no page uses it yet.
  const domain = bare(capture(text, /^\|\s*(?:domain\/服务域|数据库\s*schema|domain)\s*\|\s*(.+?)\s*\|/m))
  const app = bare(capture(text, /^\|\s*(?:所属应用|applicationCode)\s*\|\s*(.+?)\s*\|/m))
  const version = bare(capture(text, /^platform_version:\s*(.+?)\s*$/m))
  const status = capture(text, /^status:\s*(\S+)\s*$/m)
  const verified = capture(text, /^last_verified:\s*(\S+)\s*$/m)
  const refs = parseRefs(text)
  const fieldCount = parseFieldCount(text)

  return {
    uri: uri ?? null,
    page,
    file,
    name: heading ?? page,
    ...(table === undefined ? {} : { table }),
    ...(domain === undefined ? {} : { domain }),
    ...(app === undefined ? {} : { app }),
    ...(version === undefined ? {} : { version }),
    ...(status === undefined ? {} : { status }),
    ...(verified === undefined ? {} : { verified }),
    ...(refs.length === 0 ? {} : { refs }),
    ...(fieldCount === undefined ? {} : { fieldCount }),
  }
}

/**
 * Read every entity page in a vault and build a fresh index.
 *
 * Pages that fail to read are skipped rather than failing the whole build: a
 * knowledge base is edited by hand and by other tools, and one unreadable file
 * should not cost the model every other answer.
 *
 * @param root - absolute vault root.
 * @returns the index, ready to cache and to serve.
 * @throws when the root holds no entity directory at all.
 */
export async function buildWikiIndex(root: string): Promise<WikiIndex> {
  const dir = entityDirOf(root)
  if (dir === undefined) {
    throw new Error(`知识库目录结构无法识别：${root}（找不到 wiki/entities 或 wiki/实体）`)
  }

  const entries = await readdir(dir, { withFileTypes: true })
  const entities: WikiPage[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const full = path.join(dir, entry.name)
    try {
      const text = await readFile(full, 'utf8')
      const rel = path.relative(root, full).split(path.sep).join('/')
      entities.push(parseEntityPage(text, rel, entry.name.replace(/\.md$/, '')))
    } catch {
      // A page this process cannot read is not a page this index can serve.
    }
  }

  entities.sort((a, b) => a.page.localeCompare(b.page, 'zh'))
  return {
    version: 2,
    vault: root,
    builtAt: new Date().toISOString(),
    entities,
  }
}

/**
 * Read a vault's cached index.
 * @param root - absolute vault root.
 * @returns the index, or undefined when none is cached or the file is unreadable.
 */
export async function readWikiIndex(root: string): Promise<WikiIndex | undefined> {
  try {
    const raw = await readFile(wikiIndexPath(root), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const candidate = parsed as Partial<WikiIndex>
    if (candidate.version !== 2 || !Array.isArray(candidate.entities)) return undefined
    return candidate as WikiIndex
  } catch {
    return undefined
  }
}

/**
 * Write an index into its vault.
 * @param index - the index to cache.
 */
export async function writeWikiIndex(index: WikiIndex): Promise<void> {
  const target = wikiIndexPath(index.vault)
  await writeFile(target, `${JSON.stringify(index)}\n`, 'utf8')
}

/**
 * A vault's index, rebuilt only when it is missing.
 *
 * Rebuilding 5400 pages takes a few seconds, which is cheap enough to do once and
 * too expensive to do per call, so a stale index is used until something asks for
 * a refresh rather than being detected and rebuilt behind the operator's back.
 *
 * @param root - absolute vault root.
 * @returns the cached index, or a freshly built and cached one.
 */
export async function ensureWikiIndex(root: string): Promise<WikiIndex> {
  const cached = await readWikiIndex(root)
  if (cached !== undefined) return cached
  const built = await buildWikiIndex(root)
  await writeWikiIndex(built)
  return built
}

/** Whether a path is a directory this process can list. */
export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}
