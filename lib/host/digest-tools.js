import { auditDigest } from "./digest-audit.js";
import { planDigest } from "./digest-plan.js";
import { sweepDigests } from "./digest-sweep.js";
import { loadDigestConfig } from "./digest-config.js";
/** 这个模块拥有的工具。 */
export const DIGEST_TOOL_NAMES = ['digest_plan', 'digest_audit', 'digest_sweep'];
/** 一个文本块。 */
function text(content) {
    return [{ type: 'text', text: content }];
}
/** 待办状态卡片。 */
function card(title, kind, rawInput) {
    return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } };
}
/** 百分比，null 显示为破折号。 */
function pct(value) {
    return value === null || value === undefined ? '  —  ' : `${(value * 100).toFixed(1).padStart(5)}%`;
}
/** 合格标记，null 表示该项不适用。 */
function mark(ok) {
    return ok === null ? '  ·' : ok ? ' ✅' : ' ❌';
}
/** 产物显示名：一组文件时给出页数与前几个名字。 */
function productNameOf(product) {
    if (typeof product === 'string')
        return product;
    if (product.length === 0)
        return '(空产物)';
    const head = product.slice(0, 3).join('、');
    return product.length <= 3 ? head : `${head} … 共 ${product.length} 页`;
}
/** 把一次摸底渲染成人能读的骨架图。 */
function renderPlan(plan) {
    const lines = [];
    const name = plan.source.split(/[\\/]/).pop() ?? plan.source;
    lines.push(`消化摸底：${name}`);
    lines.push(`  ${plan.pageMarks} 页 · ${plan.characters} 字符 · ${plan.lines} 行 · ${(plan.bytes / 1024).toFixed(0)} KB`);
    if (plan.pageMarks > 0) {
        lines.push(`  每页字符：中位 ${plan.pageChars.median}，最小 ${plan.pageChars.min}，最大 ${plan.pageChars.max}`);
    }
    if (plan.chapters.length === 0) {
        lines.push('');
        lines.push('没有识别到一级章节。');
    }
    else {
        lines.push('');
        lines.push(`章节骨架（${plan.chapters.length} 章，${plan.sectionCount} 个二级小节）：`);
        for (const chapter of plan.chapters) {
            const page = chapter.page === undefined ? '  —' : `p${String(chapter.page).padStart(3)}`;
            lines.push(`  ${chapter.title}`);
            lines.push(`      ${page}   offset ${chapter.line}, limit ${chapter.endLine - chapter.line + 1}`
                + `   ${chapter.characters} 字符   ${chapter.children.length} 节`);
        }
        lines.push('');
        lines.push('把 offset / limit 直接交给 read 工具即可分段读——**不要按页号自己算范围**，');
        lines.push('章节常常跨页，按页切会把章节的尾巴切给下一章。');
    }
    if (plan.notes.length > 0) {
        lines.push('');
        lines.push('注意：');
        for (const note of plan.notes)
            lines.push(`  · ${note}`);
    }
    return lines.join('\n');
}
/**
 * 把一次验收渲染成人能读的报告。
 *
 * @param audit - 验收结果。
 * @param config - 配置，取阈值用。
 * @param gateOnly - 门禁模式：`product` 只是占位的源文档，1–5、7 各项都是拿源文档
 *   跟自己比（覆盖必然 100%、保真必然 100%），数字没有意义。曾经这里照渲染完整
 *   报告，末尾打出「判定：不合格 —— structure」，与开头那句「除第 6 项外无意义」
 *   自相矛盾——足够让人以为门禁没过而放弃一份值得做的素材。
 */
