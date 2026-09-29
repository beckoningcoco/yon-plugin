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
 * 一个标题及其行号。
 *
 * 这是**全插件唯一的章节识别结果结构**：`digest-plan` 用它算范围，`digest-audit`
 * 的 `sections()` 也调用同一个 `headingsOf()`。
 */
export interface Heading {
    readonly title: string;
    readonly level: number;
    readonly line: number;
}
/**
 * 抽出全部有编号的标题及其行号。
 *
 * **这是章节识别的唯一实现**，`digest-plan` 与 `digest-audit` 共用。
 *
 * 曾经这里踩过一个坑：两个模块各写了一套识别逻辑，plan 侧有五条过滤规则
 * （有「第X章」时数字一级编号作废、一级编号须严格递增、一级标题长度上限、
 * 一级标题禁含句读标点、跳过页标记与页眉），audit 侧一条都没有。结果同一份
 * 文档，plan 报 6 章而 audit 报 10 章——audit 把参数表里的
 * 「0 表示操作成功，和result 等同」当成了一个一级章节，于是**合格产物被判
 * 覆盖率不合格（假阴性）**。两套逻辑必然漂移，所以合并到这里。
 *
 * 一级编号要求**严格递增**，这条是踩出来的：实测一份 1846 页的文档报出 58 个
 * 一级章节，而它只有 10 章——正文里的 `1 xxx` 这类表格行、列表项被当成了标题。
 * 真章节的编号是 1,2,3…连续递增的，误判的则是零散的。
 *
 * @param lines - 源文档按行切开的数组。
 * @param config - 配置。
 * @returns 标题列表，按行号升序。
 */
export declare function headingsOf(lines: readonly string[], config: DigestConfig): readonly Heading[];
/**
 * 摸清一份源文档的骨架。
 *
 * @param source - 源文档路径（PDF 抽取出来的文本）。
 * @param config - 配置。
 * @returns 骨架与分段范围。
 * @throws 当源文档读不到时。
 */
export declare function planDigest(source: string, config: DigestConfig): Promise<DigestPlan>;
