/**
 * The metadata index: what `modules/ * /METADATA/ *.bmf` says, flattened into
 * something a question can be asked of.
 *
 * ## The problem this solves
 *
 * The `.bmf` files are the authority on what an NCC installation's entities are, and
 * they are 3,600 files of 244.2 MB that only make sense one entity at a time. A
 * question like "which table holds 报销单据类型" or "which entities have a 员工 field"
 * cannot be answered by finding and reading files — it is a question about the whole
 * tree at once. So the tree is read once and flattened.
 *
 * ## What is stored, and what is deliberately not
 *
 * Four layers, each there because something asks for it:
 *
 * - **L0 fingerprint** — `relative path → mtime:size`, so a later run can say whether
 *   the index still describes the installation. Relative, not absolute: the key is
 *   what makes one index reusable across two Homes of the same version, which is the
 *   whole point of keying the index by version instead of by directory.
 * - **L1 identity** — name, label, table, VO class, module, file. Answers "what is
 *   this entity and where is it defined".
 * - **L1.5 field names** — one `名字|中文名` pair per labelled field. Answers both
 *   directions: "what are this entity's columns" and "which entities have this column".
 * - **L1.6 enumerations** — a field's value set. Answers "what does `1` mean here".
 *
 * Not stored: **field attributes** (types, lengths, flags). Those are read on demand
 * from the one file a hit names — 217,140 attributes would be the bulk of the file and
 * are only ever wanted for a handful of entities at a time.
 *
 * Not stored: **foreign-key edges**. A field's `dataType` holds another entity's UUID
 * for a reference column, and resolving those needs the whole 256,152-id space resident
 * at build time. It buys no query in this batch, so it is the plan's §11 first cut.
 *
 * ## Why arrays rather than maps
 *
 * `entities` is a flat array, not `{ name: [...] }`. The map shape has to commit to one
 * spelling of a name, and the two spellings disagree in case for the same entity —
 * `expensetype.bmf` declares `name="ExpenseType"`. A stored key would have to pick, and
 * whichever it dropped would be invisible in exactly the queries the index exists for.
 * A query scans the array (5,573 entries, sub-millisecond) and matches every spelling.
 *
 * ## Duplicates are kept, never resolved
 *
 * Measured: 182 entity names (3.40%) are defined by more than one file, and the
 * duplicates are real — `psndoc` ships in `baseapp`, `hrhi` and `uapbd`, and two of
 * those copies carry the same entity UUID. Picking one would be a guess that reads as
 * an answer. Every defining file is returned so the caller can see there is a choice.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parseBmf, type BmfEnum, type BmfEntity } from './meta-bmf.ts'
import { classIndexDir } from './class-index.ts'
import { HomeError } from './home-files.ts'

/** One entity as the index stores it: identity plus the flattened field names. */
export interface StoredEntity {
  readonly name: string
  /** The file's basename without extension — the other spelling of the name. */
  readonly filename: string
  readonly displayName: string
  readonly tableName: string
  readonly fullClassName: string
  readonly module: string
  /** Path relative to the Home, with forward slashes. */
  readonly file: string
  readonly primary: boolean
  /** `名字|中文名`, or just `名字` for a field the file gave no label. */
  readonly fields: readonly string[]
}

/** One enumeration as the index stores it. */
export interface StoredEnum {
  readonly name: string
  readonly displayName: string
  readonly fullClassName: string
  readonly module: string
  readonly file: string
  /** `[value, label]`, in the order the file lists them. */
  readonly items: readonly (readonly [string, string])[]
}

/** How much of the tree an index covers. */
export interface MetaCounts {
  readonly files: number
  readonly entities: number
  readonly enums: number
  readonly fields: number
  readonly enumItems: number
}

