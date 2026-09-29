import { type DigestAudit } from './digest-audit.ts';
import type { DigestConfig } from './digest-config.ts';
/** 一组产物在体检里的结局。 */
export type SweepStatus = 
/** 找到了源文件，跑完了验收。 */
'audited'
/** frontmatter 里没有指向 vault 内的 `sources` —— 无法验收。 */
 | 'no-source-field'
/** `sources` 指向的文件不存在 —— 来源丢了。 */
 | 'source-missing'
/** 这一组的体量超过上限，整组没验 —— **它没有结论，不是不合格**。 */
 | 'skipped-large'
/** 产物本身读不到。 */
 | 'unreadable';
/** 体检结果里的一行。 */
export interface SweepEntry {
    /** 这次验收涵盖的产物，相对 root 的路径。合并验收时会有多页。 */
    readonly products: readonly string[];
    readonly status: SweepStatus;
    /** 相对 root 的源文件路径，解析到时才有。 */
    readonly source?: string;
    /** frontmatter 的 `source_type`，用来区分「来源不是文件」的产物。 */
    readonly sourceType?: string;
    /** frontmatter 里 `source:`（单数）声明的来源，指向库外时记在这里。 */
    readonly declaredSource?: string;
    readonly audit?: DigestAudit;
}
/** 一次批量体检的结果。 */
export interface DigestSweep {
    readonly root: string;
    readonly under: string;
    /** 扫到的 .md 总数。 */
    readonly scanned: number;
    /** 各结局的组数/份数。 */
    readonly counts: Readonly<Record<SweepStatus, number>>;
    /** `no-source-field` 那一桶按 `source_type` 的分布；`(未标)` 表示没有该字段。 */
    readonly nonFileSourceTypes: Readonly<Record<string, number>>;
    /**
     * 每个 `source_type` 的抽样页名（各取前 2 个）。
     *
     * 这一项是**为了让人能推翻报告**而存在的。实测两次错误结论——「94% 无来源」和
     * 「合格 0 组」——都是靠人工翻开 frontmatter 才发现的，而不是靠报告自己露馅。
     * 报告必须把判断所依据的样本摆出来，否则一个有说服力的错结论和一个对结论
     * 长得一模一样。
     */
    readonly nonFileSourceSamples: Readonly<Record<string, readonly string[]>>;
    /** `no-source-field` 那一桶里，用 `source:` 指向库外的有多少，以及它们的取值分布。 */
    readonly declaredSources: Readonly<Record<string, number>>;
    /** `source:` 指向库外文件的抽样页名与它们声明的来源。 */
    readonly declaredSourceSamples: readonly {
        readonly product: string;
        readonly declared: string;
    }[];
    /** 能验收的**源文档份数**（不是产物页数）里，合格的组数。 */
    readonly passing: number;
    /** 能验收的源文档份数里，不合格的组数。 */
    readonly failing: number;
    /** 能验收的组，按术语覆盖率升序——最差的排最前。 */
    readonly entries: readonly SweepEntry[];
}
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
export declare function sourcePathOf(text: string): string | undefined;
/**
 * 取 frontmatter 里某个标量字段的值。
 *
 * @param text - 产物全文。
 * @param key - 字段名。
 * @returns 去掉引号的值；没有该字段时为 undefined。
 */
export declare function frontmatterValueOf(text: string, key: string): string | undefined;
/**
 * 扫一个目录，把产物按它们各自声明的源文档分组，逐组验收。
 *
 * @param input - vault 根、限定子树、配置，以及可选的体量上限与返回条数上限。
 * @returns 逐组的验收结果与汇总。
 */
export declare function sweepDigests(input: {
    readonly root: string;
    readonly under?: string;
    readonly config: DigestConfig;
    /**
     * **按组**判定：一组的产物合计超过这么多字节，整组跳过、记为 `skipped-large`。
     *
     * 按组而不是按页，这条是被实测逼出来的：先前的实现逐页跳过大页面，于是
     * `MDD接口与工具类.md`（57.5 KB）被剔掉，它所在的那组只剩 4 页，覆盖率掉下去
     * ——扫描于是报「合格 0 组」，而那一组恰恰是整个库里唯一合格的一组。
     * **让组残缺比不验它更糟：残缺的组会给出一个错误的结论。**
     */
    readonly maxGroupBytes?: number;
    /** 返回的明细条数上限；汇总永远是全量的。 */
    readonly limit?: number;
}): Promise<DigestSweep>;
