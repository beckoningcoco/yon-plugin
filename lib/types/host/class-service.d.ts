/**
 * The class index, as the panel and the model use it.
 *
 * This layer owns three things the index file does not:
 *
 * - **One build per version at a time.** The panel's button is one click away from being
 *   pressed twice, and two walks of the same installation would both write the same file.
 * - **A build reported rather than awaited.** `startBuild` returns the moment the work is
 *   queued, and the state it reports is what the panel polls. A walk measured at 26.2 s on
 *   the reference Home is not something to hold an HTTP response open for.
 * - **A status that is cheap enough to poll.** It reads each index file's head rather than
 *   parsing it — see `summaryOf` in `class-index.ts` for the measurement. Without that,
 *   the panel's progress poll would parse a 43 MB document once a second.
 *
 * ## Where the Home comes from
 *
 * The service is handed a `resolve` function rather than the registrations themselves,
 * the same seam `meta-service.ts` uses and for the same reason: `home-service.ts` already
 * reads each row's class-index summary, so a direct import would be a cycle.
 *
 * ## Both callers, one implementation
 *
 * The tool waits for its build; the panel watches one. They are the same walk, so they
 * share the state map — a build the model started is visible in the panel, and starting
 * one from either side while the other runs joins it instead of racing it.
 */
import { type BuildProgress, type ClassIndex, type StoredIndex } from './class-index.ts';
import type { ClassIndexStatusView } from '../shared/types.ts';
/** One Home, as this service needs it. */
export interface ClassHome {
    readonly id: string;
    readonly path: string;
    readonly version: string;
}
/** What a finished build produced, for the tool that asked for it. */
export interface ClassBuildResult {
    /** The Home's id, not its path: the model addresses it by id everywhere else. */
    readonly home: string;
    readonly version: string;
    readonly totalJars: number;
    readonly totalClasses: number;
    /** Where the index was written. */
    readonly path: string;
    /** How long the walk took, in seconds. */
    readonly seconds: number;
}
/** What `startBuild` was asked to do, and whether it was already being done. */
export interface ClassBuildHandle {
    readonly started: boolean;
    readonly status: ClassIndexStatusView;
}
/** The class index, as the tools and the panel use it. */
export interface YonClassService {
    status(homeId: string): Promise<ClassIndexStatusView>;
    startBuild(homeId: string): Promise<ClassBuildHandle>;
    /** Build and wait for it, which is what a tool call needs. */
    build(homeId: string): Promise<ClassBuildResult>;
    remove(homeId: string): Promise<boolean>;
    dispose(): void;
}
/**
 * Open the service.
 *
 * @param resolve - look one registered Home up by id.
 * @param build - the walker, injected so a case can run it without a real installation.
 * @param write - where a built index goes, injected for the same reason.
 * @param list - where the stored indexes come from. Defaults to the real directory; a
 *   case hands it its own answer so that neither half touches the operator's disk.
 * @param drop - how an index is removed, injected alongside `list`.
 * @returns the service.
 */
export declare function createYonClassService(resolve: (id: string) => Promise<ClassHome>, build: (home: string, version: string, onProgress: (progress: BuildProgress) => void) => Promise<ClassIndex>, write: (built: ClassIndex) => Promise<string>, list?: () => Promise<readonly StoredIndex[]>, drop?: (version: string) => Promise<boolean>): YonClassService;