/** A whole built index, as stored on disk. */
export interface MetaIndex {
  readonly version: string
  readonly builtAt: string
  /** Every Home whose files went into this index; more than one after an incremental merge. */
  readonly sourceHomes: readonly string[]
  readonly counts: MetaCounts
  /** L0: Home-relative path → `mtimeMs:size`. */
  readonly fingerprint: Record<string, string>
  readonly entities: readonly StoredEntity[]
  readonly enums: readonly StoredEnum[]
}

/** Progress one build reports, so a long run can say where it is. */
export interface MetaBuildProgress {
  readonly files: number
  readonly parsed: number
  readonly total: number
  readonly current: string
}

/** What a freshness check concluded. */
export interface MetaFreshness {
  /** `fresh` — the fingerprints agree; `stale` — they do not; `unknown` — nothing built. */
  readonly state: 'fresh' | 'stale' | 'unknown'
  readonly changed: number
  readonly added: number
  readonly removed: number
}

/** Where indexes live, beside the class indexes. */
export function metaIndexDir(): string {
  return classIndexDir()
}

/**
 * The file one version's metadata index is stored in.
 *
 * @param version - the label it is stored under.
 * @param dir - the directory to store in; defaults to the operator's own. The same
 *   seam `mirrorHomes`'s `skillsRoot` and `createYonHomesService`'s are: a case that
 *   had to write the operator's `~/.dsh` to exercise storage would be editing the
 *   installation it is checking.
 * @returns the absolute path.
 */
export function metaIndexPath(version: string, dir = metaIndexDir()): string {
  const safe = version.replace(/[^A-Za-z0-9_-]/g, '_')
  return join(dir, `meta_index_${safe}.json`)
}

/** How often a build reports progress, in files. */
const PROGRESS_EVERY = 200

/** One `.bmf` the walk found. */
interface FoundFile {
  readonly abs: string
  readonly rel: string
  readonly module: string
  readonly filename: string
}

/**
 * Walk the authoritative metadatatree: `modules/ * /METADATA`, recursively.
 *
 * Only that tree, and that is a measured decision rather than a shortcut. Of the 3,819
 * `.bmf` files under a whole Home, 3,600 are here and they are **96.5% of the bytes**;
 * the 219 outside hold 8.8 MB of odds and ends. Walking the whole Home instead costs
 * 30–42 s against 163 ms, and the 3.5% it adds is not metadata the index is asked about.
 *
 * Recursion is required: `psndoc.bmf` lives at
 * `modules/uapbd/METADATA/metadata/bbd/psninfo/psndoc.bmf`, two levels below `METADATA`.
 *
 * @param home - absolute Home path.
 * @returns every `.bmf` found, with the module and basename already worked out.
 */
export async function findBmfFiles(home: string): Promise<readonly FoundFile[]> {
  const root = home.replace(/\\/g, '/').replace(/\/+$/, '')
  const found: FoundFile[] = []
  let modules: string[]
  try {
    modules = await readdir(join(root, 'modules'))
  } catch {
    // No `modules/` is not an error the index can act on — it is an installation that
    // has nothing to index, and an empty index says that better than a thrown failure.
    return []
  }
  for (const moduleName of modules) {
    const pending = [join(root, 'modules', moduleName, 'METADATA')]
    while (pending.length > 0) {
      const dir = pending.pop() as string
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) {
          pending.push(abs)
          continue
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.bmf')) continue
        found.push({
          abs,
          rel: abs.slice(root.length + 1).replace(/\\/g, '/'),
          module: moduleName,
          filename: entry.name.replace(/\.bmf$/i, ''),
        })
      }
    }
  }
  return found
}

/**
 * The `mtime:size` fingerprint of every file found.
 *
 * `mtimeMs` and size together, rather than a content hash: hashing 244.2 MB would cost
 * seconds on every status check, and the question being asked is only "did anything
 * change since the build". A file that changed without its mtime or size moving is not
 * a case this is asked to catch.
 *
 * @param files - what the walk found.
 * @returns Home-relative path → fingerprint string.
 */
