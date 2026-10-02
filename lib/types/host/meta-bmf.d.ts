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
    readonly name: string;
    /** The Chinese label; empty when the file carries none. */
    readonly label: string;
    readonly dbtype: string;
    readonly fieldType: string;
    /**
     * The business type: a `BS…` code for a primitive, or a UUID naming either an
     * enumeration or another entity. Resolving the UUID needs the file's own
     * enumerations and, for a foreign key, the whole id space — see the header.
     */
    readonly dataType: string;
    /** The type's readable name, which for an enumeration is its `name`. */
    readonly typeName: string;
    readonly length: number;
    readonly precise: number;
    readonly isKey: boolean;
    readonly isNullable: boolean;
    readonly isReadOnly: boolean;
    readonly isHide: boolean;
    readonly defaultValue: string;
}
/** One `<enumitem>`: one value of an enumeration, with the label a person sees. */
export interface BmfEnumItem {
    readonly value: string;
    readonly label: string;
}
/** One `<Enumerate>`: a field's value set. */
export interface BmfEnum {
    readonly name: string;
    readonly displayName: string;
    readonly fullClassName: string;
    /** What a field's `dataType` matches to reach this enumeration. */
    readonly id: string;
    readonly items: readonly BmfEnumItem[];
}
/** One `<entity>`: the business object, its table, and its columns. */
export interface BmfEntity {
    /** The declared name, or the file's basename when the element carries none. */
    readonly name: string;
    /** The file's basename without extension — the other spelling a caller may use. */
    readonly filename: string;
    readonly displayName: string;
    readonly tableName: string;
    readonly fullClassName: string;
    readonly id: string;
    /** The module from the path, never the document's own `moduleName`. */
    readonly module: string;
    readonly primary: boolean;
    readonly fields: readonly BmfField[];
}
/** Everything one `.bmf` file declares. */
export interface BmfComponent {
    readonly entities: readonly BmfEntity[];
    readonly enums: readonly BmfEnum[];
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
export declare function parseBmf(text: string, module: string, fallbackName: string): BmfComponent;
