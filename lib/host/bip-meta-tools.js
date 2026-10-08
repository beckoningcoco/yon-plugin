import { BipMetaError, clampBipLimit, findBipColumns, findBipEnums, findBipEntities, bipEntityOf, bipCandidates, loadBipMetadata, DEFAULT_BIP_LIMIT, MAX_BIP_LIMIT } from "./bip-meta.js";
import { asQueryKind, META_QUERY_KINDS } from "./meta-index.js";
import { memoryHintLine, withMemoryHint } from "./memory-session.js";
/** Every tool this module owns. */
export const BIP_META_TOOL_NAMES = ['bip_meta_find', 'bip_meta_detail'];
/** The closed set of kinds, spelled for a description. */
const KINDS = META_QUERY_KINDS.join(' / ');
/**
 * Read the `kind` argument, raising this module's error class.
 *
 * The kind surface is the NCC metadata pair's, reused verbatim so the two lines answer
 * the same four questions and cannot drift apart. `asQueryKind` belongs to a Home module
 * and throws `HomeError`, though, and that would make a 旗舰版 tool report a Home error --
 * only the message survives the tool boundary today, but a caller matching on the class
 * would be misled. So the class is translated here, in one place, and the message is kept.
 */
function asBipKind(raw) {
    try {
        return asQueryKind(raw);
    }
    catch (error) {
        throw new BipMetaError('invalid-input', error instanceof Error ? error.message : String(error));
    }
}
/** The pending-state card a UI renders for one call. */
function card(title) {
    return { card: 'generic', title, kind: 'read' };
}
/** Read one required argument as a non-empty string. */
function asString(value, argument) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new BipMetaError('invalid-input', `${argument} 必须是非空字符串`);
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
                throw new BipMetaError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new BipMetaError('invalid-input', `${spec.name} 已被取消`);
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
/** `property / column（label）` — the two spellings a caller might need, and the Chinese one. */
function pairOf(column) {
    const names = column.property === column.column || column.column === ''
        ? column.property
        : `${column.property} / ${column.column}`;
    return column.label === '' ? names : `${names}（${column.label}）`;
}
/** One column, written the way a data dictionary writes one. */
function columnLine(column) {
    const parts = [pairOf(column)];
    const type = column.type === '' ? '?' : column.type;
    const size = column.length === 0
        ? ''
        : column.precise > 0 ? `(${column.length},${column.precise})` : `(${column.length})`;
    parts.push(` ${type}${size}`);
    const flags = [];
    if (column.isKey)
        flags.push('主键');
    if (column.isCode)
        flags.push('编号');
    if (column.notNull)
        flags.push('非空');
    if (column.isRequired)
        flags.push('必填');
    if (column.enumName !== '')
        flags.push(`枚举 ${column.enumName}`);
    if (column.refUri !== '')
        flags.push(`引用 ${column.refUri}`);
    if (flags.length > 0)
        parts.push(` [${flags.join('·')}]`);
    if (column.defaultValue !== '')
        parts.push(` 默认 ${column.defaultValue}`);
    return parts.join('');
}
/** One entity, as one line of a result plus its qualifiers. */
function entityLines(hit, indent) {
    const label = hit.label === '' ? '' : `（${hit.label}）`;
    const lines = [
        `${indent}${hit.name}${label} · 表 ${hit.tableName} · ${hit.domain}`,
        `${indent}    ${hit.columnCount} 列 + ${hit.childCount} 个子表`,
        `${indent}    ${hit.uri}`,
    ];
    if (hit.matched.length > 0)
        lines.splice(1, 0, `${indent}    命中：${hit.matched.join('、')}`);
    return lines;
}
/** Turn one corpus entity into the shape a find reports. */
function hitOf(entity, matched) {
    return {
        name: entity.name,
        uri: entity.uri,
        label: entity.label,
        tableName: entity.tableName,
        domain: entity.domain,
        columnCount: entity.columns.length,
        childCount: entity.children.length,
        matched: matched.map(pairOf),
    };
}
/** The head line every answer starts with, so the vintage is never in doubt. */
function headOf(tenant, corpusSize, kind, term) {
    const from = tenant === '' ? '多个租户' : `租户 ${tenant}`;
    return `在随包发布的旗舰版元数据快照（${from} · ${corpusSize} 个实体）里按 ${kind} 查「${term}」：`;
}
/** The notes an answer carries when something about the corpus is worth saying. */
function notesOf(skipped) {
    if (skipped.length === 0)
        return [];
    return [`有 ${skipped.length} 个快照不是实体模型，已跳过：${skipped.join('、')}。`
            + '这是随包数据的问题，不是查询写错了。'];
}
/** The JSON Schema of a find's answer. */
const FIND_VALUE = {
    type: 'object',
    required: ['kind', 'term', 'total', 'truncated', 'tenant', 'corpusSize', 'entities', 'enums', 'skipped'],
    properties: {
        kind: { type: 'string', enum: [...META_QUERY_KINDS] },
        term: { type: 'string' },
        total: { type: 'number' },
        truncated: { type: 'boolean' },
        tenant: { type: 'string' },
        corpusSize: { type: 'number' },
        entities: { type: 'array', items: { type: 'object' } },
        enums: { type: 'array', items: { type: 'object' } },
        skipped: { type: 'array', items: { type: 'string' } },
    },
};
/** The JSON Schema of a detail's answer. */
const DETAIL_VALUE = {
    type: 'object',
    required: ['name', 'uri', 'tableName', 'domain', 'tenant', 'builtAt', 'source', 'columns', 'children'],
    properties: {
        name: { type: 'string' },
        uri: { type: 'string' },
        label: { type: 'string' },
        tableName: { type: 'string' },
        domain: { type: 'string' },
        tenant: { type: 'string' },
        builtAt: { type: 'string' },
        source: { type: 'string' },
        columns: { type: 'array', items: { type: 'object' } },
        children: { type: 'array', items: { type: 'object' } },
    },
};
/**
 * Register the flagship-edition metadata tools.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonBipMetaTools(ctx, hint) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'bip_meta_find',
        description: 'Look up 旗舰版 / YonBIP metadata by name, out of the snapshots this package ships: which '
            + 'business entities exist, what physical table each one is, which entities have a given column, and '
            + 'which columns use a given enumeration. '
            + `kind is one of ${KINDS}. \`entity\` matches an entity name, its URI (whole or in part), its table `
            + 'name or its Chinese label; `field` reverses that, returning every entity that has a column with that '
            + 'physical name, that Java property name, or that Chinese label; `enum` matches an enumeration by name '
            + 'and returns the columns that use it. '
            + 'This is the 旗舰版/BIP line ONLY — for an NCC installation use ncc_meta_find, which reads that '
            + 'installation\'s own files. The two lines share no entity, table or column name, so asking the wrong '
            + 'one returns nothing rather than something wrong. '
            + 'Answerable offline: the payloads are captures shipped with the package, all from one tenant, and every '
            + 'answer names the tenant and when the platform built the metadata, so a custom field is traceable to '
            + 'the installation that defined it. '
            + 'An enumeration\'s *values* are not in the payloads — only the name of the enum a column uses — so '
            + '`enum` cannot say what a status code means.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'q'],
            properties: {
                kind: {
                    type: 'string',
                    enum: [...META_QUERY_KINDS],
                    description: '`entity` to find entities by name, table, URI or label; `field` to find which entities '
                        + 'have a column; `enum` to find which columns use an enumeration.',
                },
                q: {
                    type: 'string',
                    description: 'What to look for: an entity name, a table name, an entity URI, a column (physical or '
                        + 'Java property), a Chinese label, or an enumeration name.',
                },
                limit: {
                    type: 'number',
                    description: `How many hits to return at most; defaults to ${DEFAULT_BIP_LIMIT}, capped at ${MAX_BIP_LIMIT}.`,
                },
            },
        },
        outputSchema: FIND_VALUE,
        async execute(args) {
            const kind = asBipKind(args.kind);
            const term = asString(args.q, 'q');
            const limit = clampBipLimit(args.limit);
            const corpus = await loadBipMetadata();
            const answer = {
                kind,
                term,
                total: 0,
                truncated: false,
                tenant: corpus.tenant,
                corpusSize: corpus.entities.length,
                entities: [],
                enums: [],
                skipped: [...corpus.skipped],
            };
            if (kind === 'enum') {
                const hits = findBipEnums(corpus, term, limit);
                answer.total = hits.length;
                answer.truncated = hits.length >= limit;
                answer.enums = hits.map(hit => ({
                    name: hit.name,
                    refs: hit.refs.map(ref => ({
                        entity: ref.entity.name,
                        uri: ref.entity.uri,
                        column: pairOf(ref.column),
                    })),
                }));
                return answer;
            }
            const hits = kind === 'field'
                ? findBipColumns(corpus, term, limit).map(hit => hitOf(hit.entity, hit.columns))
                : findBipEntities(corpus, term, limit).map(entity => hitOf(entity, []));
            answer.total = hits.length;
            answer.truncated = hits.length >= limit;
            answer.entities = hits;
            return answer;
        },
        render(value) {
            const answer = value;
            const head = headOf(answer.tenant, answer.corpusSize, answer.kind, answer.term);
            const lines = [head, ...notesOf(answer.skipped).map(note => `  · ${note}`), ''];
            if (answer.kind === 'enum') {
                if (answer.enums.length === 0) {
                    lines.push('没有哪个字段用这个枚举。可以只给枚举名的一部分；注意这里只认枚举的**名字**，不认它的取值。');
                    return lines.join('\n');
                }
                for (const hit of answer.enums) {
                    lines.push(`  枚举 ${hit.name} · ${hit.refs.length} 个字段用到它`);
                    for (const ref of hit.refs.slice(0, 8))
                        lines.push(`      ${ref.entity}.${ref.column}`);
                    if (hit.refs.length > 8)
                        lines.push(`      …… 另有 ${hit.refs.length - 8} 个`);
                }
                lines.push('', '注意：快照里只有枚举的**名字**，没有它的取值表，所以这里回答不了「这个状态码是什么意思」。'
                    + '要取值得去旗舰版环境里查，或先在知识库里补一条。');
                if (answer.truncated)
                    lines.push('', `（只列了前 ${answer.enums.length} 个，还有更多；把 q 写具体一点。）`);
                return lines.join('\n');
            }
            if (answer.entities.length === 0) {
                lines.push(answer.kind === 'field'
                    ? '没有哪个实体有这个字段。可以试试只给中文名或列名的一部分，或者用 kind=entity 先确认实体名。'
                    : '没有匹配的实体。可以试试中文显示名、表名、实体 URI，或者只给名字的一部分。');
                lines.push('', '另：快照只覆盖随包发布的那些实体，不是整套旗舰版元数据；查不到不等于不存在。');
                return lines.join('\n');
            }
            for (const hit of answer.entities)
                lines.push(...entityLines(hit, '  '), '');
            if (answer.truncated) {
                lines.push(`（只列了前 ${answer.entities.length} 个，还有更多；把 q 写具体一点。）`, '');
            }
            lines.push('要某个实体的完整字段（类型、长度、主键/非空、引用了哪个实体）用 bip_meta_detail，'
                + 'entity 传上面的名字或 URI。');
            return lines.join('\n');
        },
        presentCall(args) {
            return card(`查旗舰版元数据：${String(args.kind ?? '')} ${String(args.q ?? '')}`.trim());
        },
    }, hint)));
    disposers.push(ctx.tools.register(defineTool({
        name: 'bip_meta_detail',
        description: 'Read one 旗舰版 / YonBIP entity\'s full column list out of the shipped snapshots: every column '
            + 'with its Java property name, its physical column name, its Chinese label, type, length, precision, '
            + 'key/code/not-null flags, default, the enumeration it uses, and the entity it references — plus the '
            + 'entity\'s sub-tables with their tables. '
            + 'Use it after bip_meta_find has named the entity, when the question is about the fields themselves: '
            + 'what a table\'s columns are, what a column is called in Java versus in SQL, what type it is, which '
            + 'table a sub-table maps to. '
            + 'This is the 旗舰版/BIP line ONLY; for an NCC installation use ncc_meta_detail. '
            + 'Accept an entity name, a table name or an entity URI. A term matching more than one entity returns the '
            + 'candidates instead of guessing.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['entity'],
            properties: {
                entity: {
                    type: 'string',
                    description: 'The entity name, table name or URI, as bip_meta_find returned it.',
                },
            },
        },
        outputSchema: DETAIL_VALUE,
        async execute(args) {
            const entity = asString(args.entity, 'entity');
            const corpus = await loadBipMetadata();
            const found = bipEntityOf(corpus, entity);
            if (found === undefined) {
                const candidates = bipCandidates(corpus, entity, 8);
                if (candidates.length > 0) {
                    throw new BipMetaError('invalid-input', `「${entity}」没有精确匹配到哪个实体，但有几个相近的，请用其中一个的准确名字或 URI：\n`
                        + candidates.map(candidate => `  · ${candidate.name}（${candidate.label}）· 表 ${candidate.tableName} · ${candidate.uri}`).join('\n'));
                }
                throw new BipMetaError('not-found', `随包快照里没有叫「${entity}」的实体。先用 bip_meta_find 的 kind=entity 找到它的准确名字。`
                    + '注意快照只覆盖一部分实体，查不到不等于旗舰版里没有。');
            }
            const answer = {
                name: found.name,
                uri: found.uri,
                label: found.label,
                tableName: found.tableName,
                domain: found.domain,
                tenant: found.tenant,
                builtAt: found.builtAt,
                source: found.source,
                columns: found.columns,
                children: found.children.map(child => ({
                    property: child.property,
                    label: child.label,
                    uri: child.uri,
                    tableName: child.tableName,
                })),
            };
            return answer;
        },
        render(value) {
            const answer = value;
            const label = answer.label === '' ? '' : `（${answer.label}）`;
            const head = `${answer.name}${label} · 表 ${answer.tableName} · ${answer.domain}`
                + `\n  ${answer.uri}`
                + `\n  快照 ${answer.source}`
                + `${answer.builtAt === '' ? '' : ` · 平台构建于 ${answer.builtAt}`}`
                + `${answer.tenant === '' ? '' : ` · 租户 ${answer.tenant}`}`
                + `\n  ${answer.columns.length} 列 + ${answer.children.length} 个子表`;
            const lines = [head, ''];
            for (const column of answer.columns)
                lines.push(`  ${columnLine(column)}`);
            const withEnums = answer.columns.filter(column => column.enumName !== '');
            if (withEnums.length > 0) {
                lines.push('', `其中 ${withEnums.length} 个字段是枚举，快照里只有枚举名、没有取值表：`
                    + `${[...new Set(withEnums.map(column => column.enumName))].join('、')}。`);
            }
            if (answer.children.length > 0) {
                lines.push('', '子表（不是列，是它的下级实体）：');
                for (const child of answer.children) {
                    const childLabel = child.label === '' ? '' : `（${child.label}）`;
                    const table = child.tableName === '' ? '' : ` · 表 ${child.tableName}`;
                    lines.push(`  · ${child.property}${childLabel} → ${child.uri === '' ? '(payload 未给 URI)' : child.uri}${table}`);
                }
                const unresolved = answer.children.filter(child => child.tableName === '').length;
                if (unresolved > 0) {
                    lines.push(`  其中 ${unresolved} 个子表的快照不在随包数据里，所以没有它的表名；`
                        + '要用 bip_meta_detail 查那个子表本身，得先有它的快照。');
                }
            }
            return lines.join('\n');
        },
        presentCall(args) {
            return card(`读旗舰版元数据：${String(args.entity ?? '')}`);
        },
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