export async function fingerprintOf(files: readonly FoundFile[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(files.map(async file => {
    try {
      const info = await stat(file.abs)
      out[file.rel] = `${Math.floor(info.mtimeMs)}:${info.size}`
    } catch {
      // A file that vanished between the walk and the stat simply has no fingerprint,
      // which the comparison below reads as "removed".
    }
  }))
  return out
}

/** The L1.5 pair for one field, or the bare name when the file gave no label. */
function pairOf(entity: BmfEntity): string[] {
  return entity.fields.map(field => field.label === '' ? field.name : `${field.name}|${field.label}`)
}

/**
 * One parsed entity, flattened into what the index stores.
 *
 * An entity with no fields is kept rather than dropped. It is useless to the field
 * query and nearly useless to the entity query, but dropping it would make the stored
 * `counts.entities` disagree with the number of `<entity>` elements in the tree — and a
 * count that silently excludes a category is the kind of thing that takes an afternoon
 * to notice.
 */
function entitiesOf(entity: BmfEntity, rel: string): StoredEntity[] {
  return [{
    name: entity.name,
    filename: entity.filename,
    displayName: entity.displayName,
    tableName: entity.tableName,
    fullClassName: entity.fullClassName,
    module: entity.module,
    file: rel,
    primary: entity.primary,
    fields: pairOf(entity),
  }]
}

/** One enumeration flattened, with the id dropped — nothing stored carries it. */
function enumsOf(enumeration: BmfEnum, module: string, rel: string): StoredEnum[] {
  return [{
    name: enumeration.name,
    displayName: enumeration.displayName,
    fullClassName: enumeration.fullClassName,
    module,
    file: rel,
    items: enumeration.items.map(item => [item.value, item.label] as const),
  }]
}

/** Count what an index holds, without trusting the file's own summary. */
function countOf(entities: readonly StoredEntity[], enums: readonly StoredEnum[], files: number): MetaCounts {
  let fields = 0
  for (const entity of entities) fields += entity.fields.length
  let enumItems = 0
  for (const enumeration of enums) enumItems += enumeration.items.length
  return { files, entities: entities.length, enums: enums.length, fields, enumItems }
}

/**
 * Build an index over one Home, reusing what an earlier build already parsed.
 *
 * Incremental is an optimisation, not a premise: a full rebuild is ~3.3 s (measured:
 * 163 ms to walk, 3,131 ms to parse 244.2 MB at 78 MB/s), so the panel's rebuild button
 * could plausibly always do the whole thing. What incremental buys is the version-keyed
 * reuse below.
 *
 * @param home - absolute Home path.
 * @param version - the label to store the index under.
 * @param previous - the index already stored, when there is one.
 * @param onProgress - called every {@link PROGRESS_EVERY} files.
 * @returns the index, ready to write.
 */
export async function buildMetaIndex(
  home: string,
  version: string,
  previous?: MetaIndex,
  onProgress?: (progress: MetaBuildProgress) => void,
): Promise<MetaIndex> {
  const files = await findBmfFiles(home)
  const fingerprint = await fingerprintOf(files)

  const before = previous?.fingerprint ?? {}
  const rebuild: FoundFile[] = []
  for (const file of files) {
    if (before[file.rel] !== fingerprint[file.rel]) rebuild.push(file)
  }
  const removed = new Set(Object.keys(before).filter(rel => fingerprint[rel] === undefined))
  const changed = new Set(rebuild.map(file => file.rel))

  // Everything the earlier build did not parse, kept as it was — minus the files that
  // changed (about to be re-parsed) and the ones that are gone.
  const keepEntities = (previous?.entities ?? []).filter(
    entity => !changed.has(entity.file) && !removed.has(entity.file))
  const keepEnums = (previous?.enums ?? []).filter(
    enumeration => !changed.has(enumeration.file) && !removed.has(enumeration.file))

  const entities: StoredEntity[] = [...keepEntities]
  const enums: StoredEnum[] = [...keepEnums]

  let parsed = 0
  for (const file of rebuild) {
    let text: string
    try {
      text = await readFile(file.abs, 'utf8')
    } catch {
      // Unreadable now, but it was still found by the walk, so its fingerprint stays
      // and the next build will try again rather than reporting a spurious change.
      continue
    }
    const component = parseBmf(text, file.module, file.filename)
    for (const entity of component.entities) entities.push(...entitiesOf(entity, file.rel))
    for (const enumeration of component.enums) enums.push(...enumsOf(enumeration, file.module, file.rel))
    parsed += 1
    if (onProgress !== undefined && (parsed % PROGRESS_EVERY === 0 || parsed === rebuild.length)) {
      onProgress({ files: files.length, parsed, total: rebuild.length, current: file.rel })
    }
  }

  // The Homes this index describes: the earlier list, plus the one just read. A rebuild
  // of the same version from a second Home therefore accumulates, which is honest — the
  // entries really did come from both — and the fingerprints are relative precisely so
  // that the two agree where the installations do.
  const sources = new Set(previous?.sourceHomes ?? [])
  sources.add(home.replace(/\\/g, '/').replace(/\/+$/, ''))

  return {
    version,
    builtAt: new Date().toISOString(),
    sourceHomes: [...sources],
    counts: countOf(entities, enums, files.length),
    fingerprint,
    entities,
    enums,
  }
}

/**
 * Write an index where {@link metaIndexPath} will look for it.
 * @param built - the index to store.
 * @param dir - the directory to store in; defaults to the operator's own.
 * @returns the absolute path written.
 */
export async function writeMetaIndex(built: MetaIndex, dir = metaIndexDir()): Promise<string> {
  const target = metaIndexPath(built.version, dir)
  await mkdir(dir, { recursive: true })
  // Compact, like the class index: this is a lookup table of millions of characters and
  // a single line parses faster than one that is mostly whitespace.
  await writeFile(target, JSON.stringify(built), 'utf8')
  return target
}

/**
 * Read a parsed document as an index, or nothing when it is not one.
 *
 * Shared by the single read and the listing so that the two cannot disagree about what
 * a stored index is: a document one of them rejects and the other reports would show up
 * as a row in the panel whose figures nothing can load.
 *
 * @param parsed - the JSON, already parsed.
 * @returns the index, or undefined when the document is not one.
 */
function asIndex(parsed: unknown): MetaIndex | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined
  const candidate = parsed as Partial<MetaIndex>
  if (typeof candidate.version !== 'string') return undefined
  if (!Array.isArray(candidate.entities) || !Array.isArray(candidate.enums)) return undefined
  if (candidate.fingerprint === null || typeof candidate.fingerprint !== 'object') return undefined
  return candidate as MetaIndex
}

