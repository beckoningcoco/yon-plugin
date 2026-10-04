import { type BrowserListPayload, type BrowserRunView, type BrowserView, type LaunchBrowserInput, type SaveBrowserInput, type ScanBrowsersPayload, type StopBrowserResult } from '../shared/types.ts';
import { type SystemPorts } from './browser-system.ts';
import { type BrowserConfigStore, type BrowserRunStore } from './browser-store.ts';
/** Why an operation could not be carried out. `not-found` answers 404; the rest answer 400. */
export type BrowserErrorCode = 'invalid-input' | 'not-found' | 'path-missing' | 'profile-unwritable' | 'port-out-of-range' | 'port-in-use' | 'launch-failed';
/**
 * A refusal, with the code the HTTP face maps to a status.
 *
 * There is no `spawn-unavailable`, though an earlier design listed one: it existed for
 * a dependency that might be missing, and there is no longer such a dependency. What
 * took its place is `debugger.available === false`, which is not a failure to spawn but
 * the absence of the *graceful* way to stop. The forceful one still works, so it
 * changes a `method`, not an outcome.
 */
export declare class BrowserError extends Error {
    readonly code: BrowserErrorCode;
    constructor(code: BrowserErrorCode, message: string);
}
/** The panel's whole surface, as the routes and the client use it. */
export interface YonBrowsersService {
    /** The registration document, for the panel to name. */
    readonly configPath: string;
    /** The launch ledger, for the panel to name. */
    readonly runsPath: string;
    list(): Promise<BrowserListPayload>;
    scan(): Promise<ScanBrowsersPayload>;
    save(id: string, input: SaveBrowserInput): Promise<BrowserView>;
    launch(id: string, input: LaunchBrowserInput): Promise<BrowserRunView>;
    stop(runId: string): Promise<StopBrowserResult>;
}
/**
 * Everything the service reaches outside itself for.
 *
 * No default values, for the reason `datasource-probe.ts` injects its runner and
 * `home-service.ts` injects `skillsRoot`: with the real ports as defaults, a case that
 * meant to stub one would reach the machine by forgetting to. The only place the real
 * ones are built is `src/index.ts`.
 */
export interface BrowserDeps extends SystemPorts {
    /**
     * Whether a path exists.
     *
     * The service's single filesystem call, injected like the rest: `list()` needs it to
     * keep `pathExists`/`stale` honest, and `save()` needs it to refuse a path that is not
     * there. Nothing here opens a file.
     */
    exists(path: string): boolean;
    /** The plugin root. The default profile directory hangs off this. */
    readonly hostRoot: string;
}
/**
 * Open the service over its two documents.
 * @param config - the registration document.
 * @param runs - the launch ledger.
 * @param deps - the machine, injected.
 * @returns the service.
 */
export declare function createYonBrowsersService(config: BrowserConfigStore, runs: BrowserRunStore, deps: BrowserDeps): YonBrowsersService;
