/**
 * The data contract both halves share: the host serves these shapes over
 * `/yon/api`, and the browser half renders them. Keeping it in one module is
 * what stops the two sides from drifting.
 */
/** A JSON-compatible value: what one dynamic field may hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
/** Lifecycle of one project. */
export type ProjectStatus = 'active' | 'paused' | 'done';
/** Every status, in display order (the client renders these as options). */
export declare const PROJECT_STATUSES: readonly ProjectStatus[];
/**
 * One project as a list reads it. The main table alone answers this, so a
 * picker (a dropdown of projects) never pays for the child table.
 */
export interface ProjectSummary {
    /** Stable identity; the child table keys its rows by this. */
    readonly projectId: string;
    /** Display name. */
    readonly name: string;
    /** Short code the operator recognizes (may be empty). */
    readonly code: string;
    readonly status: ProjectStatus;
    /** Soft-deleted marker: archived projects stay readable but leave pickers. */
    readonly archived: boolean;
    readonly createdAt: number;
    readonly updatedAt: number;
    /** How many dynamic fields the project carries. */
    readonly fieldCount: number;
}
/** One project with its child-table fields folded in. */
export interface ProjectDetail extends ProjectSummary {
    /** Dynamic fields, keyed by the operator's own field name. */
    readonly fields: Record<string, JsonValue>;
}
/** One dynamic field as the child table stores it. */
export interface ProjectFieldValue {
    /** Field name chosen by the operator (any text, not just identifiers). */
    readonly fieldKey: string;
    readonly value: JsonValue;
    readonly updatedAt: number;
}
/** Body of `POST /yon/api/projects`. */
export interface CreateProjectInput {
    readonly name: string;
    readonly code?: string;
    readonly status?: ProjectStatus;
    /** Fields to write alongside the project; each one becomes a child row. */
    readonly fields?: Record<string, JsonValue>;
}
/** Body of `PATCH /yon/api/projects/<id>`. */
export interface UpdateProjectInput {
    readonly name?: string;
    readonly code?: string;
    readonly status?: ProjectStatus;
    readonly archived?: boolean;
}
/** Body of `PUT /yon/api/projects/<id>/fields/<fieldKey>`. */
export interface SetFieldInput {
    readonly value: JsonValue;
}
/** One failure the API reports instead of a payload. */
export interface ApiError {
    /** Stable machine code (`not-found`, `invalid-input`, `conflict`, `internal`). */
    readonly code: string;
    /** Human-readable reason. */
    readonly message: string;
}
/** `GET /yon/api/projects` payload. */
export interface ProjectListPayload {
    readonly projects: readonly ProjectSummary[];
}
/** `GET /yon/api/projects/<id>` and every mutation payload. */
export interface ProjectPayload {
    readonly project: ProjectDetail;
}
/** One mutation that removes something answers with the affected project. */
export type ProjectMutationPayload = ProjectPayload;
/** One skill as the panel lists it. */
export interface SkillView {
    /** Kebab-case identifier the registry addresses it by. */
    readonly name: string;
    /** One line, as the model sees it while choosing a skill. */
    readonly description: string;
    readonly whenToUse?: string;
    /** Discovery origin; `yon-panel` for skills this plugin ships. */
    readonly source: string;
    /** Providing registry layer; `runtime` for skills this plugin registers. */
    readonly provider: string;
    /**
     * Whether this plugin ships and owns the skill. Only a managed skill can be
     * switched off: the rest come from the operator's own skill directories, and
     * this panel shows them read-only rather than pretending to own them.
     */
    readonly managed: boolean;
    /** Whether the skill is currently offered to a session. */
    readonly enabled: boolean;
    readonly modelInvocable: boolean;
    readonly userInvocable: boolean;
}
/** One skill with its instruction body, for the detail pane. */
export interface SkillDetail extends SkillView {
    /** Markdown body, frontmatter removed. */
    readonly content: string;
}
/** Body of `PATCH /yon/api/skills/<name>`. */
export interface SetSkillEnabledInput {
    readonly enabled: boolean;
}
/** `GET /yon/api/skills` payload. */
export interface SkillListPayload {
    readonly skills: readonly SkillView[];
    /** False when a skill source could not be read; the list is then partial. */
    readonly complete: boolean;
}
/** `GET /yon/api/skills/<name>` and the switch payload. */
export interface SkillPayload {
    readonly skill: SkillDetail;
}
/** Where the API lives, shared by the host's route table and the client's calls. */
export declare const API_PREFIX = "/yon/api";
