/**
 * 消化验收：判断一份「源素材 → 知识页」的消化做没做到位。
 *
 * ## 为什么需要它
 *
 * 靠自觉消化的产物看不出破绽。实测过一份 1.1 KB 的摘要，frontmatter 里写着
 * `confidence: EXTRACTED`（声称从原文抽取），正文列了「数据模型 / 业务逻辑 /
 * API 服务 / 事件处理 / 安全权限 / 扩展机制」六大核心部分——**而文档真实的六章
 * 是「基本概念 / 技术架构 / UI 元数据驱动引擎 / 开发环境 / 单据开发 / RESTful
 * 接口」，没有一条对得上**。那是照标题想象出来的。
 *
 * 在文件列表里，那份编造的摘要和一份合格产物长得一模一样。这个模块就是用来
 * 把它们分开的。
 *
 * ## 七项指标
 *
 * | # | 指标 | 测什么 | 能自动判定吗 |
 * |---|---|---|---|
 * | 1 | 结构完整 | frontmatter 必填字段齐全 | 能 |
 * | 2 | 知识点覆盖 | 源文档的术语/标识符/章节/约束句进了产物多少 | 能 |
 * | 3 | 保真率 | 产物里的标识符有多少能在源文档找到（防幻觉） | 能，但要人复核「引用」与「编造」 |
 * | 4 | 溯源密度 | 关键结论能否指回原文页码 | 能 |
 * | 5 | 体积 | 字节比异常提示 | 只提示，不判定 |
 * | 6 | 重叠门禁 | 与已有知识库的重复度（**消化前**就该跑） | 能 |
 * | 7 | 可寻址 | 源文档的术语能否在产物里定位到 | 能 |
 *
 * ## 它验证不了什么
 *
 * **校验不了正确性。** 只能证明「覆盖了」和「没有编造」，证明不了「原文本身
 * 是对的」。实测例：产物逐字照录了原文的 `pub_ref.bauth` 取值「1:不受，0:受」
 * ——保真率给它满分，可那个取值反直觉，原文可能自己就写反了。正确性只有对照
 * 真实环境一条路。
 *
 * 所以它的定位是**必要不充分**：挡住编造与糊弄，挡不住错误。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { compilePatterns } from "./digest-config.js";
/** 读取文本；读不到时抛错，因为源文档读不到就没法验收。 */
async function readText(file) {
    return await readFile(file, 'utf8');
}
/**
 * 收集产物：可以是单个文件，也可以是一个目录。
 * @param target - 文件或目录。
 * @returns 产物文件列表。
 */
async function collectProduct(target) {
    const info = await stat(target);
    if (info.isFile()) {
        return [{ file: target, text: await readText(target) }];
    }
    const pages = [];
    const walk = async (dir) => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
                continue;
            }
            if (!/\.(md|txt)$/i.test(entry.name))
                continue;
            pages.push({ file: full, text: await readText(full) });
        }
    };
    await walk(target);
    return pages;
}
// ---------------------------------------------------------------- 抽取
/**
 * 英文标识符：带分隔符的名、驼峰词、纯大写缩写。
 *
 * 三条分支缺一不可，都是踩过坑补的：
 * - 带分隔符（`UCF-MDD`、`ucf-org-center`、`iuap.busiObj`）——用友的命名大量用
 *   连字符，第一版正则只认点号和下划线，于是把 `UCF-MDD` 整个漏掉，还把 `UCF`
 *   当 3 字母词滤掉，报告出一句「产物只有 0 个标识符」——那是检查器瞎了
 * - 驼峰（`ViewModel`、`getSelectData`）
 * - 纯大写缩写（`MDD`、`OMG`、`MDA`）
 *
 * @param text - 待抽取的文本。
 * @param config - 配置。
 * @returns 标识符集合。
 */
export function identifiers(text, config) {
    const patterns = compilePatterns(config);
    const stop = new Set(config.identifiers.stop);
    const found = new Set();
    for (const match of text.matchAll(patterns.identifier)) {
        const term = match[0];
        if (term.length < config.identifiers.minLength || term.length > config.identifiers.maxLength)
            continue;
        if (stop.has(term))
            continue;
        if (/^\d/.test(term))
            continue;
        found.add(term);
    }
    return found;
}
/**
 * 去掉封面、版权页、修订记录、目录和页眉，只留知识正文。
 *
 * 不剔除不行：`版权`、`用友集团`、`本文档描述` 会被 n-gram 当成术语抽出来，
 * 但没有任何一份合格的产物会去覆盖版权声明——留着它们，覆盖率永远上不了 85%。
 *
 * @param text - 源文档全文。
 * @param config - 配置。
 * @returns 只剩知识正文的文本。
 */
