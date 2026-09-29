import { type DigestConfig } from './digest-config.ts';
/** 一个章节在源文档里的位置与范围。 */
export interface PlanChapter {
    /** 章节标题，含编号。 */
    readonly title: string;
    /** 1 表示一级章节，2 表示二级小节。 */
    readonly level: number;
    /** 标题所在行，1-based。 */
    readonly line: number;
    /** 内容结束行（下一章标题的前一行），1-based。 */
    readonly endLine: number;
    /** 本章字符数。 */
    readonly characters: number;
    /** 标题所在的 PDF 物理页号；源文档没有页标记时为 undefined。 */
    readonly page?: number;
    /** 本章之下的二级小节标题，按出现顺序。 */
    readonly children: readonly string[];
}
/** 一份源文档的骨架。 */
export interface DigestPlan {
    readonly source: string;
    readonly bytes: number;
    readonly characters: number;
    readonly lines: number;
    /** 抽取器插入的页标记数量。 */
    readonly pageMarks: number;
    /** 每页字符数的分布——用来判断哪些页内容密集、哪些是空页。 */
    readonly pageChars: {
        readonly median: number;
        readonly min: number;
        readonly max: number;
    };
    /** 一级章节；源文档没有一级章节时为空。 */
    readonly chapters: readonly PlanChapter[];
    /** 二级小节总数。 */
    readonly sectionCount: number;
    /** 值得注意的地方：跨页边界、疑似只有图题的图、范围切分提示。 */
    readonly notes: readonly string[];
}
/**
 * 摸清一份源文档的骨架。
 *
 * @param source - 源文档路径（PDF 抽取出来的文本）。
 * @param config - 配置。
 * @returns 骨架与分段范围。
 * @throws 当源文档读不到时。
 */
export declare function planDigest(source: string, config: DigestConfig): Promise<DigestPlan>;
