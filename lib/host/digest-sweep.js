/**
 * 批量体检：把一整个目录的产物按**源文档**分组，逐组拿去验收。
 *
 * ## 为什么需要它
 *
 * `digest_audit` 一次只验一份。可「库里的消化做得到底怎么样」从来不是一个
 * 单份的问题——实测里为了回答这个问题，**连着写了四回一次性脚本**，每次都是
 * 自己遍历目录、自己从 frontmatter 里抠 `sources`、自己配对源文件、自己排表。
 * 第四次的时候就该明白了：那四回写的是同一个东西。
 *
 * ## 为什么必须按源分组
 *
 * 一份源文档常常被拆成多个主题页。**逐页对着整本源文档比覆盖率必然不合格**：
 * 实测一份 129 页文档拆成 10 页，单拿其中一页去比只有 12%–43%，十页合起来才是
 * 98.7%。第一版 `sweepDigests` 就是逐页比的，于是报告说「30 份全部不合格」——
 * 连刚验收合格的那批也在里面。这个假象是工具自己造成的，所以现在按源分组合并
 * 验收：一组的产物页一起当一份产物看。
 *
 * ## 它查出来的东西
 *
 * 一次扫描就掀开了三层：
 *
 * - 库里同一批源文档上并存着**两套互不知情的摘要**（`topics/` 与
 *   `topics/bip-platform/`），术语覆盖率 8%–18%，而合格线是 85%；
 * - 同一份 PDF 被消化过**三次**（6/1、6/14、9/30），三代产物互不引用；
 * - 一份 746 字节的摘要写着 `confidence: EXTRACTED`，正文把**消息平台**红皮书
 *   讲成了 MQ 开发指南（消息队列、生产者消费者、死信队列），六条没一条在原文里
 *   ——而 `index.md` 已经把这套说法当成事实写进了索引；
 * - `wiki/topics/` 93 份里 **59 份**的 `sources` 指向库外（一个 PDF 名），
 *   根本无从复核。
 *
 * 单看文件列表，这些产物和一份合格摘要长得一模一样。
 *
 * ## 与其他两个工具的分工
 *
 * ```
 * digest_audit(source, vault)          消化前：这一份值不值得做
 * digest_plan(source)                  摸底：分几章、每章哪行到哪行
 * digest_audit(source, product, vault) 消化后：这一份做得怎么样
 * digest_sweep(root)                   回头看：**库里这一批**做得怎么样
 * ```
 *
 * 前三个管一份，`digest_sweep` 管一批。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { auditDigest } from "./digest-audit.js";
/**
 * 从 frontmatter 里取第一个指向 vault 内的源路径。
 *
 * 只认 `raw/` 开头的值：`sources` 这个字段在库里有三种写法——指向 vault 内的
 * 抽取文本（可验收）、指向 vault 外的 PDF 名（验收不了）、空数组（没记来源）。
 * 后两种都该被算成「验收不了」而不是「合格」。
 *
 * @param text - 产物全文。
 * @returns 相对 vault 根的源路径；解析不到时为 undefined。
 */
export function sourcePathOf(text) {
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (block === null)
        return undefined;
    const body = block[1] ?? '';
    const items = [];
    const inline = /^sources:[ \t]*\[([^\]]*)\]/m.exec(body);
    if (inline !== null) {
        items.push(...(inline[1] ?? '').split(','));
    }
    else {
        const headed = /^sources:[ \t]*$/m.exec(body);
        if (headed !== null) {
            const after = body.slice(headed.index + headed[0].length);
            for (const line of after.split(/\r?\n/)) {
                // 空行要跳过而不是停：`sources:` 后面紧跟的就是一个换行，切出来第一项是
                // 空串。最初写成「不匹配就 break」，于是块列表式一条都读不到——是测试
                // 里那条块列表用例把它抓出来的。
                if (line.trim() === '')
                    continue;
                const item = /^[ \t]*-[ \t]*(.+)$/.exec(line);
                if (item === null)
                    break;
                items.push(item[1] ?? '');
            }
        }
    }
    for (const raw of items) {
        const value = raw.trim().replace(/^["']|["']$/g, '').trim();
        if (value.startsWith('raw/'))
            return value;
    }
    return undefined;
}
/** 递归列出目录下的全部 .md。 */
async function markdownUnder(dir) {
    const found = [];
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            found.push(...await markdownUnder(full));
        else if (entry.isFile() && entry.name.endsWith('.md'))
            found.push(full);
    }
    return found;
}
/** 绝对路径 → 相对 root 的正斜杠路径。 */
function relOf(root, file) {
    return path.relative(root, file).split(path.sep).join('/');
}
/**
 * 扫一个目录，把产物按它们各自声明的源文档分组，逐组验收。
 *
 * @param input - vault 根、限定子树、配置，以及可选的体量上限与返回条数上限。
 * @returns 逐组的验收结果与汇总。
 */
export async function sweepDigests(input) {
    const under = input.under ?? 'wiki';
    const files = await markdownUnder(path.join(input.root, under));
    const counts = {
        audited: 0, 'no-source-field': 0, 'source-missing': 0, unreadable: 0,
    };
    const loose = [];
    /** 源文件绝对路径 → 引用它的产物页绝对路径。 */
    const groups = new Map();
    const sourceCache = new Map();
    let scanned = 0;
    let skippedLarge = 0;
    for (const file of files) {
        const rel = relOf(input.root, file);
        scanned += 1;
        let text;
        try {
            text = await readFile(file, 'utf8');
        }
        catch {
            counts.unreadable += 1;
            loose.push({ products: [rel], status: 'unreadable' });
            continue;
        }
        if (input.maxProductBytes !== undefined && Buffer.byteLength(text, 'utf8') > input.maxProductBytes) {
            skippedLarge += 1;
            continue;
        }
        const sourceRel = sourcePathOf(text);
        if (sourceRel === undefined) {
            counts['no-source-field'] += 1;
            loose.push({ products: [rel], status: 'no-source-field' });
            continue;
        }
        const sourceAbs = path.join(input.root, sourceRel);
        let exists = sourceCache.get(sourceAbs);
        if (exists === undefined) {
            exists = await stat(sourceAbs).then(s => s.isFile()).catch(() => false);
            sourceCache.set(sourceAbs, exists);
        }
        if (!exists) {
            counts['source-missing'] += 1;
            loose.push({ products: [rel], status: 'source-missing', source: sourceRel });
            continue;
        }
        const list = groups.get(sourceAbs);
        if (list === undefined)
            groups.set(sourceAbs, [file]);
        else
            list.push(file);
    }
    let passing = 0;
    let failing = 0;
    const audited = [];
    for (const [sourceAbs, productFiles] of groups) {
        const sourceRel = relOf(input.root, sourceAbs);
        const productRels = productFiles.map(f => relOf(input.root, f));
        const audit = await auditDigest({
            source: sourceAbs,
            product: productFiles,
            config: input.config,
            label: `${sourceRel}  ←  ${productRels.length} 页`,
        });
        counts.audited += 1;
        if (audit.passed)
            passing += 1;
        else
            failing += 1;
        audited.push({ products: productRels, status: 'audited', source: sourceRel, audit });
    }
    // 最差的排最前：体检的目的就是先看该修哪个
    audited.sort((a, b) => (a.audit?.coverage.terms.rate ?? 1) - (b.audit?.coverage.terms.rate ?? 1));
    const ordered = [...audited, ...loose];
    return {
        root: input.root,
        under,
        scanned,
        skippedLarge,
        counts,
        passing,
        failing,
        entries: input.limit === undefined ? ordered : ordered.slice(0, input.limit),
    };
}
