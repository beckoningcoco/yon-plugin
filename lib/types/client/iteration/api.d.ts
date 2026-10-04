import { type IterationCreatedPayload, type IterationKind, type IterationListPayload, type IterationRowView, type IterationSeverity, type IterationStatus, type SaveIterationInput, type UpdateIterationInput } from '../../shared/types.ts';
import type { YonPanelKey } from '../locales.ts';
export { ApiError as IterationApiError } from '../request.ts';
/** Which rows a read asks for; `all` is the default. */
export interface IterationQuery {
    readonly status?: IterationStatus | 'all';
    readonly kind?: IterationKind;
}
/** The ledger operations the UI drives. */
export interface IterationApi {
    list(query?: IterationQuery): Promise<IterationListPayload>;
    /** File one row by hand. Unlike the model's path, this never dedupes. */
    create(input: SaveIterationInput): Promise<IterationCreatedPayload>;
    /** Re-triage one row. Only status and severity may change. */
    update(id: string, patch: UpdateIterationInput): Promise<{
        readonly row: IterationRowView;
    }>;
    remove(id: string): Promise<{
        readonly removed: string;
    }>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createIterationApi(): IterationApi;
/**
 * 每个取值的名字在词典里的键。
 *
 * 存的是 `iteration.status.open` 这类键而不是「待处理」这类词：这一屏有四种状态、
 * 三种优先级、两种类型，写死中文就得为英文再写一遍，两遍之间必然漂。类型写成
 * `YonPanelKey` 而不是 `string`，漏一个键时编译就不过。
 */
export declare const KIND_LABEL_KEYS: Readonly<Record<IterationKind, YonPanelKey>>;
/** @see KIND_LABEL_KEYS */
export declare const SEVERITY_LABEL_KEYS: Readonly<Record<IterationSeverity, YonPanelKey>>;
/** @see KIND_LABEL_KEYS */
export declare const STATUS_LABEL_KEYS: Readonly<Record<IterationStatus, YonPanelKey>>;
/** 计数行读得懂的一栏。 */
export interface IterationCounts {
    readonly total: number;
    readonly byStatus: Readonly<Record<IterationStatus, number>>;
    readonly byKind: Readonly<Record<IterationKind, number>>;
}
/**
 * 把一屏行数成一个计数。
 *
 * 在前端算而不是让宿主多返回一个 `summary`：台账就是几十行，面板手里已经有全量，
 * 宿主再折一遍等于把同一个事实存两处，两处迟早不一致。这与 `digest` 的选择相反，
 * 因为那份流水账是追加流、可以到 2000 行，面板不会全取。
 *
 * @param rows - 面板已经拿到的行。
 * @returns 总数与两个分组计数。
 */
export declare function countRows(rows: readonly IterationRowView[]): IterationCounts;
/** 过滤器与排序都要的取值表，导出一次免得组件再拼一遍。 */
export declare const STATUS_FILTERS: readonly (IterationStatus | 'all')[];
/** 三档优先级，按由重到轻。 */
export declare const SEVERITIES: readonly IterationSeverity[];
/** 两种类型。 */
export declare const KINDS: readonly IterationKind[];
