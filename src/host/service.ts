/**
 * The project store every consumer sees: the main table answers lists and
 * pickers, the child table answers one project's dynamic fields.
 *
 * Deliberately not a Cordis `Service` subclass: this package must not import
 * the framework's runtime identity (a plugin that shipped its own `cordis`
 * copy would register a service the host cannot see). The entry point keeps
 * the returned object reachable as `ctx.yonProjects` through `ctx.provide`.
 *
 * Ownership is read from each child RECORD, never from its key: a `per-record`
 * medium turns keys into file names, so keys are an opaque encoding
 * ({@link fieldRecordKey}) while the project id and field name ride in the
 * record itself.
 *
 * Writes are validated here, not only at the HTTP edge: the storage domain
 * validates stored records when it OPENs, so a value the schema would refuse,
 * written now, would make the domain fail to open on the next boot. Two cheap
 * guards (status vocabulary, JSON round trip) keep that from happening.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { DOMAIN_NAME, fieldRecordKey, type ProjectRow, type YonDomain } from './domain.ts'
import {
  PROJECT_STATUSES, type CreateProjectInput, type JsonValue, type ProjectDetail,
  type ProjectStatus, type ProjectSummary, type UpdateProjectInput,
} from '../shared/types.ts'

/** A failure the caller can act on; the HTTP layer maps it to a status code. */
export class ProjectError extends Error {
  constructor(
    /** Machine code the API reports. */
    readonly code: 'not-found' | 'invalid-input',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectError'
  }
}

/**
 * How one project reference resolved.
 *
 * A tool argument names a project the way a human would — by name — while the
 * store keys by id, so this lookup accepts either and reports an ambiguous name
 * instead of guessing which of two same-named projects was meant.
 */
export type ProjectRefResolution =
  | { readonly kind: 'found'; readonly project: ProjectDetail }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly ProjectSummary[] }
  | { readonly kind: 'missing' }

/** The public store, reachable in-process as `ctx.yonProjects`. */
export interface YonProjectsService {
  /**
   * Projects the pickers and lists read, ordered by name.
   * @param options - `includeArchived` keeps soft-deleted projects in the answer.
   * @returns the summaries, cheapest read in the service (main table only).
   */
  list(options?: { includeArchived?: boolean }): readonly ProjectSummary[]

  /**
   * One project with its dynamic fields folded in.
   * @param projectId - project identity.
   * @returns the detail, or undefined when no such project exists.
   */
  get(projectId: string): ProjectDetail | undefined

  /**
   * Locate one project by id, or by the exact name or code a human used.
   * @param ref - project id, name, or code.
   * @returns the match; the candidates when the reference is ambiguous; missing
   *   when nothing matches. Archived projects match too — naming one is a
   *   deliberate act, not an accident.
   */
  resolve(ref: string): ProjectRefResolution

  /**
   * Create a project and its initial fields (main row first, then one child row
   * per field).
   * @param input - name (required), code, status, and starting fields.
   * @returns the stored project.
   */
  create(input: CreateProjectInput): Promise<ProjectDetail>

  /**
   * Patch the main table's columns.
   * @param projectId - project identity.
   * @param patch - the columns to replace.
   * @returns the stored project.
   */
  update(projectId: string, patch: UpdateProjectInput): Promise<ProjectDetail>

  /**
   * Write one dynamic field: one atomic child-row write, so a concurrent edit to
   * a different field of the same project cannot be lost.
   * @param projectId - project identity.
   * @param fieldKey - the operator's field name (any text).
   * @param value - JSON-compatible value.
   * @returns the stored project.
   */
  setField(projectId: string, fieldKey: string, value: JsonValue): Promise<ProjectDetail>

  /**
   * Remove one dynamic field.
   * @param projectId - project identity.
   * @param fieldKey - field name to drop.
   * @returns the stored project.
   */
  removeField(projectId: string, fieldKey: string): Promise<ProjectDetail>

  /**
   * Delete a project and every field row it owns (the child table has no
   * foreign key, so the cascade lives here).
   * @param projectId - project identity.
   */
  remove(projectId: string): Promise<void>

  /**
   * Cached project list; the identity is stable between durable changes.
   * @returns the same array until something is written.
   */
  getSnapshot(): readonly ProjectSummary[]

  /**
   * Observe durable changes of this domain — whoever wrote them.
   * @param listener - called after each change.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void
}

/** The service plus the plugin-owned teardown. */
export interface YonProjectsHandle {
  readonly service: YonProjectsService
  dispose(): void
}

/** Drop undefined members so a partial patch never blanks a column. */
function definedOnly(patch: UpdateProjectInput): UpdateProjectInput {
  const next: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(patch)) {
    if (value !== undefined) next[column] = value
  }
  return next as UpdateProjectInput
}

/** Reject a status outside the declared vocabulary. */
function assertStatus(value: ProjectStatus): ProjectStatus {
  if (!(PROJECT_STATUSES as readonly string[]).includes(value)) {
    throw new ProjectError('invalid-input', `status must be one of ${PROJECT_STATUSES.join(', ')}`)
  }
  return value
}

/** Reject a field value the medium could not carry. */
function assertJsonValue(value: JsonValue): JsonValue {
  let encoded: string | undefined
  try {
    encoded = JSON.stringify(value)
  } catch (error: unknown) {
    throw new ProjectError('invalid-input', `value is not JSON-serializable: ${String(error)}`)
  }
  if (encoded === undefined) {
    throw new ProjectError('invalid-input', 'value is not JSON-serializable')
  }
  return value
}

