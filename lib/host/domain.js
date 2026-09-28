/**
 * The stored shape: one main table plus one child table.
 *
 * `projects` holds what a list or a picker needs (name, code, status, soft
 * delete, timestamps), so reading a project list never touches dynamic data.
 * `project_fields` holds the operator's own fields, one record per field keyed
 * `<projectId>/<fieldKey>` — adding or removing a field is one atomic row write
 * that cannot clobber a concurrent edit to another field.
 *
 * Neither table's schema has to change when a field is added, so dynamic fields
 * never force a version bump: only the main table's own columns are versioned.
 */
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { PROJECT_STATUSES } from "../shared/types.js";
/** Domain (and therefore backend storage unit) name; `^[a-z][a-z0-9_]*$`. */
export const DOMAIN_NAME = 'yon_projects';
/** Current stored format version of the main table's columns. */
export const DOMAIN_VERSION = 1;
/** A field value must survive a JSON round trip. */
const JsonValueSchema = z.lazy(() => z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
]));
/** Main table: one project. Columns here are the only versioned shape. */
const projectSchema = z.object({
    name: z.string(),
    code: z.string(),
    status: z.enum(PROJECT_STATUSES),
    archived: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
/** Child table: one dynamic field of one project. */
const projectFieldSchema = z.object({
    projectId: z.string(),
    fieldKey: z.string(),
    value: JsonValueSchema,
    updatedAt: z.number(),
});
/** The declared domain, opened by the host plugin's `apply`. */
export const YON_DOMAIN = defineDomain({
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    // A field edit rewrites one small document instead of the whole project.
    layout: 'per-record',
    tables: {
        projects: domainTable(projectSchema),
        project_fields: domainTable(projectFieldSchema),
    },
});
/**
 * Encode one text fragment into the character set the child table's record keys
 * accept.
 *
 * A `per-record` medium stores one document per record, so a record key becomes
 * a file name and must match `/^[a-zA-Z0-9_-]+$/`. Field names are the
 * operator's own text — Chinese, spaces, slashes, dots — nearly all of which are
 * illegal in a key. Every byte outside the safe set becomes `_` plus two hex
 * digits, and the underscore escapes too, which keeps the mapping injective.
 * @param text - fragment to encode.
 * @returns a path-safe encoding of the fragment.
 */
export function encodeKeyFragment(text) {
    let encoded = '';
    for (const byte of new TextEncoder().encode(text)) {
        const character = String.fromCharCode(byte);
        encoded += /^[A-Za-z0-9-]$/.test(character)
            ? character
            : `_${byte.toString(16).padStart(2, '0')}`;
    }
    return encoded;
}
/**
 * Build one child-table record key: the owning project id plus the encoded field
 * name.
 *
 * Nothing ever decodes this key — the field's own name and its project ride in
 * the record — so it only has to be unique per (project, field) and path-safe.
 * The service therefore reads ownership from the record, never from the key.
 * @param projectId - owning project (a generated uuid, already key-safe).
 * @param fieldKey - the operator's field name.
 * @returns the record key.
 */
export function fieldRecordKey(projectId, fieldKey) {
    return `${projectId}_${encodeKeyFragment(fieldKey)}`;
}
