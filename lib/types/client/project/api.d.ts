import { type CreateProjectInput, type JsonValue, type ProjectDetail, type ProjectSummary, type UpdateProjectInput } from '../../shared/types.ts';
export { ApiError as ProjectApiError } from '../request.ts';
/** The project operations the UI drives. */
export interface ProjectApi {
    /**
     * Projects for the list.
     * @param includeArchived - keep soft-deleted projects in the answer.
     * @returns the summaries.
     */
    listProjects(includeArchived?: boolean): Promise<readonly ProjectSummary[]>;
    /**
     * One project with its dynamic fields folded in.
     * @param projectId - project identity.
     * @returns the stored project.
     */
    getProject(projectId: string): Promise<ProjectDetail>;
    /**
     * Create a project.
     * @param input - name (required), code, status, starting fields.
     * @returns the stored project.
     */
    createProject(input: CreateProjectInput): Promise<ProjectDetail>;
    /**
     * Patch a project's own columns.
     * @param projectId - project identity.
     * @param patch - columns to replace.
     * @returns the stored project.
     */
    updateProject(projectId: string, patch: UpdateProjectInput): Promise<ProjectDetail>;
    /**
     * Write one dynamic field.
     * @param projectId - project identity.
     * @param fieldKey - the operator's field name.
     * @param value - JSON-compatible value.
     * @returns the stored project.
     */
    setField(projectId: string, fieldKey: string, value: JsonValue): Promise<ProjectDetail>;
    /**
     * Remove one dynamic field.
     * @param projectId - project identity.
     * @param fieldKey - field name to drop.
     * @returns the stored project.
     */
    removeField(projectId: string, fieldKey: string): Promise<ProjectDetail>;
    /**
     * Soft-delete or restore a project.
     * @param projectId - project identity.
     * @param archived - target state.
     * @returns the stored project.
     */
    archiveProject(projectId: string, archived: boolean): Promise<ProjectDetail>;
    /**
     * Delete a project and its fields.
     * @param projectId - project identity.
     */
    removeProject(projectId: string): Promise<void>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createProjectApi(): ProjectApi;