function renderAudit(audit, config, gateOnly = false) {
    const t = config.thresholds;
    const lines = [];
    lines.push(`消化验收：${audit.label}`);
    lines.push(`  源文档  ${audit.source}   ${(audit.volume.sourceBytes / 1024).toFixed(0)} KB`);
    if (gateOnly) {
        lines.push('  产物    （未给 product——本次只跑重叠门禁）');
        if (audit.configNote !== '')
            lines.push(`  配置    ${audit.configNote}`);
        lines.push('');
        lines.push('【6】重叠门禁 —— 与已有知识库的重复度');
        if (audit.overlap === undefined) {
            lines.push('  未运行（给了 vault 才会跑）');
        }
        else {
            lines.push(`  扫描 ${audit.overlap.scannedFiles} 个已有页面、${audit.overlap.knownTerms} 个术语`);
            lines.push(`  重叠 ${String(audit.overlap.hit).padStart(5)} / ${String(audit.overlap.total).padEnd(5)} ${pct(audit.overlap.rate)}${mark(audit.verdicts.overlap)}  （阈值 ≤ ${t.overlap * 100}%）`);
            if (audit.verdicts.overlap === false) {
                lines.push('  ⚠ 重叠过高：这份素材大部分内容已在库里，先确认增量价值再消化');
            }
            else {
                lines.push('  → 有增量。接着跑 digest_plan 摸底。');
            }
        }
        lines.push('');
        lines.push('─'.repeat(52));
        lines.push('判定：（门禁模式，只跑第 6 项，不作合格判定）');
        return lines.join('\n');
    }
    lines.push(`  产物    ${productNameOf(audit.product)}   ${audit.pages} 个文件 / ${(audit.volume.productBytes / 1024).toFixed(1)} KB`);
    if (audit.configNote !== '')
        lines.push(`  配置    ${audit.configNote}`);
    lines.push('');
    lines.push('【1】结构完整 —— frontmatter 必填字段');
    if (audit.verdicts.structure) {
        lines.push('  ✅ 全部产物字段齐全');
    }
    else {
        for (const item of audit.structure.filter(entry => !entry.ok)) {
            lines.push(`  ❌ ${item.file}：缺 ${item.missing.join(', ')}`);
        }
    }
    const extra = [...new Set(audit.structure.flatMap(item => item.extra))];
    if (extra.length > 0)
        lines.push(`  ·  schema 之外的字段：${extra.join(', ')}`);
    lines.push('');
    lines.push('【2】知识点覆盖 —— 源文档的知识进了多少');
    const cov = audit.coverage;
    lines.push(`  中文术语   ${String(cov.terms.hit).padStart(5)} / ${String(cov.terms.total).padEnd(5)} ${pct(cov.terms.rate)}${mark(audit.verdicts.terms)}  （阈值 ${t.coverage * 100}%）`);
    lines.push(`  英文标识符 ${String(cov.identifiers.hit).padStart(5)} / ${String(cov.identifiers.total).padEnd(5)} ${pct(cov.identifiers.rate)}`);
    lines.push(`  一级章节   ${String(cov.level1.hit).padStart(5)} / ${String(cov.level1.total).padEnd(5)} ${pct(cov.level1.rate)}${mark(audit.verdicts.coverage)}  （阈值 ${t.coverage * 100}%）`);
    lines.push(`  二级章节   ${String(cov.level2.hit).padStart(5)} / ${String(cov.level2.total).padEnd(5)} ${pct(cov.level2.rate)}${mark(audit.verdicts.level2)}  （阈值 ${t.level2 * 100}%）`);
    lines.push(`  约束句     ${String(cov.constraints.hit).padStart(5)} / ${String(cov.constraints.total).padEnd(5)} ${pct(cov.constraints.rate)}  （阈值 ${t.coverage * 100}%）`);
    if (cov.missingSections.length > 0) {
        lines.push(`  未见的一级章节：${cov.missingSections.slice(0, 8).join('、')}`);
    }
    if (cov.missingTerms.length > 0) {
        lines.push(`  未覆盖的术语（前 10）：${cov.missingTerms.slice(0, 10).join('、')}`);
    }
    lines.push('');
    lines.push('【3】保真率 —— 产物里有没有源文档没有的标识符');
    if (audit.fidelity.fabricated > 0) {
        lines.push(`  ⚠ 两个口径都在报——按唯一标识符 ${(audit.fidelity.rate * 100).toFixed(1)}%，`
            + `按出现次数 ${(audit.fidelity.rateByOccurrence * 100).toFixed(1)}%`
            + `（阈值 ${t.fidelity * 100}%，取两者较低者判定）`);
        lines.push(`  ${audit.fidelity.fabricated} / ${audit.fidelity.total} 个标识符在源文档里找不到，`
            + `它们共出现 ${audit.fidelity.fabricatedOccurrences} / ${audit.fidelity.totalOccurrences} 次`);
        lines.push('  逐条出处——源文档里没有 ≠ 一定是幻觉，也可能是引用别的来源、或批注原文拼写：');
        for (const item of audit.fidelity.located.slice(0, 8)) {
            lines.push(`     ${item.term.padEnd(26)} ${item.file}:${item.line}`);
        }
        if (audit.fidelity.fabricated > 8)
            lines.push(`     …另有 ${audit.fidelity.fabricated - 8} 条`);
    }
    else {
        lines.push(`  ✅ ${audit.fidelity.total} 个标识符（共出现 ${audit.fidelity.totalOccurrences} 次）全部能在源文档找到`);
    }
    if (audit.fidelity.total >= t.fidelitySample) {
        lines.push(`  判定：${mark(audit.verdicts.fidelity)}`);
    }
    else if (audit.fidelity.fabricated === 0) {
        lines.push(`  ·  只有 ${audit.fidelity.total} 个标识符，样本不足，不比比例`);
    }
    lines.push('');
    lines.push('【4】溯源密度 —— 关键结论能否指回原文位置');
    lines.push(`  出处标注 ${audit.provenance.marks} 处 / ${audit.provenance.blocks} 个小节 ${pct(audit.provenance.rate)}${mark(audit.verdicts.provenance)}  （阈值 ${t.provenance * 100}%）`);
    lines.push('');
    lines.push('【5】体积 —— 只提示，不作判据');
    lines.push(`  ${(audit.volume.sourceBytes / 1024).toFixed(0)} KB → ${(audit.volume.productBytes / 1024).toFixed(1)} KB = ${pct(audit.volume.ratio)}`
        + `${audit.volume.warn ? '  ⚠ 落在预警区间外，人工看一眼' : '  · 正常区间'}`);
    lines.push('');
    if (audit.overlap === undefined) {
        lines.push('【6】重叠门禁 —— 未运行（给了 vault 才会跑）');
    }
    else {
        lines.push('【6】重叠门禁 —— 与已有知识库的重复度');
        lines.push(`  扫描 ${audit.overlap.scannedFiles} 个已有页面、${audit.overlap.knownTerms} 个术语`);
        lines.push(`  重叠 ${String(audit.overlap.hit).padStart(5)} / ${String(audit.overlap.total).padEnd(5)} ${pct(audit.overlap.rate)}${mark(audit.verdicts.overlap)}  （阈值 ≤ ${t.overlap * 100}%）`);
        if (audit.verdicts.overlap === false) {
            lines.push('  ⚠ 重叠过高：这份素材大部分内容已在库里，先确认增量价值再消化');
        }
    }
    lines.push('');
    lines.push('【7】可寻址 —— 源文档的术语能否在产物里定位到');
    lines.push(`  抽样 ${audit.addressable.sampled} 个，命中 ${audit.addressable.hit} 个 ${pct(audit.addressable.rate)}${mark(audit.verdicts.addressable)}  （阈值 ${t.addressable * 100}%）`);
    lines.push('');
    lines.push('─'.repeat(52));
    lines.push(audit.passed ? '判定：合格' : `判定：不合格 —— ${audit.failed.join(', ')}`);
    return lines.join('\n');
}
/** 把一次批量体检渲染成人能读的报告。 */
function renderSweep(sweep) {
    const lines = [];
    const c = sweep.counts;
    lines.push(`知识库体检：${sweep.under}/`);
    lines.push(`  扫描 ${sweep.scanned} 份产物`);
    lines.push('');
    lines.push(`  能验收        ${String(c.audited).padStart(5)} 份   合格 ${sweep.passing} / 不合格 ${sweep.failing}`);
    if (c['source-missing'] > 0) {
        lines.push(`  来源缺失      ${String(c['source-missing']).padStart(5)} 份   frontmatter 的 sources 指向的文件不在库里`);
    }
    if (c['no-source-field'] > 0) {
        lines.push(`  无 vault 内来源 ${String(c['no-source-field']).padStart(3)} 份   sources 指向库外或为空——这本身就没法验收`);
    }
    if (c.unreadable > 0)
        lines.push(`  读不到        ${String(c.unreadable).padStart(5)} 份`);
    if (c['skipped-large'] > 0) {
        lines.push(`  整组超限未验  ${String(c['skipped-large']).padStart(5)} 组   **没有结论，不是不合格**`);
    }
    const audited = sweep.entries.filter(entry => entry.status === 'audited' && entry.audit !== undefined);
    if (audited.length > 0) {
        lines.push('');
        lines.push('能验收的按术语覆盖率升序——**最差的排最前**（同一源的多页产物已合并验收）：');
        for (const entry of audited) {
            const a = entry.audit;
            if (a === undefined)
                continue;
            const pages = entry.products.length === 1 ? '' : ` [${entry.products.length}页]`;
            lines.push(`  术语${pct(a.coverage.terms.rate)} 标识符${pct(a.coverage.identifiers.rate)}`
                + ` 二级${String(a.coverage.level2.hit).padStart(3)}/${String(a.coverage.level2.total).padEnd(3)}`
                + ` 约束${String(a.coverage.constraints.hit).padStart(3)}/${String(a.coverage.constraints.total).padEnd(3)}`
                + ` 保真${pct(a.fidelity.rate)}  ${productNameOf(entry.products)}${pages}`);
        }
    }
    if (audited.length > 0) {
        lines.push('');
        lines.push('  ·  同一份源可能有多代产物混在一组里——实测一个组里既有 9/28 那代的一页，');
        lines.push('     又有另一批 9 页，它们指向同一个源却属于两次独立消化。合并验收会把两代');
        lines.push('     的差异一起算，所以看一组时要对照页名判断是不是同一代；不齐的那代拖累整组。');
    }
    const noSource = sweep.entries.filter(entry => entry.status === 'no-source-field');
    if (noSource.length > 0) {
        lines.push('');
        lines.push(`没有 vault 内文件来源的 ${noSource.length} 份。**这一桶必须再拆一层**：`);
        const types = Object.entries(sweep.nonFileSourceTypes).sort((a, b) => b[1] - a[1]);
        lines.push('  按 source_type（附抽样页名——照着翻一眼 frontmatter，就能判断这一桶是');
        lines.push('  真的缺依据，还是来源本来就不是文件）：');
        for (const [name, count] of types.slice(0, 8)) {
            const samples = (sweep.nonFileSourceSamples[name] ?? []).map(s => productNameOf([s])).join('、');
            lines.push(`    ${String(count).padStart(6)}  ${name}`);
            if (samples !== '')
                lines.push(`            e.g. ${samples}`);
        }
        const declared = Object.entries(sweep.declaredSources).sort((a, b) => b[1] - a[1]);
        if (declared.length > 0) {
            lines.push('  其中用 `source:` 指向库外文件的——**这些才是「页面在、依据没了」**：');
            for (const [name, count] of declared.slice(0, 8))
                lines.push(`    ${String(count).padStart(6)}  ${name}`);
            for (const sample of sweep.declaredSourceSamples.slice(0, 3)) {
                lines.push(`            e.g. ${sample.product}`);
                lines.push(`                 source: ${sample.declared}`);
            }
        }
        lines.push('  ·  来源是外部在线源（如 OpenAPI 文档站抓取页 `community-api-docs`）的产物，');
        lines.push('     本来就没有本地文件可对照，不算缺陷。第一版把两件事混成一桶，报出「94% 无来源」，');
        lines.push('     抽样看 frontmatter 才发现绝大多数是前者。');
        lines.push('  ·  **另一件要分清的事**：源 PDF 不进库（体积），但**抽取后的文本必须留在');
        lines.push('     `raw/articles/`**——它是这份消化唯一的可复核依据。没有抽取文本的产物，');
        lines.push('     等于从此不可验。');
    }
    const missing = sweep.entries.filter(entry => entry.status === 'source-missing');
    if (missing.length > 0) {
        lines.push('');
        lines.push(`来源文件缺失的 ${missing.length} 份（列前 12）——页面在、来源没了，等于不可复核：`);
        for (const entry of missing.slice(0, 12)) {
            lines.push(`  ${productNameOf(entry.products)}  →  ${entry.source ?? ''}`);
        }
    }
    return lines.join('\n');
}
/**
 * 注册消化验收工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param wiki - 知识库服务，用来把 vault id 解析成路径。
 * @returns 撤回全部注册的处置函数。
 */