/**
 * Read one stored index.
 * @param version - the label it was stored under.
 * @param dir - the directory to read from; defaults to the operator's own.
 * @returns the index, or undefined when none is stored or it cannot be read.
 */
export async function readMetaIndex(version: string, dir = metaIndexDir()): Promise<MetaIndex | undefined> {
  try {
    return asIndex(JSON.parse(await readFile(metaIndexPath(version, dir), 'utf8')))
  } catch {
    return undefined
  }
}

/** One stored index, as a listing reports it. */
export interface StoredMetaIndex {
  readonly version: string
  readonly builtAt: string
  readonly counts: MetaCounts
  readonly bytes: number
}

/**
 * Every metadata index stored, newest first.
 *
 * Read whole rather than by header — unlike the class index, whose entries are hundreds
 * of thousands of lines, this one's summary is small next to the arrays.
 *
 * @param dir - the directory to list; defaults to the operator's own.
 * @returns the stored indexes.
 */
export async function listMetaIndexes(dir = metaIndexDir()): Promise<readonly StoredMetaIndex[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const found: StoredMetaIndex[] = []
  for (const name of names) {
    if (!name.startsWith('meta_index_') || !name.endsWith('.json')) continue
    const full = join(dir, name)
    try {
      const info = await stat(full)
      // Read whole and validate, so a row in the listing is always one `readMetaIndex`
      // would also load — the panel's figures and the tool's answers come from the same
      // document.
      const parsed = asIndex(JSON.parse(await readFile(full, 'utf8')))
      if (parsed === undefined) continue
      found.push({
        version: parsed.version,
        builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : info.mtime.toISOString(),
        counts: parsed.counts ?? { files: 0, entities: 0, enums: 0, fields: 0, enumItems: 0 },
        bytes: info.size,
      })
    } catch {
      // An index this process cannot read is not one it can list.
    }
  }
  return found.sort((a, b) => b.builtAt.localeCompare(a.builtAt))
}