export function knowledgeBody(text, config) {
    const patterns = compilePatterns(config);
    return text
        .split(/\r?\n/)
        .filter((raw) => {
        const line = raw.trim();
        if (line === '')
            return true;
        if (patterns.sourcePageMark.test(line))
            return false;
        if (/^第\s*\d+\s*页$/.test(line))
            return false;
        if (patterns.tocLine.test(line))
            return false;
        if (patterns.sourceNoise.test(line))
            return false;
        return true;
    })
        .join('\n');
}
/**
 * 章节标题：一级与二级。
 *
 * PDF 抽取出来的正文没有 markdown 标记，标题就是普通短行，只能靠编号形态认。
 * 只取到配置的 maxDepth（默认二级），三级太碎会把覆盖率稀释成没有意义的数字。
 *
 * @param text - 源文档全文。
 * @param config - 配置。
 * @returns 一级与二级章节标题集合。
 */
export function sections(text, config) {
    const patterns = compilePatterns(config);
    const level1 = new Set();
    const level2 = new Set();
    for (const raw of knowledgeBody(text, config).split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '' || line.length > config.sections.maxTitleLength)
            continue;
        if (patterns.tocLine.test(line))
            continue;
        const chapter = patterns.chapter.exec(line);
        if (chapter !== null) {
            const title = (chapter[2] ?? '').trim();
            if (title.length >= 2 && !/^[。；，,;]/.test(title))
                level1.add(`第${chapter[1] ?? ''}章 ${title}`);
            continue;
        }
        const numbered = patterns.numbered.exec(line);
        if (numbered === null)
            continue;
        const number = numbered[1] ?? '';
        const depth = number.split('.').length;
        if (depth > config.sections.maxDepth)
            continue;
        const title = (numbered[2] ?? '').trim();
        if (title.length < 2 || /[。；，,;]$/.test(title))
            continue;
        if (/^\d/.test(title))
            continue;
        if (/^(年|月|日|修订|页)/.test(title))
            continue;
        if (/^[、，。；：,.;:（）()【】]/.test(title))
            continue;
        if (!/[\u4e00-\u9fa5A-Za-z]/.test(title))
            continue;
        if (depth === 1)
            level1.add(`${number} ${title}`);
        if (depth === 2)
            level2.add(`${number} ${title}`);
    }
    return { level1, level2 };
}
/**
 * 约束句：含「必须/禁止/不支持」这类模态词的行。
 *
 * 技术文档里最容易被摘要丢掉、又最不能丢的就是这些——「树表不支持整列全选」
 * 这种限制，摘要作者觉得是细节，使用者却会因此踩坑。
 *
 * @param text - 源文档全文。
 * @param config - 配置。
 * @returns 约束句列表。
 */
export function constraints(text, config) {
    const patterns = compilePatterns(config);
    const found = [];
    for (const raw of knowledgeBody(text, config).split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length < 12 || line.length > 120)
            continue;
        if (!patterns.constraint.test(line))
            continue;
        found.push(line);
    }
    return found;
}
/**
 * 中文术语：源文档里反复出现的中文片段。
 *
 * **为什么必须单独抽这一类**：中文技术文档的知识主体往往是中文名词。实测
 * MDD 红皮书第 1–2 章讲的是「元模型 / 元数据 / UI 元数据 / 参照 / 自定义项 /
 * 交易类型」，而全文的英文标识符只有 MDD、MDA、OMG、UCF-MDD 几个缩写。只按
 * 英文标识符算覆盖率，这两章会被判成「什么都没覆盖」——那是度量的问题。
 *
 * 做法：切连续汉字串，滑窗取片段，保留高频的，滤掉含虚词的和通用词，最后去掉
 * 被更长片段包含的短片段。
 *
 * **这是启发式的，必然不全。** 中文没有词边界，做不到精确分词；它的作用是砍掉
 * 噪音，不是给出术语表。
 *
 * @param text - 源文档全文。
 * @param config - 配置。
 * @returns 术语集合。
 */
