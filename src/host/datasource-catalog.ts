/**
 * Turning the stored document into what the panel and the model read.
 *
 * The stored shape is the query script's own (`projects.<name>.<env>.{host,…}`),
 * which carries a password per login. This module is the one place that shape is
 * interpreted, and the interpretation is where the secrets stop: the value it
 * produces has no password member at all, so nothing downstream can leak one —
 * not the HTTP route, not a tool result, not a log line.
 *
 * Reading the presence of a secret is still useful, so {@link DataSourceView}
 * answers `hasPassword` instead of the secret, which is the whole fact the
 * surface needs to explain a connection before trying it.
 */
import type { DataSourceView } from '../shared/types.ts'
import { dataSourceKey } from '../shared/types.ts'
import type { StoredConfig, StoredConnection, StoredEnvironment } from './datasource-store.ts'

/**
 * Database types the bundled query script ships a connector for.
 *
 * Anything else is listed but not probeable: the plugin reports "this type has
 * no connector" rather than pretending a failure to connect was a network
 * problem, which is what a bare error message would have said.
 */
export const PROBEABLE_TYPES: readonly string[] = ['oracle', 'dm', 'mysql', 'postgresql']

/**
 * Environments a person reads first, when a connection offers several.
 *
 * Only an ordering hint: an environment outside this list still appears, sorted
 * after the known ones.
 */
const ENV_ORDER: readonly string[] = ['test', 'dev', 'prod', 'analysis']

/** Rank one environment name for display order. */
function envRank(env: string): number {
  const at = ENV_ORDER.indexOf(env)
  return at === -1 ? ENV_ORDER.length : at
}

/**
 * Whether one member of a connection is an environment branch rather than
 * connection-level metadata.
 *
 * The test is structural, not a name list: `type`, `projectId` and any future
 * metadata are scalars, while a branch is always an object holding connection
 * detail. A name list would silently drop an environment somebody invented.
 * @param value - the member to test.
 * @returns true when it looks like an environment branch.
 */
function isEnvironment(value: unknown): value is StoredEnvironment {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const branch = value as Record<string, unknown>
  return 'host' in branch || 'port' in branch || 'users' in branch
}

/**
 * Every environment branch of one stored connection, in display order.
 * @param connection - the stored connection.
 * @returns the branch names.
 */
export function environmentNames(connection: StoredConnection): string[] {
  return Object.entries(connection)
    .filter(([, value]) => isEnvironment(value))
    .map(([name]) => name)
    .sort((left, right) => {
      const byRank = envRank(left) - envRank(right)
      return byRank !== 0 ? byRank : left.localeCompare(right)
    })
}

/**
 * Read the stored login names of one branch, never their secrets.
 * @param branch - the environment branch.
 * @returns the login names in stored order.
 */
function loginNames(branch: StoredEnvironment): string[] {
  const users = branch.users
  if (users === null || typeof users !== 'object' || Array.isArray(users)) return []
  return Object.keys(users as Record<string, unknown>)
}

/**
 * Whether one branch stores a usable secret for any of its logins.
 * @param branch - the environment branch.
 * @returns true when at least one secret is a non-empty string.
 */
function holdsSecret(branch: StoredEnvironment): boolean {
  const users = branch.users
  if (users === null || typeof users !== 'object' || Array.isArray(users)) return false
  return Object.values(users as Record<string, unknown>)
    .some(secret => typeof secret === 'string' && secret !== '')
}

/** Read a member as text, answering empty for anything that is not a scalar. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** Read a port, answering 0 for anything that is not a usable number. */
function portOf(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

/** How a stored connection's binding resolves to a project, when the caller can. */
export type ProjectLookup = (projectId: string) => { readonly name: string } | undefined

/**
 * Flatten the stored document into one view per connection and environment.
 * @param config - the stored document.
 * @param resolveProject - looks a bound project id up, or answers undefined.
 * @returns every connection this plugin can show, in display order.
 */
export function toViews(config: StoredConfig, resolveProject: ProjectLookup): DataSourceView[] {
  const views: DataSourceView[] = []
  const connections = config.projects
  if (connections === null || typeof connections !== 'object' || Array.isArray(connections)) return views

  for (const [configKey, connection] of Object.entries(connections)) {
    if (connection === null || typeof connection !== 'object' || Array.isArray(connection)) continue
    const stored = connection as StoredConnection
    const dbType = textOf(stored.type)
    const boundTo = textOf(stored.projectId)
    const project = boundTo === '' ? undefined : resolveProject(boundTo)

    for (const env of environmentNames(stored)) {
      const branch = stored[env]
      if (!isEnvironment(branch)) continue
      views.push({
        key: dataSourceKey(configKey, env),
        configKey,
        env,
        dbType,
        host: textOf(branch.host),
        port: portOf(branch.port),
        serviceName: textOf(branch.service_name),
        userNames: loginNames(branch),
        hasPassword: holdsSecret(branch),
        probeable: PROBEABLE_TYPES.includes(dbType),
        ...project === undefined ? {} : { binding: { projectId: boundTo, projectName: project.name } },
      })
    }
  }

  views.sort((left, right) => {
    const byKey = left.configKey.localeCompare(right.configKey, 'zh-Hans-CN')
    if (byKey !== 0) return byKey
    return envRank(left.env) - envRank(right.env)
  })
  return views
}

/**
 * Read one stored connection by its key.
 * @param config - the stored document.
 * @param configKey - the connection's key in the document.
 * @returns the stored connection, or undefined when there is none.
 */
export function connectionOf(config: StoredConfig, configKey: string): StoredConnection | undefined {
  const connections = config.projects
  if (connections === null || typeof connections !== 'object' || Array.isArray(connections)) return undefined
  const found = (connections as Record<string, unknown>)[configKey]
  if (found === null || typeof found !== 'object' || Array.isArray(found)) return undefined
  return found as StoredConnection
}
