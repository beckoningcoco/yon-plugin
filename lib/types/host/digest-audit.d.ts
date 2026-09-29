import { type DigestConfig } from './digest-config.ts';
/** 一个「命中数 / 总数」对，比率为 null 表示该项不适用。 */
export interface CountRate {
    readonly total: number;
    readonly hit: number;
    /** 命中率；总数为 0 时为 null，表示这一项不适用而不是不合格。 */
    readonly rate: number | null;
}
/** 单个产物文件的结构检查结果。 */
export interface StructureCheck {
    readonly file: string;
    readonly ok: boolean;
    readonly missing: readonly string[];
    /** schema 之外的字段：不算错，但值得知道。 */
    readonly extra: readonly string[];
}
/** 某一项指标对某个产物的判定。 */
export interface Verdicts {
    readonly structure: boolean;
    readonly coverage: boolean | null;
    readonly level2: boolean | null;
    readonly terms: boolean | null;
    readonly fidelity: boolean | null;
    readonly provenance: boolean;
    readonly overlap: boolean | null;
    readonly addressable: boolean | null;
}
/** 覆盖率明细。 */
export interface CoverageCheck {
    readonly terms: CountRate;
    readonly identifiers: CountRate;
    readonly level1: CountRate;
    readonly level2: CountRate;
    readonly constraints: CountRate;
    readonly missingSections: readonly string[];
    readonly missingTerms: readonly string[];
}
/** 保真率明细。 */
export interface FidelityCheck {
    readonly total: number;
    readonly fabricated: number;
    /** 按**唯一标识符**计的保真率。 */
    readonly rate: number;
    /**
     * 按**出现次数**计的保真率。
     *
     * 比上面那个敏感得多：幻觉集中在高频词上时（把 `id` 换成 `xId`），唯一标识
     * 符只少了一个，出现次数却少了几百次。只报前者会让人以为产物没问题。
     */
    readonly rateByOccurrence: number;
    /** 被判为臆造的标识符总共出现了多少次。 */
    readonly fabricatedOccurrences: number;
    /** 产物里标识符的总出现次数。 */
    readonly totalOccurrences: number;
    /** 每条臆造及其出处，供人区分「合法引用」与「编造」。 */
    readonly located: readonly {
        readonly term: string;
        readonly file: string;
        readonly line: number;
    }[];
}
/** 溯源密度明细。 */
export interface ProvenanceCheck {
    readonly marks: number;
    readonly blocks: number;
    readonly rate: number;
}
/** 体积明细。 */
export interface VolumeCheck {
    readonly sourceBytes: number;
    readonly productBytes: number;
    readonly ratio: number;
    readonly warn: boolean;
}
/** 重叠门禁明细。 */
export interface OverlapCheck {
    readonly scannedFiles: number;
    readonly knownTerms: number;
    readonly total: number;
    readonly hit: number;
    readonly rate: number;
}
/** 可寻址明细。 */
export interface AddressableCheck {
    readonly sampled: number;
    readonly hit: number;
    readonly rate: number | null;
}
/** 一次验收的完整结果。 */
export interface DigestAudit {
    readonly label: string;
    readonly source: string;
    readonly product: string;
    readonly pages: number;
    readonly structure: readonly StructureCheck[];
    readonly coverage: CoverageCheck;
    readonly fidelity: FidelityCheck;
    readonly provenance: ProvenanceCheck;
    readonly volume: VolumeCheck;
    readonly overlap: OverlapCheck | undefined;
    readonly addressable: AddressableCheck;
    readonly verdicts: Verdicts;
    /** 不合格的项名，空数组表示全部通过。 */
    readonly failed: readonly string[];
    readonly passed: boolean;
    /** 配置来源说明：路径，以及读配置时遇到的问题。 */
    readonly configNote: string;
}
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
export declare function identifiers(text: string, config: DigestConfig): ReadonlySet<string>;
/**
 * 标识符及其出现次数。
 *
 * 保真率需要按出现次数算一份：只按去重后的唯一标识符算，会把幻觉稀释掉。
 * 实测过——向产物注入 371 处编造标识符（占出现次数的 19.2%），去重后只涉及
 * 27 个唯一标识符，保真率从 98.0% 只掉到 95.1%，两个点。阈值是 98%，余量
 * 只剩两个点，规模再大一点的幻觉就蒙混过关了。
 *
 * @param text - 待统计的文本。
 * @param config - 配置。
 * @returns 标识符到出现次数的映射。
 */
export declare function identifierCounts(text: string, config: DigestConfig): ReadonlyMap<string, number>;
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
export declare function knowledgeBody(text: string, config: DigestConfig): string;
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
export declare function sections(text: string, config: DigestConfig): {
    level1: ReadonlySet<string>;
    level2: ReadonlySet<string>;
};
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
export declare function constraints(text: string, config: DigestConfig): readonly string[];
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
export declare function chineseTerms(text: string, config: DigestConfig): ReadonlySet<string>;
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
export declare function bodyOnly(text: string, config: DigestConfig): string;
/**
 * 验收一份消化。
 *
 * @param input - 源文档、产物、可选的 vault 与标签，以及配置。
 * @returns 七项指标的实测值与判定。
 * @throws 当源文档读不到时——没有源就无从验收。
 */
export declare function auditDigest(input: {
    readonly source: string;
    readonly product: string;
    readonly config: DigestConfig;
    readonly vault?: string;
    readonly label?: string;
    readonly configNote?: string;
}): Promise<DigestAudit>;
