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
/**
 * One database connection as the panel reads it.
 *
 * This type has no password member, and that is the design rather than an
 * oversight: the configuration the host reads holds a secret per login, and the
 * browser never receives one. {@link DataSourceView.hasPassword} carries the
 * only fact the surface needs — whether a secret is stored — so nothing has to
 * be stripped on the way out, because nothing secret is ever put in.
 */
export interface DataSourceView {
    /** `<configKey>::<env>`; both halves address a row by this and nothing else. */
    readonly key: string;
    /** The key this connection sits under in the configuration. */
    readonly configKey: string;
    /** The environment branch under that key (`test`, `prod`, `dev`, `analysis`, …). */
    readonly env: string;
    /** Declared database type (`oracle`, `dm`, `mysql`, `postgresql`, `oceanbase`, …). */
    readonly dbType: string;
    readonly host: string;
    readonly port: number;
    /** Oracle service name, or the MySQL/PostgreSQL database; empty when unused. */
    readonly serviceName: string;
    /** Login names this connection offers — names only, never the secrets beside them. */
    readonly userNames: readonly string[];
    /** Whether a secret is stored for this connection; the value itself stays on the host. */
    readonly hasPassword: boolean;
    /** False when the query tool ships no connector for {@link DataSourceView.dbType}. */
    readonly probeable: boolean;
    /** The project this connection is bound to, when the operator bound one. */
    readonly binding?: DataSourceBinding;
}
/**
 * A binding from one connection to one project.
 *
 * Only the binding is stored by this plugin; the connection itself stays in the
 * operator's configuration file, which is what the query tool reads. Copying
 * host, port and login into this store would make a second copy that drifts
 * from the first, so this row deliberately holds nothing but the reference.
 */
export interface DataSourceBinding {
    /** The project's identity in the project store's main table. */
    readonly projectId: string;
    /** The project's display name, resolved when the answer is built. */
    readonly projectName: string;
}
/** `GET /yon/api/datasources` payload. */
export interface DataSourceListPayload {
    readonly sources: readonly DataSourceView[];
    /** Absolute path of the configuration actually read, so the surface can name it. */
    readonly configPath: string;
    /** False when the configuration is missing or unreadable; `sources` is then empty. */
    readonly complete: boolean;
    /** False when the query tool could not be found; the surface then offers no test. */
    readonly probeAvailable: boolean;
    /** Why the configuration could not be read, when it could not. */
    readonly error?: string;
    /**
     * Where a first run adopted its starting connections from, when it did.
     *
     * Absent on every ordinary answer: it exists so the surface can say "adopted
     * the connections already on this machine" once, instead of leaving the
     * operator to wonder why a fresh install already lists eleven of them.
     */
    readonly seededFrom?: string;
}
/** Body of `PUT /yon/api/datasources/<key>`. Also the create form's payload. */
export interface SaveDataSourceInput {
    /** The connection group's name; may be created by this call. */
    readonly configKey: string;
    /** The environment branch to write under that name. */
    readonly env: string;
    readonly dbType: string;
    readonly host: string;
    readonly port: number;
    readonly serviceName?: string;
    /**
     * Logins to store, keyed by login name. Omit to keep whatever is stored —
     * the surface never receives a password, so it cannot send one back unchanged.
     */
    readonly users?: Readonly<Record<string, string>>;
    /** Bind the group to this project; an empty string unbinds it. */
    readonly projectId?: string;
}
/** Body of `PUT /yon/api/datasources/<key>/binding`. */
export interface SetDataSourceBindingInput {
    /** The project to bind; an empty string or null unbinds. */
    readonly projectId: string | null;
}
/** Outcome of one `SELECT 1` probe. */
export interface DataSourceProbeResult {
    readonly ok: boolean;
    /** Wall-clock milliseconds the probe took, the spawn included. */
    readonly latencyMs: number;
    /** The login the probe used (the connection's first one, when none was named). */
    readonly user?: string;
    /** Rows the answer carried; absent when the failure happened before any result. */
    readonly rowCount?: number;
    /** What went wrong, carrying the query tool's own diagnostic text. */
    readonly error?: string;
}
/** One Obsidian vault the operator registered as a knowledge base. */
export interface WikiVaultView {
    /** Stable short id, used to address the vault in calls. */
    readonly id: string;
    /** Human label for the panel. */
    readonly label: string;
    /** Absolute vault root on the operator's machine. */
    readonly path: string;
    /** Entity pages in the cached index; 0 before one is built. */
    readonly pages: number;
    /** When the cached index was built; absent until one is. */
    readonly indexedAt?: string;
    /** False when the registered path no longer holds a readable vault. */
    readonly ready: boolean;
}
/** Body of `GET /yon/api/wiki`, and of a rebuild's answer. */
export interface WikiListPayload {
    readonly vaults: readonly WikiVaultView[];
}
/** One dated line of a vault's `log.md`, as both halves read it. */
export interface WikiLogEntry {
    /** The ISO date the line leads with, or an empty string when it has none. */
    readonly date: string;
    /** The rest of the line — what happened, in the writer's own words. */
    readonly text: string;
    readonly vault: string;
    readonly vaultLabel: string;
}
/** Body of `GET /yon/api/wiki/recent`. */
export interface WikiLogPayload {
    readonly entries: readonly WikiLogEntry[];
}
/**
 * What a knowledge-base page can be used for, strongest first.
 *
 * Mirrors the host's `WikiLevel`. The two are kept in step by hand rather than by
 * an import, because this module is shared by both halves and may not depend on
 * either — the same reason every other payload here repeats a host shape.
 */
