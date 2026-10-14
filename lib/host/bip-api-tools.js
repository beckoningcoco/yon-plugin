import { BipApiError, createBipApiRouteStore, detailExpression, findExpression, renderHit, } from "./bip-api.js";
import { createBipApiIndexStore, BIP_API_INDEX_FRESH_MS, } from "./bip-api-index.js";
/** Every tool this module owns, in the order they are registered. */
export const BIP_API_TOOL_NAMES = ['bip_api_find', 'bip_api_detail'];
/** One text block, which is all these tools return. */
function textOf(content) {
    return [{ type: 'text', text: content }];
}
/** One tool definition over the registry's contract. */
function defineTool(spec) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => textOf(spec.render(value)),
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new BipApiError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new BipApiError('invalid-input', `${spec.name} 已被取消`);
            return await spec.execute(args, exec.signal);
        },
        presentCall: (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall(args),
    };
}
/** A required string argument, or a refusal naming what was missing. */
function asString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new BipApiError('invalid-input', `${name} 要是一个非空的字符串。`);
    }
    return value.trim();
}
/** An optional string argument. */
function optionalString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
/** An optional positive integer argument. */
function optionalCount(value, name) {
    if (value === undefined || value === null)
        return undefined;
    const asNumber = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isInteger(asNumber) || asNumber <= 0) {
        throw new BipApiError('invalid-input', `${name} 要是一个正整数。`);
    }
    return asNumber;
}
/** The origin of one address, or the empty string when it will not parse. */
function originOf(url) {
    try {
        return new URL(url).origin;
    }
    catch {
        return '';
    }
}
/**
 * Whether an argument is already an API id rather than a name.
 *
 * Measured on a real environment, ids come in two shapes — a 19-digit number
 * (`2201778107777548296`) and a bare uuid (`dde3e06ebb8d4119aed9f118e17c2cdd`) —
 * so the test is "long enough to be one of those, and made only of hex digits",
 * which is what keeps a Chinese API name from ever being mistaken for an id.
 */
