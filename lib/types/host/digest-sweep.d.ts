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
/**
 * 流水账里对某一组产物的最近一次判定。
 *
 * 它回答的是「这一组**验过没有**」——这件事 `digest_sweep` 自己算不出来，因为
 * 验收记录不在库里，而在 `~/.dsh/` 的流水账里。
 *
 * 为什么要单列这一档：实测里一份文档的两道检查（摸底、门禁）都记了账，而**真正
 * 判定合格的那一次验收发生在仪表之外**——当时运行中的插件版本还没有「第X章」
 * 无空格的修复，走工具会把它认成 58 章、误判不合格，所以验收是在测试里直接调
 * `auditDigest` 跑的。结果是面板显示「2 次检查、合格 0、不合格 0」，读起来像
 * 「这份材料做完了检查、都没给判定」，而真相是判定跑了、只是没留下痕迹。
 *
 * **缺省不是「不合格」，也不是「合格」，是「没人验过」。** 把这三件事混成两件，
 * 报告就会替一份没验过的消化背书。
 */
export interface SweepVerdict {
    readonly outcome: 'pass' | 'fail';
    /** 判定时刻，ISO 字符串。 */
    readonly at: string;
}
/**
 * 源文件路径在对账时用的键。
 *
 * 两个来源的写法不保证一致：日志里是运行当时手敲或拼出来的绝对路径，这边是
 * `path.join(root, rel)` 拼出来的。斜杠方向与大小写都可能不同，所以两边都先
 * 归一化再比——否则对账会静默地一条都配不上，然后把全部组报成「从未验收」。
 *
 * @param file - 源文件的绝对路径。
 * @returns 归一化后的键。
 */
export declare function sourceKey(file: string): string;
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
    /** 流水账里对同一个源的最近一次判定；**从未验收时缺省**。 */
    readonly verdict?: SweepVerdict;
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
    /**
     * 能验收的组里，流水账里**没有任何判定记录**的组数。
     *
     * 「消化进库了，但没人验过」的规模。它必须单独一档：并进「合格」等于替没验过
     * 的消化背书，并进「不合格」则是冤枉——它连不合格都算不上，是没结论。
     */
    readonly neverAudited: number;
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
    /**
     * 源文件路径 → 最近一次判定，由调用方从流水账读出后注入。
     *
     * 用注入而不是让这里自己去读日志：`digest-sweep` 只认文件系统，把 `~/.dsh/`
     * 下的状态引进来，既让它没法单独测，也让「扫一遍库」这件事悄悄依赖另一份
     * 可能存在也可能不存在的文件。
     */
    readonly verdicts?: ReadonlyMap<string, SweepVerdict>;
}): Promise<DigestSweep>;
