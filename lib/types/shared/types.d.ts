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
    /**
     * Oracle service name, or the MySQL/PostgreSQL database. Omit to keep whatever
     * is stored; an empty string clears it.
     */
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
/**
 * Which product line an installation directory belongs to.
 *
 * The two share a `modules/` layout but not the paths around it, so the label is
 * carried on the registration and decides which skills-side file the mirror
 * writes — `ncc_home_path.json` or `bip_home_path.json`.
 */
export type HomeProduct = 'ncc' | 'bip';
/** Every product, in display order (the client renders these as options). */
export declare const HOME_PRODUCTS: readonly HomeProduct[];
/**
 * What the host's folder chooser answered.
 *
 * The path has to come from the host: a browser cannot produce one. `showDirectoryPicker()`
 * hands back a handle and `<input webkitdirectory>` hands back names relative to the
 * picked root, while the field this fills is `E:/NCProject/NCC/...`.
 *
 * `kind` is open rather than a closed union because it is the *host's* vocabulary, not
 * this plugin's: the harness composes one directory-picker backend per environment and
 * documents that a consumer meeting a shape it does not implement should hide the
 * picking affordance rather than fail. `native` is the one this plugin drives; anything
 * else means "this host has no chooser to show you", and the form goes back to typing.
 */
export interface DirectoryPickResult {
    /** `native` when the host's own chooser was used; otherwise why it was not. */
    readonly kind: string;
    /** The chosen absolute path — `native` only — or null when the operator cancelled. */
    readonly path?: string | null;
}
/** One entry of the version picker: what is stored, and what the operator reads. */
export interface HomeVersionOption {
    /** What goes into the registration and into the skills-side file's key. */
    readonly value: string;
    /** What the dropdown shows. */
    readonly label: string;
}
/**
 * The versions the operator can pick, per product line.
 *
 * **The value is the bare version** (`2111`), while the label carries the product
 * family (`NCC2111`). That split is not cosmetic: the value is what the skills side
 * keys on, and the files on disk settle it — `ncc_home_path.json`'s human-authored
 * sibling `path_config.json` writes its keys as `NCC_Home_2111` / `BIP_Home_V5`, and
 * the skill directory holds `class_index_2111.json`, `class_index_2312.json`,
 * `class_index_BIP_V5.json`. A registration stored as `NCC2111` would make the
 * mirror write `index_file: class_index_NCC2111.json` — a name that matches nothing,
 * so the index it points at would read as never built.
 *
 * NCC's six are the versions the operator named; `NC65` is the older product line,
 * which is why its label is not `NCC65`. BIP gets its own list because the products
 * version differently — the BIP home on this machine is keyed `V5` (a
 * `class_index_BIP_V5.json` exists beside it), and the NCC list has no way to say
 * that. Neither list is closed: the form offers an "其他" escape so a version that
 * ships later (or one this file has not heard of) is still registrable, and the
 * service deliberately does not validate against this table — the mirror merges
 * versions the panel never registered, so a whitelist there would be a lie about
 * what the rest of the system tolerates.
 */
export declare const HOME_VERSIONS: Readonly<Record<HomeProduct, readonly HomeVersionOption[]>>;
/**
 * What a Home is called: its product line and its version, and nothing else.
 *
 * A name is not something to ask the operator for. Two NCC 2111 installations from
 * two different projects are interchangeable for everything this registration is
 * used for — the class index is keyed by version, and `ncc_home_find`/`ncc_home_read`
 * go where the registration points. A hand-typed name therefore only ever adds a
 * field to fill in and a way for two rows to look different while describing the
 * same thing. The service refuses a second registration of a version under the same
 * product line (see `home-service.ts`), so `(product, version)` is already the
 * identity of a row; the name is just that identity, spelled for a person.
 *
 * The spelling comes from the same table the version dropdown is drawn from, so the
 * name and the entry the operator picked there can never disagree. A version outside the
 * table — registered through the form's 「其他」 escape — is named the obvious way
 * (`NCC2405`), because a version that ships after this file was written must still
 * get a name.
 *
 * @param product - which product line.
 * @param version - the bare version, as stored (`2111`, `V5`).
 * @returns the display name.
 */
export declare function homeLabelOf(product: HomeProduct, version: string): string;
/**
 * What a probe concluded about a directory.
 *
 * `jar-collection` is the honest middle case rather than a failure: a directory
 * that holds jars but is not an installation. It can be indexed by version, but
 * it has no `modules/`, so `.bmf` and module config are not there to read. The
 * surface says so instead of showing a home-shaped empty result.
 */
export type HomeShape = 'ncc-home' | 'bip-home' | 'jar-collection' | 'not-found';
/** One canonical path a Home is expected to have, and whether this one does. */
export interface HomeKeyView {
    readonly role: string;
    /** Relative path, with `*` where a module's own directory name goes. */
    readonly rel: string;
    readonly exists: boolean;
}
/** One probe of a Home directory, as both halves read it. */
export interface HomeProfileView {
    readonly probedAt: string;
    readonly shape: HomeShape;
    /** The canonical directories this Home actually has. */
    readonly present: readonly string[];
    /** Subdirectories under `modules/`; 0 when there is no `modules/`. */
    readonly modules: number;
    /** `.jar` files anywhere under the root, `ufjdk/` excluded. */
    readonly jars: number;
    /** True when the walk hit its cap, so both counts are lower bounds. */
    readonly capped: boolean;
    readonly keys: readonly HomeKeyView[];
    readonly warnings: readonly string[];
}
/** The class index built for a Home's version, when one exists. */
export interface HomeIndexView {
    readonly builtAt: string;
    readonly totalClasses: number;
    readonly bytes: number;
}
/** One registered Home, as the panel and the model read it. */
export interface HomeView {
    /** Stable id, generated at registration and immutable on edit. */
    readonly id: string;
    /** The display name, which is {@link homeLabelOf} of the two fields below. */
    readonly label: string;
    /** Forward-slash form; both separators are accepted on input. */
    readonly path: string;
    readonly product: HomeProduct;
    readonly version: string;
    readonly isDefault: boolean;
    /** False when the directory no longer reads as a Home; the row is still shown. */
    readonly ready: boolean;
    readonly profile?: HomeProfileView;
    readonly index?: HomeIndexView;
    readonly meta?: HomeMetaIndexView;
}
/** `GET /yon/api/homes` payload. */
export interface HomeListPayload {
    readonly homes: readonly HomeView[];
    /** Absolute path of the panel's own document, so the surface can name it. */
    readonly configPath: string;
    /** False when the document exists but could not be parsed. */
    readonly complete: boolean;
    readonly error?: string;
    /** Where the skills-side mirror lives, when a product line is registered. */
    readonly mirrorPath?: string;
    /** Why the last mirror was skipped or failed, when it was. */
    readonly mirrorWarning?: string;
}
/**
 * Body of `POST /yon/api/homes` and `PUT /yon/api/homes/<id>`.
 *
 * No `label`: the name is {@link homeLabelOf} of the two fields that are here, so
 * the panel has nothing to ask for and the service has nothing to trust.
 */
