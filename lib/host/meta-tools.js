import { HomeError } from "./home-files.js";
import { asQueryKind, clampQueryLimit, MAX_QUERY_LIMIT, META_QUERY_KINDS } from "./meta-index.js";
import { memoryHintLine, withMemoryHint } from "./memory-session.js";
/** Every tool this module owns. */
export const META_TOOL_NAMES = ['ncc_meta_find', 'ncc_meta_detail'];
/** The closed set of kinds, spelled for a description. */
const KINDS = META_QUERY_KINDS.join(' / ');
/** The pending-state card a UI renders for one call. */
function card(title) {
    return { card: 'generic', title, kind: 'read' };
}
/** Read one required argument as a non-empty string. */
function asString(value, argument) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new HomeError('invalid-input', `${argument} 必须是非空字符串`);
    }
    return value.trim();
}
/** One tool definition over the registry's contract. */
function defineTool(spec, hint) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => [{ type: 'text', text: spec.render(value) + memoryHintLine(value) }],
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new HomeError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new HomeError('invalid-input', `${spec.name} 已被取消`);
            const value = await spec.execute(args, exec.signal);
            // The signpost, when this tool is one of the four that carry it. Injected here
            // rather than in the tool's own `execute` so that each of those four stays about its
            // own subject, and so the four cannot drift in how they say the same sentence.
            return hint === undefined ? value : await withMemoryHint(value, hint, exec);
        },
        presentCall: (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall(args),
    };
}
/** One `名字|中文名` pair split into its halves. */
function pairOf(pair) {
    const split = pair.indexOf('|');
    return split < 0 ? { name: pair, label: '' } : { name: pair.slice(0, split), label: pair.slice(split + 1) };
}
/** The JSON Schema of a find's answer. */
const FIND_VALUE = {
    type: 'object',
    required: ['home', 'version', 'kind', 'term', 'total', 'truncated', 'stale', 'entities', 'enums'],
    properties: {
        home: { type: 'string' },
        version: { type: 'string' },
        kind: { type: 'string', enum: [...META_QUERY_KINDS] },
        term: { type: 'string' },
        total: { type: 'number' },
        truncated: { type: 'boolean' },
        stale: { type: 'boolean' },
        entities: { type: 'array', items: { type: 'object' } },
        enums: { type: 'array', items: { type: 'object' } },
    },
};
/** The JSON Schema of a detail's answer. */
const DETAIL_VALUE = {
    type: 'object',
    required: ['home', 'version', 'entity', 'file', 'fields'],
    properties: {
        home: { type: 'string' },
        version: { type: 'string' },
        entity: { type: 'string' },
        filename: { type: 'string' },
        displayName: { type: 'string' },
        tableName: { type: 'string' },
        fullClassName: { type: 'string' },
        module: { type: 'string' },
        file: { type: 'string' },
        others: { type: 'array', items: { type: 'string' } },
        fields: { type: 'array', items: { type: 'object' } },
    },
};
/** One field, written the way a data dictionary writes one. */
function fieldLine(field) {
    const parts = [`${field.name}`];
    if (field.label !== '')
        parts.push(`（${field.label}）`);
    const type = field.dbtype === '' ? field.typeName : field.dbtype;
    const size = field.length === 0
        ? ''
        : field.precise > 0 ? `(${field.length},${field.precise})` : `(${field.length})`;
    parts.push(` ${type}${size}`);
    const flags = [];
    if (field.isKey)
        flags.push('主键');
    if (!field.isNullable)
        flags.push('非空');
    if (field.isReadOnly)
        flags.push('只读');
    if (field.isHide)
        flags.push('隐藏');
    if (flags.length > 0)
        parts.push(` [${flags.join('·')}]`);
    if (field.defaultValue !== '')
        parts.push(` 默认 ${field.defaultValue}`);
    return parts.join('');
}
/**
 * Register the metadata tools.
 * @param ctx - host context carrying the tool registry.
 * @param meta - the service over the built indexes.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonMetaTools(ctx, meta, hint) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'ncc_meta_find',
        description: 'Look up NCC metadata by name: which business entities the installation defines and where, '
            + 'which entities carry a given field, and what an enumeration\'s values mean. '
            + `kind is one of ${KINDS}, and those are the only three — there is no general query. `
            + '`entity` matches an entity name, its display name, '
            + 'its table name or its VO class; `field` reverses that, returning every entity that has a field with '
            + 'that name or Chinese label; `enum` matches an enumeration by name, or by a value or label inside one. '
            + 'Use it for questions like "报销单据类型是哪张表", "哪些单据有员工字段", "单据状态 2 是什么". '
            + 'The `home` argument is the id ncc_home_list returned, never a path. '
            + 'An entity name several files define (measured: psndoc is defined by three) comes back in full, with '
            + 'the module and file of each — pick from those, and ask the operator when it is not clear. '
            + 'An index has to exist before this answers; ncc_home_list says whether one does, and its answer carries '
            + '`stale`, which is true when the installation has changed since the index was built.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['home', 'kind', 'q'],
            properties: {
                home: {
                    type: 'string',
                    description: 'The id from ncc_home_list, exactly as returned — not a path.',
                },
                kind: {
                    type: 'string',
                    enum: [...META_QUERY_KINDS],
                    description: '`entity` to find entities by name, `field` to find which entities have a field, '
                        + '`enum` to find an enumeration by name or by one of its values.',
                },
                q: {
                    type: 'string',
                    description: 'What to look for: an entity or field name, a Chinese label, a table name, a VO class, '
                        + 'or an enumeration value.',
                },
                limit: {
                    type: 'number',
                    description: `How many hits to return at most; defaults to 20, capped at ${MAX_QUERY_LIMIT}.`,
                },
            },
        },
        outputSchema: FIND_VALUE,
        async execute(args) {
            const home = asString(args.home, 'home');
            const kind = asQueryKind(args.kind);
            const term = asString(args.q, 'q');
            const result = await meta.query(home, kind, term, clampQueryLimit(args.limit));
            return result;
        },
        render(value) {
            const answer = value;
            const head = `在 ${answer.home}（版本 ${answer.version}）里按 ${answer.kind} 查「${answer.term}」：`;
            const notes = [];
            if (answer.stale) {
                const fresh = answer.freshness;
                notes.push(fresh === undefined
                    ? '索引与安装目录不一致，答案可能过时。'
                    : `索引与安装目录不一致（${fresh.changed} 个改动 · ${fresh.added} 个新增 · ${fresh.removed} 个删除），答案可能过时，建议先在面板里重建。`);
            }
            if (answer.kind === 'enum') {
                if (answer.enums.length === 0) {
                    return [head, ...notes.map(note => `  · ${note}`), '',
                        '没有匹配的枚举。可以换一个名字片段，或直接查某个字段的取值（ncc_meta_find 查不到时用 ncc_meta_detail 看那个字段）。'].join('\n');
                }
                const lines = [head, ...notes.map(note => `  · ${note}`), ''];
                for (const hit of answer.enums) {
                    lines.push(`  ${hit.name}${hit.displayName === '' ? '' : `（${hit.displayName}）`} · ${hit.module}`);
                    lines.push(`      取值：${hit.items.map(item => `${item[0]}=${item[1]}`).join('、')}`);
                    lines.push(`      定义：${hit.file}`);
                }
                if (answer.truncated)
                    lines.push('', `（只列了前 ${answer.enums.length} 个，还有更多；把 q 写具体一点。）`);
                return lines.join('\n');
            }
            if (answer.entities.length === 0) {
                return [head, ...notes.map(note => `  · ${note}`), '',
                    answer.kind === 'field'
                        ? '没有哪个实体有这个字段。可以试试只给中文名的一部分，或者用 kind=entity 先确认实体名。'
                        : '没有匹配的实体。可以试试中文显示名、表名或 VO 类名，或者只给名字的一部分。'].join('\n');
            }
            const lines = [head, ...notes.map(note => `  · ${note}`), ''];
            for (const hit of answer.entities) {
                const label = hit.displayName === '' ? '' : `（${hit.displayName}）`;
                const where = hit.matched.length > 0
                    ? `命中字段：${hit.matched.map(pair => {
                        const split = pairOf(pair);
                        return split.label === '' ? split.name : `${split.name}（${split.label}）`;
                    }).join('、')}`
                    : `${hit.fieldCount} 个字段`;
                lines.push(`  ${hit.name}${label} · 表 ${hit.tableName} · ${hit.module}${hit.primary ? ' · 主实体' : ''}`);
                lines.push(`      ${where}`);
                lines.push(`      ${hit.file}`);
            }
            if (answer.truncated) {
                lines.push('', `（只列了前 ${answer.entities.length} 个，还有更多；把 q 写具体一点，或加 file 参数缩小范围。）`);
            }
            lines.push('', '要某个实体的完整字段（类型、长度、枚举取值）用 ncc_meta_detail，entity 传上面的名字。'
                + '同名实体定义在多个文件时，detail 会要求你再给 file。');
            return lines.join('\n');
        },
        presentCall(args) {
            return card(`查元数据：${String(args.kind ?? '')} ${String(args.q ?? '')}`.trim());
        },
    }, hint)));
    disposers.push(ctx.tools.register(defineTool({
        name: 'ncc_meta_detail',
        description: 'Read one entity\'s full field list from the .bmf file that defines it: every column with its '
            + 'database type, length, precision, key/nullable/readonly flags, default, and — for a column whose type '
            + 'is an enumeration — the values and their labels. Use it after ncc_meta_find(kind=entity) has named the '
            + 'entity, when the question is about the fields themselves: what a table\'s columns are, what type a '
            + 'column is, what a status code means. '
            + 'The `home` argument is the id ncc_home_list returned, never a path. '
            + 'When the entity name is defined by more than one file, this returns the list of them instead of '
            + 'guessing — call it again with `file` set to the one you want. An entity\'s name and the name of the '
            + 'file that holds it are both accepted.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['home', 'entity'],
            properties: {
                home: {
                    type: 'string',
                    description: 'The id from ncc_home_list, exactly as returned — not a path.',
                },
                entity: {
                    type: 'string',
                    description: 'The entity name, as ncc_meta_find returned it.',
                },
                file: {
                    type: 'string',
                    description: 'Which defining file to read, when the name is defined by several — a path as '
                        + 'ncc_meta_find returned it, or just its last segment.',
                },
            },
        },
        outputSchema: DETAIL_VALUE,
        async execute(args) {
            const home = asString(args.home, 'home');
            const entity = asString(args.entity, 'entity');
            const file = typeof args.file === 'string' && args.file.trim() !== '' ? args.file.trim() : undefined;
            const result = await meta.detail(home, entity, file);
            return result;
        },
        render(value) {
            const answer = value;
            const head = `${answer.entity}`
                + `${answer.displayName === '' ? '' : `（${answer.displayName}）`}`
                + ` · 表 ${answer.tableName}`
                + `${answer.fullClassName === '' ? '' : ` · ${answer.fullClassName}`}`
                + `\n  ${answer.file}`
                + `\n  ${answer.fields.length} 个字段`;
            const lines = [head, ''];
            for (const field of answer.fields) {
                lines.push(`  ${fieldLine(field)}`);
                if (field.values !== undefined) {
                    lines.push(`        取值：${field.values.map(item => `${item[0]}=${item[1]}`).join('、')}`);
                }
            }
            if (answer.others.length > 0) {
                lines.push('', `注意：同名实体在另外 ${answer.others.length} 个文件里也有定义：`);
                for (const other of answer.others)
                    lines.push(`  · ${other}`);
            }
            return lines.join('\n');
        },
        presentCall(args) {
            return card(`读元数据：${String(args.entity ?? '')}`);
        },
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
