/**
 * Reading one `.bmf` file: the NCC metadata that describes a business entity.
 *
 * A `.bmf` is XML with one element per line, and it declares its own encoding
 * (`<?xml version="1.0" encoding="UTF-8"?>`), which is accurate — a 400-file sample
 * across the modules tree found **zero** files that are not valid UTF-8 and zero with
 * a BOM. That is why this module takes a `string` rather than bytes: the only caller
 * is the indexer, which reads whole subtrees in bulk and decodes once.
 *
 * ## Why not an XML parser
 *
 * The authoritative tree is 3,600 files / 244.2 MB, and a rebuild has to fit in the
 * time a person will wait (measured: 78 MB/s with these two regexes, ~3.3 s total).
 * A DOM would hold the whole tree as objects; a SAX pass would still allocate a node
 * per element. What is actually needed is four things per file — entities, their
 * fields, the enumerations, and (not here, see below) the cross-file references —
 * and every one of them is one element with attributes on a single line.
 *
 * So the parse is one left-to-right scan over the tag stream with a `current`
 * pointer: `<entity>` opens a container, `<attribute>` lands in it, `</entity>`
 * closes it. Nested containers (`<attributelist>`, `<enumitemlist>`,
 * `<canzhaolist>`) need no handling at all because they are not in the alternation —
 * only the four tags that carry data are.
 *
 * ## The four rules that are judgements, not implementation details
 *
 * 1. **A file may hold several entities** — measured: 1,191 of 3,600 files do. So the
 *    unit of the result is the entity, never the file. A parser that returned one
 *    entity per file would silently drop 2,000-odd entities.
 * 2. **`moduleName` is not usable as the owning module** — measured: a file under
 *    `modules/riawf` carries `moduleName="uap"`. Ownership comes from the path, which
 *    is what the caller passes in as `module`.
 * 3. **`<Enumerate>` is a sibling of `<entity>`, and a field reaches it through
 *    `dataType`** — measured: `<attribute dataType="dd2ccba9-…">` and
 *    `<Enumerate id="dd2ccba9-…">` carry the same UUID. There is no `enumID` on
 *    `<attribute>`; that name belongs to `<enumitem>`, which points *back* at its
 *    enumeration. Resolving the link therefore needs the file's own enumerations,
 *    which is why {@link BmfComponent} returns them together.
 *    That same `dataType` slot also holds the id of *another entity* for foreign keys
 *    (`pk_org` → an org entity's id). Those edges cross files and need the full
 *    256,152-id space, so batch A does not resolve them — see the plan's §11.
 * 4. **The name a person types is the entity's `name`, not the file's** — measured:
 *    keyed by `name` there are 5,358 distinct entities with 182 ambiguous (3.40%);
 *    keyed by file basename, 3,514 with 80 ambiguous. They agree for most entities
 *    (`psndoc.bmf` holds `name="psndoc"`) but not all — a file named
 *    `expensetype.bmf` holds `name="ExpenseType"`. Both are recorded so a query
 *    matches either, and neither is treated as canonical on its own.
 *
 * ## A field can be missing either half of its identity
 *
 * Every `<attribute>` has a `fieldName`, but a `displayName` can be absent. A blank
 * label is not an error and not a reason to drop the field: the name is what a
 * "which tables have this column" query matches on, and the label is only what a
 * person reads. The parser reports the label as written — empty means empty — and
 * the index decides what to store.
 */
/** One `<attribute>`: a column of the entity, and everything a dictionary says about it. */
export interface BmfField {
  readonly name: string
  /** The Chinese label; empty when the file carries none. */
  readonly label: string
  readonly dbtype: string
  readonly fieldType: string
  /**
   * The business type: a `BS…` code for a primitive, or a UUID naming either an
   * enumeration or another entity. Resolving the UUID needs the file's own
   * enumerations and, for a foreign key, the whole id space — see the header.
   */
  readonly dataType: string
  /** The type's readable name, which for an enumeration is its `name`. */
  readonly typeName: string
  readonly length: number
  readonly precise: number
  readonly isKey: boolean
  readonly isNullable: boolean
  readonly isReadOnly: boolean
  readonly isHide: boolean
  readonly defaultValue: string
}