export function chineseTerms(text, config) {
    const patterns = compilePatterns(config);
    const generic = new Set(config.terms.generic);
    const source = knowledgeBody(text, config);
    const freq = new Map();
    for (const run of source.replace(/[^\u4e00-\u9fa5]+/g, ' ').split(/\s+/)) {
        if (run.length < config.terms.minLength)
            continue;
        for (let len = config.terms.minLength; len <= config.terms.maxLength; len++) {
            for (let i = 0; i + len <= run.length; i++) {
                const term = run.slice(i, i + len);
                freq.set(term, (freq.get(term) ?? 0) + 1);
            }
        }
    }
    const kept = [...freq]
        .filter(([term, count]) => count >= config.terms.minCount
        && !patterns.termFunction.test(term)
        && !generic.has(term))
        .map(([term]) => term);
    return new Set(kept.filter(term => !kept.some(other => other !== term && other.includes(term) && other.length > term.length)));
}
/**
 * 去掉 frontmatter 与编者注，只留作事实声明的正文。
 *
 * 保真率只能算正文，两个原因：
 *
 * 一、frontmatter 字段名（`platform_version`、`status`）本来就不该出现在源文档
 * 里，算作「臆造」是误报——实测里这一条把保真率从 100% 压到 75%。
 *
 * 二、编者注约定用引用块书写，内容常常**故意提及源文档里没有的词**，比如
 * 「原文拼写 `MddRefServcie`，疑为 `MddRefService`」。后半截是更正建议，不是
 * 事实声明。本模块与产物规范就此对齐：**引用块 = 编者注，不参与保真检查**。
 *
 * @param text - 产物全文。
 * @param config - 配置。
 * @returns 只含事实声明的正文。
 */
export function bodyOnly(text, config) {
    const patterns = compilePatterns(config);
    return text
        .replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/, '')
        .replace(patterns.wikilink, ' ')
        .split(/\r?\n/)
        .filter(line => !patterns.noteLine.test(line))
        .join('\n');
}
/**
 * 压掉所有空白，用于模糊比对。
 *
 * PDF 抽取会把标识符从中间断开——实测里源文档有 `N ULL`、`ove rrule`、
 * `java.lang.Excep tion`。产物理所当然写成完整形态，于是检查器把
 * `java.lang.Exception` 报成臆造。两边都去空白再比，这类误报就没了。
 *
 * @param text - 文本。
 * @returns 压掉空白并小写化的文本。
 */
