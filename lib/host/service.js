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
import { randomUUID } from 'node:crypto';
import { DOMAIN_NAME, fieldRecordKey } from "./domain.js";
import { PROJECT_STATUSES, } from "../shared/types.js";
/** A failure the caller can act on; the HTTP layer maps it to a status code. */
export class ProjectError extends Error {
    code;
    constructor(
    /** Machine code the API reports. */
    code, message) {
        super(message);
        this.code = code;
        this.name = 'ProjectError';
    }
}
/** Drop undefined members so a partial patch never blanks a column. */
function definedOnly(patch) {
    const next = {};
    for (const [column, value] of Object.entries(patch)) {
        if (value !== undefined)
            next[column] = value;
    }
    return next;
}
/** Reject a status outside the declared vocabulary. */
function assertStatus(value) {
    if (!PROJECT_STATUSES.includes(value)) {
        throw new ProjectError('invalid-input', `status must be one of ${PROJECT_STATUSES.join(', ')}`);
    }
    return value;
}
/** Reject a field value the medium could not carry. */
function assertJsonValue(value) {
    let encoded;
    try {
        encoded = JSON.stringify(value);
    }
    catch (error) {
        throw new ProjectError('invalid-input', `value is not JSON-serializable: ${String(error)}`);
    }
    if (encoded === undefined) {
        throw new ProjectError('invalid-input', 'value is not JSON-serializable');
    }
    return value;
}
/** Reject a patch the stored schema would refuse at the next open. */
function assertPatch(patch) {
    if (patch.status !== undefined)
        assertStatus(patch.status);
}
/** Turn the backend's missing-key rejection into the caller's not-found. */
function asProjectError(error, projectId) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('missing-key')
        ? new ProjectError('not-found', `no project "${projectId}"`)
        : error;
}
/**
 * Build the store over an opened domain.
 * @param ctx - host context (used for the durable-change subscription).
 * @param domain - the opened `yon_projects` domain.
 * @returns the service and its disposer.
 */
export function createYonProjectsService(ctx, domain) {
    const projects = domain.table('projects');
    const fields = domain.table('project_fields');
    const listeners = new Set();
    let fieldCounts = new Map();
    let snapshot = [];
    /** Count child rows per project in one pass, so `list()` stays linear. */
    const countFields = () => {
        const counts = new Map();
        for (const [, fieldRow] of fields.entries()) {
            counts.set(fieldRow.projectId, (counts.get(fieldRow.projectId) ?? 0) + 1);
        }
        return counts;
    };
    const summarize = (projectId, row) => ({
        projectId,
        name: row.name,
        code: row.code,
        status: row.status,
        archived: row.archived,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        fieldCount: fieldCounts.get(projectId) ?? 0,
    });
    const refresh = () => {
        fieldCounts = countFields();
        const rows = [];
        for (const [projectId, row] of projects.entries())
            rows.push(summarize(projectId, row));
        rows.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
        snapshot = rows;
        for (const listener of [...listeners])
            listener();
    };
    const detailOf = (projectId) => {
        const row = projects.get(projectId);
        if (row === undefined)
            return undefined;
        const collected = {};
        for (const [, fieldRow] of fields.entries()) {
            if (fieldRow.projectId !== projectId)
                continue;
            collected[fieldRow.fieldKey] = fieldRow.value;
        }
        return { ...summarize(projectId, row), fields: collected };
    };
    const requireProject = (projectId) => {
        if (projects.get(projectId) === undefined) {
            throw new ProjectError('not-found', `no project "${projectId}"`);
        }
    };
    /** `requireProject` already proved presence, so the detail cannot be absent. */
    const stored = (projectId) => detailOf(projectId);
    const service = {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        list({ includeArchived = false } = {}) {
            return includeArchived ? snapshot : snapshot.filter(project => !project.archived);
        },
        get: detailOf,
        resolve(ref) {
            const needle = ref.trim();
            if (needle === '')
                return { kind: 'missing' };
            const byId = detailOf(needle);
            if (byId !== undefined)
                return { kind: 'found', project: byId };
            const matches = snapshot.filter(project => project.name === needle || (project.code !== '' && project.code === needle));
            if (matches.length === 0)
                return { kind: 'missing' };
            if (matches.length > 1)
                return { kind: 'ambiguous', candidates: matches };
            const only = matches[0];
            return { kind: 'found', project: stored(only.projectId) };
        },
        async create(input) {
            const name = input.name.trim();
            if (name === '')
                throw new ProjectError('invalid-input', 'name is required');
            const projectId = randomUUID();
            const now = Date.now();
            await projects.put(projectId, {
                name,
                code: input.code?.trim() ?? '',
                status: assertStatus(input.status ?? 'active'),
                archived: false,
                createdAt: now,
                updatedAt: now,
            });
            for (const [fieldKey, value] of Object.entries(input.fields ?? {})) {
                await fields.put(fieldRecordKey(projectId, fieldKey), {
                    projectId,
                    fieldKey,
                    value: assertJsonValue(value),
                    updatedAt: now,
                });
            }
            return stored(projectId);
        },
        async update(projectId, patch) {
            requireProject(projectId);
            assertPatch(patch);
            try {
                await projects.update(projectId, row => ({
                    ...row,
                    ...definedOnly(patch),
                    updatedAt: Date.now(),
                }));
            }
            catch (error) {
                throw asProjectError(error, projectId);
            }
            return stored(projectId);
        },
        async setField(projectId, fieldKey, value) {
            requireProject(projectId);
            const key = fieldKey.trim();
            if (key === '')
                throw new ProjectError('invalid-input', 'field name is required');
            await fields.put(fieldRecordKey(projectId, key), {
                projectId,
                fieldKey: key,
                value: assertJsonValue(value),
                updatedAt: Date.now(),
            });
            return stored(projectId);
        },
        async removeField(projectId, fieldKey) {
            requireProject(projectId);
            await fields.delete(fieldRecordKey(projectId, fieldKey.trim()));
            return stored(projectId);
        },
        async remove(projectId) {
            requireProject(projectId);
            for (const [recordKey, fieldRow] of [...fields.entries()]) {
                if (fieldRow.projectId === projectId)
                    await fields.delete(recordKey);
            }
            await projects.delete(projectId);
        },
    };
    // Durable change is the single notification source, so a write made anywhere —
    // this service, another plugin, a future Remote — reaches subscribers alike.
    const offChange = ctx.on('domain/changed', (change) => {
        if (change.domain === DOMAIN_NAME)
            refresh();
    });
    refresh();
    return {
        service,
        dispose() {
            offChange();
            listeners.clear();
        },
    };
}
