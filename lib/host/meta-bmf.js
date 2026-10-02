/** Every attribute on one tag, as written. */
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9_]*)="([^"]*)"/g;
/**
 * The data-carrying tags, opened or closed.
 *
 * The `\b` is load-bearing: without it `<attributelist>` would match as an
 * `<attribute>` open tag and `<entitylist>` as an `<entity>`, and every container in
 * the document would be read as its contents.
 */
const TAG = /<\/?(entity|Enumerate|attribute|enumitem|Reference)\b[^>]*>/g;
/** True for a self-closing or complete tag; `</x>` for a close tag. */
function isClose(tag) {
    return tag.startsWith('</');
}
/** The attributes of one tag, read fresh so the shared regex keeps no state. */
function attrsOf(tag) {
    const found = {};
    ATTRIBUTE.lastIndex = 0;
    let match;
    while ((match = ATTRIBUTE.exec(tag)) !== null) {
        const name = match[1];
        const value = match[2];
        if (name !== undefined)
            found[name] = value ?? '';
    }
    return found;
}
/** A number attribute, or a fallback when it is absent or not a number. */
function numberOf(raw, fallback) {
    if (raw === undefined || raw.trim() === '')
        return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}
/** An `="true"` attribute, which is how every boolean is written in these files. */
function boolOf(raw) {
    return raw === 'true';
}
/**
 * One `<attribute>` as the index stores it.
 *
 * The attributes kept are the ones a reader of a data dictionary asks about: what
 * column it is, what type and length, and whether it is a key, a nullable, or hidden.
 * The rest — `createTime`, `resid`, `versionType`, the twenty-odd `is*` flags — are
 * toolchain bookkeeping.
 */
function fieldOf(attrs) {
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
    };
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
export function parseBmf(text, module, fallbackName) {
    const entities = [];
    const enums = [];
    let entity;
    let enumeration;
    TAG.lastIndex = 0;
    let match;
    while ((match = TAG.exec(text)) !== null) {
        const kind = match[1];
        const closing = isClose(match[0]);
        if (kind === 'entity') {
            if (closing) {
                if (entity !== undefined)
                    entities.push(entityOf(entity.attrs, entity.fields, module, fallbackName));
                entity = undefined;
            }
            else {
                // A second `<entity>` before the first closed would mean malformed nesting;
                // closing the open one first keeps every entity that did appear.
                if (entity !== undefined)
                    entities.push(entityOf(entity.attrs, entity.fields, module, fallbackName));
                entity = { attrs: attrsOf(match[0]), fields: [] };
            }
            continue;
        }
        if (kind === 'Enumerate') {
            if (closing) {
                if (enumeration !== undefined)
                    enums.push(enumOf(enumeration.attrs, enumeration.items));
                enumeration = undefined;
            }
            else {
                if (enumeration !== undefined)
                    enums.push(enumOf(enumeration.attrs, enumeration.items));
                enumeration = { attrs: attrsOf(match[0]), items: [] };
            }
            continue;
        }
        if (closing)
            continue;
        if (kind === 'attribute') {
            // An `<attribute>` outside any `<entity>` describes nothing this index can key
            // on, so it is dropped rather than attached to whichever entity was last seen.
            if (entity !== undefined)
                entity.fields.push(fieldOf(attrsOf(match[0])));
            continue;
        }
        if (kind === 'enumitem') {
            if (enumeration === undefined)
                continue;
            const attrs = attrsOf(match[0]);
            // `enumValue`/`enumDisplay`, not `value`/`displayName` — measured against a real
            // file, and the reason a simpler parser reports every enumeration as empty.
            enumeration.items.push({
                value: attrs.enumValue ?? '',
                label: attrs.enumDisplay ?? attrs.displayName ?? '',
            });
            continue;
        }
        // `Reference` is parsed by nobody in this batch. It is named in the alternation so
        // the tag is consumed here rather than being left to confuse a later reader of the
        // loop — but its 8,367 `mdFilePath` values need a resolution rule of their own and
        // have no query to answer yet, so they are the plan's §11 first cut.
    }
    if (entity !== undefined)
        entities.push(entityOf(entity.attrs, entity.fields, module, fallbackName));
    if (enumeration !== undefined)
        enums.push(enumOf(enumeration.attrs, enumeration.items));
    return { entities, enums };
}
/** One `<entity>` element as the index stores it. */
function entityOf(attrs, fields, module, fallbackName) {
    const declared = (attrs.name ?? '').trim();
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
    };
}
/** One `<Enumerate>` element as the index stores it. */
function enumOf(attrs, items) {
    return {
        name: attrs.name ?? '',
        displayName: attrs.displayName ?? '',
        fullClassName: attrs.fullClassName ?? '',
        // The id is not stored, but it is what a field's `dataType` points at, so the
        // caller resolving that link needs it in hand. `meta-index.ts` drops it.
        id: attrs.id ?? '',
        items,
    };
}
