/** 各项指标的阈值。全部是比例（0–1），不是百分数。 */
export interface DigestThresholds {
    /** 中文术语、英文标识符、一级章节、约束句的覆盖率下限 */
    readonly coverage: number;
    /** 二级章节覆盖率下限——比一级松，因为二级更容易被合并掉 */
    readonly level2: number;
    /** 保真率下限 */
    readonly fidelity: number;
    /** 溯源密度下限 */
    readonly provenance: number;
    /** 重叠率**上限**：高于它就说明这份素材大部分已经在库里了 */
    readonly overlap: number;
    /** 可寻址下限 */
    readonly addressable: number;
    /**
     * 保真率的样本下限。
     *
     * 低于这个数时只报告臆造、不按比例判定：五个标识符里错一个就是 80%，这个
     * 比例没有意义。但**有臆造仍然要报**——实测里那份编造的摘要靠 5 个标识符
     * 拿到 100% 保真，正是分母太小造成的假合格。
     */
    readonly fidelitySample: number;
}
/** 章节识别的模式与限制。 */
export interface DigestSectionConfig {
    /** 一级章节：中文数字章号，捕获组 1 是章号、组 2 是标题 */
    readonly chapterPattern: string;
    /** 数字编号章节：捕获组 1 是编号、组 2 是标题 */
    readonly numberedPattern: string;
    /** 标题最长多少个字符——再长就不是标题了 */
    readonly maxTitleLength: number;
    /** 最多认到第几级编号（2 表示 `1.1`，3 表示 `1.1.1`） */
    readonly maxDepth: number;
}
/** 术语抽取的参数。 */
export interface DigestTermConfig {
    /** 至少出现几次才算术语 */
    readonly minCount: number;
    readonly minLength: number;
    readonly maxLength: number;
    /** 含这些字符的片段不算术语（虚词与助词） */
    readonly functionPattern: string;
    /** 通用词表：单独出现时不含知识的词 */
    readonly generic: readonly string[];
    /**
     * 源文档里要剔除的行：封面、版权页、修订记录、目录、页眉。
     *
     * 不剔除不行。`版权`、`用友集团`、`本文档描述` 会被 n-gram 当成术语抽出来，
     * 但没有任何一份合格的产物会去覆盖版权声明——留着它们，覆盖率永远上不了
     * 85%，标准也就废了。
     */
    readonly noisePattern: string;
    /** 页标记行（抽取器插入的），不计入正文 */
    readonly pageMarkPattern: string;
    /** 目录行 */
    readonly tocLinePattern: string;
}
/** 英文标识符抽取的参数。 */
export interface DigestIdentifierConfig {
    /** 标识符的形态：带分隔符的名、驼峰词、纯大写缩写 */
    readonly pattern: string;
    readonly minLength: number;
    readonly maxLength: number;
    /**
     * 不承载知识点的通用英文词。
     *
     * 只放功能词和任何技术文档都会有的术语（HTTP、JSON）。**产品与框架缩写不放
     * 这里**——`MDD`、`MDF`、`BIP` 对各自的文档就是核心概念，滤掉等于把知识点
     * 从分母里删掉。
     */
    readonly stop: readonly string[];
}
/** 一份完整的消化验收配置。 */
export interface DigestConfig {
    readonly thresholds: DigestThresholds;
    /** 体积比的预警区间：落在区间外只提示，不作判据 */
    readonly volume: {
        readonly min: number;
        readonly max: number;
    };
    readonly sections: DigestSectionConfig;
    readonly terms: DigestTermConfig;
    readonly identifiers: DigestIdentifierConfig;
    /** 产物页码引用的写法 */
    readonly pageMarkPattern: string;
    /** 约束句的模态词 */
    readonly constraintPattern: string;
    /** 产物 frontmatter 的必填字段 */
    readonly requiredFields: readonly string[];
    /** frontmatter 的已知字段，用于指出多余字段 */
    readonly knownFields: readonly string[];
    /** 编者注的判定：以这些字符开头的行不参与保真检查 */
    readonly noteLinePattern: string;
    /** wikilink 的形态，比对前先剔除 */
    readonly wikilinkPattern: string;
    /** 重叠门禁扫描 vault 的哪几个目录 */
    readonly vaultScopes: readonly string[];
}
/** 默认配置。数值来自 MDD（133 页）与 MDF（1846 页）两份红皮书的实测校准。 */
export declare const DEFAULT_DIGEST_CONFIG: DigestConfig;
/** 配置文件的位置。 */
export declare function digestConfigPath(): string;
/** 读到的一份配置，连同它的来源说明。 */
export interface LoadedDigestConfig {
    readonly config: DigestConfig;
    /** 配置文件的实际路径，便于操作者去改。 */
    readonly path: string;
    /** 配置文件是否存在。 */
    readonly exists: boolean;
    /** 读取或解析失败时的说明；成功时为 undefined。 */
    readonly problem?: string;
}
/**
 * 读配置；没有文件、或文件坏了，都用默认值。
 *
 * 坏文件**不抛错**：验收是只读操作，一份写坏的配置不该让整个检查跑不起来，
 * 只该让人知道「这次用的是默认值」。
 *
 * @returns 配置，以及它从哪来。
 */
export declare function loadDigestConfig(): Promise<LoadedDigestConfig>;
/**
 * 把一份配置写回磁盘，覆盖已有文件。
 *
 * 先写临时文件再改名，与插件里其他几处配置落盘的做法一致：直接覆盖时若进程
 * 中途退出，留下的是半截 JSON，下次读就只能退回默认值了。
 *
 * @param config - 要写入的配置。
 */
export declare function saveDigestConfig(config: DigestConfig): Promise<void>;
/** 把配置里的正则编译出来；编译失败抛错，因为那是配置错误而不是数据问题。 */
export interface DigestPatterns {
    readonly identifier: RegExp;
    readonly chapter: RegExp;
    readonly numbered: RegExp;
    readonly constraint: RegExp;
    readonly pageMark: RegExp;
    readonly tocLine: RegExp;
    readonly sourcePageMark: RegExp;
    readonly sourceNoise: RegExp;
    readonly termFunction: RegExp;
    readonly noteLine: RegExp;
    readonly wikilink: RegExp;
}
/**
 * 把配置里的模式字符串编译成正则。
 * @param config - 配置。
 * @returns 全部模式。
 * @throws 当某个模式不是合法正则时——这必须让人知道，静默退回默认模式会让人
 *   以为自己改的配置生效了。
 */
export declare function compilePatterns(config: DigestConfig): DigestPatterns;
