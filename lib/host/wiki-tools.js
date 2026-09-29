import { WikiError } from "./wiki-service.js";
/** Every tool this module owns. */
export const WIKI_TOOL_NAMES = ['wiki_lookup', 'wiki_read', 'wiki_recent'];
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
/**
 * Split a page into its sections.
 *
 * A page in this vault reaches 70 KB and the tool's own ceiling truncates at 60, so
 * the model could be handed a page it was unable to read to the end — with no way
 * to say which part it actually wanted. Sections give it that: list them, then ask
 * for one. Raising the ceiling instead would push the whole page into the context
 * and make every later turn pay for it.
 *
 * @param text - the page's full markdown.
 * @returns one entry per `##` or `###` heading, in document order.
 */
function splitSections(text) {
    const lines = text.split(/\r?\n/);
    const marks = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined)
            continue;
        const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
        if (m === null)
            continue;
        marks.push({ heading: (m[2] ?? '').trim(), level: (m[1] ?? '##').length, at: i });
    }
    return marks.map((mark, index) => {
        const next = marks.slice(index + 1).find(other => other.level <= mark.level);
        const end = next?.at ?? lines.length;
        return {
            heading: mark.heading,
            level: mark.level,
            body: lines.slice(mark.at, end).join('\n').trimEnd(),
        };
    });
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
        uri: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        version: { type: 'string' },
        status: { type: 'string' },
        verified: { type: 'string' },
        section: { type: 'string' },
        outline: { type: 'boolean' },
        text: { type: 'string' },
    },
};
/** The JSON Schema of a history read's answer. */
const RECENT_VALUE = {
    type: 'object',
    required: ['count', 'entries'],
    properties: {
        count: { type: 'number' },
        entries: { type: 'array', items: { type: 'object' } },
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
        description: 'Read one page from the operator\'s Yon knowledge base. Pass the page name '
            + 'wiki_lookup returned. The page carries the entity\'s physical table, its domain, and the field '
            + 'list mapping field codes to database columns — the facts needed to write correct SQL. The '
            + 'answer also states the page\'s verification status: treat an unverified or outdated page as a '
            + 'lead to confirm against the database (datasource_query), not as fact.\n'
            + 'A page can run to 70 KB, so two arguments narrow the read instead of dumping it: '
            + 'outline: true returns just the heading list with a line count per section, and '
            + 'section: "章节名" returns that one section. On a large page, read the outline first and then '
            + 'ask for the sections you need — the whole page would crowd out everything that follows.',
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
                outline: {
                    type: 'boolean',
                    description: 'Return only the list of sections, with a line count each, instead of the page.',
                },
                section: {
                    type: 'string',
                    description: 'Return only this section. Matched on the exact heading first, then on a heading containing it.',
                },
            },
        },
        outputSchema: READ_VALUE,
        async execute(args) {
            const result = await wiki.read(String(args.page ?? ''), typeof args.vault === 'string' && args.vault !== '' ? args.vault : undefined);
            const sections = splitSections(result.text);
            const wanted = typeof args.section === 'string' && args.section !== '' ? args.section.trim() : undefined;
            if (wanted !== undefined) {
                const found = sections.find(section => section.heading === wanted)
                    ?? sections.find(section => section.heading.includes(wanted));
                if (found === undefined) {
                    throw new WikiError('not-found', `「${result.page}」里没有「${wanted}」这一节。现有章节：\n`
                        + sections.map(section => `  ${section.heading}`).join('\n')
                        + '\n\n先用 outline: true 看一遍章节列表，再传确切的章节名。');
                }
                return { ...result, text: found.body, section: found.heading };
            }
            if (args.outline === true) {
                const listing = sections.length === 0
                    ? '（这一页没有二级或三级标题）'
                    : sections
                        .map(section => `${'  '.repeat(Math.max(0, section.level - 2))}${section.heading}`
                        + `   （${section.body.split(/\r?\n/).length} 行）`)
                        .join('\n');
                return {
                    ...result,
                    outline: true,
                    text: `整页 ${result.text.length} 字符。章节：\n\n${listing}\n\n用 section: "<章节名>" 只读其中一节。`,
                };
            }
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
    disposers.push(ctx.tools.register(defineTool({
        name: 'wiki_recent',
        description: 'Read the tail of the knowledge base\'s own history: what has been written into it '
            + 'lately, newest first. Every write appends a line to the vault\'s log.md, so this answers '
            + '"what has this base been told recently" without walking pages one at a time. Use it before '
            + 'assuming a page is missing, and to tell the operator what changed since they last looked.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                vault: { type: 'string', description: 'Vault id; every registered vault when omitted.' },
                limit: { type: 'number', description: 'How many entries, newest first; defaults to 20, capped at 200.' },
            },
        },
        outputSchema: RECENT_VALUE,
        async execute(args) {
            const entries = await wiki.recent(typeof args.vault === 'string' && args.vault !== '' ? args.vault : undefined, typeof args.limit === 'number' ? args.limit : undefined);
            return { count: entries.length, entries };
        },
        render(value) {
            const result = value;
            if (result.count === 0) {
                return [
                    '这个知识库还没有写入记录。',
                    '',
                    '两种可能：`log.md` 不存在（vault 是新建的），或者这个库从未被 wiki_write 写过。',
                ].join('\n');
            }
            const lines = [`最近 ${result.count} 条写入（新到旧）：`, ''];
            for (const entry of result.entries) {
                lines.push(`  ${entry.date}  ${entry.text}`);
                if (entry.vaultLabel !== '')
                    lines.push(`      ${entry.vaultLabel}`);
            }
            lines.push('', '要看某一条对应的页面，用 wiki_read 传页面名。');
            return lines.join('\n');
        },
        presentCall() {
            return card('读知识库写入历史', 'read');
        },
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
