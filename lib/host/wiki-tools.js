import { WikiError, } from "./wiki-service.js";
import { memoryHintLine, withMemoryHint } from "./memory-session.js";
/** Every tool this module owns. */
export const WIKI_TOOL_NAMES = ['wiki_lookup', 'wiki_read', 'wiki_recent', 'wiki_gaps'];
/**
 * What each level means, in the words the model needs to act on.
 *
 * Stated as a capability rather than a grade: "可写查询" says what to do next,
 * where "良好" or a number out of ten would say only how someone feels about it.
 */
const LEVEL_TEXT = {
    'query-ready': '可写查询',
    locatable: '可定位',
    concept: '仅概念',
};
/** What each kind of relation means, spelled out. */
const KIND_TEXT = {
    reference: '关联属性（外键指向）',
    refType: '关联引用（引用类型）',
    implements: '继承接口',
    composition: '子表',
    depends: '依赖接口',
    extends: '父实体（superUri）',
    parent: '父实体（parent_entity）',
};
/** One content block carrying text; the registry's only shape this package uses. */
function text(content) {
    return [{ type: 'text', text: content }];
}
/** The pending-state card a UI renders for one call. */
function card(title, kind, rawInput) {
    return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } };
}
/** One tool definition over the registry's contract. */
function defineTool(spec, hint) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => text(spec.render(value) + memoryHintLine(value)),
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new WikiError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new WikiError('invalid-input', `${spec.name} 已被取消`);
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
    required: ['term', 'hits', 'indexAge', 'scanned', 'unindexed'],
    properties: {
        term: { type: 'string' },
        hits: { type: 'array', items: { type: 'object' } },
        indexAge: { type: 'string' },
        scanned: { type: 'number' },
        unindexed: {
            type: 'array',
            description: 'Pages in the searched vaults that no search here can reach, because the index reads entity pages only.',
            items: {
                type: 'object',
                required: ['vault', 'dir', 'path', 'pages'],
                properties: {
                    vault: { type: 'string' },
                    dir: { type: 'string' },
                    path: { type: 'string' },
                    pages: { type: 'number' },
                },
            },
        },
    },
};
/**
 * The block naming pages a lookup could not have matched, and how to reach them.
 *
 * Carried on every answer rather than only the empty ones, because the shape of
 * the failure it prevents is a *confident* one: a vault whose prose lives under
 * `wiki/topics` answers `已扫描 0 个实体页`, and a reader with no other number in
 * front of it concludes the knowledge base is empty. Stating the scope is what
 * makes `0` mean "none of the pages I can read" instead of "none".
 *
 * The absolute directory is part of that: the index is not going to grow to cover
 * these pages, so the useful answer is not only "they exist" but "here is where,
 * go read them yourself". They carry no field list and no table name, so the line
 * says what they are *not* good for as well — the whole point of this tool is to
 * stop a table or column being invented, and a page of prose is no substitute.
 *
 * @param dirs - what the service counted.
 * @returns the block, or nothing when the vaults hold nothing outside the index.
 */
function describeUnindexed(dirs) {
    if (dirs.length === 0)
        return [];
    const total = dirs.reduce((sum, entry) => sum + entry.pages, 0);
    return [
        `另有 ${total} 个页面在所查的知识库里、但不在索引范围内`
            + '（索引只读实体页目录，所以上面的数字说的是「实体页」，不是这个知识库的规模；'
            + '0 表示我能读的页面里没有，不等于这个库是空的）：',
        ...dirs.map(entry => `  · ${entry.dir} —— ${entry.pages} 页，${entry.path}`),
        '这几种页面没有字段清单和表名，不能用它们写 SQL；要看正文，就用你手上能读文件的工具按上面的路径打开。',
    ];
}
/**
 * The one-line version, for the answers that did find something.
 *
 * The same fact, at a price the common path can pay. A hit answer already has an
 * answer in it — the failure to prevent is not "the vault looks empty" but "the
 * count above forgot to say what it counted" — and a vault like the BIP one
 * carries two directories, so the full block would repeat four lines of paths the
 * reader did not ask for on every search of the session. The paths appear where
 * they are actionable: on the search that came back with nothing.
 *
 * @param dirs - what the service counted.
 * @returns the line, or nothing when the vaults hold nothing outside the index.
 */
