/**
 * Flagship-edition (YonBIP) metadata, read from the snapshots this package ships.
 *
 * ## Why this is not an index
 *
 * The NCC half of the metadata surface is an index because it has to be: 3,600 `.bmf`
 * files and 244.2 MB cannot be searched per query, so the tree is flattened once and
 * stored. BIP is the opposite problem. Its whole corpus here is **8 payloads of 3.37 MB,
 * and parsing all of them measures 29 ms** — so there is nothing an index could buy.
 * This module parses the snapshots once, keeps the result for the life of the process,
 * and answers from that.
 *
 * That choice removes three things a stored index would have needed: a build step, a
 * place on disk, and a freshness check. None of them has a meaning here — the corpus
 * cannot change while the process runs, and it changes between releases only when the
 * package does.
 *
 * ## Where the payloads come from, and what they are not
 *
 * BIP's metadata is not on disk; it is behind the platform's HTTP APIs
 * (`queryByUri` and friends), which is why it cannot be derived from an installation
 * the way the `.bmf` tree can. These snapshots are captures taken from one tenant
 * (`nfkwaryp`) and shipped with the package, which is what makes the tool answerable
 * **offline**. Two consequences are stated here rather than hidden:
 *
 * - **The tenant is a fact about the snapshot, not a secret.** Every answer carries
 *   the tenant it came from, so a caller reading a custom field knows which
 *   installation defined it.
 * - **A field's enumeration has a name but no values.** The payloads name the enum a
 *   column uses (`enumType: "aa_boolean"`) and do not carry the value set, so `enum`
 *   searches match the *name* and the columns that use it. Returning an invented value
 *   table would be worse than returning none.
 *
 * ## What "column" means in a BIP payload
 *
 * An attribute is a column when the payload gives it a `columnName` (equivalently a
 * `fieldName`; measured: the two never disagree across 1,494 attributes). The
 * attributes without one are exactly the entity's sub-tables — measured on
 * `st_purinrecord.PurInRecord`, the 7 attributes without a `columnName` are the same 7
 * names as its `childAttributes`, and each carries the child entity's URI in `typeUri`.
 * So the split needs no guesswork and no second list.
 */
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/** Every tool-independent part of this module is pure; only the loader touches disk. */

/**
 * The shipped snapshots, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works for
 * the compiled plugin and for a spec running against the sources — the same seam
 * `KNOWLEDGE_ROOT` uses.
 *
 * Deliberately **not** under `resources/knowledge/`. That tree is the corpus the
 * `knowledge_*` tools walk, and the walk takes every `.json` it finds (measured: 424
 * documents, 6.16 MB). These eight payloads are 3.53 MB of that — 1.9% of the documents
 * and 56% of the bytes — so leaving them there made a bare metadata dump answer as often
 * as a written page for any query naming a BIP column. They are data with a reader now
 * (`bip_meta_*`), not knowledge, so they live in their own directory.
 */
export const BIP_META_ROOT = fileURLToPath(new URL('../../resources/bip-meta/', import.meta.url))

/** What a call can fail with. */
export class BipMetaError extends Error {
  constructor(readonly code: 'invalid-input' | 'not-found' | 'unavailable', message: string) {
    super(message)
    this.name = 'BipMetaError'
  }
}

/** One column: the physical field, its Java property, and what the payload says about it. */
export interface BipColumn {
  /** The Java property name (`certificateVersion`) — what a service or a VO uses. */
  readonly property: string
  /** The physical column (`certificate_version`) — what SQL uses. */
  readonly column: string
  /** The Chinese label, or `''` when the payload gave none. */
  readonly label: string
  /** `Long` / `String` / …, or the referenced entity's URI for a reference column. */
  readonly type: string
  readonly length: number
  readonly precise: number
  readonly isKey: boolean
  readonly isCode: boolean
  readonly isRequired: boolean
  /** True only when the payload says `nullable="false"`; an absent flag claims nothing. */
  readonly notNull: boolean
  /** The enumeration's *name* (`aa_boolean`); its values are not in the payload. */
  readonly enumName: string
  /** The entity a reference column points at, when it points at one. */
  readonly refUri: string
  readonly defaultValue: string
}

/** One sub-table, taken from the parent's own attribute list. */
export interface BipChild {
  readonly property: string
  readonly label: string
  /** The child entity's URI. */
  readonly uri: string
  /** The child's table, resolved from the corpus; `''` when the child is not in it. */
  readonly tableName: string
}

