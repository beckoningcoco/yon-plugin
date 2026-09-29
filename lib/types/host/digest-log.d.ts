/** 一次检查的结局。 */
export type DigestOutcome = 
/** 全部通过。 */
'pass'
/** 有项目不合格。 */
 | 'fail'
/** 只跑门禁，不作判定。 */
 | 'gate'
/** 摸底，没有合格与否可言。 */
 | 'plan'
/** 批量体检的汇总行。 */
 | 'sweep';
/** 流水账里的一行。 */
export interface DigestLogEntry {
    /** ISO 时间戳。 */
    readonly at: string;
    /** 哪个工具：`digest_plan` / `digest_audit` / `digest_sweep`。 */
    readonly tool: string;
    readonly outcome: DigestOutcome;
    /** 报告抬头用的名字。 */
    readonly label: string;
    /** 源文档路径。 */
    readonly source: string;
    /** 产物显示名；一组文件时是「首名 等 N 页」。 */
    readonly product: string;
    /** 产物文件数。 */
    readonly pages: number;
    /** 未通过的项目名，按报告顺序。 */
    readonly failed: readonly string[];
    /** 七项实测值，null 表示该项不适用。 */
    readonly metrics: Readonly<Record<string, number | null>>;
    /** 源文档字节数。 */
    readonly sourceBytes: number;
    /** 产物字节数。 */
    readonly productBytes: number;
    /** 本次耗时毫秒。 */
    readonly ms: number;
    /** 批量体检专用：扫了多少份。 */
    readonly scanned?: number;
    /** 批量体检专用：多少组合格。 */
    readonly passing?: number;
    /** 批量体检专用：多少组不合格。 */
    readonly failing?: number;
    /**
     * 批量体检专用：能验收的组里，流水账**没有任何判定记录**的组数。
     *
     * 与 `failing` 并列而不是合并：没验过的既不是合格也不是不合格，混进任何一边
     * 都是替一份没人看过的消化下结论。
     */
    readonly neverAudited?: number;
    /** 摸底专用：识别到几章。 */
    readonly chapters?: number;
}
/** 计量项的名字，面板按这个顺序显示。 */
export declare const DIGEST_METRIC_KEYS: readonly ["terms", "identifiers", "level1", "level2", "constraints", "fidelity", "provenance", "overlap", "addressable"];
/** 一条计量项的中文名。 */
export declare const DIGEST_METRIC_LABELS: Readonly<Record<string, string>>;
/** 折起来之后的流水账。 */
export interface DigestLogSummary {
    /** 一共多少条。 */
    readonly total: number;
    /** 最早一条的时间；空日志时缺省。 */
    readonly since?: string;
    /** 均值实际覆盖了多少次验收（有判定的那些）。面板用它写明依据。 */
    readonly averagedOver: number;
    /** 按结局计数。 */
    readonly byOutcome: Readonly<Record<string, number>>;
    /** 按工具计数。 */
    readonly byTool: readonly {
        readonly tool: string;
        readonly count: number;
    }[];
    /**
     * 每条计量项的最近表现：最近 N 次里该有值的那些条目上算的均值。
     * 这是面板上「分数」那一栏的数据来源——**看趋势，不看单次**。
     */
    readonly averages: Readonly<Record<string, number | null>>;
    /** 最近若干条，新的在前。 */
    readonly recent: readonly DigestLogEntry[];
}
/** 流水账，服务层看到的样子。 */
export interface DigestLog {
    /**
     * 追加一条；永不抛错。
     * @param entry - 条目，时间戳由这里补。
     */
    record(entry: Omit<DigestLogEntry, 'at'>): Promise<void>;
    /**
     * 读日志尾部，旧的在先。
     * @param limit - 最多读多少条；默认 2000。
     */
    read(limit?: number): Promise<readonly DigestLogEntry[]>;
    /**
     * 折成面板要的形状。
     * @param recent - 返回多少条明细；默认 50。
     * @param window - 均值在最近多少条上算；默认 100。
     */
    summary(recent?: number, window?: number): Promise<DigestLogSummary>;
}
/** 日志文件的位置。 */
export declare function digestLogPath(): string;
/**
 * 建流水账。
 * @param target - 要追加的文件；省略时用默认路径。
 * @returns 流水账。
 */
export declare function createDigestLog(target?: string): DigestLog;