/**
 * Compare a stored fingerprint against the directory as it is now.
 *
 * Costs a walk plus a stat per file — measured at 0.61 s on the reference Home — which
 * is why it is a status check the panel and the tools run, and not something on the
 * path of every query.
 *
 * @param home - the Home to check.
 * @param stored - the index's fingerprint.
 * @returns what changed.
 */
export async function checkFreshness(
  home: string,
  stored: Record<string, string>,
): Promise<MetaFreshness> {
  const files = await findBmfFiles(home)
  const now = await fingerprintOf(files)
  let changed = 0
  let added = 0
  for (const [rel, print] of Object.entries(now)) {
    if (stored[rel] === undefined) added += 1
    else if (stored[rel] !== print) changed += 1
  }
  let removed = 0
  for (const rel of Object.keys(stored)) if (now[rel] === undefined) removed += 1
  return {
    state: changed + added + removed === 0 ? 'fresh' : 'stale',
    changed,
    added,
    removed,
  }
}

/**
 * Find entities by any of the names they go by.
 *
 * Four tiers, strongest first, because the tiers are not equally good answers:
 *
 * 1. **The declared name matches exactly.** `psndoc` finds the entity called `psndoc`.
 * 2. **The file's basename matches exactly.** The other spelling of the same thing —
 *    `expensetype.bmf` declares `name="ExpenseType"` — so both have to work.
 * 3. **Either name contains the term.**
 * 4. **The table, the VO class, or the label contains it.**
 *
 * Measured on the reference Home, tiers 1 and 2 are not interchangeable: querying
 * `psndoc` matches one file's basename and twelve entities across three files, because a
 * multi-entity file gives every one of its entities the same basename. Ranking the
 * declared name first is what keeps the answer to that query legible; ranking them
 * together returns the ten entities that are *not* called `psndoc` before the two that
 * are.
 *
 * @param index - the index to search.
 * @param term - what to look for.
 * @param limit - how many to return at most.
 * @returns the matches, strongest first, in a stable order.
 */
export function findEntities(
  index: MetaIndex,
  term: string,
  limit: number,
): readonly StoredEntity[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return []
  const byName: StoredEntity[] = []
  const byFilename: StoredEntity[] = []
  const byNamePart: StoredEntity[] = []
  const byOther: StoredEntity[] = []
  for (const entity of index.entities) {
    const name = entity.name.toLowerCase()
    const filename = entity.filename.toLowerCase()
    if (name === needle) {
      byName.push(entity)
      continue
    }
    if (filename === needle) {
      byFilename.push(entity)
      continue
    }
    if (name.includes(needle) || filename.includes(needle)) {
      if (byNamePart.length < limit) byNamePart.push(entity)
      continue
    }
    if (byOther.length >= limit) continue
    const rest = [entity.tableName, entity.fullClassName, entity.displayName]
    if (rest.some(value => value.toLowerCase().includes(needle))) byOther.push(entity)
  }
  return [...byName, ...byFilename, ...byNamePart, ...byOther].slice(0, limit)
}

