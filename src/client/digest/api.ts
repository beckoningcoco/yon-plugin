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
import type { DigestLogEntryView, DigestSummaryPayload } from '../../shared/types.ts'
import type { YonPanelKey } from '../locales.ts'

// The shared failure keeps this module's name for it, as its siblings do.
export { ApiError as DigestApiError } from '../request.ts'

/** The ledger operations the UI drives. */
export interface DigestApi {
  /**
   * The ledger folded into what the panel shows: counts, averages, recent rows.
   *
   * One call, not two. The host's `summary` already carries the recent entries, so
   * a second call for the raw tail would fetch the same rows twice and then let
   * one copy shadow the other — which is exactly what the first revision did.
   * @param recent - how many detail rows to include; the host defaults to 50 and caps at 200.
   * @param window - how many recent audits the averages cover; the host defaults to 100.
   * @returns the summary, plus where the log file lives.
   */
  summary(recent?: number, window?: number): Promise<DigestSummaryPayload>
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

/**
 * 每一项的说明在词典里的键。
 *
 * 这一屏上每个词都是这套流程的内部术语——摸底、门禁、保真、溯源——它们此前只
 * 存在于工具报告和 skill 里。**一个要先读文档才能读懂的面板，等于没把结果交付
 * 出去**，所以每项都要有一句话解释它是什么、阈值多少。类型写成 `YonPanelKey`
 * 而不是 `string`：漏一个键时编译就不过。
 */
export const METRIC_ABOUT_KEYS: Readonly<Record<string, YonPanelKey>> = {
  terms: 'digest.metricTermsAbout',
  identifiers: 'digest.metricIdentifiersAbout',
  level1: 'digest.metricLevel1About',
  level2: 'digest.metricLevel2About',
  constraints: 'digest.metricConstraintsAbout',
  fidelity: 'digest.metricFidelityAbout',
  provenance: 'digest.metricProvenanceAbout',
  overlap: 'digest.metricOverlapAbout',
  addressable: 'digest.metricAddressableAbout',
}

/** 结局的中文名。 */
export const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  pass: '合格',
  fail: '不合格',
  gate: '门禁',
  plan: '摸底',
  sweep: '体检',
}

/**
 * One entry's **content**, without naming its tool or its outcome.
 *
 * Both of those are already on the row — the outcome is the badge on the right, the
 * tool is in the label — so repeating them here produced rows like
 * 「摸底 3 章摸底」. The line's job is to say *what the run found*, nothing else.
 *
 * Two outcomes deliberately report no score:
 * - a **plan** has no verdict at all, only a chapter count;
 * - a **gate** run's product IS the source document, so every coverage figure is
 *   necessarily 100%. That is a denominator cancelling out, not a measurement —
 *   showing it would dress up "nothing was measured" as "measured, and perfect".
 *
 * @param entry - the ledger row.
 * @returns the line.
 */
export function entryLine(entry: DigestLogEntryView): string {
  if (entry.outcome === 'sweep') {
    const line = `${entry.scanned ?? 0} 份 → 合格 ${entry.passing ?? 0} / 不合格 ${entry.failing ?? 0}`
    // 「未验收」单独报。它是第三种结局：既不是合格也不是不合格，而是压根没人看过
    // ——并进任何一边都是替一份没人验过的消化下结论。为 0 时不显示，因为那时
    // 「全都验过」和「这条记录没有这个数」本来就该长得一样。
    const never = entry.neverAudited ?? 0
    return never > 0 ? `${line} / 未验收 ${never}` : line
  }
  if (entry.outcome === 'plan') {
    // 「6 章」孤零零地摆在宽列中间，读者不知道是什么的 6 章；带上动词才自明。
    return `识别到 ${entry.chapters ?? 0} 章`
  }
  if (entry.outcome === 'gate') {
    return entry.source.split(/[\\/]/).pop() ?? entry.source
  }
  const terms = entry.metrics.terms
  if (typeof terms === 'number') return `术语 ${(terms * 100).toFixed(1)}%`
  return entry.product === '' ? entry.label : entry.product
}