export type WikiLevel = 'query-ready' | 'locatable' | 'concept';
/** How many of a vault's pages sit at one level. */
export interface WikiLevelStat {
    readonly level: WikiLevel;
    readonly pages: number;
}
/** One entity a vault's pages cite and none of them covers. */
export interface WikiGapView {
    readonly uri: string;
    /** How many references name it. */
    readonly cited: number;
    /** A few of the pages citing it, for judging whether the hole matters. */
    readonly citedBy: readonly string[];
}
/** A vault's reference tallies. */
export interface WikiGraphView {
    readonly pages: number;
    readonly withOutgoing: number;
    readonly withIncoming: number;
    readonly isolated: number;
    readonly resolvedEdges: number;
    readonly danglingEdges: number;
    readonly missingEntities: number;
}
/** A term that was asked for and came back empty. */
export interface WikiMissView {
    readonly term: string;
    readonly count: number;
    readonly last: string;
}
/** What a vault has been asked, folded. */
export interface WikiUsageView {
    readonly total: number;
    readonly misses: readonly WikiMissView[];
    readonly popular: readonly {
        readonly term: string;
        readonly count: number;
    }[];
    readonly since?: string;
}
/**
 * One vault's health: the 概览 and 缺口 tabs, in one answer.
 *
 * One call rather than three because the panel needs all of it to draw one
 * screen, and three round trips would let the tabs disagree with each other
 * about a vault that is being rebuilt while they load.
 */