/**
 * Find entities that have a field going by a name, a label, or either one's fragment.
 *
 * The reverse direction, and the one the index exists for: the answer is not a field,
 * it is the list of entities that own one. Scanned in memory rather than served from a
 * stored inverted table — 217,140 pairs scan in milliseconds, and an inverted table
 * would be a second thing to keep in step with the first.
 *
 * @param index - the index to search.
 * @param term - a field name, a Chinese label, or a fragment of either.
 * @param limit - how many entities to return at most.
 * @returns the matching entities with the fields that matched, strongest first.
 */
export function findFields(
  index: MetaIndex,
  term: string,
  limit: number,
): readonly { readonly entity: StoredEntity; readonly fields: readonly string[] }[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return []
  const hits: { entity: StoredEntity; fields: string[]; exact: boolean }[] = []
  for (const entity of index.entities) {
    const matched: string[] = []
    let exact = false
    for (const pair of entity.fields) {
      const split = pair.indexOf('|')
      const name = split < 0 ? pair : pair.slice(0, split)
      const label = split < 0 ? '' : pair.slice(split + 1)
      if (name.toLowerCase() === needle || label.toLowerCase() === needle) {
        exact = true
        matched.push(pair)
        continue
      }
      if (matched.length < 6 && (name.toLowerCase().includes(needle) || label.toLowerCase().includes(needle))) {
        matched.push(pair)
      }
    }
    if (matched.length > 0) hits.push({ entity, fields: matched, exact })
  }
  hits.sort((a, b) => Number(b.exact) - Number(a.exact))
  return hits.slice(0, limit).map(hit => ({ entity: hit.entity, fields: hit.fields }))
}

/**
 * Find enumerations by name, label, or one of their values.
 *
 * @param index - the index to search.
 * @param term - an enumeration name, or a value or label inside one.
 * @param limit - how many to return at most.
 * @returns the matching enumerations, strongest first.
 */
export function findEnums(index: MetaIndex, term: string, limit: number): readonly StoredEnum[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return []
  const exact: StoredEnum[] = []
  const partial: StoredEnum[] = []
  for (const enumeration of index.enums) {
    if (enumeration.name.toLowerCase() === needle) {
      exact.push(enumeration)
      continue
    }
    if (partial.length >= limit) continue
    const byName = enumeration.name.toLowerCase().includes(needle)
      || enumeration.displayName.toLowerCase().includes(needle)
    const byItem = enumeration.items.some(item =>
      item[0].toLowerCase() === needle || item[1].toLowerCase().includes(needle))
    if (byName || byItem) partial.push(enumeration)
  }
  return [...exact, ...partial].slice(0, limit)
}

/**
 * The query kinds the tools accept, as a closed set.
 *
 * Closed on purpose: the tool description tells the model these are the only three, and
 * a name that is not one of them has to be refused rather than quietly treated as a
 * substring search over everything.
 */
export const META_QUERY_KINDS = ['entity', 'field', 'enum'] as const

/** One of {@link META_QUERY_KINDS}. */
export type MetaQueryKind = (typeof META_QUERY_KINDS)[number]

/** Read one of the query kinds, refusing anything else. */
export function asQueryKind(raw: unknown): MetaQueryKind {
  if (typeof raw === 'string' && (META_QUERY_KINDS as readonly string[]).includes(raw.trim())) {
    return raw.trim() as MetaQueryKind
  }
  throw new HomeError('invalid-input',
    `kind 只能是 ${META_QUERY_KINDS.join(' / ')}；收到的是「${String(raw ?? '')}」`)
}

/** How many hits a query returns when the caller does not say. */
export const DEFAULT_QUERY_LIMIT = 20

/** The largest limit a caller may ask for. */
export const MAX_QUERY_LIMIT = 100

/** Clamp a requested limit into range, defaulting when it is not a number. */
export function clampQueryLimit(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_QUERY_LIMIT
  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(raw)))
}

/** The basename of a stored file path, for a display that has no room for the path. */
export function shortFile(rel: string): string {
  return basename(rel)
}