function looksLikeApiId(text) {
    return /^[0-9a-f]{16,}$/i.test(text);
}
/** Parse one page answer, refusing anything that is not the object we asked for. */
function parseAnswer(value, what) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new BipApiError('unusable', `页面里那次${what}没有返回 JSON：${value.slice(0, 200)}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new BipApiError('unusable', `页面里那次${what}返回的不是一个对象：${value.slice(0, 200)}`);
    }
    return parsed;
}
/** Turn a page-side refusal into an error the caller can act on. */
function asRefusal(answer, what) {
    const code = typeof answer.code === 'string' ? answer.code : '';
    const message = typeof answer.error === 'string' ? answer.error : `${what}失败，页面没有说明原因。`;
    throw new BipApiError(code === 'unreachable' ? 'unusable' : 'not-found', message);
}
/**
 * Settle on the page this call reads from.
 * @param cdp - the browser surface.
 * @param pageArg - the caller's page reference, when it named one.
 * @param runArg - the caller's browser, when it named one.
 * @param signal - cancellation.
 * @returns the page to evaluate in, its origin when known, and its title.
 */
async function resolvePage(cdp, pageArg, runArg, signal) {
    const listing = await cdp.pages(runArg === undefined ? {} : { run: runArg }, signal);
    const pages = listing.pages.filter(one => /^https?:/i.test(one.url));
    if (pageArg !== undefined) {
        const found = pages.find(one => one.targetId === pageArg || one.url.includes(pageArg) || one.title.includes(pageArg));
        return {
            page: pageArg,
            origin: found === undefined ? '' : originOf(found.url),
            title: found === undefined ? '' : found.title,
        };
    }
    if (pages.length === 0) {
        throw new BipApiError('no-page', '调试浏览器里没有一个 http 页面可用。API 文档接口只认登录态，所以要先在浏览器里打开'
            + '这个旗舰版环境的任意页面（或直接停在「连接集成平台 → 调用API → API文档」），'
            + '再用 browser_targets 看看有哪些页面。');
    }
    const preferred = pages.find(one => /iuap-ipaas|openPortal/i.test(one.url)) ?? pages[0];
    if (preferred === undefined) {
        throw new BipApiError('no-page', '调试浏览器里没有一个 http 页面可用。');
    }
    return { page: preferred.targetId, origin: originOf(preferred.url), title: preferred.title };
}
/** Run one find expression and check its answer. */
async function runFind(cdp, page, request, signal) {
    const result = await cdp.evaluate({ page, expression: findExpression(request), maxChars: 200000 }, signal);
    const answer = parseAnswer(result.value, '查找');
    if (answer.ok !== true)
        asRefusal(answer, '查找');
    return answer;
}
/** Run one detail expression and check its answer. */
async function runDetail(cdp, page, apiId, options, signal) {
    const result = await cdp.evaluate({
        page,
        expression: detailExpression({
            apiId,
            ...(options.section === undefined ? {} : { section: options.section }),
            ...(options.full === undefined ? {} : { full: options.full }),
        }),
        maxChars: 200000,
    }, signal);
    const answer = parseAnswer(result.value, '读详情');
    if (answer.ok !== true)
        asRefusal(answer, '读详情');
    return answer;
}
/** One parameter written the way a person reads a field list. */
function paramLine(one) {
    const shape = [one.type ?? '', one.at === undefined ? '' : one.at, one.array === true ? '数组' : '']
        .filter(part => part !== '').join(' ');
    const extras = [
        one.format === undefined ? '' : `格式 ${one.format}`,
        one.maxLength === undefined ? '' : `最长 ${one.maxLength}`,
        one.decimals === undefined ? '' : `小数 ${String(one.decimals)}`,
        one.default === undefined ? '' : `默认 ${one.default}`,
    ].filter(part => part !== '').join('，');
    return `    · ${one.name}${one.required === true ? '（必填）' : ''}`
        + `${shape === '' ? '' : ` ${shape}`}`
        + `${one.desc === undefined ? '' : ` —— ${one.desc}`}`
        + `${extras === '' ? '' : `（${extras}）`}`
        + `${one.example === undefined ? '' : ` 例：${one.example}`}`
        + `${one.hidden === true ? ' [页面不显示]' : ''}`;
}
/** The find answer, as the model reads it. */
function renderFind(outcome) {
    if (outcome.timedOut === true) {
        return `${outcome.origin}：查「${outcome.keyword}」超过了这次调用的时间预算，没有拿到结果。`
            + '那个页面的接口连接可能已经被占满了——先用 product 或 classify_id 缩小范围再试，'
            + '或者把那个页面刷新一下。';
    }
    const scan = outcome.scanned;
    // 走搜索那一发时服务/分类/实查三个数字都是 0——「翻了 0 个分类」不是信息，是噪声。
    const notes = scan.viaSearch === true ? ['按名字搜索命中，没有翻目录（1 次请求）'] : [
        outcome.viaRoute ? '走了路标' : '',
        outcome.viaIndex ? '走了定位图' : `服务 ${String(scan.products)}`,
        // 只扫了一两个分类看起来和「扫描被截断」一模一样，所以收网是靠什么收的要说出来。
        outcome.viaIndex && scan.viaApi ? '按图上记着的接口名收的网' : '',
        `${outcome.viaIndex ? '图上' : ''}分类 ${String(scan.classifies)}`,
        `实查 ${String(scan.groups)} 个分类`,
        scan.truncated ? '分类数超过上限，只扫了一部分（可加 product 缩小范围）' : '',
        scan.deadline ? '扫描超过时间预算，提前收尾（结果可能不全，可加 product 或 classify_id 缩范围）' : '',
        outcome.fellBack ? '原路标落空，已作废并重扫全量' : '',
        outcome.indexForgotten ? '原定位图落空，已作废并重扫全量' : '',
        // 图刚建过、关键词只是不存在时，这一趟没有重扫——要说出来，并且把「不信它」的办法给出来。
        // 少了的可能只有一个：图建好之后新加的分类。删掉图文件再问一次就能绕开。
        outcome.total === 0 && outcome.viaIndex && !outcome.indexForgotten
            ? `定位图刚建过，没有因落空重扫；如果这是刚新增的分类，删掉 ${outcome.indexPath ?? ''} 再问一次`
            : '',
        outcome.indexSaved ? `定位图已更新：${outcome.indexPath ?? ''}` : '',
    ].filter(part => part !== '');
    const head = `${outcome.origin}：找到 ${String(outcome.total)} 条匹配「${outcome.keyword}」（${notes.join('；')}）。`;
    if (outcome.total === 0) {
        const asked = scan.searched === true
            ? '名字搜索与目录枚举都空手而归：'
            : '这次是按目录浏览，没有问名字搜索：';
        return [
            head,
            `${asked}可以换一个更接近接口名的说法（接口名与分类路径都会被匹配），`,
            '也可以先只给 product 缩小到某一个服务再看一遍。',
        ].join('\n');
    }
    return [
        head,
        ...outcome.hits.map(renderHit),
        '',
        '用 bip_api_detail 取其中一条的调用地址与字段（把上面的 id 或完整名称传给它）。',
    ].join('\n');
}
/** The detail answer, as the model reads it. */
function renderDetail(answer) {
    const api = answer.api;
    const where = api.path !== undefined && api.path !== ''
        ? api.path
        : [api.productName ?? '', api.classifyName ?? ''].filter(part => part !== '').join(' / ');
    const lines = [
        `${api.name}${api.description === '' ? '' : ` —— ${api.description}`}`,
        `  地址：${api.address === '' ? '(原厂没有登记调用地址)' : api.address}`,
        `  方式：${api.method}${api.contentType === undefined ? '' : `  ${api.contentType}`}`
            + `${api.protocol === undefined ? '' : `  ${api.protocol}`}`,
        `  归属：${where === '' ? '(未知)' : where}`
            + `    发布：${api.publishStatus ? '是' : '否'}`
            + `${api.updated === undefined ? '' : `    更新：${api.updated}`}`,
        `  网关内路径：${api.proxyUrl === '' ? '(无)' : api.proxyUrl}`
            + `${api.connectUrl === undefined ? '' : `    集成侧：${api.connectUrl}`}`,
        `  参数：共 ${String(answer.request.total)} 个，必填 ${String(answer.request.required.length)} 个`,
    ];
    if (answer.request.required.length > 0) {
        lines.push('  必填：', ...answer.request.required.map(paramLine));
    }
    if (answer.request.optional !== undefined && answer.request.optional.length > 0) {
        lines.push('  非必填：', ...answer.request.optional.map(paramLine));
    }
    else if (answer.request.optionalCount > 0) {
        lines.push(`  （另有 ${String(answer.request.optionalCount)} 个非必填参数；要看的加 full: true）`);
    }
    if (answer.request.nested.length > 0) {
        lines.push('  嵌套节点：', ...answer.request.nested.map(one => `    · ${one.name}${one.desc === undefined ? '' : ` —— ${one.desc}`}`
            + `（${String(one.total)} 个字段，必填 ${String(one.requiredCount)} 个）`));
    }
    if (answer.request.demo !== undefined) {
        lines.push('  请求示例：', answer.request.demo.split('\n').map(line => `    ${line}`).join('\n'));
    }
    if (answer.returns.length > 0) {
        lines.push('  返回：', ...answer.returns.map(paramLine));
    }
    if (answer.successDemo !== undefined) {
        lines.push('  正确返回示例：', answer.successDemo.split('\n').map(line => `    ${line}`).join('\n'));
    }
    if (answer.errorDemo !== undefined) {
        lines.push('  错误返回示例：', answer.errorDemo.split('\n').map(line => `    ${line}`).join('\n'));
    }
    if (answer.section !== undefined) {
        lines.push(`  ${answer.section.name} 的字段${answer.section.desc === undefined ? '' : `（${answer.section.desc}）`}`
            + `：共 ${String(answer.section.total)} 个，下面列 ${String(answer.section.fields.length)} 个`, ...answer.section.fields.map(paramLine));
    }
    return lines.join('\n');
}
/** How every tool here may name the browser it acts on. */
const RUN_ARG = {
    type: 'string',
    description: 'Which debugging browser, when more than one is running: a run id, a browser '
        + 'id such as "edge", or part of its label. Usually omitted.',
};
/** How every tool here may name the page it reads from. */
const PAGE_ARG = {
    type: 'string',
    description: 'Which logged-in page to read through: a position from browser_targets, a '
        + 'target id, or a piece of its title/address. Omit it and one is picked for you — '
        + 'preferably a page already on the API-document console.',
};
/**
 * Register the API-document tools.
 * @param ctx - host context carrying the tool registry.
 * @param cdp - the browser surface the reads go through.
 * @param routes - where the "which classify answers which phrase" routes are kept.
 * @param index - where the "which products and classifies this environment has" 定位图 is kept.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonBipApiTools(ctx, cdp, routes = createBipApiRouteStore(), index = createBipApiIndexStore()) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'bip_api_find',
        description: 'Searches the **旗舰版/BIP open-API documents this environment currently '
            + 'publishes** — "which APIs exist for saving a sales order", "does this environment expose '
            + 'X". It reads the live API-document console through an already-logged-in page, so the '
            + 'answer is this tenant\'s own published set rather than a shipped snapshot; a page must be '
            + 'open (omit `page` and one is picked). A lookup first asks the console\'s **own name '
            + 'search** — one request, matching API names and category paths — and only when that finds '
            + 'nothing does it walk the catalogue: one request for the whole tree (every 云 / 服务 / 分类 '
            + '/ 子分类, ~780 nodes), then one request per candidate category, narrowed by a remembered '
            + 'route, by the stored 定位图 (this environment\'s map, interface names included), or by '
            + 'scanning the lot. The name search is tried first because the catalogue is what once '
            + 'produced a confident false "this environment has no such API" — do not repeat that '
            + 'conclusion from this tool unless the answer says the name search missed too. Returns '
            + 'matching APIs with their id, name, description and category; follow up with '
            + 'bip_api_detail for the call address, fields and where the API sits in the console tree. '
            + 'This is the 旗舰版 line only — NCC shares no API or table with it. For *calling* such an '
            + 'API (token, signature), see the knowledge library instead.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['keyword'],
            properties: {
                keyword: {
                    type: 'string',
                    description: 'What to look for, in the operator\'s words: 「销售订单保存」, '
                        + '「根据单据条形码查询件」, 「批量保存」. The console\'s own search matches it against '
                        + 'API names and category paths — an exact Chinese API name from the operator is the '
                        + 'best input there is.',
                },
                product: {
                    type: 'string',
                    description: 'Narrow to one service (the tree\'s 服务 level) by name fragment or id '
                        + '(「档案服务」). It turns the lookup into reading that part of the catalogue instead '
                        + 'of searching by name — use it when the line is already known.',
                },
                classify_id: {
                    type: 'string',
                    description: 'A category id already known from an earlier answer: reads exactly that '
                        + 'category and nothing else. The fastest form.',
                },
                deep: {
                    type: 'boolean',
                    description: 'Skip the name search and read every category in the catalogue from the '
                        + 'top. Only for a phrase that appears in an API description but in neither its name '
                        + 'nor its path — the slowest form.',
                },
                limit: { type: 'integer', description: 'How many matches to return. Default 20.' },
                page: PAGE_ARG,
                run: RUN_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: ['origin', 'keyword', 'total', 'hits'],
            properties: {
                origin: { type: 'string' },
                keyword: { type: 'string' },
                total: { type: 'number' },
                hits: { type: 'array', items: { type: 'object' } },
            },
        },
        render: renderFind,
        async execute(args, signal) {
            const keyword = asString(args.keyword, 'keyword');
            const target = await resolvePage(cdp, optionalString(args.page), optionalString(args.run), signal);
            const base = {
                keyword,
                ...(optionalString(args.product) === undefined ? {} : { product: String(optionalString(args.product)) }),
                ...(optionalString(args.classify_id) === undefined ? {} : { classifyId: String(optionalString(args.classify_id)) }),
                ...(args.deep === true ? { deep: true } : {}),
                ...(optionalCount(args.limit, 'limit') === undefined ? {} : { limit: Number(optionalCount(args.limit, 'limit')) }),
            };
            const hints = target.origin === ''
                ? []
                : await routes.hints(target.origin, keyword);
            // 两级读取：先路标（一条路，直接查那个分类），再定位图（省掉「产品 → 分类」那 30 次请求），
            // 两者都没有才走全量。顺序不能反——路标说的是「这个说法去哪个分类」，比图更准也更省。
            let lookup;
            if (hints.length === 0 && target.origin !== '') {
                const stored = await index.get(target.origin);
                // 过期的图**不拿来用**：一次查找宁可按全量重扫，也不要拿一张旧图给出一份「少了几条」的
                // 答案——条数少了，看的人是看不出来的。过期的代价是多扫一轮，而那一轮会顺手重建它。
                if (stored !== undefined && !stored.stale)
                    lookup = stored;
            }
            let answer = await runFind(cdp, target.page, hints.length > 0
                ? { ...base, routes: hints }
                : (lookup === undefined
                    ? base
                    : {
                        ...base,
                        // 图里记着建图时用的那个集成系统，带上它连 `listIntegrateSys` 那次也省了。
                        integrateSys: lookup.snapshot.systemId,
                        taxonomy: { products: lookup.snapshot.products, classifies: lookup.snapshot.classifies },
                    }), signal);
            let fellBack = false;
            let indexForgotten = false;
            if (hints.length > 0 && answer.total === 0 && answer.timedOut !== true) {
                // 路标是假设：它落空时先作废它，再用全量重扫一遍，绝不把过时的定位当成"没有"。
                // 超时不算落空——那说明这一趟根本没问完，作废它等于把一条好路标丢掉。
                await routes.forget(answer.origin === '' ? target.origin : answer.origin, keyword);
                answer = await runFind(cdp, target.page, base, signal);
                fellBack = true;
            }
            else if (lookup !== undefined && answer.total === 0 && answer.timedOut !== true
                && (answer.scanned.viaApi === true || lookup.ageMs > BIP_API_INDEX_FRESH_MS)) {
                // 定位图同样是假设，但不每次落空都要重扫：
                //  · 图上记着的名字收过网（viaApi）——它对这次查找下过判断，判断错了就该重扫；
                //  · 图已经超出新鲜窗口——环境可能多了图里没有的分类；
                //  · 其余情况（图刚建、关键词只是不存在）重扫只是把同一批请求原样再发一遍，答案不会变，
                //    所以就地承认「没有」，并把图的路径给出来当退路。超时同样不作废。
                await index.forget(answer.origin === '' ? target.origin : answer.origin);
                indexForgotten = true;
                answer = await runFind(cdp, target.page, base, signal);
            }
            // 这一趟真拉了「产品 → 分类」那一层，就把图存下来：下一次换个说法时不必再问这一层。
            let indexSaved = false;
            if (answer.taxonomy !== undefined && answer.origin !== '' && answer.system !== '') {
                const saved = await index.put({
                    origin: answer.origin,
                    systemId: answer.system,
                    at: new Date().toISOString(),
                    products: answer.taxonomy.products,
                    classifies: answer.taxonomy.classifies,
                });
                indexSaved = saved;
            }
            if (answer.routes.length > 0) {
                await routes.remember(answer.origin, keyword, answer.routes);
            }
            return {
                ...answer,
                fellBack,
                viaRoute: hints.length > 0 && !fellBack,
                viaIndex: lookup !== undefined && !indexForgotten && answer.scanned.viaSearch !== true,
                indexForgotten,
                indexSaved,
                // 用过图或写过图，就把图的位置报出来：读的人要能自己删掉它。
                ...(indexSaved || lookup !== undefined ? { indexPath: index.path } : {}),
            };
        },
        presentCall: args => ({
            card: 'generic',
            title: `查 API 文档「${typeof args.keyword === 'string' ? args.keyword : ''}」`,
            kind: 'read',
        }),
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'bip_api_detail',
        description: 'Read one 旗舰版/BIP API\'s document: its **call address**, HTTP method, '
            + 'content type, the request parameters with which are required and what they mean, the '
            + 'nested nodes (a document body like `orderDetails`), the response fields, and the '
            + 'request/response examples. Reads live through a logged-in page, like bip_api_find. '
            + 'Summarised on purpose: a real document is ~100 KB, so this returns the address, the '
            + 'required parameters and one level of everything else — ask for `section` to see the '
            + 'fields of one nested node, or `full: true` for the non-required parameters too. '
            + 'Accepts an id from bip_api_find or a full API name. 旗舰版 only.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['api'],
            properties: {
                api: {
                    type: 'string',
                    description: 'An API id from bip_api_find, or its full name (「销售订单单个保存」). A '
                        + 'name is looked up first; the exact match wins when several contain it.',
                },
                section: {
                    type: 'string',
                    description: 'Return this parameter node\'s fields as well — a top-level one such as '
                        + '`data`, or a nested one such as `orderDetails`. Use it for a document body\'s '
                        + 'own field list.',
                },
                full: {
                    type: 'boolean',
                    description: 'Include the non-required parameters and every field of `section`. '
                        + 'Much longer; ask for it when writing the call, not when identifying it.',
                },
                page: PAGE_ARG,
                run: RUN_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: ['origin', 'api', 'request', 'returns'],
            properties: {
                origin: { type: 'string' },
                api: { type: 'object' },
                request: { type: 'object' },
                returns: { type: 'array', items: { type: 'object' } },
            },
        },
        render: renderDetail,
        async execute(args, signal) {
            const apiArg = asString(args.api, 'api');
            const section = optionalString(args.section);
            const target = await resolvePage(cdp, optionalString(args.page), optionalString(args.run), signal);
            let apiId = apiArg;
            if (!looksLikeApiId(apiArg)) {
                const found = await runFind(cdp, target.page, { keyword: apiArg, limit: 10 }, signal);
                if (found.hits.length === 0) {
                    throw new BipApiError('not-found', `这个环境发布的 API 里没有叫「${apiArg}」的。先用 bip_api_find 找一个更接近的名字，`
                        + '或把上一个回答里的 id 传进来。');
                }
                const exact = found.hits.find(one => one.apiName === apiArg) ?? found.hits[0];
                if (exact === undefined) {
                    throw new BipApiError('not-found', `「${apiArg}」有匹配，但页面没有给出可用的 id。`);
                }
                apiId = exact.apiId;
            }
            return await runDetail(cdp, target.page, apiId, {
                ...(section === undefined ? {} : { section }),
                ...(args.full === true ? { full: true } : {}),
            }, signal);
        },
        presentCall: args => ({
            card: 'generic',
            title: `读 API 文档「${typeof args.api === 'string' ? args.api.slice(0, 40) : ''}」`,
            kind: 'read',
        }),
    })));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