export interface WikiHealthReport {
    readonly vault: string;
    readonly vaultLabel: string;
    readonly pages: number;
    readonly indexedAt?: string;
    /** Size of the cached index on disk, so a slow rebuild has a visible cause. */
    readonly indexBytes?: number;
    readonly graph: WikiGraphView;
    readonly levels: readonly WikiLevelStat[];
    readonly gaps: readonly WikiGapView[];
    readonly usage: WikiUsageView;
}
/** Body of `GET /yon/api/wiki/health`. */
export interface WikiHealthPayload {
    readonly reports: readonly WikiHealthReport[];
}
/** One kind of relation, with a sample of its targets and how many there are. */
export interface WikiRelationGroupView {
    readonly kind: string;
    readonly total: number;
    readonly sample: readonly string[];
}
/** A page as a card: what it is good for and where it leads, without its body. */
export interface WikiCardView {
    readonly vault: string;
    readonly vaultLabel: string;
    readonly page: string;
    readonly uri: string | null;
    readonly name: string;
    readonly table?: string;
    readonly app?: string;
    readonly version?: string;
    readonly status?: string;
    readonly level: WikiLevel;
    readonly fieldCount?: number;
    /** What the page lacks to answer more, in the host's own words. */
    readonly lacks: readonly string[];
    readonly refs: number;
    readonly incoming: number;
    readonly outgoing: readonly WikiRelationGroupView[];
    readonly incomingGroups: readonly WikiRelationGroupView[];
    readonly unresolved: {
        readonly total: number;
        readonly sample: readonly string[];
    };
}
/** Body of `GET /yon/api/wiki/card`. */
export interface WikiCardPayload {
    readonly card: WikiCardView;
}
/** One page a panel search matched. */
export interface WikiSearchHit {
    readonly page: string;
    readonly uri: string | null;
    readonly name: string;
    readonly table?: string;
    readonly app?: string;
    readonly level: WikiLevel;
    readonly fieldCount?: number;
    /** How the term matched: `uri`, `table`, `page`, `name` or `contains`. */
    readonly matchedBy: string;
}
/** Body of `GET /yon/api/wiki/search`. */
export interface WikiSearchPayload {
    readonly term: string;
    readonly scanned: number;
    readonly hits: readonly WikiSearchHit[];
}
/** Body of `GET /yon/api/wiki/citers`. */
export interface WikiCitersPayload {
    readonly uri: string;
    readonly pages: readonly string[];
}
/**
 * 一次检查的结局。
 *
 * 与宿主 `DigestOutcome` 手工保持一致——两半之间不共享代码，只共享这个契约，
 * 所以谁改了取值都要同时改两边。多出这一个联合类型而不是直接写 `string`，
 * 是为了让面板的 switch 穷尽检查能生效：漏掉一种结局时编译不过。
 */
export type DigestOutcomeView = 'pass' | 'fail' | 'gate' | 'plan' | 'sweep';
/**
 * 流水账里的一行：一次检查的分数。
 *
 * 只带路径、分数与判定，不带正文——日志要能安心躺在 `~/.dsh/yon-panel/` 下，
 * 不做知识库的第二份副本。
 */
export interface DigestLogEntryView {
    readonly at: string;
    readonly tool: string;
    readonly outcome: DigestOutcomeView;
    readonly label: string;
    readonly source: string;
    readonly product: string;
    readonly pages: number;
    /** 未通过的项目名，按报告顺序。 */
    readonly failed: readonly string[];
    /** 各项实测值，null 表示该项不适用。 */
    readonly metrics: Readonly<Record<string, number | null>>;
    readonly sourceBytes: number;
    readonly productBytes: number;
    readonly ms: number;
    /** 批量体检专用。 */
    readonly scanned?: number;
    readonly passing?: number;
    readonly failing?: number;
    /** 摸底专用。 */
    readonly chapters?: number;
}
/** 折起来之后的流水账。 */
export interface DigestLogSummaryView {
    readonly total: number;
    readonly since?: string;
    /** 均值实际覆盖了多少次验收；面板用它写明依据，而不是写「最近若干次」。 */
    readonly averagedOver: number;
    readonly byOutcome: Readonly<Record<string, number>>;
    readonly byTool: readonly {
        readonly tool: string;
        readonly count: number;
    }[];
    /** 每条计量项在最近若干次验收上的均值；看趋势，不看单次。 */
    readonly averages: Readonly<Record<string, number | null>>;
    readonly recent: readonly DigestLogEntryView[];
}
/** Body of `GET /yon/api/digest/summary`. */
export interface DigestSummaryPayload {
    readonly summary: DigestLogSummaryView;
    /** 日志文件的位置，方便直接打开看。 */
    readonly path: string;
}
/** Body of `GET /yon/api/digest/log`. */
export interface DigestLogPayload {
    readonly entries: readonly DigestLogEntryView[];
    readonly path: string;
}
/**
 * Build the identity both halves address one connection by.
 * @param configKey - the key the connection sits under in the configuration.
 * @param env - the environment branch under it.
 * @returns the composite key.
 */
export declare function dataSourceKey(configKey: string, env: string): string;
/**
 * Split a composite key back into its parts.
 *
 * The split takes the LAST separator, so a project name that itself contains
 * `::` still round-trips.
 * @param key - the composite key.
 * @returns the parts, or undefined when the key carries no usable separator.
 */
export declare function splitDataSourceKey(key: string): {
    configKey: string;
    env: string;
} | undefined;
/** Where the API lives, shared by the host's route table and the client's calls. */
export declare const API_PREFIX = "/yon/api";