/** One `<enumitem>`: one value of an enumeration, with the label a person sees. */
export interface BmfEnumItem {
  readonly value: string
  readonly label: string
}

/** One `<Enumerate>`: a field's value set. */
export interface BmfEnum {
  readonly name: string
  readonly displayName: string
  readonly fullClassName: string
  /** What a field's `dataType` matches to reach this enumeration. */
  readonly id: string
  readonly items: readonly BmfEnumItem[]
}

/** One `<entity>`: the business object, its table, and its columns. */
export interface BmfEntity {
  /** The declared name, or the file's basename when the element carries none. */
  readonly name: string
  /** The file's basename without extension — the other spelling a caller may use. */
  readonly filename: string
  readonly displayName: string
  readonly tableName: string
  readonly fullClassName: string
  readonly id: string
  /** The module from the path, never the document's own `moduleName`. */
  readonly module: string
  readonly primary: boolean
  readonly fields: readonly BmfField[]
}

/** Everything one `.bmf` file declares. */
export interface BmfComponent {
  readonly entities: readonly BmfEntity[]
  readonly enums: readonly BmfEnum[]
}

/** Every attribute on one tag, as written. */
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9_]*)="([^"]*)"/g

/**
 * The data-carrying tags, opened or closed.
 *
 * The `\b` is load-bearing: without it `<attributelist>` would match as an
 * `<attribute>` open tag and `<entitylist>` as an `<entity>`, and every container in
 * the document would be read as its contents.
 */
const TAG = /<\/?(entity|Enumerate|attribute|enumitem|Reference)\b[^>]*>/g

/** True for a self-closing or complete tag; `</x>` for a close tag. */
function isClose(tag: string): boolean {
  return tag.startsWith('</')
}

/** The attributes of one tag, read fresh so the shared regex keeps no state. */
function attrsOf(tag: string): Record<string, string> {
  const found: Record<string, string> = {}
  ATTRIBUTE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ATTRIBUTE.exec(tag)) !== null) {
    const name = match[1]
    const value = match[2]
    if (name !== undefined) found[name] = value ?? ''
  }
  return found
}