/** Reject a patch the stored schema would refuse at the next open. */
function assertPatch(patch: UpdateProjectInput): void {
  if (patch.status !== undefined) assertStatus(patch.status)
}

/** Turn the backend's missing-key rejection into the caller's not-found. */
function asProjectError(error: unknown, projectId: string): unknown {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('missing-key')
    ? new ProjectError('not-found', `no project "${projectId}"`)
    : error
}

/**
 * Build the store over an opened domain.
 * @param ctx - host context (used for the durable-change subscription).
 * @param domain - the opened `yon_projects` domain.
 * @returns the service and its disposer.
 */
export function createYonProjectsService(ctx: Context, domain: YonDomain): YonProjectsHandle {
  const projects = domain.table('projects')
  const fields = domain.table('project_fields')

  const listeners = new Set<() => void>()
  let fieldCounts = new Map<string, number>()
  let snapshot: readonly ProjectSummary[] = []

  /** Count child rows per project in one pass, so `list()` stays linear. */
  const countFields = (): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const [, fieldRow] of fields.entries()) {
      counts.set(fieldRow.projectId, (counts.get(fieldRow.projectId) ?? 0) + 1)
    }
    return counts
  }

  const summarize = (projectId: string, row: ProjectRow): ProjectSummary => ({
    projectId,
    name: row.name,
    code: row.code,
    status: row.status,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fieldCount: fieldCounts.get(projectId) ?? 0,
  })

  const refresh = (): void => {
    fieldCounts = countFields()
    const rows: ProjectSummary[] = []
    for (const [projectId, row] of projects.entries()) rows.push(summarize(projectId, row))
    rows.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
    snapshot = rows
    for (const listener of [...listeners]) listener()
  }

  const detailOf = (projectId: string): ProjectDetail | undefined => {
    const row = projects.get(projectId)
    if (row === undefined) return undefined
    const collected: Record<string, JsonValue> = {}
    for (const [, fieldRow] of fields.entries()) {
      if (fieldRow.projectId !== projectId) continue
      collected[fieldRow.fieldKey] = fieldRow.value
    }
    return { ...summarize(projectId, row), fields: collected }
  }

  const requireProject = (projectId: string): void => {
    if (projects.get(projectId) === undefined) {
      throw new ProjectError('not-found', `no project "${projectId}"`)
    }
  }

  /** `requireProject` already proved presence, so the detail cannot be absent. */
  const stored = (projectId: string): ProjectDetail => detailOf(projectId) as ProjectDetail

  const service: YonProjectsService = {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    list({ includeArchived = false } = {}) {
      return includeArchived ? snapshot : snapshot.filter(project => !project.archived)
    },

    get: detailOf,

    resolve(ref) {
      const needle = ref.trim()
      if (needle === '') return { kind: 'missing' }
      const byId = detailOf(needle)
      if (byId !== undefined) return { kind: 'found', project: byId }
      const matches = snapshot.filter(project =>
        project.name === needle || (project.code !== '' && project.code === needle))
      if (matches.length === 0) return { kind: 'missing' }
      if (matches.length > 1) return { kind: 'ambiguous', candidates: matches }
      const only = matches[0] as ProjectSummary
      return { kind: 'found', project: stored(only.projectId) }
    },

    async create(input) {
      const name = input.name.trim()
      if (name === '') throw new ProjectError('invalid-input', 'name is required')
      const projectId = randomUUID()
      const now = Date.now()
      await projects.put(projectId, {
        name,
        code: input.code?.trim() ?? '',
        status: assertStatus(input.status ?? 'active'),
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      for (const [fieldKey, value] of Object.entries(input.fields ?? {})) {
        await fields.put(fieldRecordKey(projectId, fieldKey), {
          projectId,
          fieldKey,
          value: assertJsonValue(value),
          updatedAt: now,
        })
      }
      return stored(projectId)
    },

    async update(projectId, patch) {
      requireProject(projectId)
      assertPatch(patch)
      try {
        await projects.update(projectId, row => ({
          ...row,
          ...definedOnly(patch),
          updatedAt: Date.now(),
        }))
      } catch (error: unknown) {
        throw asProjectError(error, projectId)
      }
      return stored(projectId)
    },

    async setField(projectId, fieldKey, value) {
      requireProject(projectId)
      const key = fieldKey.trim()
      if (key === '') throw new ProjectError('invalid-input', 'field name is required')
      await fields.put(fieldRecordKey(projectId, key), {
        projectId,
        fieldKey: key,
        value: assertJsonValue(value),
        updatedAt: Date.now(),
      })
      return stored(projectId)
    },

    async removeField(projectId, fieldKey) {
      requireProject(projectId)
      await fields.delete(fieldRecordKey(projectId, fieldKey.trim()))
      return stored(projectId)
    },

    async remove(projectId) {
      requireProject(projectId)
      for (const [recordKey, fieldRow] of [...fields.entries()]) {
        if (fieldRow.projectId === projectId) await fields.delete(recordKey)
      }
      await projects.delete(projectId)
    },
  }

  // Durable change is the single notification source, so a write made anywhere —
  // this service, another plugin, a future Remote — reaches subscribers alike.
  const offChange = ctx.on('domain/changed', (change) => {
    if (change.domain === DOMAIN_NAME) refresh()
  })
  refresh()

  return {
    service,
    dispose() {
      offChange()
      listeners.clear()
    },
  }
}