function squeeze(text) {
    return text.replace(/\s+/g, '').toLowerCase();
}
// ---------------------------------------------------------------- 七项检查
/** 【1】结构完整：frontmatter 必填字段。 */
function checkStructure(pages, config) {
    const known = new Set(config.knownFields);
    return pages.map((page) => {
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(page.text);
        if (fm === null) {
            return { file: page.file, ok: false, missing: ['(无 frontmatter)'], extra: [] };
        }
        const body = fm[1] ?? '';
        const missing = config.requiredFields.filter(field => !new RegExp(`^${field}:`, 'm').test(body));
        const extra = [...body.matchAll(/^([a-z_]+):/gm)]
            .map(m => m[1] ?? '')
            .filter(key => key !== '' && !known.has(key));
        return { file: page.file, ok: missing.length === 0, missing, extra };
    });
}
/** 【2】知识点覆盖。 */
function checkCoverage(source, productText, config) {
    const haystack = productText.toLowerCase();
    const productSqueezed = squeeze(productText);
    const rate = (hit, total) => total === 0 ? null : hit / total;
    const sourceIdents = identifiers(source, config);
    const hitIdents = [...sourceIdents].filter(term => haystack.includes(term.toLowerCase()));
    const sourceTerms = chineseTerms(source, config);
    const hitTerms = [...sourceTerms].filter(term => productText.includes(term));
    const sourceSections = sections(source, config);
    const sectionHit = (title) => {
        const words = title.replace(/^[\d.]+\s*/, '').replace(/^第[一二三四五六七八九十百]+章\s*/, '');
        const parts = words.split(/[\s　]+/).filter(word => word.length >= 2);
        if (parts.length === 0)
            return false;
        return parts.every(word => haystack.includes(word.toLowerCase()));
    };
    const hit1 = [...sourceSections.level1].filter(sectionHit);
    const hit2 = [...sourceSections.level2].filter(sectionHit);
    const sourceConstraints = constraints(source, config);
    const hitConstraints = sourceConstraints.filter((line) => {
        // 约束句按「骨架词命中」判断，不做逐字前缀比对：合格的消化是**改写**而不是
        // 照抄，「树表不支持整列全选」在产物里会变成「整列全选不支持树表」——字面
        // 不同，知识相同。
        const core = line.replace(/[，。；：、（）()《》"'`\s　,.;:]/g, '');
        if (core.length < 8)
            return productSqueezed.includes(core.toLowerCase());
        const grams = [];
        for (let i = 0; i + 4 <= core.length; i += 4)
            grams.push(core.slice(i, i + 4).toLowerCase());
        if (grams.length === 0)
            return false;
        return grams.filter(gram => productSqueezed.includes(gram)).length / grams.length >= 0.5;
    });
    return {
        terms: { total: sourceTerms.size, hit: hitTerms.length, rate: rate(hitTerms.length, sourceTerms.size) },
        identifiers: { total: sourceIdents.size, hit: hitIdents.length, rate: rate(hitIdents.length, sourceIdents.size) },
        level1: { total: sourceSections.level1.size, hit: hit1.length, rate: rate(hit1.length, sourceSections.level1.size) },
        level2: { total: sourceSections.level2.size, hit: hit2.length, rate: rate(hit2.length, sourceSections.level2.size) },
        constraints: { total: sourceConstraints.length, hit: hitConstraints.length, rate: rate(hitConstraints.length, sourceConstraints.length) },
        missingSections: [...sourceSections.level1].filter(title => !sectionHit(title)).slice(0, 12),
        missingTerms: [...sourceTerms].filter(term => !productText.includes(term)).slice(0, 20),
    };
}
/** 【3】保真率：产物正文里的标识符有多少能在源文档找到。 */
function checkFidelity(source, productBody, pages, config) {
    const sourceSqueezed = squeeze(source);
    const productIdents = identifiers(productBody, config);
    const fabricated = [...productIdents].filter(term => !sourceSqueezed.includes(squeeze(term)));
    // 每条臆造带出处。没有出处就没法判断它是真幻觉，还是合法引用别的来源、或对
    // 原文拼写的批注——实测里 16 条报告有 13 条是后两种。
    const located = fabricated.slice(0, 20).map((term) => {
        const needle = term.toLowerCase();
        for (const page of pages) {
            const lines = page.text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                if (!(lines[i] ?? '').toLowerCase().includes(needle))
                    continue;
                return { term, file: path.basename(page.file), line: i + 1 };
            }
        }
        return { term, file: '(未定位)', line: 0 };
    });
    return {
        total: productIdents.size,
        fabricated: fabricated.length,
        rate: productIdents.size === 0 ? 1 : 1 - fabricated.length / productIdents.size,
        located,
    };
}
/** 【4】溯源密度。 */
function checkProvenance(productText, config) {
    const patterns = compilePatterns(config);
    const marks = [...productText.matchAll(patterns.pageMark)].length;
    const headings = [...productText.matchAll(/^#{2,4}\s+.+$/gm)].length;
    const blocks = headings > 0
        ? headings
        : productText.split(/\n\s*\n/).filter(block => block.trim().length > 40).length;
    return { marks, blocks, rate: blocks === 0 ? 0 : Math.min(1, marks / blocks) };
}
/** 【5】体积：只看异常，不作判据。 */
function checkVolume(source, productText, config) {
    const sourceBytes = Buffer.byteLength(source, 'utf8');
    const productBytes = Buffer.byteLength(productText, 'utf8');
    const ratio = sourceBytes === 0 ? 1 : productBytes / sourceBytes;
    return {
        sourceBytes,
        productBytes,
        ratio,
        warn: ratio < config.volume.min || ratio > config.volume.max,
    };
}
/** 【6】重叠门禁：源文档与已有知识库的标识符重叠率。 */
async function checkOverlap(source, vaultRoot, config) {
    if (vaultRoot === undefined)
        return undefined;
    const known = new Set();
    let scanned = 0;
    for (const scope of config.vaultScopes) {
        const dir = path.join(vaultRoot, scope);
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.md'))
                continue;
            const text = await readFile(path.join(dir, entry.name), 'utf8').catch(() => '');
            scanned += 1;
            for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{2,}/g))
                known.add(match[0].toLowerCase());
        }
    }
    const sourceIdents = identifiers(source, config);
    const hit = [...sourceIdents].filter(term => known.has(term.toLowerCase()));
    return {
        scannedFiles: scanned,
        knownTerms: known.size,
        total: sourceIdents.size,
        hit: hit.length,
        rate: sourceIdents.size === 0 ? 0 : hit.length / sourceIdents.size,
    };
}
/** 【7】可寻址：源文档的标识符有多少能在产物里定位到。 */
function checkAddressable(source, productText, config, sampleSize = 20) {
    const haystack = productText.toLowerCase();
    const sourceIdents = [...identifiers(source, config)];
    if (sourceIdents.length === 0)
        return { sampled: 0, hit: 0, rate: null };
    // 均匀取样而不是随机取样：同一份输入每次结果必须一致，否则「合格」不可复现
    const step = Math.max(1, Math.floor(sourceIdents.length / sampleSize));
    const sample = sourceIdents.filter((_, index) => index % step === 0).slice(0, sampleSize);
    const hit = sample.filter(term => haystack.includes(term.toLowerCase()));
    return { sampled: sample.length, hit: hit.length, rate: sample.length === 0 ? null : hit.length / sample.length };
}
// ---------------------------------------------------------------- 主流程
/**
 * 验收一份消化。
 *
 * @param input - 源文档、产物、可选的 vault 与标签，以及配置。
 * @returns 七项指标的实测值与判定。
 * @throws 当源文档读不到时——没有源就无从验收。
 */
