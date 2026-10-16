import type { RunSubprocess } from './datasource-probe.ts';
import { type ArthasResponse, type ArthasResult } from './arthas-http.ts';
import type { ArthasStore } from './arthas-store.ts';
import type { ArthasPanelPayload, ArthasSessionDetail, ArthasTargetsPayload } from '../shared/types.ts';
/** Where a session is in its life. */
export type ArthasWatchState = 'watching' | 'settled' | 'failed' | 'stopped';
/**
 * One observation session, as the tools drive it.
 *
 * The mutable fields are mutable on purpose: this object *is* the session, and the
 * background request writes its outcome into it as it arrives. The panel never
 * touches it — it reads the immutable `ArthasSessionView` built from it.
 */
export interface ArthasWatchHandle {
    readonly id: string;
    readonly pid: number;
    readonly port: number;
    readonly command: string;
    /** The class being observed; absent for a session started by hand. */
    readonly className?: string;
    readonly startedAt: number;
    /** The `-n` value: how many hits this session will collect at most. */
    readonly expected: number;
    /**
     * How many results a reader has already been handed.
     *
     * A read cursor rather than part of the session's own story: `arthas_events`
     * defaults to "only what is new", and something has to remember where the last
     * read stopped. It belongs here rather than in the tool because a session can be
     * read more than once — a retry, a second question about the same run — and a
     * cursor kept in the calling code would silently re-deliver or skip.
     */
    delivered: number;
    /** Cancels the in-flight request. Owned by the session, not by a tool call. */
    readonly controller: AbortController;
    /** Resolves when the command finishes, however it finishes. */
    settled: Promise<void>;
    state: ArthasWatchState;
    results: readonly ArthasResult[];
    response?: ArthasResponse;
    /** Why it failed, or what `stop` did to it. */
    message?: string;
}
/** What {@link YonArthasService.startWatch} needs. */
export interface StartWatchInput {
    readonly pid: number;
    readonly port: number;
    readonly command: string;
    readonly className?: string;
    readonly expected: number;
}
/** One audit row to record. */
export interface AuditInput {
    readonly kind: string;
    readonly pid: number;
    readonly port: number;
    readonly command: string;
    /** True for the arbitrary-code-execution kind. */
    readonly risky?: boolean;
    readonly outcome?: string;
}
/** What the host gives this service that it cannot reach itself. */
export interface ArthasServiceDeps {
    readonly store: ArthasStore;
    /** `ufjdk/bin` candidates, best first. */
    readonly jdkBins: () => Promise<readonly string[]>;
    /** The subprocess service, when this deployment has one. */
    readonly subprocess: () => RunSubprocess | undefined;
}
/** The service, as the tools and the HTTP routes use it. */
export interface YonArthasService {
    /** The registration document, for a screen that has to name it. */
    readonly storePath: string;
    startWatch(input: StartWatchInput): ArthasWatchHandle;
    watch(id: string): ArthasWatchHandle | undefined;
    audit(input: AuditInput): void;
    panel(): Promise<ArthasPanelPayload>;
    detail(id: string): ArthasSessionDetail | undefined;
    targets(port?: number): Promise<ArthasTargetsPayload>;
    attach(pid: number, port?: number, signal?: AbortSignal): Promise<ArthasTargetsPayload>;
    stop(id: string, signal?: AbortSignal): Promise<ArthasSessionDetail>;
}
/** The service and the disposer that ends its sessions. */
export interface YonArthasHandle {
    readonly service: YonArthasService;
    dispose(): void;
}
/**
 * Build the service.
 * @param deps - the store, the JDK candidates, and the subprocess service.
 * @returns the service and its disposer.
 */
export declare function createYonArthasService(deps: ArthasServiceDeps): YonArthasHandle;
