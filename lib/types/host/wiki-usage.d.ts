/** One question put to the knowledge base. */
export interface WikiUsageEntry {
    /** ISO timestamp of the call. */
    readonly at: string;
    /** Which tool was called. */
    readonly tool: string;
    /** The term or page name it was called with. */
    readonly term: string;
    /** Vault the caller restricted to, when it restricted. */
    readonly vault?: string;
    /** How many pages came back; zero is the interesting value. */
    readonly hits: number;
    /** The first page returned, when there was one. */
    readonly top?: string;
}
/** A term the knowledge base was asked for and could not answer. */
export interface WikiUsageMiss {
    readonly term: string;
    /** How many times it was asked. */
    readonly count: number;
    /** The most recent time it was asked, ISO. */
    readonly last: string;
}
/** What the log says once it is folded. */
export interface WikiUsageSummary {
    /** How many questions the log holds. */
    readonly total: number;
    /** Terms that came back empty, most-asked first. */
    readonly misses: readonly WikiUsageMiss[];
    /** Terms asked most often, whatever the answer was. */
    readonly popular: readonly {
        readonly term: string;
        readonly count: number;
    }[];
    /** The oldest entry the log still holds, ISO; absent when it holds none. */
    readonly since?: string;
}
/** The log, as the service uses it. */
export interface WikiUsageLog {
    /**
     * Append one question; never throws.
     * @param entry - the entry, without its timestamp.
     */
    record(entry: Omit<WikiUsageEntry, 'at'>): Promise<void>;
    /**
     * The tail of the log, oldest first.
     * @param limit - how many entries to keep; 5000 when omitted.
     */
    read(limit?: number): Promise<readonly WikiUsageEntry[]>;
    /**
     * Fold the log into what it is for: what could not be answered.
     * @param limit - how many rows to report per list; 15 when omitted.
     */
    summary(limit?: number): Promise<WikiUsageSummary>;
}
/** Where the log lives. */
export declare function usageLogPath(): string;
/**
 * Build the usage log.
 * @param target - the file to append to; the default path when omitted.
 * @returns the log.
 */
export declare function createWikiUsageLog(target?: string): WikiUsageLog;