/** One business entity, as a snapshot describes it. */
export interface BipEntity {
  /** The declared name (`PurInRecord`). */
  readonly name: string
  /** The entity URI (`st.purinrecord.PurInRecord`) — the key `wiki_lookup` also accepts. */
  readonly uri: string
  readonly label: string
  readonly tableName: string
  /** The service domain (`ustock`) — BIP's counterpart to a module. */
  readonly domain: string
  readonly tenant: string
  /** When the platform built this metadata, as the payload reports it. */
  readonly builtAt: string
  /** The snapshot file it came from, for provenance. */
  readonly source: string
  readonly columns: readonly BipColumn[]
  readonly children: readonly BipChild[]
}

/** Everything the shipped snapshots describe. */
export interface BipCorpus {
  readonly entities: readonly BipEntity[]
  /** The tenant the snapshots came from, or `''` when they disagree. */
  readonly tenant: string
  /**
   * Payloads in the directory that were not entity models — a failed capture reports
   * `Does not exist in DB` with no `data.data`, and is skipped structurally rather than
   * by filename so one that is re-added cannot pollute an answer.
   */
  readonly skipped: readonly string[]
}

/** Read a value the payload stores as a string boolean. */
function flag(value: unknown): boolean {
  return value === true || value === 'true'
}