function summarizeUnindexed(dirs) {
    if (dirs.length === 0)
        return [];
    const total = dirs.reduce((sum, entry) => sum + entry.pages, 0);
    const names = dirs.map(entry => entry.dir).join('、');
    return [`（索引只读实体页目录：另有 ${total} 页散在 ${names}，没参与这次检索，也不算进上面的页数。）`];
}
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
/** The JSON Schema of a gap report's answer. */
const GAPS_VALUE = {
    type: 'object',
    required: ['reports'],
    properties: {
        reports: { type: 'array', items: { type: 'object' } },
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
/**
 * One line saying what a page can answer.
 *
 * The point is to be readable *before* the page is, so that a caller who needs a
 * column name does not spend 70 KB of context discovering the page never had one.
 *
 * @param assessment - the page's verdict, when it carries one.
 * @returns the line, or undefined when there is nothing to say.
 */
function describeAssessment(assessment) {
    if (assessment === undefined)
        return undefined;
    const detail = [];
    if (assessment.table !== undefined)
        detail.push(`物理表 \`${assessment.table}\``);
    if (assessment.fieldCount !== undefined)
        detail.push(`${assessment.fieldCount} 个字段`);
    const head = `能力：${LEVEL_TEXT[assessment.level]}${detail.length === 0 ? '' : ` — ${detail.join('，')}`}`;
    return assessment.lacks.length === 0 ? head : `${head}\n  注意：${assessment.lacks.join('；')}`;
}
/** One line counting a page's relations, both directions. */
function describeRelationHead(relations) {
    if (relations === undefined)
        return undefined;
    const out = relations.outgoing.reduce((total, group) => total + group.total, 0);
    const incoming = relations.incoming.reduce((total, group) => total + group.total, 0);
    if (out === 0 && incoming === 0)
        return '关系：与任何实体都不相连，只能靠搜索找到';
    return `关系：引用 ${out} 个实体，被 ${incoming} 个页面引用`;
}
/**
 * The relation detail, as the roads out of a page.
 *
 * Printed after the body rather than before it, because the body is what was
 * asked for and this is what to do next. Both directions are shown: the outgoing
 * edges save a second search, and the incoming ones answer a question a lookup
 * cannot — what else is built on this entity.
 *
 * @param relations - the page's relations.
 * @returns the lines, empty when the page has none.
 */
function describeRelations(relations) {
    if (relations === undefined)
        return [];
    const lines = [];
    const block = (title, groups) => {
        if (groups.length === 0)
            return;
        lines.push(title);
        for (const group of groups) {
            const more = group.total > group.sample.length ? ' …' : '';
            lines.push(`  ${KIND_TEXT[group.kind]}（${group.total}）：${group.sample.join('、')}${more}`);
        }
    };
    block('这一页指向：', relations.outgoing);
    block('指向这一页：', relations.incoming);
    if (relations.unresolved.total > 0) {
        const more = relations.unresolved.total > relations.unresolved.sample.length ? ' 等' : '';
        lines.push(`其中 ${relations.unresolved.total} 个目标在知识库里还没有页面：`
            + `${relations.unresolved.sample.join('、')}${more}`);
    }
    if (lines.length > 0) {
        lines.push('', '（上面是实体 URI 或页面名，都可以直接交给 wiki_lookup 或 wiki_read。）');
    }
    return lines;
}
/** One hit, as a few lines the model can act on. */
function describeHit(hit, index) {
    const lines = [`  ${index}. ${hit.name}${hit.uri === null ? '' : `  ${hit.uri}`}`];
    lines.push(`     页面：${hit.page}`);
    const capability = hit.fieldCount === undefined
        ? LEVEL_TEXT[hit.level]
        : `${LEVEL_TEXT[hit.level]}（${hit.fieldCount} 字段）`;
    const facts = [capability];
    if (hit.table !== undefined)
        facts.push(`物理表 \`${hit.table}\``);
    if (hit.domain !== undefined)
        facts.push(`domain \`${hit.domain}\``);
    if (hit.app !== undefined)
        facts.push(`应用 \`${hit.app}\``);
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
export function registerYonWikiTools(ctx, wiki, hint) {
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
            + 'from an unverified one. It also grades what the page can actually answer — 可写查询 when it '
            + 'carries both a table and its field list, 可定位 when it names the table but no columns, 仅概念 '
            + 'when it names no table at all — which is how you pick between 49 hits without opening them. '
            + 'Only entity pages are indexed: a vault\'s topic and source pages are out of reach here, and '
            + 'every answer lists those directories, their page counts and their absolute paths, so you can '
            + 'go read one directly rather than report the knowledge base as empty. '
            + 'This vault holds entities — tables and fields — not mechanics: for how the platform '
            + 'behaves, what an error means, or how something is done, use knowledge_search on the '
            + 'reference library that ships with the plugin. '
            + 'Follow up with wiki_read to read the full page, including its field list.',
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
            const unindexed = describeUnindexed(result.unindexed);
            if (result.hits.length === 0) {
                return [
                    `没有找到与「${result.term}」匹配的页面（已扫描 ${result.scanned} 个实体页）。`,
                    ...unindexed,
                    '',
                    '可以试试：换用实体 URI、物理表名、或中文显示名；确认该知识库是否登记在 Yon 面板的「知识库」里。',
                    // 这一句是 knowledge_search 那句「而不是使用者自己的知识库（后者用 wiki_lookup 查）」
                    // 的镜像。少了它，一个「问的是平台机制、却先查了实体页」的问题会停在这里：
                    // 两本库各管一半，查错库不是查不到，而是没人告诉它去查另一本。
                    '（如果问的不是某张表和它的字段，而是平台怎么运作、某个报错什么意思、某件事怎么做 —— '
                        + '那不在实体页的范围里，去 knowledge_search 查随包参考库。）',
                    '如果确实没有，说明这个实体还没被消化进知识库 —— 不要凭记忆编造表名或列名。',
                ].join('\n');
            }
            const lines = [
                `「${result.term}」匹配到 ${result.hits.length} 个页面`
                    + `（扫描 ${result.scanned} 页，索引构建于 ${result.indexAge.slice(0, 19).replace('T', ' ')}）：`,
                ...summarizeUnindexed(result.unindexed),
                '',
            ];
            result.hits.forEach((hit, i) => { lines.push(...describeHit(hit, i + 1)); });
            lines.push('', '用 wiki_read 传「页面」名读取该页全文（含字段清单）。');
            return lines.join('\n');
        },
        presentCall(args) {
            return card(`查知识库：${String(args.term ?? '')}`, 'read');
        },
    }, hint)));
    disposers.push(ctx.tools.register(defineTool({
        name: 'wiki_read',
        description: 'Read one entity page from the operator\'s Yon knowledge base. Pass the page name '
            + 'wiki_lookup returned. The page carries the entity\'s physical table, its domain, and the field '
            + 'list mapping field codes to database columns — the facts needed to write correct SQL. The '
            + 'answer also states the page\'s verification status: treat an unverified or outdated page as a '
            + 'lead to confirm against the database (datasource_query), not as fact.\n'
            + 'A page can run to 70 KB, so two arguments narrow the read instead of dumping it: '
            + 'outline: true returns just the heading list with a line count per section, and '
            + 'section: "章节名" returns that one section. On a large page, read the outline first and then '
            + 'ask for the sections you need — the whole page would crowd out everything that follows.\n'
            + 'The answer opens with what the page is good for and closes with the entities it relates to, '
            + 'in both directions: what this page points at (child tables, foreign keys, interfaces) and '
            + 'what points at it. Follow those instead of searching again — the pages are densely connected, '
            + 'and the connections are the part a name search cannot show you.',
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
            const lines = [
                `${page.page}${page.uri === null ? '' : ` / ${page.uri}`}（${page.vaultLabel}）`,
            ];
            const state = [];
            if (page.version !== undefined)
                state.push(page.version);
            state.push(page.status === undefined ? '未标注验证状态' : page.status);
            if (page.verified !== undefined)
                state.push(`最后验证 ${page.verified}`);
            lines.push(state.join('   ·   '));
            // The badge and the relation count come before the body on purpose: they are
            // what tells a caller whether this page is the one it needs, and they cost
            // two lines where reading the body to find out costs 70 KB.
            const badge = describeAssessment(page.assessment);
            if (badge !== undefined)
                lines.push(badge);
            const relationHead = describeRelationHead(page.relations);
            if (relationHead !== undefined)
                lines.push(relationHead);
            lines.push('', page.text);
            const relations = describeRelations(page.relations);
            if (relations.length > 0) {
                lines.push('', '─── 相关实体 ───────────────────────', ...relations);
            }
            return lines.join('\n');
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
    disposers.push(ctx.tools.register(defineTool({
        name: 'wiki_gaps',
        description: 'Report the holes in the operator\'s Yon knowledge base: entities its pages keep '
            + 'citing that no page covers, most-cited first, plus how well the pages are connected to each '
            + 'other.\n'
            + 'This is the knowledge base\'s own to-do list, and it needs no history to be useful — the '
            + 'evidence is already in the pages, which name tens of thousands of references. Use it to tell '
            + 'the operator what is worth documenting next, and to recognise when a lookup failed because '
            + 'the entity was never documented rather than because the term was wrong. Note that the '
            + 'largest holes are usually platform interfaces (IYTenant, LogicDelete, IAuditInfo), which may '
            + 'be met by a page or by a decision that they need none.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                vault: { type: 'string', description: 'Vault id; every registered vault when omitted.' },
                limit: { type: 'number', description: 'How many gaps per vault, most-cited first; defaults to 15, capped at 500.' },
            },
        },
        outputSchema: GAPS_VALUE,
        async execute(args) {
            const reports = await wiki.gaps(typeof args.vault === 'string' && args.vault !== '' ? args.vault : undefined, typeof args.limit === 'number' ? args.limit : undefined);
            return { reports };
        },
        render(value) {
            const result = value;
            if (result.reports.length === 0)
                return '没有可分析的知识库。';
            const lines = [];
            for (const report of result.reports) {
                const stats = report.summary;
                const share = (n) => `${(n / Math.max(1, stats.pages) * 100).toFixed(1)}%`;
                lines.push(`${report.vaultLabel}：${stats.pages} 页`);
                lines.push(`  有出链 ${stats.withOutgoing}（${share(stats.withOutgoing)}）`
                    + ` · 有入链 ${stats.withIncoming}（${share(stats.withIncoming)}）`
                    + ` · 与任何实体都不相连 ${stats.isolated}（${share(stats.isolated)}）`);
                lines.push(`  引用边 ${stats.resolvedEdges + stats.danglingEdges} 条：`
                    + `落到页面 ${stats.resolvedEdges}，指向没有页面的实体 ${stats.danglingEdges}`);
                lines.push(`  被引用但知识库里没有页面的实体：${stats.missingEntities} 个`);
                if (report.gaps.length > 0) {
                    lines.push('', `  引用最多、却最缺页面的 ${report.gaps.length} 个：`);
                    report.gaps.forEach((gap, index) => {
                        lines.push(`    ${index + 1}. ${gap.uri}   被引用 ${gap.cited} 次`);
                        if (gap.citedBy.length > 0)
                            lines.push(`         引用它的页面：${gap.citedBy.join('、')}`);
                    });
                }
                lines.push('');
                // The other half of the evidence, and the more direct half: this is what
                // somebody actually asked for, rather than what the pages imply they need.
                if (report.asked === 0) {
                    lines.push('  查询日志：还没有记录。日志从装好这一版之后开始积累，查得越多越准。');
                }
                else {
                    lines.push(`  查询日志：${report.asked} 次调用`);
                    if (report.misses.length > 0) {
                        lines.push(`  查了却没有结果的 ${report.misses.length} 个词：`);
                        for (const miss of report.misses) {
                            const when = miss.last === '' ? '' : `，最近 ${miss.last.slice(0, 10)}`;
                            lines.push(`    ${miss.term}   查了 ${miss.count} 次${when}`);
                        }
                    }
                    else {
                        lines.push('  还没有查不到的词。');
                    }
                }
                lines.push('');
            }
            lines.push('补这些洞比补任何别的页面都值：它们是已有的页面反复需要、却找不到的东西。');
            return lines.join('\n');
        },
        presentCall() {
            return card('看知识库缺口', 'read');
        },
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
