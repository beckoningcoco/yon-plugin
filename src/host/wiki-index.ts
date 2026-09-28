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
}

/** A built index: every entity page a vault holds, as of one moment. */
export interface WikiIndex {
  readonly version: 1
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
  const table = bare(capture(text, /^\|\s*物理表\s*\|\s*(.+?)\s*\|/m))
  // `domain/服务域` is the label 4742 of this vault's 5374 pages use; the other 632
  // carry no domain row at all, which the vault's own schema explains as pages
  // ingested before that field was collected. `数据库 schema` is accepted too
  // because the schema document names that spelling, though no page uses it yet.
  const domain = bare(capture(text, /^\|\s*(?:domain\/服务域|数据库\s*schema)\s*\|\s*(.+?)\s*\|/m))
  const app = bare(capture(text, /^\|\s*所属应用\s*\|\s*(.+?)\s*\|/m))
  const version = bare(capture(text, /^platform_version:\s*(.+?)\s*$/m))
  const status = capture(text, /^status:\s*(\S+)\s*$/m)
  const verified = capture(text, /^last_verified:\s*(\S+)\s*$/m)

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
    version: 1,
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
    if (candidate.version !== 1 || !Array.isArray(candidate.entities)) return undefined
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
