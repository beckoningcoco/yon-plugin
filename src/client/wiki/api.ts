/**
 * The knowledge base calls the UI drives: thin calls against `/yon/api/wiki`.
 *
 * It lives outside the components on purpose, like the other three API clients.
 * The apply world builds one of these and hands the methods to the entry through
 * an inject face, so a component never fetches and never learns a URL.
 *
 * There are only two calls because a vault is not editable from here: its path
 * is a machine fact the operator sets once, and this surface reports rather than
 * configures. Adding a vault is a file edit the panel does not pretend to own.
 */
import { request } from '../request.ts'
import type { WikiListPayload } from '../../shared/types.ts'

// The shared failure keeps this module's name for it, as its siblings do.
export { ApiError as WikiApiError } from '../request.ts'

/** The knowledge base operations the UI drives. */
export interface WikiApi {
  /**
   * Every registered vault, with its page count and index timestamp.
   * @returns the vaults, each marked ready or not.
   */
  listVaults(): Promise<WikiListPayload>

  /**
   * Rebuild one vault's index, or every vault's when none is named.
   * @param vault - a vault id; all of them when omitted.
   * @returns the vaults as they stand after the rebuild.
   */
  rebuildVault(vault?: string): Promise<WikiListPayload>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createWikiApi(): WikiApi {
  return {
    listVaults() {
      return request<WikiListPayload>('/wiki')
    },

    rebuildVault(vault) {
      return request<WikiListPayload>('/wiki/rebuild', {
        method: 'POST',
        body: JSON.stringify(vault === undefined ? {} : { vault }),
      })
    },
  }
}