/** The first of several spellings that is a non-empty string. */
function firstString(...values: readonly unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/** A non-negative integer read from one of the payload's numeric spellings. */
function numberOf(...values: readonly unknown[]): number {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return 0
}

/** One attribute flattened, or a sub-table link when it names no column. */
function attributeOf(raw: Record<string, unknown>): { column: BipColumn } | { child: BipChild } {
  const property = firstString(raw.name)
  const column = firstString(raw.columnName, raw.fieldName)
  const typeUri = firstString(raw.typeUri)
  const typeRaw = raw.type
  // A primitive's type is an object naming itself; a reference's is a bare id whose
  // meaning is in `typeUri`. Only a dotted `typeUri` names another entity.
  const primitive = typeRaw !== null && typeof typeRaw === 'object' && !Array.isArray(typeRaw)
    ? firstString((typeRaw as Record<string, unknown>).name, (typeRaw as Record<string, unknown>).title)
    : ''
  const referenced = typeUri.includes('.') ? typeUri : ''

  if (column === '') {
    return {
      child: {
        property,
        label: firstString(raw.displayName, raw.title),
        uri: referenced,
        tableName: '',
      },
    }
  }
  return {
    column: {
      property,
      column,
      label: firstString(raw.displayName, raw.title),
      type: primitive !== '' ? primitive : referenced,
      length: numberOf(raw.length, raw.iLength),
      precise: numberOf(raw.precise, raw.iScale, raw.iPrecision),
      isKey: flag(raw.isKey),
      isCode: flag(raw.isCode),
      isRequired: flag(raw.isRequired),
      notNull: raw.nullable === false || raw.nullable === 'false',
      enumName: firstString(raw.enumType),
      refUri: referenced,
      defaultValue: firstString(raw.defaultValue),
    },
  }
}

/** One entity flattened, or nothing when the payload is not an entity model. */
function entityOf(payload: unknown, source: string): BipEntity | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const raw = payload as Record<string, unknown>
  const name = firstString(raw.name)
  const uri = firstString(raw.uri)
  // Both are what every later step keys on; a payload missing either is not one of these.
  if (name === '' || uri === '') return undefined
  const attributes = Array.isArray(raw.attributes)
    ? raw.attributes.filter((entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    : []
  const columns: BipColumn[] = []
  const children: BipChild[] = []
  for (const attribute of attributes) {
    const parsed = attributeOf(attribute)
    if ('column' in parsed) columns.push(parsed.column)
    else children.push(parsed.child)
  }
  return {
    name,
    uri,
    label: firstString(raw.displayName, raw.title, raw.description),
    tableName: firstString(raw.tableName),
    domain: firstString(raw.domain, raw.applicationCode),
    tenant: firstString(raw.tenantId),
    builtAt: firstString(raw.buildTime),
    source,
    columns,
    children,
  }
}

/**
 * Unwrap one snapshot document into its entity payload.
 *
 * The captures are the platform's own envelope — `{code, data: {data, resultCode}}` — and
 * a capture that failed puts a message where the second `data` would be. Reaching
 * through the envelope here is what makes a failed capture a skipped file rather than an
 * entity named `undefined`.
 */
function payloadOf(document: unknown): unknown {
  if (document === null || typeof document !== 'object') return undefined
  const data = (document as Record<string, unknown>).data
  if (data === null || typeof data !== 'object') return undefined
  return (data as Record<string, unknown>).data
}

/** The corpus, parsed once and kept: the snapshots ship inside the package and cannot change. */
let cached: BipCorpus | undefined

/** Parse every snapshot under a root, without touching the cache. */
async function readCorpus(root: string): Promise<BipCorpus> {
  let names: string[]
  try {
    names = await readdir(root)
  } catch (error) {
    throw new BipMetaError('unavailable',
      `读不到随包发布的旗舰版元数据快照：${root}（${error instanceof Error ? error.message : String(error)}）。`
      + '这是安装包不完整，不是查询写错了。')
  }
  const entities: BipEntity[] = []
  const skipped: string[] = []
  const tenants = new Set<string>()
  for (const name of names.filter(entry => /^metadata_.*\.json$/i.test(entry)).sort()) {
    let document: unknown
    try {
      document = JSON.parse(await readFile(join(root, name), 'utf8'))
    } catch {
      skipped.push(name)
      continue
    }
    const entity = entityOf(payloadOf(document), name)
    if (entity === undefined) {
      skipped.push(name)
      continue
    }
    entities.push(entity)
    if (entity.tenant !== '') tenants.add(entity.tenant)
  }
  entities.sort((a, b) => a.uri.localeCompare(b.uri))
  // Children name the entity they lead to; filling the table in here is the one piece
  // of cross-entity work, and it stays a lookup rather than a second stored field.
  const byUri = new Map(entities.map(entity => [entity.uri, entity]))
  const resolved = entities.map(entity => ({
    ...entity,
    children: entity.children.map(child => ({
      ...child,
      tableName: byUri.get(child.uri)?.tableName ?? '',
    })),
  }))
  return {
    entities: resolved,
    tenant: tenants.size === 1 ? [...tenants][0] ?? '' : '',
    skipped,
  }
}

/**
 * The shipped BIP metadata, parsed on first use and kept after.
 *
 * @param root - the directory the snapshots live in; defaults to the shipped one,
 *   overridden only by a test that needs its own fixtures.
 * @returns the corpus.
 */
export async function loadBipMetadata(root = BIP_META_ROOT): Promise<BipCorpus> {
  if (cached !== undefined && root === BIP_META_ROOT) return cached
  const corpus = await readCorpus(root)
  if (root === BIP_META_ROOT) cached = corpus
  return corpus
}

/**
 * Drop the cached corpus.
 *
 * Only a test needs this: the corpus is a read of files that ship with the package, so
 * nothing in a running plugin can invalidate it.
 */
export function clearBipMetadataCache(): void {
  cached = undefined
}

/** Every spelling an entity answers to, lowercased, for matching. */
function spellingsOf(entity: BipEntity): { name: string; table: string; uri: string; label: string } {
  return {
    name: entity.name.toLowerCase(),
    table: entity.tableName.toLowerCase(),
    uri: entity.uri.toLowerCase(),
    label: entity.label.toLowerCase(),
  }
}

/**
 * Find entities by any of the names they go by.
 *
 * The ranking is the NCC finder's, for the same reason: an exact declared name is a
 * better answer than a substring, and mixing the two returns the near-misses first. The
 * tiers are name, table, then the URI's last segment (BIP's second spelling of a name,
 * where NCC has the defining file's basename), then the Chinese label.
 *
 * @param corpus - what to search.
 * @param term - an entity name, a table, a URI (whole or in part), or a Chinese label.
 * @param limit - how many to return at most.
 * @returns the matches, strongest first.
 */
export function findBipEntities(
  corpus: BipCorpus,
  term: string,
  limit: number,
): readonly BipEntity[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return []
  const exact: BipEntity[] = []
  const partial: BipEntity[] = []
  const other: BipEntity[] = []
  for (const entity of corpus.entities) {
    const spelled = spellingsOf(entity)
    const last = entity.uri.split('.').pop()?.toLowerCase() ?? ''
    if (spelled.name === needle || spelled.table === needle || spelled.uri === needle || last === needle) {
      exact.push(entity)
      continue
    }
    if (spelled.name.includes(needle) || spelled.uri.includes(needle) || spelled.table.includes(needle)) {
      if (partial.length < limit) partial.push(entity)
      continue
    }
    if (other.length < limit && spelled.label.includes(needle)) other.push(entity)
  }
  return [...exact, ...partial, ...other].slice(0, limit)
}

/** One entity with the columns that matched a field query. */
export interface BipFieldHit {
  readonly entity: BipEntity
  readonly columns: readonly BipColumn[]
}

/**
 * Find entities that have a column going by a name, a property, a label, or a fragment.
 *
 * Both spellings are matched because both are asked about: `certificate_version` is what
 * SQL needs and `certificateVersion` is what a service needs, and they are the same
 * column. An exact hit sorts above a partial one, per entity.
 *
 * @param corpus - what to search.
 * @param term - a column, a property, a Chinese label, or a fragment of one.
 * @param limit - how many entities to return at most.
 * @returns the matching entities with the columns that matched, strongest first.
 */
export function findBipColumns(corpus: BipCorpus, term: string, limit: number): readonly BipFieldHit[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return []
  const hits: { entity: BipEntity; columns: BipColumn[]; exact: boolean }[] = []
  for (const entity of corpus.entities) {
    const matched: BipColumn[] = []
    let exact = false
    for (const column of entity.columns) {
      const fields = [column.column.toLowerCase(), column.property.toLowerCase(), column.label.toLowerCase()]
      if (fields.some(field => field === needle)) {
        exact = true
        matched.push(column)
        continue
      }
      if (matched.length < 6 && fields.some(field => field.includes(needle))) matched.push(column)
    }
    if (matched.length > 0) hits.push({ entity, columns: matched, exact })
  }
  hits.sort((a, b) => Number(b.exact) - Number(a.exact))
  return hits.slice(0, limit).map(hit => ({ entity: hit.entity, columns: hit.columns }))
}

/** One enumeration name, and the columns that use it. */
export interface BipEnumHit {
  readonly name: string
  readonly refs: readonly { readonly entity: BipEntity; readonly column: BipColumn }[]
}

/**
 * Find enumerations by name, returning the columns that use them.
 *
 * The payloads name an enumeration without carrying its values, so this answers "which
 * columns are of this enum" and not "what does `1` mean here". The second question is
 * the one to ask the platform, and the answering text says so rather than leaving the
 * caller to infer it from an empty value list.
 *
 * @param corpus - what to search.
 * @param term - an enumeration name, or a fragment of one.
 * @param limit - how many enumerations to return at most.
 * @returns the matching enumerations with their referrers, exact names first.
 */
export function findBipEnums(corpus: BipCorpus, term: string, limit: number): readonly BipEnumHit[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return []
  const refs = new Map<string, { entity: BipEntity; column: BipColumn }[]>()
  for (const entity of corpus.entities) {
    for (const column of entity.columns) {
      if (column.enumName === '') continue
      const list = refs.get(column.enumName) ?? []
      list.push({ entity, column })
      refs.set(column.enumName, list)
    }
  }
  const exact: BipEnumHit[] = []
  const partial: BipEnumHit[] = []
  for (const [name, list] of refs) {
    if (name.toLowerCase() === needle) exact.push({ name, refs: list })
    else if (partial.length < limit && name.toLowerCase().includes(needle)) partial.push({ name, refs: list })
  }
  return [...exact, ...partial].slice(0, limit)
}

/**
 * One entity, by name, table or URI, or nothing.
 *
 * Ambiguity is reported rather than resolved: a term matching two entities is a term the
 * caller has to narrow, and picking one would be a guess that reads as an answer.
 *
 * @param corpus - what to search.
 * @param term - an entity name, a table, or a URI.
 * @returns the entity, or nothing.
 */
export function bipEntityOf(corpus: BipCorpus, term: string): BipEntity | undefined {
  const needle = term.trim().toLowerCase()
  if (needle === '') return undefined
  return corpus.entities.find(entity => {
    const spelled = spellingsOf(entity)
    const last = entity.uri.split('.').pop()?.toLowerCase() ?? ''
    return spelled.name === needle || spelled.table === needle || spelled.uri === needle || last === needle
  })
}

/**
 * Every entity whose name, table or URI matches, for the "which one did you mean" answer.
 *
 * @param corpus - what to search.
 * @param term - the term as given.
 * @param limit - how many to report at most.
 * @returns the candidates.
 */
export function bipCandidates(corpus: BipCorpus, term: string, limit: number): readonly BipEntity[] {
  return findBipEntities(corpus, term, limit)
}

/** How many hits a query returns when the caller does not say. */
export const DEFAULT_BIP_LIMIT = 20

/** The largest limit a caller may ask for. */
export const MAX_BIP_LIMIT = 100

/** Clamp a requested limit into range, defaulting when it is not a number. */
export function clampBipLimit(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_BIP_LIMIT
  return Math.max(1, Math.min(MAX_BIP_LIMIT, Math.floor(raw)))
}
