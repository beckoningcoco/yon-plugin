import type { DigestLogEntryView, DigestSummaryPayload } from '../../shared/types.ts';
export { ApiError as DigestApiError } from '../request.ts';
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
    summary(recent?: number, window?: number): Promise<DigestSummaryPayload>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createDigestApi(): DigestApi;
/** 一条计量项的中文名，与宿主 `DIGEST_METRIC_LABELS` 一致。 */
export declare const METRIC_LABELS: Readonly<Record<string, string>>;
/** 面板上显示计量项的顺序。 */
export declare const METRIC_ORDER: readonly string[];
/** 结局的中文名。 */
export declare const OUTCOME_LABELS: Readonly<Record<string, string>>;
/** 工具名 → 短标签。 */
export declare const TOOL_LABELS: Readonly<Record<string, string>>;
/**
 * One entry rendered as the one line a reader needs.
 *
 * The wording lives here rather than inline in the list so the compact row and any
 * future detail view cannot drift apart on what a sweep or a plan reads as.
 * @param entry - the ledger row.
 * @returns the line.
 */
export declare function entryLine(entry: DigestLogEntryView): string;
