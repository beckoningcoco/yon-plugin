import { type MemoryStore } from './memory-store.ts';
import type { YonProjectsService } from './service.ts';
/** 体检报出的一类问题。 */
export type SweepCheck = 'index-drift' | 'orphan' | 'no-source' | 'too-long' | 'overlap' | 'stale';
/** 一条被点名的问题记录。`title` 空着表示这个文件读不出来。 */
export interface SweepItem {
    readonly id: string;
    readonly title: string;
}
/** 一项检查在一个项目上的结论。 */
export interface SweepFinding {
    readonly check: SweepCheck;
    /**
     * 这一条要不要一个人拿主意。
     *
     * 只有 `index-drift` 是 false：索引能从文件重建，所以那是一处可以由 `repair` 直接
     * 抹掉的毛病。其余五项都要判断——判断一条结论还成不成立，不是体检能做的事。
     */
    readonly needsPerson: boolean;
    /** 空字符串表示这项与某个项目无关（索引漂移是整个库的事）。 */
    readonly projectId: string;
    readonly projectName: string;
    readonly detail: string;
    readonly items: readonly SweepItem[];
}
/** 一次重建索引的结果。 */
export interface SweepRepair {
    /** 重建之后索引里有多少条。 */
    readonly records: number;
    /** 文件在、索引原先没有的条数——找回来的。 */
    readonly added: number;
    /** 索引原先有、文件已经读不出来的条数——只能丢掉的。 */
    readonly dropped: number;
}
/** 一次体检的报告。 */
export interface MemorySweepReport {
    readonly root: string;
    readonly path: string;
    /** 库里的记忆条数（以能读出来的文件为准）。 */
    readonly total: number;
    readonly findings: readonly SweepFinding[];
    /** 只在 `repair: true` 时出现。 */
    readonly repair?: SweepRepair;
}
/**
 * 两个标题有多像：字符二元组的 Jaccard 重叠。
 *
 * 刻意是最笨的一种：模糊匹配需要一个没人能论证的阈值，而这里错了的代价只是「多出一行
 * 让人多看一眼」——比漏掉真正重复的一对便宜得多。
 * @param a - one title.
 * @param b - the other.
 * @returns 0 … 1.
 */
export declare function titleOverlap(a: string, b: string): number;
/**
 * 体检一整个记忆库。
 *
 * @param store - the bank. Reading it is all this does, unless `repair` is asked for.
 * @param projects - the operator's projects, for naming and for spotting orphans.
 * @param options - `repair` to rebuild `index.json` from the files; `now` for the age checks.
 * @returns the report. A broken index is reported, never thrown: seeing the report is how
 *   somebody learns the index is broken, so failing to produce one would hide the finding.
 */
export declare function sweepMemories(store: MemoryStore, projects: YonProjectsService, options?: {
    readonly repair?: boolean;
    readonly now?: Date;
}): Promise<MemorySweepReport>;
