import type { DigestLogEntryView, DigestLogPayload, DigestSummaryPayload } from '../../shared/types.ts';
export { ApiError as DigestApiError } from '../request.ts';
/** The ledger operations the UI drives. */
export interface DigestApi {
    /**
     * The ledger folded into what the panel shows: counts, averages, recent rows.
     * @param recent - how many detail rows to include; the host defaults to 50.
     * @param window - how many recent audits the averages cover; the host defaults to 100.
     * @returns the summary, plus where the log file lives.
     */
    summary(recent?: number, window?: number): Promise<DigestSummaryPayload>;
    /**
     * The raw tail of the ledger, oldest first.
     * @param limit - how many entries; the host defaults to 200 and caps at 2000.
     * @returns the entries, plus where the log file lives.
     */
    entries(limit?: number): Promise<DigestLogPayload>;
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
 * Exported because the panel's list and its detail row must agree on the wording
 * — a second formatter would drift.
 * @param entry - the ledger row.
 * @returns the line.
 */
export declare function entryLine(entry: DigestLogEntryView): string;
