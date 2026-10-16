import type { RunSubprocess } from './datasource-probe.ts';
import type { ReplayDiff, ReplayDiffLine, ReplayDump, ReplayEnvironment, ReplayRun } from '../shared/types.ts';
export type { ReplayDiff, ReplayDiffLine, ReplayDump, ReplayEnvironment, ReplayRun };
/** What the host gives this service that it cannot reach itself. */
export interface ReplayServiceDeps {
    /** `ufjdk/bin` candidates, best first — `java` and `jar` come from one of them. */
    readonly jdkBins: () => Promise<readonly string[]>;
    readonly subprocess: () => RunSubprocess | undefined;
}
/** The service, as the tools and the HTTP routes use it. */
export interface YonReplayService {
    /** Where captures and results live, for a screen that has to name it. */
    readonly workDir: string;
    prepare(input: {
        pid: number;
        className: string;
        port?: number;
        signal?: AbortSignal;
    }): Promise<ReplayEnvironment>;
    environments(): Promise<readonly ReplayEnvironment[]>;
    dumps(): Promise<readonly ReplayDump[]>;
    runs(): Promise<readonly ReplayRun[]>;
    read(runId: string): Promise<ReplayRun>;
    run(input: {
        env: string;
        dump: string;
        className: string;
        methodName: string;
        signal?: AbortSignal;
    }): Promise<ReplayRun>;
    diff(leftId: string, rightId: string): Promise<ReplayDiff>;
}
/**
 * Split one manifest attribute value into lines that satisfy the 72-byte rule.
 *
 * Exported for its own test: this is the part that fails silently. A manifest that
 * violates either rule still gets written, still produces a jar, and still fails
 * later with a `ClassNotFoundException` that names a class that is plainly on disk.
 *
 * @param value - the whole attribute line, `Class-Path: …` included.
 * @returns the lines, continuations already prefixed with their space.
 */
export declare function manifestLines(value: string): string[];
/**
 * Build the service.
 * @param deps - the JDK candidates and the subprocess service.
 * @returns the service.
 */
export declare function createYonReplayService(deps: ReplayServiceDeps): YonReplayService;