export interface SaveHomeInput {
    readonly path: string;
    readonly product: HomeProduct;
    readonly version: string;
    readonly isDefault?: boolean;
}
/** One file `ncc_home_find` matched, relative to the Home root. */
export interface HomeFileView {
    readonly rel: string;
    readonly size: number;
}
/** `ncc_home_find`'s answer. */
export interface HomeFindPayload {
    readonly home: string;
    readonly matches: readonly HomeFileView[];
    /** Directory entries visited; a capped walk reports a lower bound on matches. */
    readonly scanned: number;
    readonly capped: boolean;
}
/** `ncc_home_read`'s answer. */
export interface HomeReadPayload {
    readonly home: string;
    readonly rel: string;
    /** The encoding the text was actually decoded with. */
    readonly encoding: string;
    readonly bytes: number;
    readonly totalLines: number;
    /** 1-based, inclusive; what the returned text covers. */
    readonly from: number;
    readonly to: number;
    readonly truncated: boolean;
    /** Key names whose values were masked, so the answer can say it did. */
    readonly masked: readonly string[];
    readonly text: string;
}
/** How much of a Home's metadata tree an index covers. */
export interface MetaCountsView {
    readonly files: number;
    readonly entities: number;
    readonly enums: number;
    readonly fields: number;
    readonly enumItems: number;
}
/** What comparing an index against the installation concluded. */
export interface MetaFreshnessView {
    /** `fresh` — the index still describes the tree; `stale` — it does not; `unknown` — nothing built. */
    readonly state: 'fresh' | 'stale' | 'unknown';
    readonly changed: number;
    readonly added: number;
    readonly removed: number;
}
/** A build that is running, so the panel can show where it is. */
export interface MetaBuildView {
    readonly running: boolean;
    readonly parsed: number;
    readonly total: number;
    readonly files: number;
    readonly current: string;
    readonly startedAt: string;
    /** Why the last build failed, if it did. */
    readonly error?: string;
}
/** The metadata index built for a Home's version, when one exists. */
export interface MetaIndexStatusView {
    /** False when nothing is stored for this version yet. */
    readonly indexed: boolean;
    readonly version: string;
    readonly builtAt?: string;
    readonly counts?: MetaCountsView;
    /** Size of the stored file, in bytes. */
    readonly bytes?: number;
    /** The Homes whose files went into it. */
    readonly sourceHomes?: readonly string[];
    readonly freshness?: MetaFreshnessView;
    readonly build?: MetaBuildView;
}
/** `GET /yon/api/homes/<id>/meta-index` payload. */
export interface MetaIndexPayload {
    readonly home: string;
    readonly status: MetaIndexStatusView;
}
/**
 * A class-index build that is running, so the panel can show where it is.
 *
 * Counts jars rather than files, because that is the unit this walk moves in: a jar is
 * one read of two small regions, and the loose files it also picks up are a rounding
 * error beside the ~8,500 jars a real installation holds.
 */
export interface ClassBuildView {
    readonly running: boolean;
    readonly jars: number;
    readonly classes: number;
    /** The file being read, relative to the Home. */
    readonly current: string;
    readonly startedAt: string;
    /** Why the last build failed, if it did. */
    readonly error?: string;
}
/**
 * The class index built for a Home's version, when one exists.
 *
 * Separate from {@link HomeIndexView}, which is what a *list* row carries. This one is
 * the answer to a call about one Home, so it also carries the build in flight — and it
 * is read through the file's head rather than parsed, because the panel asks for it
 * every time the selection changes.
 */
export interface ClassIndexStatusView {
    /** False when nothing is stored for this version yet. */
    readonly indexed: boolean;
    readonly version: string;
    readonly builtAt?: string;
    readonly totalJars?: number;
    readonly totalClasses?: number;
    /** Size of the stored file, in bytes. */
    readonly bytes?: number;
    readonly build?: ClassBuildView;
}
/** `GET /yon/api/homes/<id>/class-index` payload. */
export interface ClassIndexPayload {
    readonly home: string;
    readonly status: ClassIndexStatusView;
}
/**
 * `GET /yon/api/homes` gains this when a Home's version has a metadata index.
 *
 * Carried on {@link HomeView} rather than as a separate call, for the same reason the
 * class index is: the list is what the panel already refreshes, and a second request
 * would mean the row and its index could disagree about which version they describe.
 */
export interface HomeMetaIndexView {
    readonly builtAt: string;
    readonly counts: MetaCountsView;
    readonly bytes: number;
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
    /**
     * Topic pages beside the entity pages (`wiki/topics`), counted directly from
     * the directory.
     *
     * Not in the index — `wiki_lookup` still reads entity pages only — but a vault
     * whose whole digested corpus lives in `wiki/topics` answered `0` to "how many
     * pages", and that number, read alone, says the knowledge base is empty. The
     * count is here so the panel can say what is actually there.
     */
    readonly topicPages?: number;
    /** Source pages (`wiki/sources`), same reasoning as {@link topicPages}. */
    readonly sourcePages?: number;
    /** When the cached index was built; absent until one is. */
    readonly indexedAt?: string;
    /** False when the registered path no longer holds a readable vault. */
    readonly ready: boolean;
}
/** Body of `GET /yon/api/wiki`, and of a rebuild's answer. */
export interface WikiListPayload {
    readonly vaults: readonly WikiVaultView[];
}
/**
 * The directories a vault's entity pages may live in, in the order they are tried.
 *
 * Shared rather than owned by the reader, because the panel has to name them too:
 * a registration whose directory holds none of these is the one state where the
 * operator needs to be told what to create, and a list typed out again in a
 * translation string is a list that drifts from the one being searched.
 *
 * The Chinese names are not hypothetical — `yon-ncc-obsidian` was initialised with
 * `wiki/实体`, `wiki/来源`, `wiki/模块`, so a reader that only knows the English
 * convention silently finds nothing there.
 */
export declare const WIKI_ENTITY_DIRS: readonly ["wiki/entities", "wiki/实体", "entities", "实体"];
/**
 * Where a vault's non-entity pages may live, relative to the vault root.
 *
 * Entity pages answer "which table and which columns"; these two answer "what
 * does this document say". A digested PDF lands here — one index page per source
 * under `sources/`, one page per chapter or module under `topics/` — and neither
 * carries an entity URI, so neither can be an entity page.
 *
 * The Chinese spellings are live for the same reason as {@link WIKI_ENTITY_DIRS}:
 * `yon-ncc-obsidian` was initialised with `wiki/模块` and `wiki/来源`.
 */
export declare const WIKI_PROSE_DIRS: readonly ["wiki/topics", "wiki/sources", "wiki/模块", "wiki/来源"];
/** Which of the two non-entity kinds a page is. */
export type WikiProseKind = 'topic' | 'source';
/** One non-entity page as the index and the panel see it. */
export interface WikiProseView {
    readonly kind: WikiProseKind;
    /** Vault id, filled in by a list that spans every registered vault. */
    readonly vault?: string;
    /** Page name without `.md`; this is what `[[links]]` and `wiki_read` use. */
    readonly page: string;
    /** Path relative to the vault root, forward-slashed. */
    readonly file: string;
    /** Title from the `#` line, falling back to the page name. */
    readonly name: string;
    /** First paragraph (or lead blockquote), truncated to 160 characters. */
    readonly summary?: string;
    readonly tags?: readonly string[];
    /** `platform_version` from the page's frontmatter. */
    readonly version?: string;
    readonly status?: string;
    readonly updated?: string;
    /** Frontmatter `sources` — the extract text a digested page rests on. */
    readonly sources?: readonly string[];
    /** `##` headings, at most 12, for finding a page by its sections. */
    readonly headings?: readonly string[];
}
/** Body of `GET /yon/api/wiki/prose`. */
export interface WikiProseListPayload {
    readonly term: string;
    /** How many pages matched before the limit was applied. */
    readonly count: number;
    readonly hits: readonly WikiProseView[];
}
/**
 * Body of `POST /yon/api/wiki/vaults` and `PUT /yon/api/wiki/vaults/<id>`.
 *
 * No `id`, unlike a Home: that one is derived from the product line and version it
 * is registered under, and this one is derived from the directory the operator
 * picked. Either way it is the service's to mint and nobody's to type, which is
 * what makes it immutable on edit rather than a field to validate.
 *
 * `label` is here and is not derived, because there is nothing to derive it from:
 * a Home is `<产品线><版本>`, while a vault's name is whatever the operator calls
 * that knowledge base. It defaults to the directory's own name in the form.
 */
