/**
 * The iteration ledger's calls and its vocabulary.
 *
 * Unlike its siblings this one is not read-only: the operator triages rows here —
 * accept, fix, drop, delete, or file one by hand. The model's side of the same
 * ledger deliberately stops at append (see `host/iteration-tools.ts`), so every
 * state change on this screen is a person's decision, which is exactly the split
 * the feature exists to keep.
 *
 * It lives outside the component like the other API clients: the apply world
 * builds one and hands the methods to the entry through an inject face, so a
 * component never fetches and never learns a URL.
 */
import { request } from '../request.ts'
import {
  ITERATION_KINDS, ITERATION_SEVERITIES, ITERATION_STATUSES,
  type IterationCreatedPayload, type IterationKind, type IterationListPayload, type IterationRowView,
  type IterationSeverity, type IterationStatus, type SaveIterationInput, type UpdateIterationInput,
} from '../../shared/types.ts'
import type { YonPanelKey } from '../locales.ts'

// The shared failure keeps this module's name for it, as its siblings do.
export { ApiError as IterationApiError } from '../request.ts'

/** Which rows a read asks for; `all` is the default. */
export interface IterationQuery {
  readonly status?: IterationStatus | 'all'
  readonly kind?: IterationKind
}

/** The ledger operations the UI drives. */
export interface IterationApi {
  list(query?: IterationQuery): Promise<IterationListPayload>
  /** File one row by hand. Unlike the model's path, this never dedupes. */
  create(input: SaveIterationInput): Promise<IterationCreatedPayload>
  /** Re-triage one row. Only status and severity may change. */
  update(id: string, patch: UpdateIterationInput): Promise<{ readonly row: IterationRowView }>
  remove(id: string): Promise<{ readonly removed: string }>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createIterationApi(): IterationApi {
  return {
    list(query = {}) {
      const search = new URLSearchParams()
      if (query.status !== undefined && query.status !== 'all') search.set('status', query.status)
      if (query.kind !== undefined) search.set('kind', query.kind)
      const text = search.toString()
      return request<IterationListPayload>(`/iterations${text === '' ? '' : `?${text}`}`)
    },
    create(input) {
      return request<IterationCreatedPayload>('/iterations', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    },
    update(id, patch) {
      return request<{ readonly row: IterationRowView }>(`/iterations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    remove(id) {
      return request<{ readonly removed: string }>(`/iterations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
  }
}

/**
 * 每个取值的名字在词典里的键。
 *
 * 存的是 `iteration.status.open` 这类键而不是「待处理」这类词：这一屏有四种状态、
 * 三种优先级、两种类型，写死中文就得为英文再写一遍，两遍之间必然漂。类型写成
 * `YonPanelKey` 而不是 `string`，漏一个键时编译就不过。
 */
export const KIND_LABEL_KEYS: Readonly<Record<IterationKind, YonPanelKey>> = {
  gap: 'iteration.kind.gap',
  improvement: 'iteration.kind.improvement',
}

/** @see KIND_LABEL_KEYS */
export const SEVERITY_LABEL_KEYS: Readonly<Record<IterationSeverity, YonPanelKey>> = {
  high: 'iteration.severity.high',
  medium: 'iteration.severity.medium',
  low: 'iteration.severity.low',
}

/** @see KIND_LABEL_KEYS */
export const STATUS_LABEL_KEYS: Readonly<Record<IterationStatus, YonPanelKey>> = {
  open: 'iteration.status.open',
  accepted: 'iteration.status.accepted',
  fixed: 'iteration.status.fixed',
  dropped: 'iteration.status.dropped',
}

/** 计数行读得懂的一栏。 */
export interface IterationCounts {
  readonly total: number
  readonly byStatus: Readonly<Record<IterationStatus, number>>
  readonly byKind: Readonly<Record<IterationKind, number>>
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
export function countRows(rows: readonly IterationRowView[]): IterationCounts {
  const byStatus = Object.fromEntries(ITERATION_STATUSES.map(status => [status, 0])) as Record<IterationStatus, number>
  const byKind = Object.fromEntries(ITERATION_KINDS.map(kind => [kind, 0])) as Record<IterationKind, number>
  for (const row of rows) {
    byStatus[row.status] += 1
    byKind[row.kind] += 1
  }
  return { total: rows.length, byStatus, byKind }
}

/** 过滤器与排序都要的取值表，导出一次免得组件再拼一遍。 */
export const STATUS_FILTERS: readonly (IterationStatus | 'all')[] = ['all', ...ITERATION_STATUSES]

/** 三档优先级，按由重到轻。 */
export const SEVERITIES: readonly IterationSeverity[] = ITERATION_SEVERITIES

/** 两种类型。 */
export const KINDS: readonly IterationKind[] = ITERATION_KINDS
