/**
 * The project calls the UI drives: thin calls against `/yon/api/projects`.
 *
 * It lives outside the components on purpose. The apply world builds one of
 * these and hands the methods to components through an inject face, so a
 * component never fetches, never subscribes, and never learns a URL.
 */
import { request } from '../request.ts'
import {
  type CreateProjectInput, type JsonValue, type ProjectDetail,
  type ProjectSummary, type UpdateProjectInput,
} from '../../shared/types.ts'

// The shared failure keeps this module's name for it: callers and specs already
// reach for `ProjectApiError` here.
export { ApiError as ProjectApiError } from '../request.ts'

/** Field-name URL segment: any text the operator typed. */
const fieldSegment = (fieldKey: string): string => encodeURIComponent(fieldKey)

/** The project operations the UI drives. */
export interface ProjectApi {
  /**
   * Projects for the list.
   * @param includeArchived - keep soft-deleted projects in the answer.
   * @returns the summaries.
   */
  listProjects(includeArchived?: boolean): Promise<readonly ProjectSummary[]>

  /**
   * One project with its dynamic fields folded in.
   * @param projectId - project identity.
   * @returns the stored project.
   */
  getProject(projectId: string): Promise<ProjectDetail>

  /**
   * Create a project.
   * @param input - name (required), code, status, starting fields.
   * @returns the stored project.
   */
  createProject(input: CreateProjectInput): Promise<ProjectDetail>

  /**
   * Patch a project's own columns.
   * @param projectId - project identity.
   * @param patch - columns to replace.
   * @returns the stored project.
   */
  updateProject(projectId: string, patch: UpdateProjectInput): Promise<ProjectDetail>

  /**
   * Write one dynamic field.
   * @param projectId - project identity.
   * @param fieldKey - the operator's field name.
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
   * Soft-delete or restore a project.
   * @param projectId - project identity.
   * @param archived - target state.
   * @returns the stored project.
   */
  archiveProject(projectId: string, archived: boolean): Promise<ProjectDetail>

  /**
   * Delete a project and its fields.
   * @param projectId - project identity.
   */
  removeProject(projectId: string): Promise<void>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createProjectApi(): ProjectApi {
  return {
    async listProjects(includeArchived = false) {
      const answer = await request<{ projects: readonly ProjectSummary[] }>(
        `/projects${includeArchived ? '?archived=1' : ''}`,
      )
      return answer.projects
    },

    async getProject(projectId) {
      const answer = await request<{ project: ProjectDetail }>(
        `/projects/${encodeURIComponent(projectId)}`,
      )
      return answer.project
    },

    async createProject(input) {
      const answer = await request<{ project: ProjectDetail }>('/projects', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return answer.project
    },

    async updateProject(projectId, patch) {
      const answer = await request<{ project: ProjectDetail }>(
        `/projects/${encodeURIComponent(projectId)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      )
      return answer.project
    },

    async setField(projectId, fieldKey, value) {
      const answer = await request<{ project: ProjectDetail }>(
        `/projects/${encodeURIComponent(projectId)}/fields/${fieldSegment(fieldKey)}`,
        { method: 'PUT', body: JSON.stringify({ value }) },
      )
      return answer.project
    },

    async removeField(projectId, fieldKey) {
      const answer = await request<{ project: ProjectDetail }>(
        `/projects/${encodeURIComponent(projectId)}/fields/${fieldSegment(fieldKey)}`,
        { method: 'DELETE' },
      )
      return answer.project
    },

    async archiveProject(projectId, archived) {
      const answer = await request<{ project: ProjectDetail }>(
        `/projects/${encodeURIComponent(projectId)}/archive`,
        { method: 'POST', body: JSON.stringify({ archived }) },
      )
      return answer.project
    },

    async removeProject(projectId) {
      await request<{ removed: string }>(
        `/projects/${encodeURIComponent(projectId)}`,
        { method: 'DELETE' },
      )
    },
  }
}
