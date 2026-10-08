import { type MemoryListPayload, type MemoryType, type MemoryView } from '../../shared/types.ts';
import type { YonPanelKey } from '../locales.ts';
export { ApiError as MemoryApiError } from '../request.ts';
/** 一次列表读要带的条件；全部省略就是整个库。 */
export interface MemoryQuery {
    readonly project?: string;
    readonly type?: MemoryType;
    readonly tag?: string;
    readonly query?: string;
}
/** 这一屏会调的操作。 */
export interface MemoryApi {
    list(query?: MemoryQuery): Promise<MemoryListPayload>;
    read(id: string): Promise<{
        readonly memory: MemoryView;
    }>;
    /** 删除一条。面板问两次才走到这里，安全那一步属于界面。 */
    remove(id: string): Promise<{
        readonly removed: string;
    }>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createMemoryApi(): MemoryApi;
/**
 * 每个取值的名字在词典里的键。
 *
 * 存键而不是中文，理由与 `iteration/api.ts:74-79` 相同：五种类型写死中文就得为英文
 * 再写一遍，两遍之间必然漂。类型写成 `YonPanelKey`，漏一个键时编译就不过。
 */
export declare const TYPE_LABEL_KEYS: Readonly<Record<MemoryType, YonPanelKey>>;
/**
 * 筛选器上那一排类型，**按「先看会让人做错的」排**：坑与环境事实不知道就会出事，
 * 做法与决定是背景。顺序与 `MEMORY_TYPES` 同源，不另抄一份。
 */
export declare const TYPES: readonly MemoryType[];
/** 一屏记忆按类型数的个数，给顶部那行计数用。 */
export declare function countTypes(rows: readonly {
    readonly type: MemoryType;
}[]): Readonly<Record<MemoryType, number>>;
