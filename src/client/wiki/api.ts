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
import type { WikiListPayload, WikiLogEntry, WikiLogPayload } from '../../shared/types.ts'

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

  /**
   * The tail of a vault's own history, newest first.
   *
   * Every write appends a line to the vault's `log.md`, so this is what the
   * knowledge base has been told lately — reported from a file that is already
   * maintained rather than from a second record kept only for display.
   * @param vault - a vault id; all of them when omitted.
   * @param limit - how many entries; the host defaults to 20 and caps at 200.
   * @returns the entries.
   */
  recentWrites(vault?: string, limit?: number): Promise<readonly WikiLogEntry[]>
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

    async recentWrites(vault, limit) {
      const params = new URLSearchParams()
      if (vault !== undefined) params.set('vault', vault)
      if (limit !== undefined) params.set('limit', String(limit))
      const query = params.toString()
      const answer = await request<WikiLogPayload>(`/wiki/recent${query === '' ? '' : `?${query}`}`)
      return answer.entries
    },
  }
}