export async function auditDigest(input) {
    const sourceText = await readText(input.source);
    const pages = await collectProduct(input.product);
    const productText = pages.map(page => page.text).join('\n\n');
    // 逐文件剥 frontmatter：正则锚定行首，先拼成一个大字符串再处理的话，只有
    // 第一份的 frontmatter 会被剥掉，后面几份的字段名全被当成正文标识符报成臆造
    const productBody = pages.map(page => bodyOnly(page.text, input.config)).join('\n\n');
    const structure = checkStructure(pages, input.config);
    const coverage = checkCoverage(sourceText, productText, input.config);
    const fidelity = checkFidelity(sourceText, productBody, pages, input.config);
    const provenance = checkProvenance(productText, input.config);
    const volume = checkVolume(sourceText, productText, input.config);
    const overlap = await checkOverlap(sourceText, input.vault, input.config);
    const addressable = checkAddressable(sourceText, productText, input.config);
    const t = input.config.thresholds;
    const verdicts = {
        structure: structure.every(item => item.ok),
        // 源文档里没有这一级章节时该项不适用（null），不参与判定——否则一份没有
        // 「第X章」的文档会被判成覆盖率不合格，那是文档结构的差异，不是消化的失职
        coverage: coverage.level1.rate === null ? null : coverage.level1.rate >= t.coverage,
        level2: coverage.level2.rate === null ? null : coverage.level2.rate >= t.level2,
        terms: coverage.terms.rate === null ? null : coverage.terms.rate >= t.coverage,
        // 样本不足时只报臆造、不比比例：五个标识符错一个就是 80%，这个比例没有意义。
        // 但仍要报——实测里那份编造的摘要靠 5 个标识符拿到了 100% 保真。
        fidelity: fidelity.total < t.fidelitySample
            ? (fidelity.fabricated > 0 ? false : null)
            : fidelity.rate >= t.fidelity,
        provenance: provenance.rate >= t.provenance,
        overlap: overlap === undefined ? null : overlap.rate <= t.overlap,
        addressable: addressable.rate === null ? null : addressable.rate >= t.addressable,
    };
    const failed = Object.entries(verdicts)
        .filter(([, value]) => value === false)
        .map(([key]) => key);
    return {
        label: input.label ?? path.basename(input.product),
        source: input.source,
        product: input.product,
        pages: pages.length,
        structure,
        coverage,
        fidelity,
        provenance,
        volume,
        overlap,
        addressable,
        verdicts,
        failed,
        passed: failed.length === 0,
        configNote: input.configNote ?? '',
    };
}
