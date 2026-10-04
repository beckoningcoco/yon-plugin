import type { YonPanelKey } from '../locales.ts';
import type { BrowserListPayload, BrowserView, LaunchBrowserInput, SaveBrowserInput, ScanBrowsersPayload, StopBrowserResult, BrowserRunView } from '../../shared/types.ts';
export { ApiError as BrowserApiError } from '../request.ts';
/** The browser operations the UI drives. */
export interface BrowserApi {
    /** Every registration, every remembered run, and how much of that could be read. */
    listBrowsers(): Promise<BrowserListPayload>;
    /** Re-scan this machine and store what was found. */
    scanBrowsers(): Promise<ScanBrowsersPayload>;
    /** Edit one row. The id is in the path and is not editable. */
    saveBrowser(id: string, patch: SaveBrowserInput): Promise<{
        readonly browser: BrowserView;
    }>;
    /**
     * Start one, with a debugging port.
     *
     * An empty input is the normal call: every member means "use what this row remembers",
     * and the surface saves the form before it gets here, so sending members would be a
     * second, unsaved copy of the same settings.
     */
    launchBrowser(id: string, input: LaunchBrowserInput): Promise<{
        readonly run: BrowserRunView;
    }>;
    /** End one this panel started. */
    stopBrowser(runId: string): Promise<StopBrowserResult>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createBrowserApi(): BrowserApi;
/**
 * What each liveness verdict is called in the dictionary.
 *
 * The keys rather than the words, as the iteration ledger's tables do it: the same three
 * states have to read in two languages, and writing the words here means writing them
 * twice and having the two drift. Typed `YonPanelKey`, so a renamed key fails the build
 * instead of rendering its own name at whoever is looking.
 */
export declare const ALIVE_LABEL_KEYS: Readonly<Record<BrowserRunView['alive'], YonPanelKey>>;
