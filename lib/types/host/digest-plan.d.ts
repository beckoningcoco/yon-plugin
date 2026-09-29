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
 * 一行文字要成为某一级标题，必须通过的全部检查。
 *
 * **只写一遍**，`第X章` 与数字编号两个分支共用。此前这些条件散在四段代码里各写
 * 一套，代价在实测里兑现了三次：一次是 `digest_audit` 与 `digest_plan` 各写一套
 * 章节识别，audit 把参数表里的一行当成一级章节，一份合格产物被判覆盖率不合格；
 * 一次是二级没有长度与标点过滤，正文里被硬折行截断的编号项成了二级小节；一次是
 * 结尾的顿号没禁，升级说明里的条目成了二级小节。每次都是改了 A 处忘了 B 处，
 * 而**忘记不会报错**，只是某一级悄悄多认或少认标题。
 *
 * @param title - 去掉编号之后的标题正文。
 * @param level - 1 为一级章节，2 及以上为小节。
 * @param config - 配置。
 * @returns 拒绝原因（便于调试与测试）；通过时为 undefined。
 */
export declare function rejectTitle(title: string, level: number, config: DigestConfig): string | undefined;
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
