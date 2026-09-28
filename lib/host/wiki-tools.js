import { WikiError } from "./wiki-service.js";
/** Every tool this module owns. */
export const WIKI_TOOL_NAMES = ['wiki_lookup', 'wiki_read'];
/** One content block carrying text; the registry's only shape this package uses. */
function text(content) {
    return [{ type: 'text', text: content }];
}
/** The pending-state card a UI renders for one call. */
function card(title, kind, rawInput) {
    return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } };
}
/** One tool definition over the registry's contract. */
function defineTool(spec) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => text(spec.render(value)),
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new WikiError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new WikiError('invalid-input', `${spec.name} 已被取消`);
            return await spec.execute(args, exec.signal);
        },
        presentCall: (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall(args),
    };
}
/** The JSON Schema of a lookup's answer. */
const LOOKUP_VALUE = {
    type: 'object',
    required: ['term', 'hits', 'indexAge', 'scanned'],
    properties: {
        term: { type: 'string' },
        hits: { type: 'array', items: { type: 'object' } },
        indexAge: { type: 'string' },
        scanned: { type: 'number' },
    },
};
/** The JSON Schema of a read's answer. */
const READ_VALUE = {
    type: 'object',
    required: ['vault', 'page', 'text'],
    properties: {
        vault: { type: 'string' },
        vaultLabel: { type: 'string' },
        page: { type: 'string' },
        uri: { type: ['string', 'null'] },
        version: { type: 'string' },
        status: { type: 'string' },
        verified: { type: 'string' },
        text: { type: 'string' },
    },
};
/** How one hit matched, in the model's language. */
const MATCH_TEXT = {
    uri: 'URI 精确',
    table: '物理表精确',
    page: '页面名精确',
    name: '显示名精确',
    contains: '包含',
};
/** One hit, as a few lines the model can act on. */
function describeHit(hit, index) {
    const lines = [`  ${index}. ${hit.name}${hit.uri === null ? '' : `  ${hit.uri}`}`];
    lines.push(`     页面：${hit.page}`);
    const facts = [];
    if (hit.table !== undefined)
        facts.push(`物理表 \`${hit.table}\``);
    if (hit.domain !== undefined)
        facts.push(`domain \`${hit.domain}\``);
    if (hit.app !== undefined)
        facts.push(`应用 \`${hit.app}\``);
    if (facts.length > 0)
        lines.push(`     ${facts.join('   ·   ')}`);
    const state = [hit.vaultLabel];
    if (hit.version !== undefined)
        state.push(hit.version);
    if (hit.status !== undefined) {
        state.push(hit.verified === undefined ? hit.status : `${hit.status}（${hit.verified}）`);
    }
    else if (hit.verified !== undefined) {
        state.push(`未标注状态，最后验证 ${hit.verified}`);
    }
    state.push(`匹配方式：${MATCH_TEXT[hit.matchedBy]}`);
    lines.push(`     ${state.join('   ·   ')}`);
    return lines;
}
/**
 * Register the knowledge base tools.
 * @param ctx - host context carrying the tool registry.
 * @param wiki - the service the tools read through.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonWikiTools(ctx, wiki) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'wiki_lookup',
        description: 'Find entity pages in the operator\'s Yon knowledge base, which maps YonBIP and NCC '
            + 'entities to their physical tables, domains and field lists. Pass whatever name you already '
            + 'have: an entity URI such as voucher.order.Order, a physical table name such as '
            + 'ucg_baseapi_api_info, a display name such as 销售订单, or a fragment of any of them. Use this '
            + 'BEFORE writing SQL or code that names a table or column — never invent either from memory. '
            + 'Each hit reports how it matched (exact URI, exact table, exact name, or merely containing), '
            + 'plus the page\'s platform version and verification status, so you can tell a verified answer '
            + 'from an unverified one. Follow up with wiki_read to read the full page, including its field '
            + 'list.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['term'],
            properties: {
                term: {
                    type: 'string',
                    description: 'An entity URI, physical table name, page name, Chinese display name, or a fragment of any of them.',
                },
                vault: {
                    type: 'string',
                    description: 'Optional vault id to search (for example "bip" or "ncc"). All registered vaults are searched when omitted.',
                },
            },
        },
        outputSchema: LOOKUP_VALUE,
        async execute(args) {
            const result = await wiki.lookup(String(args.term ?? ''), typeof args.vault === 'string' && args.vault !== '' ? args.vault : undefined);
            return result;
        },
        render(value) {
            const result = value;
            if (result.hits.length === 0) {
                return [
                    `没有找到与「${result.term}」匹配的页面（已扫描 ${result.scanned} 个实体页）。`,
                    '',
                    '可以试试：换用实体 URI、物理表名、或中文显示名；确认该知识库是否登记在 Yon 面板的「知识库」里。',
                    '如果确实没有，说明这个实体还没被消化进知识库 —— 不要凭记忆编造表名或列名。',
                ].join('\n');
            }
            const lines = [
                `「${result.term}」匹配到 ${result.hits.length} 个页面`
                    + `（扫描 ${result.scanned} 页，索引构建于 ${result.indexAge.slice(0, 19).replace('T', ' ')}）：`,
                '',
            ];
            result.hits.forEach((hit, i) => { lines.push(...describeHit(hit, i + 1)); });
            lines.push('', '用 wiki_read 传「页面」名读取该页全文（含字段清单）。');
            return lines.join('\n');
        },
        presentCall(args) {
            return card(`查知识库：${String(args.term ?? '')}`, 'read');
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'wiki_read',
        description: 'Read one page from the operator\'s Yon knowledge base in full. Pass the page name '
            + 'wiki_lookup returned. The page carries the entity\'s physical table, its domain, and the field '
            + 'list mapping field codes to database columns — the facts needed to write correct SQL. The '
            + 'answer also states the page\'s verification status: treat an unverified or outdated page as a '
            + 'lead to confirm against the database (datasource_query), not as fact.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: {
                    type: 'string',
                    description: 'Page name as wiki_lookup returned it, with or without the .md suffix.',
                },
                vault: {
                    type: 'string',
                    description: 'Optional vault id; needed only when several vaults hold a page of that name.',
                },
            },
        },
        outputSchema: READ_VALUE,
        async execute(args) {
            const result = await wiki.read(String(args.page ?? ''), typeof args.vault === 'string' && args.vault !== '' ? args.vault : undefined);
            return result;
        },
        render(value) {
            const page = value;
            const head = [`${page.page}${page.uri === null ? '' : ` / ${page.uri}`}（${page.vaultLabel}）`];
            const state = [];
            if (page.version !== undefined)
                state.push(page.version);
            state.push(page.status === undefined ? '未标注验证状态' : page.status);
            if (page.verified !== undefined)
                state.push(`最后验证 ${page.verified}`);
            head.push(state.join('   ·   '));
            return [...head, '', page.text].join('\n');
        },
        presentCall(args) {
            return card(`读知识库页面：${String(args.page ?? '')}`, 'read');
        },
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