/** A number attribute, or a fallback when it is absent or not a number. */
function numberOf(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/** An `="true"` attribute, which is how every boolean is written in these files. */
function boolOf(raw: string | undefined): boolean {
  return raw === 'true'
}

/**
 * One `<attribute>` as the index stores it.
 *
 * The attributes kept are the ones a reader of a data dictionary asks about: what
 * column it is, what type and length, and whether it is a key, a nullable, or hidden.
 * The rest — `createTime`, `resid`, `versionType`, the twenty-odd `is*` flags — are
 * toolchain bookkeeping.
 */
function fieldOf(attrs: Record<string, string>): BmfField {
  return {
    name: attrs.fieldName ?? attrs.name ?? '',
    // Left empty when the file carries none, rather than filled in with the name: an
    // absent label and a label that happens to equal the name are different facts,
    // and the index stores one `名字|中文名` pair per labelled field only.
    label: attrs.displayName ?? '',
    dbtype: attrs.dbtype ?? '',
    fieldType: attrs.fieldType ?? '',
    dataType: attrs.dataType ?? '',
    typeName: attrs.typeName ?? '',
    length: numberOf(attrs.length, 0),
    precise: numberOf(attrs.precise, 0),
    isKey: boolOf(attrs.isKey),
    isNullable: boolOf(attrs.isNullable),
    isReadOnly: boolOf(attrs.isReadOnly),
    isHide: boolOf(attrs.isHide),
    defaultValue: attrs.defaultValue ?? '',
  }
}

/**
 * Parse one `.bmf` document.
 *
 * @param text - the file's text, already decoded (these files are UTF-8).
 * @param module - the module the file sits under, taken from its path — never from
 *   the document's own `moduleName`, which is wrong for some files.
 * @param fallbackName - the file's basename without extension, used for an entity
 *   that carries no `name` of its own.
 * @returns every entity and enumeration the file declares, in document order.
 */
export function parseBmf(text: string, module: string, fallbackName: string): BmfComponent {
  const entities: BmfEntity[] = []
  const enums: BmfEnum[] = []
  let entity: { attrs: Record<string, string>; fields: BmfField[] } | undefined
  let enumeration: { attrs: Record<string, string>; items: { value: string; label: string }[] } | undefined

  TAG.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG.exec(text)) !== null) {
    const kind = match[1]
    const closing = isClose(match[0])
    if (kind === 'entity') {
      if (closing) {
        if (entity !== undefined) entities.push(entityOf(entity.attrs, entity.fields, module, fallbackName))
        entity = undefined
      } else {
        // A second `<entity>` before the first closed would mean malformed nesting;
        // closing the open one first keeps every entity that did appear.
        if (entity !== undefined) entities.push(entityOf(entity.attrs, entity.fields, module, fallbackName))
        entity = { attrs: attrsOf(match[0]), fields: [] }
      }
      continue
    }
    if (kind === 'Enumerate') {
      if (closing) {
        if (enumeration !== undefined) enums.push(enumOf(enumeration.attrs, enumeration.items))
        enumeration = undefined
      } else {
        if (enumeration !== undefined) enums.push(enumOf(enumeration.attrs, enumeration.items))
        enumeration = { attrs: attrsOf(match[0]), items: [] }
      }
      continue
    }
    if (closing) continue
    if (kind === 'attribute') {
      // An `<attribute>` outside any `<entity>` describes nothing this index can key
      // on, so it is dropped rather than attached to whichever entity was last seen.
      if (entity !== undefined) entity.fields.push(fieldOf(attrsOf(match[0])))
      continue
    }
    if (kind === 'enumitem') {
      if (enumeration === undefined) continue
      const attrs = attrsOf(match[0])
      // `enumValue`/`enumDisplay`, not `value`/`displayName` — measured against a real
      // file, and the reason a simpler parser reports every enumeration as empty.
      enumeration.items.push({
        value: attrs.enumValue ?? '',
        label: attrs.enumDisplay ?? attrs.displayName ?? '',
      })
      continue
    }
    // `Reference` is parsed by nobody in this batch. It is named in the alternation so
    // the tag is consumed here rather than being left to confuse a later reader of the
    // loop — but its 8,367 `mdFilePath` values need a resolution rule of their own and
    // have no query to answer yet, so they are the plan's §11 first cut.
  }
  if (entity !== undefined) entities.push(entityOf(entity.attrs, entity.fields, module, fallbackName))
  if (enumeration !== undefined) enums.push(enumOf(enumeration.attrs, enumeration.items))

  return { entities, enums }
}

/** One `<entity>` element as the index stores it. */
function entityOf(
  attrs: Record<string, string>,
  fields: readonly BmfField[],
  module: string,
  fallbackName: string,
): BmfEntity {
  const declared = (attrs.name ?? '').trim()
  return {
    // The document's own name is preferred and the file's stands in for it. Both
    // spellings that a person might type are kept by the index separately, so this
    // choice affects only which one is called the name.
    name: declared === '' ? fallbackName : declared,
    filename: fallbackName,
    displayName: attrs.displayName ?? '',
    tableName: attrs.tableName ?? '',
    fullClassName: attrs.fullClassName ?? '',
    id: attrs.id ?? '',
    module,
    primary: boolOf(attrs.isPrimary),
    fields: fields.filter(field => field.name !== ''),
  }
}

/** One `<Enumerate>` element as the index stores it. */
function enumOf(
  attrs: Record<string, string>,
  items: readonly { value: string; label: string }[],
): BmfEnum {
  return {
    name: attrs.name ?? '',
    displayName: attrs.displayName ?? '',
    fullClassName: attrs.fullClassName ?? '',
    // The id is not stored, but it is what a field's `dataType` points at, so the
    // caller resolving that link needs it in hand. `meta-index.ts` drops it.
    id: attrs.id ?? '',
    items,
  }
}