export interface SaveVaultInput {
    readonly label: string;
    /** Absolute vault root; both separators are accepted on input. */
    readonly path: string;
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
 * A directory of pages this plugin's index does not read.
 *
 * The index covers entity pages and nothing else — the graph, the capability
 * grades and every reader here are built on them. That is a decision; letting a
 * count of entity pages stand for the whole vault is not. A vault whose prose
 * lives in `wiki/topics`, as `yon-ncc-obsidian`'s own schema puts it, answers
 * `0` to "how many pages did you scan", and read on its own that number says the
 * knowledge base is empty. Naming what was skipped is the difference between
 * "nothing here" and "13 pages here, none of which this tool can see".
 */
export interface WikiUnindexedDir {
    /** Id of the vault the directory lives in. */
    readonly vault: string;
    /** Vault-relative, POSIX-joined: `wiki/topics`. */
    readonly dir: string;
    /** Absolute directory, forward-slashed, so a reader can go open the files. */
    readonly path: string;
    /** Markdown files directly inside it. */
    readonly pages: number;
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
    /** Entity pages only — see {@link WikiUnindexedDir} for what this excludes. */
    readonly pages: number;
    /** Topic pages in the same index (`wiki/topics`). */
    readonly topicPages?: number;
    /** Source pages in the same index (`wiki/sources`). */
    readonly sourcePages?: number;
    /** Page directories the index skipped, so `pages` is never read as the vault's size. */
    readonly unindexed: readonly WikiUnindexedDir[];
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
    /** Entity pages only, across the vaults searched. */
    readonly scanned: number;
    /** Pages in those vaults the search could not have matched — see {@link WikiUnindexedDir}. */
    readonly unindexed: readonly WikiUnindexedDir[];
    readonly hits: readonly WikiSearchHit[];
}
/** Body of `GET /yon/api/wiki/citers`. */
export interface WikiCitersPayload {
    readonly uri: string;
    readonly pages: readonly string[];
}
/**
 * 一条前端源码工程所属的产品线。
 *
 * 目前只有 NCC。旗舰版的前端是另一套东西（MDF），与这里 `hotwebs/` 多页脚手架
 * 的 `src/{领域}/{模块}/{节点}/{页面类型}/index.js` 没有共同约定，放进同一个
 * 登记里会让探测规则互相矛盾——一条判定"没有 src/ 就不是源码工程"的规则，
 * 对旗舰版就是错的。留成联合类型，是为了将来多一条产品线时只改这里。
 */
export type FrontendProduct = 'ncc';
/** 每条产品线，按显示顺序（客户端把它们画成选项）。 */
export declare const FRONTEND_PRODUCTS: readonly FrontendProduct[];
/**
 * 前端源码的版本列表，按产品线分。
 *
 * 与 {@link HOME_VERSIONS} 分开，而不是共用一张。两张表回答的不是同一个问题：
 * 那边是"这台机器上装过哪些版本"，这边是"手里有哪些版本的前端源码"。实测本机
 * 就有对不上的情况——2005、2505 有源码工程而安装目录未必登记，反过来也有只装了
 * 运行态、没有源码的版本。合成一张，就得在其中一边说谎。
 */
export declare const FRONTEND_VERSIONS: Readonly<Record<FrontendProduct, readonly HomeVersionOption[]>>;
/**
 * 一个前端源码工程叫什么：产品线加版本。
 *
 * 和 {@link homeLabelOf} 同一条规则、同一份理由：一个版本只留一份源码，所以
 * `(product, version)` 已经是这行的身份，再要一个名字只是让人多填一个字段、
 * 并让两行描述同一件事时看起来不同。表里没有的版本（表单里的「其他」）按
 * 同样的拼法起名，因为登记得上是它的前提，起得出名是它的结果。
 * @param product - 哪条产品线。
 * @param version - 存下来的版本号（`2005`）。
 * @returns 显示名。
 */
export declare function frontendLabelOf(product: FrontendProduct, version: string): string;
/**
 * 探测对一个目录得出的结论。
 *
 * `deployed` 是这套登记里最值钱的判定：NCC 安装目录的 `hotwebs/` 和源码工程
 * 长得像，里面却没有 `src/`——那是编译后的页面，不是能改的源码。把它当源码
 * 登记，模型会读一堆压缩过的 js 还以为是工程本身。
 *
 * `not-a-project` 与 `not-found` 分开：一个是"目录在、但不像源码工程"，一个是
 * "目录根本读不出来"。前者可能是选错了层级（选到了 `hotwebs` 的上一级），
 * 后者是路径没了，面板要说的话不同。
 */
export type FrontendShape = 'scaffold' | 'deployed' | 'not-a-project' | 'not-found';
/** 一个领域（`src/` 下的一级目录）在探测里留下的数。 */
export interface FrontendDomainView {
    readonly name: string;
    /** 这个领域下识别出的页面入口数。 */
    readonly pages: number;
    /** 这个领域下文件的字节数，用来指出 `platform/` 这种"库而不是业务"的大块。 */
    readonly bytes: number;
}
/** 一次探测，两半都读这一个结果。 */
export interface FrontendProfileView {
    readonly probedAt: string;
    readonly shape: FrontendShape;
    /**
     * `src/{领域}/{模块}/{节点}` 去重后的数目——一页可能有 list、card、main 多个入口，
     * 而人说的"一个功能/一个页面"是这一层。
     */
    readonly nodes: number;
    /** `src/{领域}/{模块}/{节点}/{页面类型}/index.js` 的数目。 */
    readonly pages: number;
    /** 页面类型那一层的取值（`list`、`card`、`main`…），去重后按字母序。 */
    readonly pageTypes: readonly string[];
    readonly domains: readonly FrontendDomainView[];
    /** 工程里的文件数，`node_modules/`、`dist/`、`.git/` 已排除。 */
    readonly files: number;
    readonly bytes: number;
    /** 走过上限时为 true，此时 `files`/`bytes`/`pages` 都只是下限。 */
    readonly capped: boolean;
    readonly hasNodeModules: boolean;
    readonly hasDist: boolean;
    /** `config.json` 的 `buildEntryPath`，拍平成字符串数组。 */
    readonly buildEntry: readonly string[];
    readonly proxy?: string;
    readonly devPort?: number;
    /** `package.json` 的 name，用来提示这份源码属于哪个工程。 */
    readonly packageName?: string;
    readonly warnings: readonly string[];
}
/** 页面索引的一个摘要，挂在列表行上，好让模型知道它是否可用、是否过期。 */
export interface FrontendPageIndexView {
    readonly builtAt: string;
    readonly nodes: number;
    readonly pages: number;
    /** 索引描述的目录与登记路径不一致，需要重建。 */
    readonly stale: boolean;
}
/** 一条已登记的前端源码工程，面板与模型都读这个形状。 */
export interface FrontendView {
    /** 稳定的 id，登记时生成，编辑时不变。 */
    readonly id: string;
    /** 显示名，是 {@link frontendLabelOf} 作用于下面两个字段。 */
    readonly label: string;
    /** 正斜杠形式；输入时两种分隔符都收。 */
    readonly path: string;
    readonly product: FrontendProduct;
    readonly version: string;
    readonly isDefault: boolean;
    /** 目录读不出来、或不再像源码工程时为 false；这一行仍然显示。 */
    readonly ready: boolean;
    readonly profile?: FrontendProfileView;
    /** 页面索引，没有建过时缺省。 */
    readonly pageIndex?: FrontendPageIndexView;
}
/** `GET /yon/api/frontends` 的载荷。 */
export interface FrontendListPayload {
    readonly frontends: readonly FrontendView[];
    /** 登记文件本身的绝对路径，好让面板说出来。 */
    readonly configPath: string;
    /** 文件存在但解析不了时为 false。 */
    readonly complete: boolean;
    readonly error?: string;
}
/**
 * `POST /yon/api/frontends` 与 `PUT /yon/api/frontends/<id>` 的请求体。
 *
 * 没有 `label`：名字由 {@link frontendLabelOf} 从这两个字段算出来，表单没有
 * 可问的，服务也没有可相信的。
 */
export interface SaveFrontendInput {
    readonly path: string;
    readonly product: FrontendProduct;
    readonly version: string;
    readonly isDefault?: boolean;
}
/** `ncc_fe_find` 命中的一个文件，相对工程根。 */
export interface FrontendFileView {
    readonly rel: string;
    readonly size: number;
}
/** `ncc_fe_find` 的答案。 */
export interface FrontendFindPayload {
    readonly frontend: string;
    readonly matches: readonly FrontendFileView[];
    /** 访问过的目录项数；走到上限时匹配数只是下限。 */
    readonly scanned: number;
    readonly capped: boolean;
    /** 被跳过的目录，相对工程根；模型要知道 `platform/` 不在结果里。 */
    readonly skipped: readonly string[];
}
/** `ncc_fe_read` 的答案。 */
export interface FrontendReadPayload {
    readonly frontend: string;
    readonly rel: string;
    /** 实际用来解码的编码。 */
    readonly encoding: string;
    readonly bytes: number;
    readonly totalLines: number;
    /** 1 起算、闭区间：返回的文本覆盖的范围。 */
    readonly from: number;
    readonly to: number;
    readonly truncated: boolean;
    /** 被遮住的键名，好让答案说出它遮过。 */
    readonly masked: readonly string[];
    readonly text: string;
}
/** 一个页面的一个构建入口（`list`、`card`、`main`…）。 */
export interface FrontendPageEntryView {
    readonly kind: string;
    /** 相对工程根的入口文件路径。 */
    readonly rel: string;
    readonly bytes: number;
}
/**
 * 一个页面节点：`src/{领域}/{模块}/{节点}`，也就是人说的"一个页面/一个功能"。
 *
 * 一个节点可以有多个入口（列表一个、卡片一个），所以节点数与入口数是两个数。
 */
export interface FrontendPageNodeView {
    readonly domain: string;
    readonly module: string;
    readonly node: string;
    /** 相对工程根的节点目录，例如 `src/cmp/bank/bankcontrast_tzwy`。 */
    readonly dir: string;
    readonly entries: readonly FrontendPageEntryView[];
    readonly files: number;
    readonly bytes: number;
}
/** `ncc_fe_pages` 的答案（索引没建时由服务惰性建一次）。 */
export interface FrontendPagesPayload {
    readonly frontend: string;
    readonly builtAt: string;
    /** 索引里的全量数，不受过滤影响。 */
    readonly totalNodes: number;
    readonly totalPages: number;
    /** 过滤后命中的节点数；`nodes` 只是它的前 `limit` 个。 */
    readonly matched: number;
    readonly nodes: readonly FrontendPageNodeView[];
}
/** 面板的页面索引块读的状态。 */
export interface FrontendPageStatusView {
    readonly builtAt: string;
    readonly nodes: number;
    readonly pages: number;
    /** 索引描述的目录与登记路径不一致——登记被改过，需要重建。 */
    readonly stale: boolean;
    /** 索引文件本身。 */
    readonly path: string;
}
/** 一层目录的内容，供面板的页面树展开一个节点。 */
export interface FrontendDirEntryView {
    readonly name: string;
    readonly rel: string;
    readonly directory: boolean;
    readonly bytes: number;
}
/** `GET /yon/api/frontends/<id>/dir?path=…` 的答案。 */
export interface FrontendDirPayload {
    readonly frontend: string;
    readonly dir: string;
    readonly entries: readonly FrontendDirEntryView[];
}
/** 内容搜索命中的一行。 */
export interface FrontendGrepHit {
    readonly rel: string;
    /** 1 起算。 */
    readonly line: number;
    /** 这一行的开头，超长会截断。 */
    readonly text: string;
}
/** `ncc_fe_grep` 的答案。 */
export interface FrontendGrepPayload {
    readonly frontend: string;
    readonly pattern: string;
    readonly matches: readonly FrontendGrepHit[];
    readonly filesScanned: number;
    readonly filesMatched: number;
    /** 命中数或目录项走到上限。 */
    readonly capped: boolean;
    /** 时间预算用完了，返回的是前 N 条。 */
    readonly timedOut: boolean;
    readonly skipped: readonly string[];
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
    /** 批量体检专用：能验收的组里，流水账里没有任何判定记录的组数。 */
    readonly neverAudited?: number;
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
 * 一条记录说的是哪一类问题。
 *
 * `gap` 是「这套插件做不到 / 做得不够」，`improvement` 是「做得到，但可以更好」。
 * 两者的处理方式不同——前者要补能力，后者只要改措辞或加一步——所以让记录的人
 * 当场分一次，比事后由读的人猜要省事。
 */
export type IterationKind = 'gap' | 'improvement';
/** 两种类型，按显示顺序。 */
export declare const ITERATION_KINDS: readonly IterationKind[];
/** 这条有多挡路。三档够用：要排序的是「先看哪条」，不是「精确到第几名」。 */
export type IterationSeverity = 'high' | 'medium' | 'low';
/** 三档，按显示顺序（由重到轻）。 */
export declare const ITERATION_SEVERITIES: readonly IterationSeverity[];
/**
 * 这条现在处于什么状态。
 *
 * `open` → `accepted`（决定要做）→ `fixed`（做完了）；`dropped` 是决定不做。
 * 只有人能改它——模型那侧没有改状态的工具，理由写在 `iteration-tools.ts` 的头注释里。
 */
export type IterationStatus = 'open' | 'accepted' | 'fixed' | 'dropped';
/** 四种状态，按显示顺序。 */
export declare const ITERATION_STATUSES: readonly IterationStatus[];
/**
 * 台账里的一行：模型在真实开发中察觉到的插件短板。
 *
 * 八个字段，分两半。**人给不了的那半**（`symptom`、`scene`、`context`）只有当时
 * 在场的人写得出，而且过一会儿就忘了；**事后能补的那半**（`severity`、`status`、
 * `suggestion`）留空也不影响这条成立。所以前者是模型记录的必填项，后者可以空着
 * 等人在面板上补。
 *
 * 没有作者字段：记的来源只有一个（模型），加上「谁写的」只会多一个永远填同一个
 * 值的格子。
 */
export interface IterationRowView {
    /** 宿主生成的 id，形如 `it-<时间戳>-<随机>`。 */
    readonly id: string;
    /**
     * ISO 时间戳，由宿主盖章。
     *
     * 不是模型传的参数：会话里没有可信的时钟，而一条记录「什么时候发生的」是它
     * 唯一的排序依据，让调用方自己填等于允许它写错。
     */
    readonly at: string;
    readonly kind: IterationKind;
    readonly severity: IterationSeverity;
    /** 在什么场景下遇到的：当时在做的任务。 */
    readonly scene: string;
    /** 当时实际发生了什么。写症状，不写诊断。 */
    readonly symptom: string;
    /** 期望它变成什么样。可以空着——察觉的时候未必想得到怎么改。 */
    readonly suggestion: string;
    /** 这条说的是哪件东西：工具名 / 面板名 / 文件名。 */
    readonly target: string;
    /** 复现上下文：命令、路径、报错、环境。 */
    readonly context: string;
    readonly status: IterationStatus;
}
/** Body of `GET /yon/api/iterations`. */
export interface IterationListPayload {
    readonly rows: readonly IterationRowView[];
    /** 台账文件的位置，方便直接打开看。 */
    readonly path: string;
    /** 文件在，但读不出来时才有：空列表和「还没记过」长得一样，所以要分开。 */
    readonly error?: string;
}
/** Body of `POST /yon/api/iterations` — also what the model's tool takes. */
export interface SaveIterationInput {
    readonly kind: IterationKind;
    readonly symptom: string;
    readonly severity?: IterationSeverity;
    readonly scene?: string;
    readonly suggestion?: string;
    readonly target?: string;
    readonly context?: string;
}
/**
 * Body of `PATCH /yon/api/iterations/<id>`.
 *
 * Two fields, and deliberately not the text: rewriting someone's account of what
 * happened is how a record of the past becomes a record of the present. A row can
 * be re-triaged and re-prioritised; what it says stays as it was written.
 */
export interface UpdateIterationInput {
    readonly status?: IterationStatus;
    readonly severity?: IterationSeverity;
}
/** Body of `POST /yon/api/iterations` as the route answers it. */
export interface IterationCreatedPayload {
    readonly row: IterationRowView;
    /** False when an identical open row already existed and nothing was appended. */
    readonly created: boolean;
}
/**
 * 一个浏览器属于哪一套调试协议。
 *
 * 这一栏不是给人看的分类，它决定**启动参数**和**怎么确认它起来了**：Chromium 系
 * 用 `--remote-debugging-port`，起来之后 `http://127.0.0.1:<端口>/json/version`
 * 会应答；Firefox 用 `-start-debugger-server`，那套协议**根本没有这个 HTTP 端点**，
 * 只能靠 TCP 能不能连上来判断。所以它必须存在，且必须一栏到底。
 */
export type BrowserFamily = 'chromium' | 'firefox';
/** 两个家族。 */
export declare const BROWSER_FAMILIES: readonly BrowserFamily[];
/**
 * 调试端口的默认值与合法区间。
 *
 * 9222 是 Chromium 系那个约定俗成的端口，也是本仓 `preview/shots.mjs` 之外唯一一个
 * 使用者一眼认得的数字。下限取 1024 而不是 1：低于它的端口需要特权，而这件事没有
 * 任何需要特权的理由。三处共用一份——宿主校验、客户端当场拦、以及界面上的提示，
 * 各写一遍迟早就对不上。
 */
export declare const DEFAULT_BROWSER_PORT = 9222;
/** @see DEFAULT_BROWSER_PORT */
export declare const MIN_BROWSER_PORT = 1024;
/** @see DEFAULT_BROWSER_PORT */
export declare const MAX_BROWSER_PORT = 65535;
/**
 * 一个登记在册的浏览器。
 *
 * `id` 与 `path` 分开，是因为它们**变的频率不同**：`id` 来自扫描表，装在哪儿都一样
 * （换目录、升级、重装都不会改它），而 `path` 会变。调试用的用户数据目录是**按 id
 * 命名**的（`<profile 根>/<id>/`），所以 id 稳定等于使用者登录过的那个 profile 不会
 * 因为重扫一次就被换掉——这是这一对字段分开的全部理由。
 */
export interface BrowserView {
    /** 稳定且不可编辑，形如 `chrome`、`edge`、`firefox`。 */
    readonly id: string;
    readonly family: BrowserFamily;
    /** 产品名，如 `Google Chrome`、`Microsoft Edge`。 */
    readonly product: string;
    /** exe 的绝对路径。存正斜杠形式，读起来两个平台一样。 */
    readonly path: string;
    /** 这个浏览器的用户数据目录。默认在插件根目录下，可改。 */
    readonly profileDir: string;
    /** 上次用过的端口，按行记住。 */
    readonly port: number;
    /** 上次用过的起始网址；空串表示开新标签页。 */
    readonly startUrl: string;
    /** 最近一次检查时这个路径还在不在。 */
    readonly pathExists: boolean;
    /** 找到过、现在不在了。**不会被自动删掉**——删了它的 profile 就成了孤儿。 */
    readonly stale: boolean;
    /** 启动日志的位置，就在 profile 目录里。 */
    readonly logPath: string;
    /** 最后一次扫到它的时间。 */
    readonly lastFoundAt?: string;
}
/** 一个实例还活着吗。`unknown` 表示问不出来（探测超时），不是「没了」。 */
export type BrowserRunLiveness = 'alive' | 'gone' | 'unknown';
/**
 * 本面板启动过的一个实例。
 *
 * 存下来是为了**跨 DSH 重启**仍然成立：浏览器是 detached 起的，DSH 退出它还在跑。
 * 不落盘的话，重启后的面板既看不到它、也停不掉它，而使用者的浏览器还占着那个端口。
 */
export interface BrowserRunView {
    readonly runId: string;
    readonly browserId: string;
    readonly label: string;
    readonly family: BrowserFamily;
    /**
     * `spawn` 返回的进程号，**只作线索**。
     *
     * 它可能只是浏览器的一个 stub：已经有一个同 profile 的实例在跑时，新进程会把请求
     * 转交给旧实例然后自己退出，所以这个号未必是真正占着端口的那个进程。停止的时候认的
     * 是端点身份，不是它。
     */
    readonly pid?: number;
    readonly port: number;
    readonly profileDir: string;
    readonly startedAt: string;
    /**
     * 怎么连它。
     *
     * Chromium 系是 `http://127.0.0.1:<端口>/json/version`；Firefox 是
     * `tcp://127.0.0.1:<端口>` —— 后者不是个能点开的地址，只是把「它监听在这儿」这件事
     * 说清楚，因为 Firefox 那套协议没有 HTTP 端点可给。
     */
    readonly endpoint: string;
    /** 端口探测通了吗。**false 不等于失败**，只是没能在时限内确认。 */
    readonly ready: boolean;
    readonly alive: BrowserRunLiveness;
    /** Chromium 的身份令牌，停止时用来确认端口上那个还是不是本面板起的。 */
    readonly debuggerUrl?: string;
    readonly note?: string;
}
/** Body of `GET /yon/api/browsers`. */
export interface BrowserListPayload {
    readonly browsers: readonly BrowserView[];
    readonly runs: readonly BrowserRunView[];
    /** 登记文件的位置，方便直接打开看。 */
    readonly configPath: string;
    /** 实例台账的位置。 */
    readonly runsPath: string;
    readonly platform: string;
    /** 当前平台支不支持自动扫描。false 时面板不显示扫描按钮。 */
    readonly scanSupported: boolean;
    /** 上一次扫描的时间；没有过就是「还没扫过」。 */
    readonly scannedAt?: string;
    /**
     * 这份清单是不是完整的。
     *
     * false 只可能是两个文档里有一个读不出来（手改坏了）。此时 `browsers`/`runs` 是空的
     * ——但它们**不代表本机没有浏览器**，所以必须有个字段把「读不出来」和「确实没有」分开，
     * 否则面板会把一个坏文件显示成一台干净的机器。
     */
    readonly complete: boolean;
    /** 读不出来时的原话，直接给使用者看。 */
    readonly error?: string;
    /** 平台不支持等说明，不是错误。 */
    readonly note?: string;
}
/** Body of `POST /yon/api/browsers/scan`. */
export interface ScanBrowsersPayload {
    readonly browsers: readonly BrowserView[];
    /** 这次新扫到的 id。 */
    readonly added: readonly string[];
    /** 这次路径有变化的 id。 */
    readonly updated: readonly string[];
    /** 登记过、这次没扫到的 id。保留着，只是标了 stale。 */
    readonly stale: readonly string[];
    readonly scannedAt: string;
    /** 扫描没做成时的说明，例如平台不支持。 */
    readonly note?: string;
}
/**
 * Body of `PUT /yon/api/browsers/<id>`。
 *
 * 只能改这四项。`id`/`family`/`product` 不给改：它们决定启动参数与探测方式，改了
 * 就等于把这一行偷偷换成了另一个东西，而它的 profile 目录还挂在那儿。
 */
export interface SaveBrowserInput {
    readonly path?: string;
    readonly profileDir?: string;
    readonly port?: number;
    readonly startUrl?: string;
}
/** Body of `POST /yon/api/browsers/<id>/launch`。三项缺省即用该行记住的值。 */
export interface LaunchBrowserInput {
    readonly port?: number;
    readonly startUrl?: string;
    readonly profileDir?: string;
}
/** 刚才那个实例是怎么结束的。`none` 表示没有动手。 */
export type BrowserStopMethod = 'cdp' | 'taskkill' | 'none';
/** Body of `POST /yon/api/browsers/runs/<runId>/stop`. */
export interface StopBrowserResult {
    /** 处理的哪一条。 */
    readonly runId: string;
    /**
     * 这条记录从台账里清掉了没有。
     *
     * **和 `stopped` 不是一回事**：端口上已经是别人的东西时，本面板不动手，但也**不会**
     * 把这条记录清掉——那条记录正是「本面板起过一个浏览器、现在不知道它去哪了」的唯一在案
     * 记录。
     */
    readonly removed: boolean;
    readonly stopped: boolean;
    readonly method: BrowserStopMethod;
    /**
     * 没停成、或停得不寻常时的说明。
     *
     * 「无法确认端口上那个还是不是本面板起的」会走到这里——那时候**不动手**比猜着杀
     * 一个进程重要得多。
     */
    readonly note?: string;
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
/**
 * 一个需求条目走到哪一步了。
 *
 * 比 `ProjectStatus` 的三档细，因为条目要走完「提出 → 开发 → 待验收 → 完成」这条线；
 * 「搁置」与「已废弃」分开，因为前者会回来、后者不会。存储里写英文键，中文只出现在
 * 给人看的地方（面板词条、宿主追加的追溯行）——与 `ProjectStatus` 同一手法。
 */
export type RequirementStatus = 'proposed' | 'working' | 'review' | 'done' | 'onHold' | 'dropped';
/** 全部状态，按面板上该显示的顺序。 */
export declare const REQUIREMENT_STATUSES: readonly RequirementStatus[];
/**
 * 一条需求条目的摘要——列表页读的就是这些。
 *
 * 每个字段只有一个权威，来源不同是刻意的：`id`/`projectId`/`createdAt` 来自
 * `index.json`，`name`/`status`/`updatedAt` 来自 `entry.md` 的 frontmatter。台账里
 * **不**存名称与状态，否则就有了第二个真相：模型改了 md 忘了改 json，面板会一直显示
 * 旧名字。代价是列表要读每个 frontmatter，买的是「不会显示错」。
 */
export interface RequirementSummary {
    readonly id: string;
    /** 所属项目的 `projectId`。归属只在台账里，所以换项目是改台账一行，不搬目录。 */
    readonly projectId: string;
    /** 简要名称。 */
    readonly name: string;
    readonly status: RequirementStatus;
    /** 建档时间，来自台账。 */
    readonly createdAt: string;
    /** 最近改动时间，来自 frontmatter（标注、改名、改状态都会推动它）。 */
    readonly updatedAt: string;
    /** `entry.md` 相对库根的路径，面板与模型都用它定位。 */
    readonly file: string;
}
/**
 * 一条需求条目读全时的样子。
 *
 * `body` 是**模型默认看到的那一份**：删除线段已经剥掉——作废的说法对干活没用，而标注
 * 只增不减，不剥就会把该看的正文挤出上下文。
 */
export interface RequirementView extends RequirementSummary {
    /** 正文，含「## 标注」一节；删除线段已剥除。 */
    readonly body: string;
    /**
     * 正文原文，删除线还在。
     *
     * **只有显式要历史时才给**（`read(ref, { history: true })`）：这一份是给人看
     * 「改过什么」的，平时不必占上下文。
     */
    readonly raw?: string;
    /**
     * 标注逐段（和 `raw` 同一份原文：划掉的旧说法还在）。
     *
     * 同样是**只在要历史时给**。落地这个字段是面板逼出来的：详情页的「追溯」要按段
     * 显示——段数、每段一行。让面板自己从 `raw` 里切，等于把「`## 标注` 这个标题长什么
     * 样」「空行分段」这两条规则复制到客户端第二份，而它们只该有一处（`requirement-doc.ts`
     * 的 `parseEntry`）。所以这里给已经切好的。
     */
    readonly notes?: readonly string[];
    /**
     * 条目自己那段话（正文），**标注那一段不在里面**——`body` 里有，这里没有。
     *
     * 与 `notes` 配对才成立：面板的详情页把文件按「标注」这个标题切成两块画（正文一块、
     * 追溯一块），而 `body` 是 prose 与 notes 拼起来的那一份，单用它两块都会画重。
     * 同样是原文（删除线还在），同样只随 `history` 出现。
     */
    readonly prose?: string;
}
/** `GET /yon/api/requirements` 的返回。 */
export interface RequirementListPayload {
    readonly rows: readonly RequirementSummary[];
    /** 库根，面板显示它、模型用它说明东西存在哪。 */
    readonly root: string;
    /**
     * 台账在、但读不出来时才有。
     *
     * 和 `IterationListPayload.error` 同一理由：空列表与「还没记过」长得一模一样，必须
     * 分开。
     */
    readonly error?: string;
    /**
     * 台账里有记录、但 `entry.md` 读不出来的那些 id。
     *
     * 不算进 `rows`（它给不出名称与状态），但也不许静默消失——那会让一条存在过的需求在
     * 列表里凭空不见。面板据此显示「N 条读不出来」。
     */
    readonly unreadable: readonly string[];
}
/** Body of `POST /yon/api/requirements`. */
export interface CreateRequirementInput {
    /** 已经解析好的 `projectId`；名称解析在调用方（工具／路由）做。 */
    readonly projectId: string;
    readonly name: string;
    readonly body?: string;
    /** 不传即 `proposed`（待开发）。 */
    readonly status?: RequirementStatus;
}
/** Body of `POST /yon/api/requirements/<id>/annotations`. */
export interface AnnotateRequirementInput {
    /** 要追加的一段，**不带日期**——日期由宿主盖章。 */
    readonly text: string;
}
/** Body of `PATCH /yon/api/requirements/<id>`. */
export interface UpdateRequirementInput {
    readonly name?: string;
    readonly status?: RequirementStatus;
}
/**
 * 新建的结果。
 *
 * 是个判别联合而不是「带可选字段的对象」：撞名与建成是两件不同的事，调用方必须分别
 * 处理，用 `created` 一分就分干净了。撞名时**什么都没写**——那是「问过再说」这条口径的
 * 落点，不是一次失败。
 */
export type RequirementCreated = {
    readonly created: true;
    readonly requirement: RequirementView;
} | {
    readonly created: false;
    readonly conflict: RequirementSummary;
};
/**
 * 条目目录下三个文件夹。
 *
 * `user/` 是使用者提供的原件，`generated/` 是模型写的方案与资料，`patches/` 是能直接
 * 落地的补丁。三者的**权限**不同（模型不能写 `user/`），但作为「一个目录」它们一样，
 * 所以列清单、读、删共用一套形状。
 */
export type RequirementDir = 'user' | 'generated' | 'patches';
/** 三个目录，按面板上该显示的顺序：先是他给的，再是你产的。 */
export declare const REQUIREMENT_DIRS: readonly RequirementDir[];
/**
 * 一条附件。
 *
 * `bytes` 与 `modifiedAt` 来自一次 `stat`，所以它们是**磁盘上的事实**，不是台账里的
 * 记录——这里没有台账：一个目录里有什么，就是 `readdir` 说什么。
 */
export interface RequirementFile {
    readonly dir: RequirementDir;
    readonly name: string;
    /** `<id>/<dir>/<name>`，相对库根——与 `RequirementSummary.file` 同一种拼法。 */
    readonly file: string;
    readonly bytes: number;
    /** 最后写入时间，ISO。 */
    readonly modifiedAt: string;
    /**
     * 这一个能不能读成文本。
     *
     * 按扩展名判的**预测**，不是承诺：真正的裁决在读取那一刻（`isBinary` 看头 64 个字节
     * 里有没有 NUL）。两层的分工是——扩展名让清单能一眼看出哪些可读，字节让读取永不吐出
     * 一屏乱码。`note` 说清是哪一层拦的。
     */
    readonly readable: boolean;
    /** 读不了时的一句原因（「这是 docx，要等批 5」；或「它不是文本」）。 */
    readonly note?: string;
    /**
     * 被覆盖掉的旧版本，从旧到新。
     *
     * `generated/` 与 `patches/` 里同名重写就是覆盖，写之前旧内容会先移到
     * `<dir>/.history/<name>/<n>`（`user/` 撞名加 `-2`、不覆盖，所以那里永远是空的）。
     * 省略或空数组表示从没被覆盖过——那正是「现在这一份就是全部」的意思。
     */
    readonly history?: readonly RequirementHistoryStat[];
    /**
     * 这是第几版（1 起）。
     *
     * 只有读某个历史版本时才有；读当前文件时没有这个字段——当前那份没有版本号，
     * 它就是「现在」。
     */
    readonly version?: number;
}
/** 一件附件被覆盖掉的某一版。 */
export interface RequirementHistoryStat {
    /** 1 是第二次写入挤掉的那一版；编号只增、不复用，所以它按序读得通。 */
    readonly version: number;
    readonly bytes: number;
    readonly modifiedAt: string;
}
/**
 * 一个目录里的一堆附件。
 *
 * 分组而不是一张大表，因为面板就是按目录画的：三块标题各自带个数和总大小，空目录也要
 * 出现（「他给的」那一块空着，本身就是一句有用的话）。
 */
export interface RequirementFileGroup {
    readonly dir: RequirementDir;
    readonly files: readonly RequirementFile[];
    /** 这一个目录里所有文件加起来多少字节。 */
    readonly bytes: number;
}
/**
 * 一个条目的三个目录。
 *
 * 一次给全，而不是一个 `dir` 一次——面板打开详情要看三块，分三次请求就是三次
 * `readdir` 的等待；调用方要只取一个目录时传 `only`，那是省字节，不是省往返。
 */
export interface RequirementFileList {
    readonly id: string;
    /** 条目的名称，省得调用方为了报一句话再读一次。 */
    readonly entry: string;
    /** 条目目录的绝对路径。 */
    readonly dir: string;
    readonly groups: readonly RequirementFileGroup[];
}
/** 一次附件读取。 */
export interface RequirementFileRead {
    readonly file: RequirementFile;
    /** 读出来的文本；读不了时是空串，原因在 `note`。 */
    readonly text: string;
    /** 实际用的解码（`utf-8` / `gb18030` / …），让报告能说清是照哪个读的。 */
    readonly encoding: string;
    /** 只读了头一段时为 true——文件比一次读取的上限长。 */
    readonly truncated: boolean;
    readonly note?: string;
}
/** 归档一件使用者原件的结果。 */
export interface RequirementFileImport {
    /** 落到哪一条条目上——HTTP 那一层要拿它拼一句「已归档到 X」。 */
    readonly entry: string;
    readonly file: RequirementFile;
    /**
     * 原来的文件名，**只在撞名改写过时才有**。
     *
     * 有它才说得清「你给的叫 X，库里这条叫 X-2」——不说的话，使用者回头在 `user/` 里
     * 找不到自己那个名字。
     */
    readonly renamedFrom?: string;
}
/**
 * 一条项目记忆属于哪一类。
 *
 * 分这五类是为了**召回时的排布**，不是为了归档：模型先看 `pitfall` 和 `env-fact`，
 * 因为这两类不知道就会做错事；`lesson` 与 `decision` 是背景。
 *
 * 没有「跨项目」这一档，是刻意的：跨项目仍然成立的东西不属于这里，那是知识库
 * （`wiki_write`）的地盘。判定问句与出口写在 `docs/yon-memory-design.md` §7。
 */
export type MemoryType = 'pitfall' | 'decision' | 'preference' | 'env-fact' | 'lesson';
/** 五种类型，按显示顺序（先看会让人做错的）。 */
export declare const MEMORY_TYPES: readonly MemoryType[];
/** 类型的中文名，面板与工具报告共用一份，免得两处各写一遍。 */
export declare const MEMORY_TYPE_TEXT: Readonly<Record<MemoryType, string>>;
/**
 * 一条记忆，按列表读它的样子。
 *
 * `body` 不在这里，理由与 `iteration_*` 注入相同：召回时注入的是标题，正文按需
 * `memory_read` 取——5 条标题约一百字，5 条正文会把上下文吃掉。
 *
 * 没有 `status`，也没有 `by`（谁写的）。前者在定稿时删掉：记忆记的是「事实是什么」，
 * 错了就该改正或删除，留着一个错结论再贴一张「已过期」的标签只是给错误加免责声明。
 * 后者随之失去意义——正文只有模型一个写作者，面板给的只有查看与删除。
 */
export interface MemorySummary {
    /** 宿主生成的 id，形如 `mem-<日期>-<时分秒>-<随机>`。 */
    readonly id: string;
    readonly projectId: string;
    /** 项目名，由服务解析后填上；项目已不存在时退化成 id。 */
    readonly projectName: string;
    readonly type: MemoryType;
    /** 召回时注入的就是它。 */
    readonly title: string;
    readonly tags: readonly string[];
    /** 这条从哪来的：会话、实测、来源文件。是「去哪核实」的线索，不是可信度标签。 */
    readonly source: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}
/** 一条记忆的全文。 */
export interface MemoryView extends MemorySummary {
    readonly body: string;
}
/**
 * 一条记忆，按 `memory_recall` 读它的样子。
 *
 * 比 {@link MemorySummary} 多一段 `snippet`：模型要凭一屏标题决定读哪几条，只有
 * 标题时它只能全读或全不读。摘要来自正文，所以列表路径**会打开文件**——这是它与
 * 注入路径的分工，后者（`recent`）只读索引。
 */
export interface MemoryListRow extends MemorySummary {
    readonly snippet: string;
}
/** Body of `GET /yon/api/memories`. */
export interface MemoryListPayload {
    readonly rows: readonly MemoryListRow[];
    /** 记忆库的位置，方便直接打开看。 */
    readonly path: string;
    /**
     * 库里一共多少条——索引里的记录数，不看这次带了什么条件。
     *
     * `rows` 为空时，它是唯一能分清「库里没有」与「一条都没匹配上」的东西。这两件事在读者
     * 眼里是同一句话，而 `memory_recall` 曾经真的被读成「记忆库是空的」，于是有人重问了一件
     * 早就答过的事。读取失败时它是 0，那种情况看 `error`。
     */
    readonly total: number;
    /** 索引在、但读不出来时才有：空列表和「还没记过」长得一样，所以要分开。 */
    readonly error?: string;
}
/** 新建一条记忆。也走工具。 */
export interface SaveMemoryInput {
    /** 项目 id / 名字 / code。由服务解析成项目 id 后落盘。 */
    readonly project: string;
    readonly title: string;
    readonly body: string;
    readonly type?: MemoryType;
    readonly tags?: readonly string[];
    readonly source: string;
}
/**
 * 改写一条记忆。
 *
 * 只列要改的字段，没列的不动。与 `UpdateIterationInput` 正好相反——那条注释说
 * 「改写一个人对当时发生了什么的叙述，就是让过去的记录变成现在的记录」，所以
 * 迭代表板只让人改状态。记忆不是叙述，它是**当前事实**：事实变了就得改，留一句
 * 错话在库里比改动它危险得多。这是两套记录唯一一处有意的不一致。
 */
export interface UpdateMemoryInput {
    readonly title?: string;
    readonly body?: string;
    readonly type?: MemoryType;
    readonly tags?: readonly string[];
    readonly source?: string;
}
/** 新建一条记忆的结果。 */
export interface MemoryCreated {
    readonly memory: MemoryView;
    /** false 表示同项目内已有一条标题一模一样的，没有重复添加。 */
    readonly created: boolean;
}
/** 一个已登记或已下载的 Arthas。 */
export interface ArthasEnvView {
    readonly id: string;
    /** `arthas-boot.jar` 的路径。 */
    readonly path: string;
    /** 版本；Arthas 首次 attach 才会把自己解压到 `~/.arthas/lib`，在那之前是空串。 */
    readonly version: string;
    /** 启动用的 JDK bin 目录；空串表示借目标 Home 的 ufjdk。 */
    readonly jdk: string;
    readonly isDefault: boolean;
    /** true 是插件自己下载的，false 是使用者指过来的。 */
    readonly managed: boolean;
}
/**
 * 一个可以 attach 的进程。
 *
 * `attached` 的含义比它看起来窄：**agent 的端口是全局的，同一时刻只有一个进程持有它**，
 * 所以这里 true 的至多一行。早先的实现按「端口通不通」逐个进程判断，结果把机器上每个
 * JVM 都标成已挂载 —— 那不只是一个显示错误，它会让命令打到别的进程上而输出看不出区别。
 */
export interface ArthasTargetView {
    readonly pid: number;
    readonly mainClass: string;
    /** `ncc` 表示这个进程带着 `-Dnc.server.location=`，也就是一个 NCC 安装。 */
    readonly kind: 'ncc' | 'java';
    /** NCC 进程服务的安装目录。 */
    readonly home?: string;
    /** 这个进程是不是 agent 的宿主。 */
    readonly attached: boolean;
}
/** 一次进程扫描。 */
export interface ArthasTargetsPayload {
    readonly port: number;
    /** agent 实际所在的 PID；没有 agent 时缺席。 */
    readonly agentPid?: number;
    /** 用来列进程的 `jps` 路径，出错时也回空串。 */
    readonly jps: string;
    readonly targets: readonly ArthasTargetView[];
    /**
     * 扫描失败的原因。
     *
     * 与其余载荷的 `error` 同一个理由：扫不出来和「没有 JVM」在界面上长得一模一样，
     * 而它们要人做的事完全不同（一个去登记 Home，一个是等 NCC 起来）。
     */
    readonly error?: string;
}
/** 一个观测会话在面板上的样子。 */
export interface ArthasSessionView {
    readonly id: string;
    readonly pid: number;
    readonly port: number;
    /** 完整的 Arthas 命令行，原样回放给人看。 */
    readonly command: string;
    /** 被观测的类；手工用 `arthas_exec` 挂的会话没有。 */
    readonly className?: string;
    readonly startedAt: number;
    /** `-n` 的值，也就是这个会话最多会有几次命中。 */
    readonly expected: number;
    readonly state: 'watching' | 'settled' | 'failed' | 'stopped';
    /** 已拿到的 `watch` 结果条数。 */
    readonly hits: number;
    /** 失败原因，含 Arthas 自己的话（ANSI 已剥）。 */
    readonly message?: string;
}
/**
 * 一条结构化结果。
 *
 * 字段是 `results` 数组各 `type` 的并集而不是一个判别联合：类型由 Arthas 决定，
 * 一个这里没见过的 `type` 不该让整条结果解析失败。
 */
export interface ArthasEventView {
    readonly type: string;
    /** `watch`：命中时刻。 */
    readonly ts?: string;
    readonly className?: string;
    readonly methodName?: string;
    readonly accessPoint?: string;
    /** `watch`：调用耗时（毫秒）。 */
    readonly cost?: number;
    /** `watch`：表达式渲染出来的文本。 */
    readonly value?: string;
    /** `enhancer`：增强有没有注册上。 */
    readonly success?: boolean;
    readonly classCount?: number;
    readonly methodCount?: number;
    /** `status`：0 成功、-1 失败。`state` 字段不代表这个。 */
    readonly statusCode?: number;
    readonly message?: string;
}
/** 一个会话连同它已经产出的结果。 */
export interface ArthasSessionDetail {
    readonly session: ArthasSessionView;
    readonly events: readonly ArthasEventView[];
}
/**
 * 操作审计的一条。
 *
 * 「一条」的粒度是一次工具调用，不是一次 HTTP 请求：面板要回答的是「**模型**做了什么」，
 * 而一次 `arthas_exec` 可能内部发好几条命令（`arthas_watch_stop` 的 reset 循环就是）。
 * 所以命令原文按调用记，内部循环不计。
 */
export interface ArthasAuditView {
    readonly at: number;
    /** 工具名去掉前缀：`exec` / `sc` / `watch_start` / `capture` / `attach` / `stop`。 */
    readonly kind: string;
    readonly pid: number;
    readonly port: number;
    readonly command: string;
    /**
     * 这一条属于「等于任意代码执行」的那一类（`ognl`）。
     *
     * 面板据此高亮。设计文档第九节把它列为安全要求而不是偏好：模型在服务上执行过什么，
     * 人必须一眼看得见。
     */
    readonly risky: boolean;
    /** 结果的一句话，成功或失败都写。 */
    readonly outcome?: string;
}
/** 面板一次读回来的全部状态。 */
export interface ArthasPanelPayload {
    /** 登记文件的位置，给人一个能去翻的地方。 */
    readonly storePath: string;
    readonly env: readonly ArthasEnvView[];
    readonly agents: ArthasTargetsPayload;
    readonly sessions: readonly ArthasSessionView[];
    readonly audit: readonly ArthasAuditView[];
    /**
     * 危险命令当前是否被解锁。
     *
     * P1 恒为 false：解锁属于面板动作，而「模型不能自己放开」是设计文档第九节写死的。
     * 这个字段现在就出现，是为了让界面能如实显示「已禁用」，而不是等解锁做出来再补。
     */
    readonly unlocked: boolean;
}
/** `POST /yon/api/arthas/attach` 的请求体。 */
export interface ArthasAttachInput {
    readonly pid: number;
    readonly port?: number;
}
/** 一个准备好的离线回放环境。 */
export interface ReplayEnvironment {
    readonly id: string;
    readonly className: string;
    /** 取 classpath 的那个加载器。 */
    readonly hash: string;
    readonly jarPath: string;
    readonly jarBytes: number;
    /** 装了多少条 classpath。 */
    readonly entries: number;
    /** `java -cp` 的起点（`Replay.class` 在这里）。 */
    readonly dir: string;
    readonly builtAt: number;
}
/** 一个 capture 落在盘上的现场。 */
export interface ReplayDump {
    readonly name: string;
    readonly path: string;
    readonly bytes: number;
    readonly at: number;
    /**
     * 抓这个现场的那次 capture 记下的来源，侧车文件在时才有。
     *
     * 没有它，回放就得靠谁记得「这个 .ser 是哪个类的哪个方法产出的」再手打一遍——
     * 而那个手打正是离线循环想省掉的东西。
     */
    readonly origin?: {
        readonly className: string;
        readonly methodName: string;
        readonly expression: string;
        readonly accessPoint: string;
        readonly pid: number;
    };
}
/** 一次回放。 */
export interface ReplayRun {
    readonly id: string;
    readonly dump: string;
    readonly className: string;
    readonly methodName: string;
    readonly outPath: string;
    readonly ok: boolean;
    /** 离线方法自己的耗时，从它写的头里读出来。 */
    readonly costMs?: number;
    readonly at: number;
    readonly output: string;
}
/** 差异里的一行。 */
export interface ReplayDiffLine {
    readonly kind: 'same' | 'left' | 'right';
    readonly text: string;
}
/** 两次回放的对比。 */
export interface ReplayDiff {
    readonly left: ReplayRun;
    readonly right: ReplayRun;
    readonly lines: readonly ReplayDiffLine[];
    /** 有几行不同；0 表示这次改动没有可观察的差异。 */
    readonly changed: number;
    /** 被当作噪声忽略的行（每次都会变的 cost 头）。 */
    readonly ignored: readonly string[];
}
/** 面板一次读回来的重放状态。 */
export interface ReplayPanelPayload {
    readonly workDir: string;
    readonly environments: readonly ReplayEnvironment[];
    readonly dumps: readonly ReplayDump[];
    readonly runs: readonly ReplayRun[];
}
