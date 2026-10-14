/**
 * 旗舰版（BIP）开放 API 文档：在**已登录的页面里**实时读，不落任何快照。
 *
 * ## 先问名字，问不到才去翻目录
 *
 * 控制台自己的搜索框背后是 `POST /iuap-ipaas-base/openPortal/api/search`，body 就一个
 * `{"param":"<关键词>"}`：一次请求，按**名称与路径**做子串匹配，返回匹配的 API 及其分类名。
 * 所以一次查找的第一步就是它。
 *
 * 这是被一个真实错误逼出来的：早先只有「枚举产品 → 枚举分类 → 逐个拉接口清单」一条路，
 * 而它的目录只覆盖 14 个产品（`listProductByIntegrateSys` 的返回），控制台的文档树却有
 * 11 云 / 38 服务 / 141 分类 / 594 子分类。实测问「根据单据条形码查询件」时两次都回 0 条，
 * 于是报出了一个「这个环境没有这个 API」的结论——而它就挂在 财务云 / 档案服务 / 档案利用
 * 下面。**只有目录的一部分时，查不到不等于没有**，所以枚举只能当兜底，不能当主路。
 *
 * ## 目录树从哪来
 *
 * `listIntegrateSys?scene=open&isAjax=1` 一次就把整棵树（784 个节点）和集成系统 id 一起
 * 给回来，节点上是 `{id, code, name, type, children}`，type 1=云、2=服务、3=分类、4=子分类。
 * 查一个分类下的接口清单要用 `domainAppCode` + `treeNodeType`（树节点的 code 与 type），
 * 不是早先那套 `apiClassifyId`——两条形状都保留，旧路标里记的是后者。
 *
 * ## 为什么不建本地索引
 *
 * 这套接口返回的是**这一个租户、这一个版本**的发布结果：详情里带着 `fieldVersion`、
 * `tenantId`、`isvId`，同一个环境里还有一堆只在本地存在的「新集成」接口。把内容抄到
 * 本地当索引，就等于把「现在哪个地址是对的」这件事交给了最后一次抄写的时刻——过期的
 * 索引比没有索引更糟，因为它会给出一个看着笃定的错误地址。所以：**内容一律现取**。
 *
 * ## 那留存下来的两样东西为什么可以留
 *
 * **路标**只记「某个说法要去哪个分类里找」——`销售订单保存` 在 `销售服务 / 销售订单`
 * 分类下这件事，换个版本也不会变。**定位图**（`bip-api-index.ts`）记「这个环境有哪些
 * 云、服务、分类、子分类」——它就是那一次目录枚举的产物，按 origin + 集成系统存，带有效期。
 *
 * 两者都不承载版本相关的真相：没有一个地址、一个字段是从 API 文档抄来的。所以
 * 上面那条「过期的索引会给出一个看着笃定的错地址」的顾虑不会发生在这两样东西上——
 * 它们错了，后果是**多扫一轮**，而不是拿到错的答案。因此两者落空时都自动作废并回退
 * 全量：路标见 {@link BipApiRouteStore}，定位图见 `BipApiIndexStore`。过期的定位图
 * 干脆不用：一份「少了几条」的答案，看的人是看不出来的。
 *
 * ## 为什么摘要做在页面里
 *
 * 一个 API 的详情实测 97 KB（`data` 下 116 个字段、子表再 107 个）。这些字节如果先回
 * 宿主再挑，每一次转手都要为它付上下文。所以页面里那次求值就已经把它压成「地址 +
 * 必填参数 + 一层返回」的形状，宿主拿到的永远是摘要。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** 这一族工具的错误类型。 */
export class BipApiError extends Error {
    /** What went wrong, in the vocabulary the tools speak. */
    code;
    constructor(code, message) {
        super(message);
        this.name = 'BipApiError';
        this.code = code;
    }
}
/**
 * 在 API 文档所属页面里跑一次查找。
 *
 * 这一段是**注入页面执行的源码**，所以它必须自包含：只用页面自己的 `fetch` 和登录态，
 * 不引用这个模块里的任何东西。`toString()` 之后由 {@link findExpression} 内联执行——
 * 选这个办法而不是把脚本写成字符串，是为了让编译器继续检查它的语法。
 */
