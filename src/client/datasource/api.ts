/**
 * The datasource calls the UI drives: thin calls against `/yon/api/datasources`.
 *
 * It lives outside the components on purpose. The apply world builds one of
 * these and hands the methods to components through an inject face, so a
 * component never fetches, never subscribes, and never learns a URL.
 *
 * Every key travels URL-encoded: a key is `<configKey>::<env>` and the group
 * name is the operator's own text — Chinese, parentheses, spaces — so it is
 * never safe to paste into a path as-is.
 */
import { request } from '../request.ts'
import {
  type DataSourceListPayload, type DataSourceProbeResult, type DataSourceView,
  type SaveDataSourceInput,
} from '../../shared/types.ts'

// The shared failure keeps this module's name for it: callers and specs already
// reach for `ProjectApiError` and its siblings here.
export { ApiError as DataSourceApiError } from '../request.ts'

/** One key as a URL segment. */
const keySegment = (key: string): string => encodeURIComponent(key)

/** The datasource operations the UI drives. */
export interface DataSourceApi {
  /**
   * Every registered connection, one row per environment, without any secret.
   * @returns the rows plus where they were read from.
   */
  listDataSources(): Promise<DataSourceListPayload>

  /**
   * Create or replace one environment branch.
   * @param input - the group, the branch, and its details.
   * @returns the stored row.
   */
  saveDataSource(input: SaveDataSourceInput): Promise<DataSourceView>

  /**
   * Remove one environment branch; the group goes with its last branch.
   * @param key - the row's composite key.
   */
  removeDataSource(key: string): Promise<void>

  /**
   * Run `SELECT 1` against one connection.
   * @param key - the row's composite key.
   * @param user - a login to use; the first one is taken when this is absent.
   * @returns whether it answered, how long it took, and why not when it did not.
   */
  probeDataSource(key: string, user?: string): Promise<DataSourceProbeResult>

  /**
   * Bind one connection group to a project, or unbind it.
   * @param key - any composite key of the group.
   * @param projectId - the project to bind; an empty string unbinds.
   */
  bindDataSource(key: string, projectId: string): Promise<void>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createDataSourceApi(): DataSourceApi {
  return {
    listDataSources() {
      return request<DataSourceListPayload>('/datasources')
    },

    async saveDataSource(input) {
      const key = `${input.configKey}::${input.env}`
      const answer = await request<{ source: DataSourceView }>(
        `/datasources/${keySegment(key)}`,
        { method: 'PUT', body: JSON.stringify(input) },
      )
      return answer.source
    },

    async removeDataSource(key) {
      await request<{ removed: string }>(
        `/datasources/${keySegment(key)}`,
        { method: 'DELETE' },
      )
    },

    async probeDataSource(key, user) {
      const answer = await request<{ result: DataSourceProbeResult }>(
        `/datasources/${keySegment(key)}/probe`,
        { method: 'POST', body: JSON.stringify(user === undefined ? {} : { user }) },
      )
      return answer.result
    },

    async bindDataSource(key, projectId) {
      await request<{ bound: string }>(
        `/datasources/${keySegment(key)}/binding`,
        { method: 'PUT', body: JSON.stringify({ projectId }) },
      )
    },
  }
}
