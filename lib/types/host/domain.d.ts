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
import { type Domain } from '@deepseek-ai/dsh-storage-domain';
import { type JsonValue } from '../shared/types.ts';
/** Domain (and therefore backend storage unit) name; `^[a-z][a-z0-9_]*$`. */
export declare const DOMAIN_NAME = "yon_projects";
/** Current stored format version of the main table's columns. */
export declare const DOMAIN_VERSION = 1;
/** Main table: one project. Columns here are the only versioned shape. */
declare const projectSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        paused: "paused";
        done: "done";
    }>;
    archived: z.ZodBoolean;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
/** Child table: one dynamic field of one project. */
declare const projectFieldSchema: z.ZodObject<{
    projectId: z.ZodString;
    fieldKey: z.ZodString;
    value: z.ZodType<JsonValue, unknown, z.core.$ZodTypeInternals<JsonValue, unknown>>;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
/** The stored project row. */
export type ProjectRow = z.infer<typeof projectSchema>;
/** The stored dynamic-field row. */
export type ProjectFieldRow = z.infer<typeof projectFieldSchema>;
/** The declared domain, opened by the host plugin's `apply`. */
export declare const YON_DOMAIN: {
    name: string;
    version: number;
    layout: string;
    tables: {
        projects: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            name: string;
            code: string;
            status: "active" | "paused" | "done";
            archived: boolean;
            createdAt: number;
            updatedAt: number;
        }>;
        project_fields: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            projectId: string;
            fieldKey: string;
            value: JsonValue;
            updatedAt: number;
        }>;
    };
};
/** An opened domain for {@link YON_DOMAIN}. */
export type YonDomain = Domain<typeof YON_DOMAIN>;
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
export declare function encodeKeyFragment(text: string): string;
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
export declare function fieldRecordKey(projectId: string, fieldKey: string): string;
export {};
