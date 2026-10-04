/**
 * The browser surface's calls.
 *
 * Five of them, one per route, plus the one label table this surface needs. The browser
 * ids, the families and the paths all come from the host already spelled the way they are
 * stored, so there is nothing to name — but the liveness verdict is a value the surface
 * draws, and it is named here the way the iteration ledger names its own enumerations.
 *
 * It lives outside the component like its siblings: the apply world builds one and hands
 * the methods to the entry through an inject face, so a component never fetches and never
 * learns a URL.
 */
import { request } from '../request.ts'
import type { YonPanelKey } from '../locales.ts'
import type {
  BrowserListPayload, BrowserView, LaunchBrowserInput, SaveBrowserInput,
  ScanBrowsersPayload, StopBrowserResult, BrowserRunView,
} from '../../shared/types.ts'

// The shared failure keeps this module's name for it, as its siblings do.
export { ApiError as BrowserApiError } from '../request.ts'

/** The browser operations the UI drives. */
export interface BrowserApi {
  /** Every registration, every remembered run, and how much of that could be read. */
  listBrowsers(): Promise<BrowserListPayload>
  /** Re-scan this machine and store what was found. */
  scanBrowsers(): Promise<ScanBrowsersPayload>
  /** Edit one row. The id is in the path and is not editable. */
  saveBrowser(id: string, patch: SaveBrowserInput): Promise<{ readonly browser: BrowserView }>
  /**
   * Start one, with a debugging port.
   *
   * An empty input is the normal call: every member means "use what this row remembers",
   * and the surface saves the form before it gets here, so sending members would be a
   * second, unsaved copy of the same settings.
   */
  launchBrowser(id: string, input: LaunchBrowserInput): Promise<{ readonly run: BrowserRunView }>
  /** End one this panel started. */
  stopBrowser(runId: string): Promise<StopBrowserResult>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createBrowserApi(): BrowserApi {
  return {
    listBrowsers() {
      return request<BrowserListPayload>('/browsers')
    },
    scanBrowsers() {
      return request<ScanBrowsersPayload>('/browsers/scan', { method: 'POST' })
    },
    saveBrowser(id, patch) {
      return request<{ readonly browser: BrowserView }>(
        `/browsers/${encodeURIComponent(id)}`,
        { method: 'PUT', body: JSON.stringify(patch) },
      )
    },
    launchBrowser(id, input) {
      return request<{ readonly run: BrowserRunView }>(
        `/browsers/${encodeURIComponent(id)}/launch`,
        { method: 'POST', body: JSON.stringify(input) },
      )
    },
    stopBrowser(runId) {
      return request<StopBrowserResult>(
        `/browsers/runs/${encodeURIComponent(runId)}/stop`,
        { method: 'POST' },
      )
    },
  }
}

/**
 * What each liveness verdict is called in the dictionary.
 *
 * The keys rather than the words, as the iteration ledger's tables do it: the same three
 * states have to read in two languages, and writing the words here means writing them
 * twice and having the two drift. Typed `YonPanelKey`, so a renamed key fails the build
 * instead of rendering its own name at whoever is looking.
 */
export const ALIVE_LABEL_KEYS: Readonly<Record<BrowserRunView['alive'], YonPanelKey>> = {
  alive: 'browser.alive.alive',
  gone: 'browser.alive.gone',
  unknown: 'browser.alive.unknown',
}
