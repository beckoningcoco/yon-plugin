/**
 * The digestion ledger calls the UI drives: thin calls against `/yon/api/digest`.
 *
 * Read-only by design. The ledger is appended by the tools themselves — a browser
 * tab has no business writing a verdict it did not compute, and letting it would
 * turn a record of what happened into a record of what someone typed.
 *
 * It lives outside the component like the other API clients: the apply world
 * builds one and hands the methods to the entry through an inject face, so a
 * component never fetches and never learns a URL.
 */
import { request } from '../request.ts'
import type {
  DigestLogEntryView, DigestLogPayload, DigestSummaryPayload,
} from '../../shared/types.ts'

// The shared failure keeps this module's name for it, as its siblings do.
export { ApiError as DigestApiError } from '../request.ts'

/** The ledger operations the UI drives. */
export interface DigestApi {
  /**
   * The ledger folded into what the panel shows: counts, averages, recent rows.
   * @param recent - how many detail rows to include; the host defaults to 50.
   * @param window - how many recent audits the averages cover; the host defaults to 100.
   * @returns the summary, plus where the log file lives.
   */
  summary(recent?: number, window?: number): Promise<DigestSummaryPayload>

  /**
   * The raw tail of the ledger, oldest first.
   * @param limit - how many entries; the host defaults to 200 and caps at 2000.
   * @returns the entries, plus where the log file lives.
   */
  entries(limit?: number): Promise<DigestLogPayload>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createDigestApi(): DigestApi {
  const query = (params: Record<string, number | undefined>): string => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      search.set(key, String(value))
    }
    const text = search.toString()
    return text === '' ? '' : `?${text}`
  }

  return {
    summary(recent, window) {
      return request<DigestSummaryPayload>(`/digest/summary${query({ recent, window })}`)
    },

    entries(limit) {
      return request<DigestLogPayload>(`/digest/log${query({ limit })}`)
    },
  }
}

/** 一条计量项的中文名，与宿主 `DIGEST_METRIC_LABELS` 一致。 */
export const METRIC_LABELS: Readonly<Record<string, string>> = {
  terms: '术语',
  identifiers: '标识符',
  level1: '一级章节',
  level2: '二级章节',
  constraints: '约束句',
  fidelity: '保真',
  provenance: '溯源',
  overlap: '重叠',
  addressable: '可寻址',
}

/** 面板上显示计量项的顺序。 */
export const METRIC_ORDER: readonly string[] = [
  'terms', 'identifiers', 'level1', 'level2', 'constraints',
  'fidelity', 'provenance', 'overlap', 'addressable',
]

/** 结局的中文名。 */
export const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  pass: '合格',
  fail: '不合格',
  gate: '门禁',
  plan: '摸底',
  sweep: '体检',
}

/** 工具名 → 短标签。 */
export const TOOL_LABELS: Readonly<Record<string, string>> = {
  digest_plan: '摸底',
  digest_audit: '验收',
  digest_sweep: '体检',
}

/**
 * One entry rendered as the one line a reader needs.
 *
 * Exported because the panel's list and its detail row must agree on the wording
 * — a second formatter would drift.
 * @param entry - the ledger row.
 * @returns the line.
 */
export function entryLine(entry: DigestLogEntryView): string {
  const tool = TOOL_LABELS[entry.tool] ?? entry.tool
  const outcome = OUTCOME_LABELS[entry.outcome] ?? entry.outcome
  if (entry.outcome === 'sweep') {
    return `${tool} ${entry.scanned ?? 0} 份 → 合格 ${entry.passing ?? 0} / 不合格 ${entry.failing ?? 0}`
  }
  if (entry.outcome === 'plan') {
    return `${tool} ${entry.chapters ?? 0} 章`
  }
  const terms = entry.metrics.terms
  const score = typeof terms === 'number' ? `术语 ${(terms * 100).toFixed(1)}%` : ''
  return `${tool} ${outcome}${score === '' ? '' : ` · ${score}`}`
}
