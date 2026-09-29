import { auditDigest } from "./digest-audit.js";
import { loadDigestConfig } from "./digest-config.js";
/** 这个模块拥有的工具。 */
export const DIGEST_TOOL_NAMES = ['digest_audit'];
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
/** 把一次验收渲染成人能读的报告。 */
function renderAudit(audit, config) {
    const t = config.thresholds;
    const lines = [];
    lines.push(`消化验收：${audit.label}`);
    lines.push(`  源文档  ${audit.source}   ${(audit.volume.sourceBytes / 1024).toFixed(0)} KB`);
    lines.push(`  产物    ${audit.product}   ${audit.pages} 个文件 / ${(audit.volume.productBytes / 1024).toFixed(1)} KB`);
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
        lines.push(`  ⚠ ${audit.fidelity.fabricated} / ${audit.fidelity.total} 个标识符在源文档里找不到`
            + `（${(audit.fidelity.rate * 100).toFixed(1)}%，阈值 ${t.fidelity * 100}%）`);
        lines.push('  逐条出处——源文档里没有 ≠ 一定是幻觉，也可能是引用别的来源、或批注原文拼写：');
        for (const item of audit.fidelity.located.slice(0, 8)) {
            lines.push(`     ${item.term.padEnd(26)} ${item.file}:${item.line}`);
        }
        if (audit.fidelity.fabricated > 8)
            lines.push(`     …另有 ${audit.fidelity.fabricated - 8} 条`);
    }
    else {
        lines.push(`  ✅ ${audit.fidelity.total} 个标识符全部能在源文档找到`);
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
/**
 * 注册消化验收工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param wiki - 知识库服务，用来把 vault id 解析成路径。
 * @returns 撤回全部注册的处置函数。
 */
export function registerYonDigestTools(ctx, wiki) {
    const disposers = [];
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
                ? `【只跑重叠门禁】未给 product，因此除第 6 项外的结果无意义。\n\n${renderAudit(audit, loaded.config)}`
                : renderAudit(audit, loaded.config);
            return { passed: audit.passed, failed: audit.failed, report };
        },
        presentCall(args) {
            const input = (args ?? {});
            const product = typeof input.product === 'string' && input.product !== '' ? input.product : '(只跑门禁)';
            return card(`消化验收：${product}`, 'read');
        },
    }));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
