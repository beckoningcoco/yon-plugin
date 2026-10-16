/** One run's measurement of one method. */
export interface BaselineSample {
    /** When the run finished, in epoch milliseconds. */
    readonly at: number;
    /** How many calls were observed. */
    readonly hits: number;
    /** Each observed call's own cost, in microseconds, in the order they were traced. */
    readonly costsUs: readonly number[];
    readonly avgUs: number;
    readonly minUs: number;
    readonly maxUs: number;
    /** The thread the calls ran on, when the target named one. */
    readonly thread: string;
}
/** What changed since the previous run of the same method. */
export interface BaselineShift {
    readonly previous: BaselineSample;
    /** Average cost relative to the previous run, minus 1: `0.25` means 25% slower. */
    readonly delta: number;
    /**
     * Minimum cost relative to the previous run.
     *
     * The minimum is the one figure a single slow call cannot move, and method costs are
     * frequently spiky. Measured on `BgrReportSyncServiceImpl#now`: two runs of five calls each
     * had minima of 47.6 ms and 46.6 ms — **no change** — while their averages read 80.3 ms and
     * 99.9 ms, a "+24.5% slower" that was one outlier rather than anything the code did. A
     * reader shown only the average would conclude a method had regressed when it had not.
     */
    readonly minDelta: number;
}
/** Where one method's history is kept. */
export declare function baselinePath(className: string, methodName: string): string;
/**
 * Summarise one run's costs.
 *
 * @returns undefined when nothing was observed — an empty summary would be a baseline
 * that claims a method takes no time.
 */
export declare function summarise(costsUs: readonly number[], thread: string, at?: number): BaselineSample | undefined;
/**
 * Append one run to a history file, and report what the previous run measured.
 *
 * The path is an argument rather than derived here, so the function has no opinion about
 * where the operator's files live and can be tested against a temporary file.
 *
 * @returns undefined when this is the first run, so a caller can say "first measurement"
 * rather than inventing a comparison against nothing.
 */
export declare function appendBaseline(path: string, sample: BaselineSample): Promise<BaselineShift | undefined>;
/** The newest readable sample in one file, or undefined when there is none. */
export declare function readLastBaseline(path: string): Promise<BaselineSample | undefined>;
