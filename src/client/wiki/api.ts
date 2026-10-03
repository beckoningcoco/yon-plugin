/**
 * The knowledge base calls the UI drives: thin calls against `/yon/api/wiki`.
 *
 * It lives outside the components on purpose, like the other three API clients.
 * The apply world builds one of these and hands the methods to the entry through
 * an inject face, so a component never fetches and never learns a URL.
 *
 * The registration is editable from here now, and that means less than it sounds:
 * every one of these calls writes the same single document — this panel's list of
 * vaults — and none of them writes a page. Reading an already-registered vault can
 * materialise the derived `wiki/.yon-index.json` cache inside it; that is the
 * *reader's* doing, it is why that file can safely be left behind when a vault is
 * unlisted, and nothing here creates or deletes one. The path is still not typed; it
 * comes from the host's own folder chooser, because an absolute machine path is not
 * something a browser field can be right about.
 */
import { request } from '../request.ts'
import type {
  DirectoryPickResult, SaveVaultInput, WikiCardPayload, WikiCitersPayload, WikiHealthPayload,
  WikiListPayload, WikiLogEntry, WikiLogPayload, WikiSearchPayload, WikiVaultView,
} from '../../shared/types.ts'

/** One id as a URL segment, the way the Home client spells it. */
const idSegment = (id: string): string => encodeURIComponent(id)

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

  /**
   * A vault's health: level breakdown, reference tallies, holes and activity.
   * @param vault - a vault id; all of them when omitted.
   * @param gaps - how many holes to include; the host defaults to 20.
   * @returns one report per vault.
   */
  health(vault?: string, gaps?: number): Promise<WikiHealthPayload>

  /**
   * Search the vault's pages by any name the operator has.
   * @param term - URI, table name, page name, display name, or a fragment.
   * @param vault - a vault id; all of them when omitted.
   * @param limit - how many hits; the host defaults to 40.
   * @returns the hits, strongest match first.
   */
  search(term: string, vault?: string, limit?: number): Promise<WikiSearchPayload>

  /**
   * One page as a card, answered without reading the page body.
   * @param page - the page name a search returned.
   * @param vault - a vault id; needed only when several hold that name.
   * @returns the card.
   */
  pageCard(page: string, vault?: string): Promise<WikiCardPayload>

  /**
   * The pages citing one entity URI, for expanding a hole.
   * @param uri - the entity URI as a page writes it.
   * @param vault - a vault id; all of them when omitted.
   * @returns the citing page names.
   */
  citers(uri: string, vault?: string): Promise<WikiCitersPayload>

  /**
   * Register a vault, or edit one that is already registered.
   *
   * The id is generated from the directory and is not an argument on the way in
   * except to say *which* registration is being edited — the same convention the
   * Home client follows, and the reason a vault edited in the panel keeps the id
   * a conversation already used to address it.
   * @param id - the registration to edit; absent to add a new one.
   * @param input - the name and the directory.
   * @returns the stored vault, with its readiness.
   */
  saveVault(id: string | undefined, input: SaveVaultInput): Promise<WikiVaultView>

  /**
   * Unlist one registration. Nothing inside the vault is deleted.
   * @param id - the registration to remove.
   */
  removeVault(id: string): Promise<void>

  /**
   * Ask the host to open its own folder chooser.
   *
   * Shared with the Home surface and here for the same reason: the browser half
   * cannot produce an absolute path, and a typed one is exactly the thing this
   * field exists to stop being wrong about.
   * @returns the host's kind, and the chosen path when it has one to give.
   */
  pickPath(): Promise<DirectoryPickResult>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createWikiApi(): WikiApi {
  /** A query string from the parameters that are present. */
  const query = (params: Record<string, string | number | undefined>): string => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue
      search.set(key, String(value))
    }
    const text = search.toString()
    return text === '' ? '' : `?${text}`
  }

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
      const answer = await request<WikiLogPayload>(`/wiki/recent${query({ vault, limit })}`)
      return answer.entries
    },

    health(vault, gaps) {
      return request<WikiHealthPayload>(`/wiki/health${query({ vault, gaps })}`)
    },

    search(term, vault, limit) {
      return request<WikiSearchPayload>(`/wiki/search${query({ term, vault, limit })}`)
    },

    pageCard(page, vault) {
      return request<WikiCardPayload>(`/wiki/card${query({ page, vault })}`)
    },

    citers(uri, vault) {
      return request<WikiCitersPayload>(`/wiki/citers${query({ uri, vault })}`)
    },

    async saveVault(id, input) {
      const body = JSON.stringify(input)
      const answer = id === undefined
        ? await request<{ vault: WikiVaultView }>('/wiki/vaults', { method: 'POST', body })
        : await request<{ vault: WikiVaultView }>(`/wiki/vaults/${idSegment(id)}`, { method: 'PUT', body })
      return answer.vault
    },

    async removeVault(id) {
      await request<{ removed: string }>(`/wiki/vaults/${idSegment(id)}`, { method: 'DELETE' })
    },

    pickPath() {
      return request<DirectoryPickResult>('/pick-directory', { method: 'POST', body: '{}' })
    },
  }
}