export function registerYonDigestTools(ctx, wiki) {
    const disposers = [];
    disposers.push(ctx.tools.register({
        name: 'digest_plan',
        description: 'Survey a source document before digesting it: returns its chapter skeleton, how many '
            + 'pages and characters it holds, and the offset/limit range of every chapter — ready to hand to '
            + 'the read tool.\n'
            + 'Call this FIRST when digesting anything long. The ranges it returns are cut on heading '
            + 'boundaries, not page boundaries, and that distinction matters: measured on a 133-page red book, '
            + 'cutting by page number sliced off the tail of section 2.3 and it vanished from the knowledge '
            + 'base until a final cross-check caught it. Chapters routinely spill across pages.\n'
            + 'It also warns about the traps that cost real time: figures that survive extraction as captions '
            + 'only (never invent what a figure showed), documents with no page markers (provenance will read '
            + 'as 0% and needs a different anchor), and chapter formats the configured patterns do not match.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['source'],
            properties: {
                source: {
                    type: 'string',
                    description: 'Absolute path to the source material — the extracted text of the PDF or document to digest.',
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['chapters', 'report'],
                properties: {
                    chapters: { type: 'number' },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => text(value.report),
        },
        async execute(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('digest_plan 需要一个对象参数');
            }
            const input = args;
            const source = typeof input.source === 'string' ? input.source.trim() : '';
            if (source === '')
                throw new Error('digest_plan 需要 source（源文档的绝对路径）');
            const loaded = await loadDigestConfig();
            const plan = await planDigest(source, loaded.config);
            return { chapters: plan.chapters.length, report: renderPlan(plan) };
        },
        presentCall(args) {
            const input = (args ?? {});
            const name = typeof input.source === 'string' ? (input.source.split(/[\\/]/).pop() ?? '') : '';
            return card(`消化摸底：${name}`, 'read');
        },
    }));
    disposers.push(ctx.tools.register({
        name: 'digest_audit',
        description: 'Audit how completely a source document was digested into knowledge pages. '
            + 'Give it the source file and the pages produced from it; it reports seven measurable '
            + 'checks and says which ones fail.\n'
            + 'It exists because a fabricated summary and an honest one look identical in a file listing: '
            + 'a 1.1 KB summary that listed six chapter headings matching none of the document\'s real six '
            + 'chapters still declared itself "extracted" in its frontmatter. Run this before delivering a '
            + 'digestion, and fix whatever it flags.\n'
            + 'The checks are: frontmatter completeness; coverage of the source\'s terms, identifiers, '
            + 'sections and constraint sentences; fidelity (identifiers in the product that appear nowhere '
            + 'in the source — the anti-hallucination check, reported with each item\'s location so you can '
            + 'tell a genuine fabrication from a legitimate cross-reference); provenance density; size; '
            + 'overlap with the existing knowledge base; and whether source terms can actually be located '
            + 'in the product.\n'
            + 'Run it with only `source` and `vault` (no `product`) to check overlap BEFORE digesting — '
            + 'that tells you whether the material is largely already in the knowledge base.\n'
            + 'Limits worth knowing: it verifies coverage and fidelity, NOT correctness — a page that '
            + 'faithfully copies a wrong value from the source passes. And identifier-type fabrications '
            + 'that are plain English words (not camelCase, dotted or hyphenated) escape the fidelity check.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['source'],
            properties: {
                source: {
                    type: 'string',
                    description: 'Absolute path to the source material — the extracted text of the PDF or document being digested.',
                },
                product: {
                    type: 'string',
                    description: 'Absolute path to the produced knowledge page, or a directory of them. Omit to run only the overlap gate.',
                },
                vault: {
                    type: 'string',
                    description: 'Vault id (e.g. "bip") or absolute vault path, used for the overlap gate. Omit to skip that check.',
                },
                label: { type: 'string', description: 'Label for the report; the product basename when omitted.' },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['passed', 'failed', 'report'],
                properties: {
                    passed: { type: 'boolean' },
                    failed: { type: 'array', items: { type: 'string' } },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => {
                const audit = value;
                return text(audit.report);
            },
        },
        async execute(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('digest_audit 需要一个对象参数');
            }
            const input = args;
            const source = typeof input.source === 'string' ? input.source.trim() : '';
            if (source === '')
                throw new Error('digest_audit 需要 source（源文档的绝对路径）');
            const product = typeof input.product === 'string' && input.product.trim() !== ''
                ? input.product.trim()
                : undefined;
            // vault 可以是 id，也可以是路径。给 id 时借知识库服务的登记表解析。
            let vaultPath;
            const vaultArg = typeof input.vault === 'string' ? input.vault.trim() : '';
            if (vaultArg !== '') {
                if (/^[A-Za-z]:[\\/]/.test(vaultArg) || vaultArg.startsWith('/')) {
                    vaultPath = vaultArg;
                }
                else {
                    const vaults = await wiki.list();
                    const found = vaults.find(entry => entry.id === vaultArg);
                    if (found === undefined) {
                        throw new Error(`没有 id 为「${vaultArg}」的知识库。已登记：${vaults.map(v => v.id).join(', ')}`);
                    }
                    vaultPath = found.path;
                }
            }
            const loaded = await loadDigestConfig();
            const note = loaded.exists
                ? `${loaded.path}${loaded.problem === undefined ? '' : `（${loaded.problem}）`}`
                : `${loaded.path} 不存在，用内置默认值`;
            // 只跑门禁时产物给的是源文档自身——这样体积、覆盖等项自然不是重点，
            // 报告里第 6 项仍然完整。
            const audit = await auditDigest({
                source,
                product: product ?? source,
                config: loaded.config,
                ...(vaultPath === undefined ? {} : { vault: vaultPath }),
                ...(typeof input.label === 'string' && input.label !== '' ? { label: input.label } : {}),
                configNote: note,
            });
            const report = product === undefined
                ? renderAudit(audit, loaded.config, true)
                : renderAudit(audit, loaded.config);
            return { passed: audit.passed, failed: audit.failed, report };
        },
        presentCall(args) {
            const input = (args ?? {});
            const product = typeof input.product === 'string' && input.product !== '' ? input.product : '(只跑门禁)';
            return card(`消化验收：${product}`, 'read');
        },
    }));
    disposers.push(ctx.tools.register({
        name: 'digest_sweep',
        description: 'Audit a whole directory of knowledge pages at once, pairing each page with the source '
            + 'file its own frontmatter declares.\n'
            + 'Use it to answer "how well has this knowledge base actually been digested". digest_audit judges '
            + 'one page; this judges a batch and sorts the worst first. Besides the per-page coverage and '
            + 'fidelity numbers it reports three buckets that cannot be audited at all: pages whose sources '
            + 'point at a file missing from the vault, pages whose sources point outside the vault (a bare PDF '
            + 'name, so nothing can be checked), and pages that record no source.\n'
            + 'Measured on a real vault this surfaced two parallel sets of summaries over the same source '
            + 'documents, one PDF digested three separate times without any generation knowing about the '
            + 'others, and a 746-byte page marked "extracted" that described a messaging-platform manual as a '
            + 'message-queue guide — six invented concepts, none of them in the source. None of it was visible '
            + 'from a file listing.\n'
            + 'It does not verify correctness, same as digest_audit — it measures coverage and fidelity only.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['vault'],
            properties: {
                vault: {
                    type: 'string',
                    description: 'Vault id (e.g. "bip") or absolute vault path.',
                },
                under: {
                    type: 'string',
                    description: 'Subtree to sweep, relative to the vault root. Defaults to "wiki".',
                },
                maxGroupBytes: {
                    type: 'number',
                    description: 'Skip any group whose product pages total more than this many bytes — such groups get NO verdict (neither pass nor fail), because trimming a group would produce a wrong one. Omit to audit everything.',
                },
                limit: {
                    type: 'number',
                    description: 'Cap on detail rows returned; the summary counts are always complete.',
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['audited', 'passing', 'failing', 'report'],
                properties: {
                    audited: { type: 'number' },
                    passing: { type: 'number' },
                    failing: { type: 'number' },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => text(value.report),
        },
        async execute(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('digest_sweep 需要一个对象参数');
            }
            const input = args;
            const vaultArg = typeof input.vault === 'string' ? input.vault.trim() : '';
            if (vaultArg === '')
                throw new Error('digest_sweep 需要 vault（知识库 id 或绝对路径）');
            let root;
            if (/^[A-Za-z]:[\\/]/.test(vaultArg) || vaultArg.startsWith('/')) {
                root = vaultArg;
            }
            else {
                const vaults = await wiki.list();
                const found = vaults.find(entry => entry.id === vaultArg);
                if (found === undefined) {
                    throw new Error(`没有 id 为「${vaultArg}」的知识库。已登记：${vaults.map(v => v.id).join(', ')}`);
                }
                root = found.path;
            }
            const loaded = await loadDigestConfig();
            const sweep = await sweepDigests({
                root,
                config: loaded.config,
                ...(typeof input.under === 'string' && input.under.trim() !== '' ? { under: input.under.trim() } : {}),
                ...(typeof input.maxGroupBytes === 'number' ? { maxGroupBytes: input.maxGroupBytes } : {}),
                ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
            });
            return {
                audited: sweep.counts.audited,
                passing: sweep.passing,
                failing: sweep.failing,
                report: renderSweep(sweep),
            };
        },
        presentCall(args) {
            const input = (args ?? {});
            const under = typeof input.under === 'string' && input.under.trim() !== '' ? input.under.trim() : 'wiki';
            return card(`知识库体检：${under}/`, 'read');
        },
    }));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