async function pageFind(P) {
    // 外层硬超时。里面每个请求都自带 15 秒超时，但那救不了「连接被占满之后请求既不返回、
    // 也不失败」的情形——实测撞上过。再套一层，这次求值就一定会在预算内给出回答，哪怕
    // 回答是「超时了，什么都没查到」。
    const guard = new Promise((resolve) => setTimeout(() => resolve(JSON.stringify({
        ok: true,
        timedOut: true,
        origin: location.origin,
        system: '',
        keyword: P.keyword,
        scanned: {
            products: 0, classifies: 0, groups: 0, truncated: false, viaRoute: false, viaIndex: false,
            viaApi: false, viaSearch: false, deadline: true,
        },
        total: 0,
        hits: [],
        routes: [],
    })), 100000));
    const body = (async () => {
        const BASE = '/iuap-ipaas-base/openPortal/api';
        // 每个请求都自带超时。页面对同域的并发连接是有限的，一个永不返回的请求会一直占着
        // 名额，后面所有请求只能排队——实测过一次并发拉 29 个产品的分类，页面网络就此堵死，
        // 连同一页面上别的 fetch 都要等它。带超时是让"某个接口不理人"退化成"这一条查不到"。
        const get = async (path) => {
            const control = new AbortController();
            const timer = setTimeout(() => control.abort(), 15000);
            try {
                const answer = await fetch(`${BASE}/${path}`, {
                    credentials: 'include',
                    headers: { isAjax: '1' },
                    signal: control.signal,
                });
                if (!answer.ok)
                    throw new Error(`HTTP ${answer.status}`);
                return await answer.json();
            }
            finally {
                clearTimeout(timer);
            }
        };
        const payload = (answer) => (answer && answer.data !== undefined ? answer.data : answer);
        const enc = (text) => encodeURIComponent(text);
        const messageOf = (error) => error && error.message !== undefined ? String(error.message) : String(error);
        /** 一个 POST（只有按名字搜索用它）。超时与凭证同 {@link get}。 */
        const post = async (path, body) => {
            const control = new AbortController();
            const timer = setTimeout(() => control.abort(), 15000);
            try {
                const answer = await fetch(`${BASE}/${path}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', isAjax: '1' },
                    body: JSON.stringify(body),
                    signal: control.signal,
                });
                if (!answer.ok)
                    throw new Error(`HTTP ${answer.status}`);
                return await answer.json();
            }
            finally {
                clearTimeout(timer);
            }
        };
        const keyword = String(P.keyword || '').trim();
        const tokens = keyword.split(/[\s,，、;；/|]+/).filter((token) => token.length >= 2);
        const limit = typeof P.limit === 'number' && P.limit > 0 ? P.limit : 20;
        // deep 是在按目录从头翻：上限放宽到整个目录（784 个节点），时间预算会拦住它。
        const classifyLimit = typeof P.classifyLimit === 'number' && P.classifyLimit > 0
            ? P.classifyLimit
            : (P.deep === true ? 800 : 120);
        // 同域并发压到 4，并且给整趟扫描一个时间预算：这两个数字是实测踩出来的，不是保守
        // 取值——见 `get()` 上面那段。宁可少扫一些并在回答里说清楚，也不能把页面拖死。
        const CONCURRENCY = 4;
        const deadline = Date.now() + 90000;
        /** 候选分类。 */
        const targets = [];
        const scanned = {
            products: 0, classifies: 0, groups: 0, truncated: false, viaRoute: false, viaIndex: false,
            viaApi: false, viaSearch: false, searched: false, deadline: false,
        };
        /** 这一趟顺带看到的全环境目录；宿主拿它去建定位图。只有真枚举过才有。 */
        let found;
        // ── 第一步：按名字问控制台自己的搜索（一次请求）─────────────────────────────
        // 这一发就是控制台搜索框背后那个接口：`POST search {"param": …}`，按名称与路径做子串
        // 匹配。它与目录无关，所以不会被「目录只覆盖了一部分」这种事骗到——而那正是一次错误
        // 结论的来源（见文件头）。
        //
        // 只有调用方是在**按目录浏览**时才跳过它：指名了分类、指名了产品、或者要求 deep。
        const browsing = P.classifyId !== undefined || P.product !== undefined || P.deep === true;
        if (!browsing) {
            // 「问过名字搜索」这件事本身要记下来：它空手而归与「按目录浏览、根本没问」是两种不同的
            // 没命中，回答里那句「都问过了」只有在真问过时才敢说。
            scanned.searched = true;
            try {
                const rows = payload(await post('search?isAjax=1', { param: keyword }));
                const kept = (Array.isArray(rows) ? rows : []).filter((one) => one && one.deprecated !== 1);
                if (kept.length > 0) {
                    scanned.viaSearch = true;
                    const hits = kept.map((one) => ({
                        apiId: String(one.apiId),
                        apiName: String(one.apiName || ''),
                        // 搜索接口只回名称与分类名：描述、产品、分类 id 都不在它的返回里。不拿别的东西凑数。
                        describe: '',
                        category: String(one.category || ''),
                        productName: '',
                        classifyId: '',
                        classifyName: String(one.category || ''),
                    }));
                    return JSON.stringify({
                        ok: true,
                        // 这一趟没问过集成系统，别报一个没验证过的 id：宿主只看 system 是不是非空。
                        origin: location.origin,
                        system: '',
                        keyword,
                        scanned,
                        total: hits.length,
                        hits: hits.slice(0, limit),
                        routes: [],
                    });
                }
            }
            catch {
                // 搜索接口不理人不是「没有这个 API」：往下走那套枚举，让答案仍由现取的清单说了算。
            }
        }
        // ── 第二步：集成系统与全环境目录树 ─────────────────────────────────────────
        // `listIntegrateSys` 一次给回整棵树（实测 11 云 / 38 服务 / 141 分类 / 594 子分类），
        // 集成系统 id 就在根上。调用方给了 id 就直接用，但那棵树仍要拉——它是枚举的唯一来源。
        let systems;
        const loadSystems = async () => {
            if (systems === undefined)
                systems = payload(await get('listIntegrateSys?scene=open&isAjax=1')) || [];
            return systems === undefined ? [] : systems;
        };
        // 给错了不会变成一个错的答案：后面的分类查询会空手而归，宿主据此作废定位图并重扫全量，
        // 那一趟会重新问到这里，也就报得出「页面连不上接口」这种真实原因。
        let sysId = P.integrateSys ? String(P.integrateSys) : '';
        if (sysId === '') {
            try {
                const all = await loadSystems();
                sysId = all[0] ? String(all[0].id) : '';
            }
            catch (error) {
                return JSON.stringify({
                    ok: false,
                    code: 'unreachable',
                    error: `这个页面访问不到 API 文档接口（${messageOf(error)}）。`
                        + '需要停在已登录的旗舰版页面上——接口只认浏览器的登录态。',
                });
            }
            if (sysId === '') {
                return JSON.stringify({ ok: false, code: 'empty', error: '这个环境没有可用的集成系统。' });
            }
        }
        /** 调用方指名了某个服务（树上 type 2，界面里叫「产品」）时把候选缩到它：id、名字片段、编码都认。 */
        const pickProducts = (list) => {
            if (!P.product)
                return list;
            return list.filter((one) => String(one.id) === P.product
                || String(one.name || '').includes(String(P.product))
                || String(one.code || '') === String(P.product));
        };
        /** 按定位图收一次网：先看图上的**接口名**，再退回分类名。 */
        const narrowByIndex = () => {
            if (P.deep === true)
                return;
            // 接口名是这一档最硬的证据：租户的分类名常常只是模块名（销售服务、客户管理…），
            // 「销售订单保存」这种单据名按分类名收不到网，但它是某个分类下接口的名字。
            const byApi = targets.filter((one) => {
                const filters = filtersOf(String(one.classifyName || ''));
                return Array.isArray(one.apis)
                    && one.apis.some((name) => filters.some((one2) => name.includes(one2)));
            });
            // 分类名这一半是双向匹配，而且匹配的是**整条路径**（财务云 / 档案服务 / 档案利用）：
            // 只判「分类名含关键词」是不够的——问「销售订单保存」时真正的分类叫「销售订单」，
            // 分类名是关键词的一部分而不是反过来；而树上来的分类，它的云与服务名也是有用的线索
            // （问「档案服务」时该收的是它下面那一大片）。少了这一半，每问一次都会退化成扫全部
            // 几百个分类：慢，而且正是一次全量并发把页面网络堵死过。
            const byName = targets.filter((one) => {
                const hay = String(one.path || one.classifyName || '');
                if (hay === '')
                    return false;
                return keyword.includes(hay)
                    || hay.includes(keyword)
                    || tokens.some((token) => hay.includes(token));
            });
            const picked = byApi.slice();
            const seen = new Set(picked.map((one) => String(one.classifyId)));
            for (const one of byName) {
                const id = String(one.classifyId);
                if (seen.has(id))
                    continue;
                seen.add(id);
                picked.push(one);
            }
            if (picked.length === 0)
                return;
            // 接口名这一半要写进回答：只扫了一两个分类，这个数字看起来和「漏扫」一模一样，
            // 不说清是图上收的网，读的人只能以为扫描被截断了。
            scanned.viaApi = byApi.length > 0;
            targets.length = 0;
            for (const one of picked)
                targets.push(one);
        };
        /** 这一次的关键词在一段文本里要找哪些串。 */
        const filtersOf = (classifyName) => {
            // 关键词去掉分类名之后剩下的部分，也要当成一个筛子：问「销售订单保存」时分类叫
            // 「销售订单」、接口叫「销售订单单个保存」，整串既不等于接口名也不出现在描述里，
            // 只有把「保存」单独拎出来，那几条才会浮上来。
            const rest = classifyName !== '' && keyword.includes(classifyName)
                ? keyword.split(classifyName).join('')
                : '';
            return [keyword, ...tokens, ...(rest.length >= 2 ? [rest] : [])];
        };
        /** 树节点的 children；没有就是空数组。 */
        const kidsOf = (node) => (node && Array.isArray(node.children) ? node.children : []);
        /**
         * 把 `listIntegrateSys` 给回的那棵树摊平成「服务」与「分类」两摞。
         *
         * 树是四层：集成系统（根，id 就是 sysId）→ 云（type 1）→ 服务（type 2）→ 分类（type 3）
         * → 子分类（type 4）。能挂接口的是 type 3/4；`path` 是从云开始的那条路（财务云 / 档案服务 /
         * 档案利用）——查询要用节点的 code（`domainAppCode`），显示要用这条路，两者都不是分类名。
         */
        const flattenTree = (roots) => {
            const products = [];
            const classifies = [];
            const walk = (nodes, product, path) => {
                for (const node of nodes) {
                    if (!node)
                        continue;
                    const type = Number(node.type);
                    const name = String(node.name || '');
                    const code = String(node.code || '');
                    if (type === 2) {
                        const one = { id: String(node.id), name, ...(code === '' ? {} : { code }) };
                        products.push(one);
                        walk(kidsOf(node), one, [...path, name]);
                        continue;
                    }
                    if (type === 3 || type === 4) {
                        classifies.push({
                            classifyId: String(node.id),
                            classifyName: name,
                            productId: product === undefined ? '' : String(product.id),
                            productName: product === undefined ? '' : String(product.name),
                            domainAppCode: code === '' ? String(node.id) : code,
                            treeNodeType: type,
                            path: [...path, name].join(' / '),
                        });
                        walk(kidsOf(node), product, [...path, name]);
                        continue;
                    }
                    // 云（type 1）与集成系统那层包装：往下走。云的名字进路径，集成系统的名字不进——
                    // 控制台里那条路是从云开始的，不是从「用友YonBIP」开始的。
                    walk(kidsOf(node), product, type === 1 && name !== '' ? [...path, name] : path);
                }
            };
            walk(roots, undefined, []);
            return { products, classifies };
        };
        // 定位层：能少问一层就少问一层。三条捷径都只是假设，所以每条都留了退路——图里、路标上
        // 找不到的东西，回到那棵树上去找，绝不允许由它们说出一句「没有」。
        let needTree = true;
        if (P.classifyId) {
            targets.push({ classifyId: P.classifyId, classifyName: '', productName: '' });
            needTree = false;
        }
        else if (P.routes && P.routes.length > 0) {
            // 路标是**定位结果本身**：它说「去这个分类里找」，那就直接去，不必再枚举目录（控制台的
            // 树有 784 个节点）。它落空时由宿主作废并重跑全量，所以这里跳过的每一步都不会变成
            // 一句「查不到」。
            for (const route of P.routes) {
                targets.push({
                    classifyId: route.classifyId,
                    classifyName: route.classifyName,
                    productId: route.productId,
                    productName: route.productName,
                    ...(route.domainAppCode === undefined ? {} : { domainAppCode: route.domainAppCode }),
                    ...(route.treeNodeType === undefined ? {} : { treeNodeType: route.treeNodeType }),
                });
            }
            scanned.viaRoute = true;
            needTree = false;
        }
        else if (P.taxonomy && Array.isArray(P.taxonomy.classifies) && P.taxonomy.classifies.length > 0) {
            // 定位图：上一次全量扫描的产物。同一件事——不枚举目录，直接在图里收网。
            // 图过期时宿主根本不会传进来；传进来的也可能漏掉新加的分类，所以落空同样回退全量。
            const fromIndex = pickProducts((P.taxonomy.products || []).map((one) => {
                return { id: String(one.id), name: String(one.name || ''), code: String(one.code || '') };
            }));
            scanned.products = fromIndex.length;
            const alive = new Set(fromIndex.map((one) => String(one.id)));
            for (const one of P.taxonomy.classifies) {
                if (!alive.has(String(one.productId)))
                    continue;
                scanned.classifies += 1;
                targets.push({
                    classifyId: String(one.id),
                    classifyName: String(one.name || ''),
                    productId: String(one.productId),
                    productName: String(one.productName || ''),
                    ...(one.domainAppCode === undefined ? {} : { domainAppCode: String(one.domainAppCode) }),
                    ...(one.treeNodeType === undefined ? {} : { treeNodeType: Number(one.treeNodeType) }),
                    ...(one.path === undefined ? {} : { path: String(one.path) }),
                    // 图上记着这个分类下有哪些接口名——租户的分类名常常只是模块名（销售服务、客户管理…），
                    // 这一档才是收得动网的那条线索。它只用来缩小范围，命中与否仍由现取的接口清单说了算。
                    apis: Array.isArray(one.apis) ? one.apis.map((name) => String(name)) : [],
                });
            }
            if (targets.length > 0) {
                scanned.viaIndex = true;
                narrowByIndex();
                needTree = false;
            }
            else {
                // 图上连这个服务都没有：要么环境新加了服务，要么这份图是按旧目录建的。这一格可以
                // 便宜地纠正——去读那棵树，再按服务只扫它自己的分类；先答一个 0 才是错的。
                targets.splice(0, targets.length);
                scanned.products = 0;
                scanned.classifies = 0;
            }
        }
        if (needTree) {
            // 目录树：一次请求给回整棵树（实测 11 云 / 38 服务 / 141 分类 / 594 子分类 = 784 个节点）。
            // 早先那套是「列出 14 个产品，再每个产品拉一次分类」——它只覆盖了控制台文档树的一角，
            // 缺掉的整个云（财务云、供应链云…）会让人得到「这个环境没有这个 API」这种错答案。
            let tree;
            try {
                tree = await loadSystems();
            }
            catch (error) {
                return JSON.stringify({
                    ok: false,
                    code: 'unreachable',
                    error: `这个页面访问不到 API 文档的目录树（${messageOf(error)}）。`
                        + '需要停在已登录的旗舰版页面上——接口只认浏览器的登录态。',
                });
            }
            const flat = flattenTree(tree);
            const products = pickProducts(flat.products);
            scanned.products = products.length;
            const alive = new Set(products.map((one) => String(one.id)));
            for (const one of flat.classifies) {
                if (!alive.has(String(one.productId)))
                    continue;
                scanned.classifies += 1;
                targets.push(one);
            }
            // 这一层的产物就是定位图：云 / 服务 / 分类 / 子分类的身份与归属，没有一个地址、没有一个
            // 字段。宿主把它存下来，下一次换个说法时就不必再问这一层。分类下的**接口名**要等清单
            // 拉完才补上（见下面 `apiNames`）——那才是让「换个说法」也便宜的东西。
            found = {
                products: products.map((one) => {
                    const code = String(one.code || '');
                    return { id: String(one.id), name: String(one.name || ''), ...(code === '' ? {} : { code }) };
                }),
                classifies: targets.map((one) => ({
                    id: String(one.classifyId),
                    name: String(one.classifyName || ''),
                    productId: one.productId === undefined ? '' : String(one.productId),
                    productName: one.productName === undefined ? '' : String(one.productName),
                    ...(one.domainAppCode === undefined ? {} : { domainAppCode: String(one.domainAppCode) }),
                    ...(one.treeNodeType === undefined ? {} : { treeNodeType: Number(one.treeNodeType) }),
                    ...(one.path === undefined ? {} : { path: String(one.path) }),
                })),
            };
            narrowByIndex();
        }
        const used = targets.slice(0, classifyLimit);
        if (targets.length > used.length)
            scanned.truncated = true;
        // 这一趟顺带看到的「哪个分类下有哪些接口名」。它不改变这一次的回答，只是把定位图的第二级
        // 建起来：有了它，下一次按接口名提问就能直接收到一两个分类，而不是把 51 个分类的清单重拉一遍。
        const apiNames = new Map();
        const keepApiName = (classifyId, name) => {
            if (name === '')
                return;
            const list = apiNames.get(classifyId);
            if (list === undefined) {
                apiNames.set(classifyId, [name]);
                return;
            }
            if (list.length < 1000 && !list.includes(name))
                list.push(name);
        };
        /**
         * 查一个分类下有哪些接口。树上来的分类要用 code（`domainAppCode`）+ `treeNodeType`：实测
         * `apiClassifyId=EAF_DALY` 返回空数组，`domainAppCode=EAF_DALY&treeNodeType=3` 才有那一条。
         * 老形状留着，是因为早先的路标记的就是它。
         */
        const groupUrlOf = (target) => {
            const code = target.domainAppCode === undefined ? '' : String(target.domainAppCode);
            if (code !== '') {
                const type = typeof target.treeNodeType === 'number' && target.treeNodeType > 0
                    ? target.treeNodeType
                    : 3;
                return `groupApiByApiClassify?scene=open&domainAppCode=${enc(code)}&treeNodeType=${type}`
                    + `&isOrigin=0&integrateSysId=${enc(sysId)}&isAjax=1`;
            }
            return `groupApiByApiClassify?scene=open&apiClassifyId=${enc(String(target.classifyId))}`
                + `&isOrigin=1&integrateSysId=${enc(sysId)}&isAjax=1`;
        };
        const hits = [];
        const routes = [];
        const seenRoute = new Set();
        // 父分类与子分类会命中同一条接口（树上它们各是一个节点），只报一次。
        const seenHit = new Set();
        for (let start = 0; start < used.length; start += CONCURRENCY) {
            if (Date.now() > deadline) {
                scanned.deadline = true;
                break;
            }
            const slice = used.slice(start, start + CONCURRENCY);
            const answers = await Promise.all(slice.map(async (target) => {
                try {
                    const groups = payload(await get(groupUrlOf(target))) || [];
                    return { target, list: groups.flatMap((group) => group.apiList || []) };
                }
                catch {
                    return { target, list: [] };
                }
            }));
            for (const answer of answers) {
                scanned.groups += 1;
                const target = answer.target;
                const filters = filtersOf(String(target.classifyName || ''));
                for (const api of answer.list) {
                    const name = String(api.apiName || '');
                    const describe = String(api.describe || '');
                    // 名字先收进定位图，再判命中：图要的是**这个分类下有哪些接口**，不是这一趟命中了哪些。
                    // 只收命中的名字，图就会越用越窄——它下次恰好问不到那些没被收进去的名字。
                    keepApiName(String(target.classifyId), name);
                    const matched = filters.some((one) => name.includes(one) || describe.includes(one));
                    if (!matched)
                        continue;
                    const apiId = String(api.apiId);
                    if (seenHit.has(apiId))
                        continue;
                    seenHit.add(apiId);
                    hits.push({
                        apiId,
                        apiName: name,
                        describe,
                        category: String(api.category || target.classifyName || ''),
                        productName: String(target.productName || ''),
                        classifyId: String(target.classifyId),
                        classifyName: String(target.classifyName || ''),
                    });
                    if (!seenRoute.has(String(target.classifyId))) {
                        seenRoute.add(String(target.classifyId));
                        routes.push({
                            classifyId: String(target.classifyId),
                            classifyName: String(target.classifyName || ''),
                            ...(target.productId === undefined ? {} : { productId: String(target.productId) }),
                            ...(target.productName === undefined ? {} : { productName: String(target.productName) }),
                            ...(target.domainAppCode === undefined ? {} : { domainAppCode: String(target.domainAppCode) }),
                            ...(target.treeNodeType === undefined ? {} : { treeNodeType: Number(target.treeNodeType) }),
                        });
                    }
                }
            }
            if (hits.length >= limit)
                break;
        }
        // 清单拉完了，把这一趟看到的接口名挂到图上：只有真扫过的分类才有名字，没扫到的保持没有
        // （宿主下一次就会退回按分类名收网，而不是以为「那个分类里一个接口都没有」）。
        if (found !== undefined) {
            for (const one of found.classifies) {
                const names = apiNames.get(String(one.id));
                if (names !== undefined)
                    one.apis = names;
            }
        }
        return JSON.stringify({
            ok: true,
            origin: location.origin,
            system: sysId,
            keyword,
            scanned,
            total: hits.length,
            hits: hits.slice(0, limit),
            routes,
            // 只有真拉过「产品 → 分类」那一层才有：宿主把它存成定位图。
            ...(found === undefined ? {} : { taxonomy: found }),
        });
    })();
    return await Promise.race([body, guard]);
}
/**
 * 在同一个页面里读一个 API 的详情，并在页面侧就压成摘要。
 *
 * 同 {@link pageFind}：注入执行，自包含。
 */
async function pageDetail(P) {
    const BASE = '/iuap-ipaas-base/openPortal/api';
    // 每个请求都自带超时。页面对同域的并发连接是有限的，一个永不返回的请求会一直占着
    // 名额，后面所有请求只能排队——实测过一次并发拉 29 个产品的分类，页面网络就此堵死，
    // 连同一页面上别的 fetch 都要等它。带超时是让"某个接口不理人"退化成"这一条查不到"。
    const get = async (path) => {
        const control = new AbortController();
        const timer = setTimeout(() => control.abort(), 15000);
        try {
            const answer = await fetch(`${BASE}/${path}`, {
                credentials: 'include',
                headers: { isAjax: '1' },
                signal: control.signal,
            });
            if (!answer.ok)
                throw new Error(`HTTP ${answer.status}`);
            return await answer.json();
        }
        finally {
            clearTimeout(timer);
        }
    };
    const payload = (answer) => (answer && answer.data !== undefined ? answer.data : answer);
    const messageOf = (error) => error && error.message !== undefined ? String(error.message) : String(error);
    const clip = (text, size) => {
        const value = typeof text === 'string' ? text : text === null || text === undefined ? '' : JSON.stringify(text);
        return value.length > size ? `${value.slice(0, size)}…` : value;
    };
    const brief = (node) => ({
        name: String(node.name || ''),
        ...(node.paramType ? { type: String(node.paramType) } : {}),
        ...(node.paramDesc ? { desc: String(node.paramDesc) } : {}),
        required: node.required === true,
        ...(node.requestParamType ? { at: String(node.requestParamType) } : {}),
        ...(node.array === true ? { array: true } : {}),
        ...(node.format ? { format: String(node.format) } : {}),
        ...(node.maxLength ? { maxLength: String(node.maxLength) } : {}),
        ...(node.decimals === null || node.decimals === undefined ? {} : { decimals: Number(node.decimals) }),
        ...(node.defaultValue === null || node.defaultValue === undefined || node.defaultValue === ''
            ? {}
            : { default: String(node.defaultValue) }),
        ...(node.example === null || node.example === undefined || node.example === ''
            ? {}
            : { example: clip(node.example, 60) }),
        ...(node.visible === false ? { hidden: true } : {}),
    });
    const childrenOf = (node) => (Array.isArray(node.children) ? node.children : []);
    const findNode = (list, name) => {
        for (const node of list) {
            if (String(node.name) === name)
                return node;
            const nested = childrenOf(node);
            if (nested.length > 0) {
                const hit = findNode(nested, name);
                if (hit)
                    return hit;
            }
        }
        return null;
    };
    let detail;
    try {
        detail = payload(await get(`getByVersionForTest/${encodeURIComponent(P.apiId)}/running?scene=open&isOrigin=1&isAjax=1`));
    }
    catch (error) {
        return JSON.stringify({
            ok: false,
            code: 'unreachable',
            error: `读不到这个 API 的详情（${messageOf(error)}）。apiId=${P.apiId}`,
        });
    }
    if (!detail || detail.id === undefined) {
        return JSON.stringify({ ok: false, code: 'missing', error: `没有找到 apiId=${P.apiId} 的 API 文档。` });
    }
    const params = Array.isArray(detail.paramDTOS) ? detail.paramDTOS : [];
    const query = Array.isArray(detail.queryParamDTOS) ? detail.queryParamDTOS : [];
    const returns = Array.isArray(detail.paramReturnDTOS) ? detail.paramReturnDTOS : [];
    const all = params.concat(query);
    const required = all.filter((node) => node.required === true);
    const optional = all.filter((node) => node.required !== true);
    const full = P.full === true;
    const demoChars = typeof P.demoChars === 'number' && P.demoChars > 0 ? P.demoChars : 600;
    // 分类路径：控制台左树里那条「财务云 / 档案服务 / 档案利用」。详情自己的 apiClassifyName 与
    // productName 在这个环境里是空的（实测：apiClassifyName=null、productName=null，只有一个
    // apiClassifyCode=EAF_DALY），而树上这条路一直有——报出「未知」会让人以为它不属于任何分类。
    let path = '';
    try {
        const chain = payload(await get(`getApiClassifyTree?scene=open&apiId=${encodeURIComponent(P.apiId)}&isOrigin=1&isAjax=1`));
        const parts = [];
        const pick = (node) => {
            if (!node || parts.length > 12)
                return;
            const type = Number(node.type);
            // 集成系统那层（type 是 'integrateSys'）不进路径：控制台里这条路是从云开始的。
            if (type === 1 || type === 2 || type === 3 || type === 4)
                parts.push(String(node.name || ''));
            for (const one of childrenOf(node))
                pick(one);
        };
        if (Array.isArray(chain))
            for (const one of chain)
                pick(one);
        else
            pick(chain);
        path = parts.filter((one) => one !== '').join(' / ');
    }
    catch {
        // 路径是锦上添花：拿不到就不报，别把一次详情查询变成失败。
    }
    const sectionName = String(P.section || '').trim();
    const node = sectionName === '' ? null : findNode(all, sectionName);
    const section = node === null ? undefined : {
        name: String(node.name || ''),
        ...(node.paramDesc ? { desc: String(node.paramDesc) } : {}),
        total: childrenOf(node).length,
        fields: (full ? childrenOf(node) : childrenOf(node).filter((child) => child.required === true)).map(brief),
    };
    return JSON.stringify({
        ok: true,
        origin: location.origin,
        api: {
            id: String(detail.id),
            name: String(detail.name || ''),
            description: String(detail.description || ''),
            address: String(detail.address || ''),
            proxyUrl: String(detail.proxyUrl || detail.completeProxyUrl || ''),
            ...(detail.connectUrl ? { connectUrl: String(detail.connectUrl) } : {}),
            method: String(detail.httpRequestType || detail.serviceHttpMethod || ''),
            ...(detail.contentType ? { contentType: String(detail.contentType) } : {}),
            ...(detail.requestProtocol ? { protocol: String(detail.requestProtocol) } : {}),
            ...(detail.productName ? { productName: String(detail.productName) } : {}),
            ...(detail.apiClassifyName ? { classifyName: String(detail.apiClassifyName) } : {}),
            ...(detail.apiClassifyId ? { classifyId: String(detail.apiClassifyId) } : {}),
            ...(path === '' ? {} : { path }),
            publishStatus: detail.publishStatus === true,
            openApi: detail.openApi === true,
            ...(detail.gmtUpdate ? { updated: String(detail.gmtUpdate) } : {}),
        },
        request: {
            total: all.length,
            required: required.map(brief),
            optionalCount: optional.length,
            ...(full ? { optional: optional.map(brief) } : {}),
            nested: all
                .filter((one) => childrenOf(one).length > 0)
                .map((one) => ({
                name: String(one.name || ''),
                ...(one.paramDesc ? { desc: String(one.paramDesc) } : {}),
                total: childrenOf(one).length,
                requiredCount: childrenOf(one).filter((child) => child.required === true).length,
            })),
            ...(detail.requestParamsDemo ? { demo: clip(detail.requestParamsDemo, demoChars) } : {}),
        },
        returns: returns.map(brief),
        ...(detail.apiDemoReturnDTO && detail.apiDemoReturnDTO.content
            ? { successDemo: clip(detail.apiDemoReturnDTO.content, demoChars) }
            : {}),
        ...(detail.apiDemoReturnDTOError && detail.apiDemoReturnDTOError.content
            ? { errorDemo: clip(detail.apiDemoReturnDTOError.content, demoChars) }
            : {}),
        ...(section === undefined ? {} : { section }),
    });
}
/** 页面表达式：函数源码 + 内联参数。 */
function callOf(source, request) {
    return `(${source.toString()})(${JSON.stringify(request)})`;
}
/**
 * 一次 `Runtime.evaluate` 要执行的表达式（查找）。
 * @param request - 查找的入参。
 * @returns 自包含的 async 表达式，其值为一段 JSON 文本。
 */
export function findExpression(request) {
    return callOf(pageFind, request);
}
/**
 * 一次 `Runtime.evaluate` 要执行的表达式（详情）。
 * @param request - 详情的入参。
 * @returns 自包含的 async 表达式，其值为一段 JSON 文本。
 */
export function detailExpression(request) {
    return callOf(pageDetail, request);
}
/** 路标文件的位置：与这一族其它文档同处 `~/.dsh/yon-panel/`。 */
export function defaultBipApiRoutePath() {
    return join(homedir(), '.dsh', 'yon-panel', 'bip-api-routes.json');
}
/** 一个成员读成字符串，缺了就是空串。 */
function textOf(value) {
    return typeof value === 'string' ? value : '';
}
/** 读一条路标，读不出来就丢掉它——丢一条路标的代价是多扫一轮。 */
function asRoute(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const entry = value;
    const origin = textOf(entry.origin).trim();
    const keyword = textOf(entry.keyword).trim();
    const raw = Array.isArray(entry.routes) ? entry.routes : [];
    const routes = [];
    for (const candidate of raw) {
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate))
            continue;
        const one = candidate;
        const classifyId = textOf(one.classifyId).trim();
        if (classifyId === '')
            continue;
        const type = Number(one.treeNodeType);
        routes.push({
            classifyId,
            classifyName: textOf(one.classifyName),
            ...(textOf(one.productId) === '' ? {} : { productId: textOf(one.productId) }),
            ...(textOf(one.productName) === '' ? {} : { productName: textOf(one.productName) }),
            // 树上来的分类要靠 code + treeNodeType 才查得到清单（apiClassifyId 那条老形状对它们
            // 返回空）；旧路标里没有这两个键，走老形状。
            ...(textOf(one.domainAppCode) === '' ? {} : { domainAppCode: textOf(one.domainAppCode) }),
            ...(Number.isFinite(type) && type > 0 ? { treeNodeType: type } : {}),
        });
    }
    if (origin === '' || keyword === '' || routes.length === 0)
        return undefined;
    return { origin, keyword, routes, at: textOf(entry.at) };
}
/**
 * 打开路标文档。
 * @param path - 文档位置；默认是操作者自己那份。
 * @returns 按它读写的存储。
 */
export function createBipApiRouteStore(path = defaultBipApiRoutePath()) {
    // 写串行，读不动它——与 `iteration-store.ts` 同一套理由：丢更新只可能发生在
    // 读-改-写的循环里，而那正是这里要排队的部分。
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    const readNow = async () => {
        const text = await readFile(path, 'utf8').catch(() => undefined);
        if (text === undefined)
            return { path, routes: [], exists: false };
        try {
            const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
            const parsed = JSON.parse(body);
            const raw = Array.isArray(parsed.routes) ? parsed.routes : [];
            const routes = raw.map(asRoute).filter((one) => one !== undefined);
            return { path, routes, exists: true };
        }
        catch {
            return { path, routes: [], exists: true, error: `无法解析 ${path}：它不是合法的 JSON。` };
        }
    };
    const writeNow = async (routes) => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, `${JSON.stringify({ routes }, null, 2)}\n`, 'utf8');
        await rename(temporary, path);
    };
    const update = async (change) => {
        const current = await readNow();
        await writeNow(change(current.routes));
    };
    return {
        path,
        read: readNow,
        async hints(origin, keyword) {
            const current = await readNow();
            const found = current.routes.find(one => one.origin === origin && one.keyword === keyword);
            return found === undefined ? [] : found.routes;
        },
        remember(origin, keyword, routes) {
            if (routes.length === 0)
                return Promise.resolve();
            const entry = { origin, keyword, routes: [...routes], at: new Date().toISOString() };
            return inLine(() => update(current => [...current.filter(one => !(one.origin === origin && one.keyword === keyword)), entry]));
        },
        forget(origin, keyword) {
            return inLine(() => update(current => current.filter(one => !(one.origin === origin && one.keyword === keyword))));
        },
    };
}
/** 一条命中在模型面前写成一行。 */
export function renderHit(hit) {
    const where = [hit.productName, hit.category].filter(part => part !== '').join(' / ');
    return `· ${hit.apiName}${hit.describe === '' ? '' : ` —— ${hit.describe}`}`
        + `${where === '' ? '' : `〔${where}〕`} (${hit.apiId})`;
}
