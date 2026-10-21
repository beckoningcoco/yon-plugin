/**
 * The front-end source calls the UI drives: thin calls against
 * `/yon/api/frontends`.
 *
 * Outside the components for the same reason the other APIs are: the apply world
 * builds one of these and hands the methods through an inject face, so a
 * component never fetches, never subscribes, and never learns a URL.
 *
 * An `id` is `fe-<product>-<version>` — plain ASCII — but it is still encoded on
 * the way into the path, because nothing stops the version having been typed
 * through the 「其他」 escape as Chinese.
 */
import { request } from '../request.ts'
import type {
  DirectoryPickResult, FrontendDirPayload, FrontendListPayload, FrontendPagesPayload,
  FrontendPageStatusView, FrontendReadPayload, FrontendView, SaveFrontendInput,
} from '../../shared/types.ts'

// The shared failure keeps this module's name for it, as the other APIs do.
export { ApiError as FrontendApiError } from '../request.ts'

/** One id as a URL segment. */
const idSegment = (id: string): string => encodeURIComponent(id)

/** The front-end source operations the UI drives. */
export interface FrontendApi {
  /**
   * Every registered project, with its last probe.
   * @returns the rows plus where they were read from.
   */
  listFrontends(): Promise<FrontendListPayload>

  /**
   * Register a project, or edit one already registered.
   * @param id - the registration to edit; absent to create.
   * @param input - the path and version.
   * @returns the stored row, probed.
   */
  saveFrontend(id: string | undefined, input: SaveFrontendInput): Promise<FrontendView>

  /**
   * Drop one registration.
   * @param id - the registration to remove.
   */
  removeFrontend(id: string): Promise<void>

  /**
   * Read the directory again and store what is there now.
   * @param id - the registration to re-probe.
   * @returns the stored row with its fresh profile.
   */
  probeFrontend(id: string): Promise<FrontendView>

  /**
   * Make this the project a bare version refers to.
   * @param id - the registration to promote.
   * @returns the stored row.
   */
  setDefaultFrontend(id: string): Promise<FrontendView>

  /**
   * Ask the host to open its own folder chooser.
   *
   * Here rather than in the component because the browser half cannot produce an
   * absolute path — see `handlePickDirectory` in the host.
   * @returns the host's kind, and the chosen path when it has one to give.
   */
  pickPath(): Promise<DirectoryPickResult>

  /**
   * The project's page nodes. Builds the index on first ask.
   * @param id - the registration.
   * @returns the nodes, the totals and when the index was built.
   */
  pages(id: string): Promise<FrontendPagesPayload>

  /**
   * What the stored page index says, without building one.
   * @param id - the registration.
   * @returns the status, or undefined when nothing is stored.
   */
  pageStatus(id: string): Promise<FrontendPageStatusView | undefined>

  /**
   * Walk the project again and replace the index.
   * @param id - the registration.
   * @returns the fresh status.
   */
  rebuildPages(id: string): Promise<FrontendPageStatusView>

  /**
   * One directory level, for the tree.
   * @param id - the registration.
   * @param path - the directory, relative to the project.
   * @returns the entries.
   */
  listDir(id: string, path: string): Promise<FrontendDirPayload>

  /**
   * Read a file's text for the preview.
   * @param id - the registration.
   * @param path - the file, relative to the project.
   * @param from - the first line, 1-based.
   * @param to - the last line, 1-based.
   * @returns the decoded text and its encoding.
   */
  readFile(id: string, path: string, from: number, to: number): Promise<FrontendReadPayload>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createFrontendApi(): FrontendApi {
  return {
    listFrontends() {
      return request<FrontendListPayload>('/frontends')
    },

    async saveFrontend(id, input) {
      const body = JSON.stringify(input)
      const answer = id === undefined
        ? await request<{ frontend: FrontendView }>('/frontends', { method: 'POST', body })
        : await request<{ frontend: FrontendView }>(`/frontends/${idSegment(id)}`, { method: 'PUT', body })
      return answer.frontend
    },

    async removeFrontend(id) {
      await request<{ removed: string }>(`/frontends/${idSegment(id)}`, { method: 'DELETE' })
    },

    async probeFrontend(id) {
      const answer = await request<{ frontend: FrontendView }>(
        `/frontends/${idSegment(id)}/probe`,
        { method: 'POST', body: '{}' },
      )
      return answer.frontend
    },

    async setDefaultFrontend(id) {
      const answer = await request<{ frontend: FrontendView }>(
        `/frontends/${idSegment(id)}/default`,
        { method: 'PUT', body: '{}' },
      )
      return answer.frontend
    },

    pickPath() {
      return request<DirectoryPickResult>('/pick-directory', { method: 'POST', body: '{}' })
    },

    pages(id) {
      return request<FrontendPagesPayload>(`/frontends/${idSegment(id)}/pages`)
    },

    async pageStatus(id) {
      const answer = await request<{ frontend: string; status: FrontendPageStatusView | null }>(
        `/frontends/${idSegment(id)}/pages/status`,
      )
      return answer.status ?? undefined
    },

    async rebuildPages(id) {
      const answer = await request<{ frontend: string; status: FrontendPageStatusView }>(
        `/frontends/${idSegment(id)}/pages`,
        { method: 'POST', body: '{}' },
      )
      return answer.status
    },

    listDir(id, path) {
      return request<FrontendDirPayload>(`/frontends/${idSegment(id)}/dir?path=${encodeURIComponent(path)}`)
    },

    readFile(id, path, from, to) {
      return request<FrontendReadPayload>(
        `/frontends/${idSegment(id)}/file?path=${encodeURIComponent(path)}&from=${from}&to=${to}`,
      )
    },
  }
}
