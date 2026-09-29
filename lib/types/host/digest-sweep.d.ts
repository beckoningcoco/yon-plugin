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
/** 产物本身读不到。 */
 | 'unreadable';
/** 体检结果里的一行。 */
export interface SweepEntry {
    /** 这次验收涵盖的产物，相对 root 的路径。合并验收时会有多页。 */
    readonly products: readonly string[];
    readonly status: SweepStatus;
    /** 相对 root 的源文件路径，解析到时才有。 */
    readonly source?: string;
    readonly audit?: DigestAudit;
}
/** 一次批量体检的结果。 */
export interface DigestSweep {
    readonly root: string;
    readonly under: string;
    /** 扫到的 .md 总数。 */
    readonly scanned: number;
    /** 因体量超限被跳过的产物页数。 */
    readonly skippedLarge: number;
    /** 因体量超限被跳过的页所涉及的产物页数。 */
    readonly counts: Readonly<Record<SweepStatus, number>>;
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
 * 扫一个目录，把产物按它们各自声明的源文档分组，逐组验收。
 *
 * @param input - vault 根、限定子树、配置，以及可选的体量上限与返回条数上限。
 * @returns 逐组的验收结果与汇总。
 */
export declare function sweepDigests(input: {
    readonly root: string;
    readonly under?: string;
    readonly config: DigestConfig;
    /** 超过这个字节数的产物页跳过——大页面基本是正经消化的，不必逐个跑。 */
    readonly maxProductBytes?: number;
    /** 返回的明细条数上限；汇总永远是全量的。 */
    readonly limit?: number;
}): Promise<DigestSweep>;
