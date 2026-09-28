import type { Context } from '@deepseek-ai/cordis';
import { type YonDomain } from './domain.ts';
import { type CreateProjectInput, type JsonValue, type ProjectDetail, type ProjectSummary, type UpdateProjectInput } from '../shared/types.ts';
/** A failure the caller can act on; the HTTP layer maps it to a status code. */
export declare class ProjectError extends Error {
    /** Machine code the API reports. */
    readonly code: 'not-found' | 'invalid-input';
    constructor(
    /** Machine code the API reports. */
    code: 'not-found' | 'invalid-input', message: string);
}
/** The public store, reachable in-process as `ctx.yonProjects`. */
export interface YonProjectsService {
    /**
     * Projects the pickers and lists read, ordered by name.
     * @param options - `includeArchived` keeps soft-deleted projects in the answer.
     * @returns the summaries, cheapest read in the service (main table only).
     */
    list(options?: {
        includeArchived?: boolean;
    }): readonly ProjectSummary[];
    /**
     * One project with its dynamic fields folded in.
     * @param projectId - project identity.
     * @returns the detail, or undefined when no such project exists.
     */
    get(projectId: string): ProjectDetail | undefined;
    /**
     * Create a project and its initial fields (main row first, then one child row
     * per field).
     * @param input - name (required), code, status, and starting fields.
     * @returns the stored project.
     */
    create(input: CreateProjectInput): Promise<ProjectDetail>;
    /**
     * Patch the main table's columns.
     * @param projectId - project identity.
     * @param patch - the columns to replace.
     * @returns the stored project.
     */
    update(projectId: string, patch: UpdateProjectInput): Promise<ProjectDetail>;
    /**
     * Write one dynamic field: one atomic child-row write, so a concurrent edit to
     * a different field of the same project cannot be lost.
     * @param projectId - project identity.
     * @param fieldKey - the operator's field name (any text).
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
     * Delete a project and every field row it owns (the child table has no
     * foreign key, so the cascade lives here).
     * @param projectId - project identity.
     */
    remove(projectId: string): Promise<void>;
    /**
     * Cached project list; the identity is stable between durable changes.
     * @returns the same array until something is written.
     */
    getSnapshot(): readonly ProjectSummary[];
    /**
     * Observe durable changes of this domain — whoever wrote them.
     * @param listener - called after each change.
     * @returns unsubscribe.
     */
    subscribe(listener: () => void): () => void;
}
/** The service plus the plugin-owned teardown. */
export interface YonProjectsHandle {
    readonly service: YonProjectsService;
    dispose(): void;
}
/**
 * Build the store over an opened domain.
 * @param ctx - host context (used for the durable-change subscription).
 * @param domain - the opened `yon_projects` domain.
 * @returns the service and its disposer.
 */
export declare function createYonProjectsService(ctx: Context, domain: YonDomain): YonProjectsHandle;
