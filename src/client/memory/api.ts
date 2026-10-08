/**
 * 记忆库的调用与它的词汇。
 *
 * 与其余面板不同，这一屏**没有新增与修改**：记忆是「某人查出来的事实」，把它做成
 * 一个可以让使用者填写的表单，就等于允许凭印象编一条。写与改都是模型那边的事
 * （`host/memory-tools.ts` 的四个工具），这一屏给人做的是**看和删**——所以它的
 * 客户端只有三个方法，其中两个是读。
 *
 * 调用方式与其余面板一致：api 客户端在 apply 世界里建好，通过 inject face 交给组件，
 * 所以组件从不发请求、也不知道 URL。
 */
import { request } from '../request.ts'
import {
  MEMORY_TYPES,
  type MemoryListPayload, type MemoryType, type MemoryView,
} from '../../shared/types.ts'
import type { YonPanelKey } from '../locales.ts'

// 共用的失败类型沿用本模块的名字，与其余面板一致。
export { ApiError as MemoryApiError } from '../request.ts'

/** 一次列表读要带的条件；全部省略就是整个库。 */
export interface MemoryQuery {
  readonly project?: string
  readonly type?: MemoryType
  readonly tag?: string
  readonly query?: string
}

/** 这一屏会调的操作。 */
export interface MemoryApi {
  list(query?: MemoryQuery): Promise<MemoryListPayload>
  read(id: string): Promise<{ readonly memory: MemoryView }>
  /** 删除一条。面板问两次才走到这里，安全那一步属于界面。 */
  remove(id: string): Promise<{ readonly removed: string }>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createMemoryApi(): MemoryApi {
  return {
    list(query = {}) {
      const search = new URLSearchParams()
      if (query.project !== undefined && query.project !== '') search.set('project', query.project)
      if (query.type !== undefined) search.set('type', query.type)
      if (query.tag !== undefined && query.tag !== '') search.set('tag', query.tag)
      if (query.query !== undefined && query.query !== '') search.set('query', query.query)
      const text = search.toString()
      return request<MemoryListPayload>(`/memories${text === '' ? '' : `?${text}`}`)
    },
    read(id) {
      return request<{ readonly memory: MemoryView }>(`/memories/${encodeURIComponent(id)}`)
    },
    remove(id) {
      return request<{ readonly removed: string }>(`/memories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  }
}

/**
 * 每个取值的名字在词典里的键。
 *
 * 存键而不是中文，理由与 `iteration/api.ts:74-79` 相同：五种类型写死中文就得为英文
 * 再写一遍，两遍之间必然漂。类型写成 `YonPanelKey`，漏一个键时编译就不过。
 */
export const TYPE_LABEL_KEYS: Readonly<Record<MemoryType, YonPanelKey>> = {
  pitfall: 'memory.type.pitfall',
  'env-fact': 'memory.type.envFact',
  decision: 'memory.type.decision',
  preference: 'memory.type.preference',
  lesson: 'memory.type.lesson',
}

/**
 * 筛选器上那一排类型，**按「先看会让人做错的」排**：坑与环境事实不知道就会出事，
 * 做法与决定是背景。顺序与 `MEMORY_TYPES` 同源，不另抄一份。
 */
export const TYPES: readonly MemoryType[] = MEMORY_TYPES

/** 一屏记忆按类型数的个数，给顶部那行计数用。 */
export function countTypes(rows: readonly { readonly type: MemoryType }[]): Readonly<Record<MemoryType, number>> {
  const counts = Object.fromEntries(MEMORY_TYPES.map(type => [type, 0])) as Record<MemoryType, number>
  for (const row of rows) counts[row.type] += 1
  return counts
}
