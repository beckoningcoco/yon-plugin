/**
 * The data contract both halves share: the host serves these shapes over
 * `/yon/api`, and the browser half renders them. Keeping it in one module is
 * what stops the two sides from drifting.
 */

/** A JSON-compatible value: what one dynamic field may hold. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/** Lifecycle of one project. */
export type ProjectStatus = 'active' | 'paused' | 'done'

/** Every status, in display order (the client renders these as options). */
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'done']

/**
 * One project as a list reads it. The main table alone answers this, so a
 * picker (a dropdown of projects) never pays for the child table.
 */
export interface ProjectSummary {
  /** Stable identity; the child table keys its rows by this. */
  readonly projectId: string
  /** Display name. */
  readonly name: string
  /** Short code the operator recognizes (may be empty). */
  readonly code: string
  readonly status: ProjectStatus
  /** Soft-deleted marker: archived projects stay readable but leave pickers. */
  readonly archived: boolean
  readonly createdAt: number
  readonly updatedAt: number
  /** How many dynamic fields the project carries. */
  readonly fieldCount: number
}

/** One project with its child-table fields folded in. */
export interface ProjectDetail extends ProjectSummary {
  /** Dynamic fields, keyed by the operator's own field name. */
  readonly fields: Record<string, JsonValue>
}

/** One dynamic field as the child table stores it. */
export interface ProjectFieldValue {
  /** Field name chosen by the operator (any text, not just identifiers). */
  readonly fieldKey: string
  readonly value: JsonValue
  readonly updatedAt: number
}

/** Body of `POST /yon/api/projects`. */
export interface CreateProjectInput {
  readonly name: string
  readonly code?: string
  readonly status?: ProjectStatus
  /** Fields to write alongside the project; each one becomes a child row. */
  readonly fields?: Record<string, JsonValue>
}

/** Body of `PATCH /yon/api/projects/<id>`. */
export interface UpdateProjectInput {
  readonly name?: string
  readonly code?: string
  readonly status?: ProjectStatus
  readonly archived?: boolean
}

/** Body of `PUT /yon/api/projects/<id>/fields/<fieldKey>`. */
export interface SetFieldInput {
  readonly value: JsonValue
}

/** One failure the API reports instead of a payload. */
export interface ApiError {
  /** Stable machine code (`not-found`, `invalid-input`, `conflict`, `internal`). */
  readonly code: string
  /** Human-readable reason. */
  readonly message: string
}

/** `GET /yon/api/projects` payload. */
export interface ProjectListPayload {
  readonly projects: readonly ProjectSummary[]
}

/** `GET /yon/api/projects/<id>` and every mutation payload. */
export interface ProjectPayload {
  readonly project: ProjectDetail
}

/** One mutation that removes something answers with the affected project. */
export type ProjectMutationPayload = ProjectPayload

/** One skill as the panel lists it. */
export interface SkillView {
  /** Kebab-case identifier the registry addresses it by. */
  readonly name: string
  /** One line, as the model sees it while choosing a skill. */
  readonly description: string
  readonly whenToUse?: string
  /** Discovery origin; `yon-panel` for skills this plugin ships. */
  readonly source: string
  /** Providing registry layer; `runtime` for skills this plugin registers. */
  readonly provider: string
  /**
   * Whether this plugin ships and owns the skill. Only a managed skill can be
   * switched off: the rest come from the operator's own skill directories, and
   * this panel shows them read-only rather than pretending to own them.
   */
  readonly managed: boolean
  /** Whether the skill is currently offered to a session. */
  readonly enabled: boolean
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/** One skill with its instruction body, for the detail pane. */
export interface SkillDetail extends SkillView {
  /** Markdown body, frontmatter removed. */
  readonly content: string
}

/** Body of `PATCH /yon/api/skills/<name>`. */
export interface SetSkillEnabledInput {
  readonly enabled: boolean
}

/** `GET /yon/api/skills` payload. */
export interface SkillListPayload {
  readonly skills: readonly SkillView[]
  /** False when a skill source could not be read; the list is then partial. */
  readonly complete: boolean
}

/** `GET /yon/api/skills/<name>` and the switch payload. */
export interface SkillPayload {
  readonly skill: SkillDetail
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
  readonly key: string
  /** The key this connection sits under in the configuration. */
  readonly configKey: string
  /** The environment branch under that key (`test`, `prod`, `dev`, `analysis`, …). */
  readonly env: string
  /** Declared database type (`oracle`, `dm`, `mysql`, `postgresql`, `oceanbase`, …). */
  readonly dbType: string
  readonly host: string
  readonly port: number
  /** Oracle service name, or the MySQL/PostgreSQL database; empty when unused. */
  readonly serviceName: string
  /** Login names this connection offers — names only, never the secrets beside them. */
  readonly userNames: readonly string[]
  /** Whether a secret is stored for this connection; the value itself stays on the host. */
  readonly hasPassword: boolean
  /** False when the query tool ships no connector for {@link DataSourceView.dbType}. */
  readonly probeable: boolean
  /** The project this connection is bound to, when the operator bound one. */
  readonly binding?: DataSourceBinding
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
  readonly projectId: string
  /** The project's display name, resolved when the answer is built. */
  readonly projectName: string
}

/** `GET /yon/api/datasources` payload. */
export interface DataSourceListPayload {
  readonly sources: readonly DataSourceView[]
  /** Absolute path of the configuration actually read, so the surface can name it. */
  readonly configPath: string
  /** False when the configuration is missing or unreadable; `sources` is then empty. */
  readonly complete: boolean
  /** False when the query tool could not be found; the surface then offers no test. */
  readonly probeAvailable: boolean
  /** Why the configuration could not be read, when it could not. */
  readonly error?: string
  /**
   * Where a first run adopted its starting connections from, when it did.
   *
   * Absent on every ordinary answer: it exists so the surface can say "adopted
   * the connections already on this machine" once, instead of leaving the
   * operator to wonder why a fresh install already lists eleven of them.
   */
  readonly seededFrom?: string
}

/** Body of `PUT /yon/api/datasources/<key>`. Also the create form's payload. */
export interface SaveDataSourceInput {
  /** The connection group's name; may be created by this call. */
  readonly configKey: string
  /** The environment branch to write under that name. */
  readonly env: string
  readonly dbType: string
  readonly host: string
  readonly port: number
  readonly serviceName?: string
  /**
   * Logins to store, keyed by login name. Omit to keep whatever is stored —
   * the surface never receives a password, so it cannot send one back unchanged.
   */
  readonly users?: Readonly<Record<string, string>>
  /** Bind the group to this project; an empty string unbinds it. */
  readonly projectId?: string
}

/** Body of `PUT /yon/api/datasources/<key>/binding`. */
export interface SetDataSourceBindingInput {
  /** The project to bind; an empty string or null unbinds. */
  readonly projectId: string | null
}

/** Outcome of one `SELECT 1` probe. */
export interface DataSourceProbeResult {
  readonly ok: boolean
  /** Wall-clock milliseconds the probe took, the spawn included. */
  readonly latencyMs: number
  /** The login the probe used (the connection's first one, when none was named). */
  readonly user?: string
  /** Rows the answer carried; absent when the failure happened before any result. */
  readonly rowCount?: number
  /** What went wrong, carrying the query tool's own diagnostic text. */
  readonly error?: string
}

// ------------------------------------------------------------------- Home

/**
 * Which product line an installation directory belongs to.
 *
 * The two share a `modules/` layout but not the paths around it, so the label is
 * carried on the registration and decides which skills-side file the mirror
 * writes — `ncc_home_path.json` or `bip_home_path.json`.
 */
export type HomeProduct = 'ncc' | 'bip'

/** Every product, in display order (the client renders these as options). */
export const HOME_PRODUCTS: readonly HomeProduct[] = ['ncc', 'bip']

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
  readonly kind: string
  /** The chosen absolute path — `native` only — or null when the operator cancelled. */
  readonly path?: string | null
}

/** One entry of the version picker: what is stored, and what the operator reads. */
export interface HomeVersionOption {
  /** What goes into the registration and into the skills-side file's key. */
  readonly value: string
  /** What the dropdown shows. */
  readonly label: string
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
export const HOME_VERSIONS: Readonly<Record<HomeProduct, readonly HomeVersionOption[]>> = {
  ncc: [
    { value: '65', label: 'NC65' },
    { value: '1909', label: 'NCC1909' },
    { value: '2105', label: 'NCC2105' },
    { value: '2111', label: 'NCC2111' },
    { value: '2207', label: 'NCC2207' },
    { value: '2312', label: 'NCC2312' },
  ],
  bip: [
    { value: 'V5', label: 'BIP V5' },
  ],
}

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
export function homeLabelOf(product: HomeProduct, version: string): string {
  const option = HOME_VERSIONS[product].find(candidate => candidate.value === version)
  if (option !== undefined) return option.label
  return `${product === 'bip' ? 'BIP' : 'NCC'}${version}`
}

/**
 * What a probe concluded about a directory.
 *
 * `jar-collection` is the honest middle case rather than a failure: a directory
 * that holds jars but is not an installation. It can be indexed by version, but
 * it has no `modules/`, so `.bmf` and module config are not there to read. The
 * surface says so instead of showing a home-shaped empty result.
 */
export type HomeShape = 'ncc-home' | 'bip-home' | 'jar-collection' | 'not-found'

/** One canonical path a Home is expected to have, and whether this one does. */
export interface HomeKeyView {
  readonly role: string
  /** Relative path, with `*` where a module's own directory name goes. */
  readonly rel: string
  readonly exists: boolean
}

/** One probe of a Home directory, as both halves read it. */
export interface HomeProfileView {
  readonly probedAt: string
  readonly shape: HomeShape
  /** The canonical directories this Home actually has. */
  readonly present: readonly string[]
  /** Subdirectories under `modules/`; 0 when there is no `modules/`. */
  readonly modules: number
  /** `.jar` files anywhere under the root, `ufjdk/` excluded. */
  readonly jars: number
  /** True when the walk hit its cap, so both counts are lower bounds. */
  readonly capped: boolean
  readonly keys: readonly HomeKeyView[]
  readonly warnings: readonly string[]
}

/** The class index built for a Home's version, when one exists. */
export interface HomeIndexView {
  readonly builtAt: string
  readonly totalClasses: number
  readonly bytes: number
}

/** One registered Home, as the panel and the model read it. */
export interface HomeView {
  /** Stable id, generated at registration and immutable on edit. */
  readonly id: string
  /** The display name, which is {@link homeLabelOf} of the two fields below. */
  readonly label: string
  /** Forward-slash form; both separators are accepted on input. */
  readonly path: string
  readonly product: HomeProduct
  readonly version: string
  readonly isDefault: boolean
  /** False when the directory no longer reads as a Home; the row is still shown. */
  readonly ready: boolean
  readonly profile?: HomeProfileView
  readonly index?: HomeIndexView
  readonly meta?: HomeMetaIndexView
}

/** `GET /yon/api/homes` payload. */
export interface HomeListPayload {
  readonly homes: readonly HomeView[]
  /** Absolute path of the panel's own document, so the surface can name it. */
  readonly configPath: string
  /** False when the document exists but could not be parsed. */
  readonly complete: boolean
  readonly error?: string
  /** Where the skills-side mirror lives, when a product line is registered. */
  readonly mirrorPath?: string
  /** Why the last mirror was skipped or failed, when it was. */
  readonly mirrorWarning?: string
}

/**
 * Body of `POST /yon/api/homes` and `PUT /yon/api/homes/<id>`.
 *
 * No `label`: the name is {@link homeLabelOf} of the two fields that are here, so
 * the panel has nothing to ask for and the service has nothing to trust.
 */
export interface SaveHomeInput {
  readonly path: string
  readonly product: HomeProduct
  readonly version: string
  readonly isDefault?: boolean
}

/** One file `ncc_home_find` matched, relative to the Home root. */
export interface HomeFileView {
  readonly rel: string
  readonly size: number
}

/** `ncc_home_find`'s answer. */
export interface HomeFindPayload {
  readonly home: string
  readonly matches: readonly HomeFileView[]
  /** Directory entries visited; a capped walk reports a lower bound on matches. */
  readonly scanned: number
  readonly capped: boolean
}

/** `ncc_home_read`'s answer. */
export interface HomeReadPayload {
  readonly home: string
  readonly rel: string
  /** The encoding the text was actually decoded with. */
  readonly encoding: string
  readonly bytes: number
  readonly totalLines: number
  /** 1-based, inclusive; what the returned text covers. */
  readonly from: number
  readonly to: number
  readonly truncated: boolean
  /** Key names whose values were masked, so the answer can say it did. */
  readonly masked: readonly string[]
  readonly text: string
}

/** How much of a Home's metadata tree an index covers. */
export interface MetaCountsView {
  readonly files: number
  readonly entities: number
  readonly enums: number
  readonly fields: number
  readonly enumItems: number
}

/** What comparing an index against the installation concluded. */
export interface MetaFreshnessView {
  /** `fresh` — the index still describes the tree; `stale` — it does not; `unknown` — nothing built. */
  readonly state: 'fresh' | 'stale' | 'unknown'
  readonly changed: number
  readonly added: number
  readonly removed: number
}

/** A build that is running, so the panel can show where it is. */
export interface MetaBuildView {
  readonly running: boolean
  readonly parsed: number
  readonly total: number
  readonly files: number
  readonly current: string
  readonly startedAt: string
  /** Why the last build failed, if it did. */
  readonly error?: string
}

/** The metadata index built for a Home's version, when one exists. */
export interface MetaIndexStatusView {
  /** False when nothing is stored for this version yet. */
  readonly indexed: boolean
  readonly version: string
  readonly builtAt?: string
  readonly counts?: MetaCountsView
  /** Size of the stored file, in bytes. */
  readonly bytes?: number
  /** The Homes whose files went into it. */
  readonly sourceHomes?: readonly string[]
  readonly freshness?: MetaFreshnessView
  readonly build?: MetaBuildView
}

/** `GET /yon/api/homes/<id>/meta-index` payload. */
export interface MetaIndexPayload {
  readonly home: string
  readonly status: MetaIndexStatusView
}

/**
 * A class-index build that is running, so the panel can show where it is.
 *
 * Counts jars rather than files, because that is the unit this walk moves in: a jar is
 * one read of two small regions, and the loose files it also picks up are a rounding
 * error beside the ~8,500 jars a real installation holds.
 */
export interface ClassBuildView {
  readonly running: boolean
  readonly jars: number
  readonly classes: number
  /** The file being read, relative to the Home. */
  readonly current: string
  readonly startedAt: string
  /** Why the last build failed, if it did. */
  readonly error?: string
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
  readonly indexed: boolean
  readonly version: string
  readonly builtAt?: string
  readonly totalJars?: number
  readonly totalClasses?: number
  /** Size of the stored file, in bytes. */
  readonly bytes?: number
  readonly build?: ClassBuildView
}

/** `GET /yon/api/homes/<id>/class-index` payload. */
export interface ClassIndexPayload {
  readonly home: string
  readonly status: ClassIndexStatusView
}

/**
 * `GET /yon/api/homes` gains this when a Home's version has a metadata index.
 *
 * Carried on {@link HomeView} rather than as a separate call, for the same reason the
 * class index is: the list is what the panel already refreshes, and a second request
 * would mean the row and its index could disagree about which version they describe.
 */
export interface HomeMetaIndexView {
  readonly builtAt: string
  readonly counts: MetaCountsView
  readonly bytes: number
}

/** One Obsidian vault the operator registered as a knowledge base. */
export interface WikiVaultView {
  /** Stable short id, used to address the vault in calls. */
  readonly id: string
  /** Human label for the panel. */
  readonly label: string
  /** Absolute vault root on the operator's machine. */
  readonly path: string
  /** Entity pages in the cached index; 0 before one is built. */
  readonly pages: number
  /** When the cached index was built; absent until one is. */
  readonly indexedAt?: string
  /** False when the registered path no longer holds a readable vault. */
  readonly ready: boolean
}

/** Body of `GET /yon/api/wiki`, and of a rebuild's answer. */
export interface WikiListPayload {
  readonly vaults: readonly WikiVaultView[]
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
export const WIKI_ENTITY_DIRS = ['wiki/entities', 'wiki/实体', 'entities', '实体'] as const

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
  readonly label: string
  /** Absolute vault root; both separators are accepted on input. */
  readonly path: string
}

/** One dated line of a vault's `log.md`, as both halves read it. */
export interface WikiLogEntry {
  /** The ISO date the line leads with, or an empty string when it has none. */
  readonly date: string
  /** The rest of the line — what happened, in the writer's own words. */
  readonly text: string
  readonly vault: string
  readonly vaultLabel: string
}

/** Body of `GET /yon/api/wiki/recent`. */
export interface WikiLogPayload {
  readonly entries: readonly WikiLogEntry[]
}

/**
 * What a knowledge-base page can be used for, strongest first.
 *
 * Mirrors the host's `WikiLevel`. The two are kept in step by hand rather than by
 * an import, because this module is shared by both halves and may not depend on
 * either — the same reason every other payload here repeats a host shape.
 */
export type WikiLevel = 'query-ready' | 'locatable' | 'concept'

/** How many of a vault's pages sit at one level. */
export interface WikiLevelStat {
  readonly level: WikiLevel
  readonly pages: number
}

/** One entity a vault's pages cite and none of them covers. */
export interface WikiGapView {
  readonly uri: string
  /** How many references name it. */
  readonly cited: number
  /** A few of the pages citing it, for judging whether the hole matters. */
  readonly citedBy: readonly string[]
}

/** A vault's reference tallies. */
export interface WikiGraphView {
  readonly pages: number
  readonly withOutgoing: number
  readonly withIncoming: number
  readonly isolated: number
  readonly resolvedEdges: number
  readonly danglingEdges: number
  readonly missingEntities: number
}

/** A term that was asked for and came back empty. */
export interface WikiMissView {
  readonly term: string
  readonly count: number
  readonly last: string
}

/** What a vault has been asked, folded. */
export interface WikiUsageView {
  readonly total: number
  readonly misses: readonly WikiMissView[]
  readonly popular: readonly { readonly term: string, readonly count: number }[]
  readonly since?: string
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
  readonly vault: string
  /** Vault-relative, POSIX-joined: `wiki/topics`. */
  readonly dir: string
  /** Absolute directory, forward-slashed, so a reader can go open the files. */
  readonly path: string
  /** Markdown files directly inside it. */
  readonly pages: number
}

/**
 * One vault's health: the 概览 and 缺口 tabs, in one answer.
 *
 * One call rather than three because the panel needs all of it to draw one
 * screen, and three round trips would let the tabs disagree with each other
 * about a vault that is being rebuilt while they load.
 */
export interface WikiHealthReport {
  readonly vault: string
  readonly vaultLabel: string
  /** Entity pages only — see {@link WikiUnindexedDir} for what this excludes. */
  readonly pages: number
  /** Page directories the index skipped, so `pages` is never read as the vault's size. */
  readonly unindexed: readonly WikiUnindexedDir[]
  readonly indexedAt?: string
  /** Size of the cached index on disk, so a slow rebuild has a visible cause. */
  readonly indexBytes?: number
  readonly graph: WikiGraphView
  readonly levels: readonly WikiLevelStat[]
  readonly gaps: readonly WikiGapView[]
  readonly usage: WikiUsageView
}

/** Body of `GET /yon/api/wiki/health`. */
export interface WikiHealthPayload {
  readonly reports: readonly WikiHealthReport[]
}

/** One kind of relation, with a sample of its targets and how many there are. */
export interface WikiRelationGroupView {
  readonly kind: string
  readonly total: number
  readonly sample: readonly string[]
}

/** A page as a card: what it is good for and where it leads, without its body. */
export interface WikiCardView {
  readonly vault: string
  readonly vaultLabel: string
  readonly page: string
  readonly uri: string | null
  readonly name: string
  readonly table?: string
  readonly app?: string
  readonly version?: string
  readonly status?: string
  readonly level: WikiLevel
  readonly fieldCount?: number
  /** What the page lacks to answer more, in the host's own words. */
  readonly lacks: readonly string[]
  readonly refs: number
  readonly incoming: number
  readonly outgoing: readonly WikiRelationGroupView[]
  readonly incomingGroups: readonly WikiRelationGroupView[]
  readonly unresolved: { readonly total: number, readonly sample: readonly string[] }
}

/** Body of `GET /yon/api/wiki/card`. */
export interface WikiCardPayload {
  readonly card: WikiCardView
}

/** One page a panel search matched. */
export interface WikiSearchHit {
  readonly page: string
  readonly uri: string | null
  readonly name: string
  readonly table?: string
  readonly app?: string
  readonly level: WikiLevel
  readonly fieldCount?: number
  /** How the term matched: `uri`, `table`, `page`, `name` or `contains`. */
  readonly matchedBy: string
}

/** Body of `GET /yon/api/wiki/search`. */
export interface WikiSearchPayload {
  readonly term: string
  /** Entity pages only, across the vaults searched. */
  readonly scanned: number
  /** Pages in those vaults the search could not have matched — see {@link WikiUnindexedDir}. */
  readonly unindexed: readonly WikiUnindexedDir[]
  readonly hits: readonly WikiSearchHit[]
}

/** Body of `GET /yon/api/wiki/citers`. */
export interface WikiCitersPayload {
  readonly uri: string
  readonly pages: readonly string[]
}

// ---------------------------------------------------------------- 消化检查流水账

/**
 * 一次检查的结局。
 *
 * 与宿主 `DigestOutcome` 手工保持一致——两半之间不共享代码，只共享这个契约，
 * 所以谁改了取值都要同时改两边。多出这一个联合类型而不是直接写 `string`，
 * 是为了让面板的 switch 穷尽检查能生效：漏掉一种结局时编译不过。
 */
export type DigestOutcomeView = 'pass' | 'fail' | 'gate' | 'plan' | 'sweep'

/**
 * 流水账里的一行：一次检查的分数。
 *
 * 只带路径、分数与判定，不带正文——日志要能安心躺在 `~/.dsh/yon-panel/` 下，
 * 不做知识库的第二份副本。
 */
export interface DigestLogEntryView {
  readonly at: string
  readonly tool: string
  readonly outcome: DigestOutcomeView
  readonly label: string
  readonly source: string
  readonly product: string
  readonly pages: number
  /** 未通过的项目名，按报告顺序。 */
  readonly failed: readonly string[]
  /** 各项实测值，null 表示该项不适用。 */
  readonly metrics: Readonly<Record<string, number | null>>
  readonly sourceBytes: number
  readonly productBytes: number
  readonly ms: number
  /** 批量体检专用。 */
  readonly scanned?: number
  readonly passing?: number
  readonly failing?: number
  /** 批量体检专用：能验收的组里，流水账里没有任何判定记录的组数。 */
  readonly neverAudited?: number
  /** 摸底专用。 */
  readonly chapters?: number
}

/** 折起来之后的流水账。 */
export interface DigestLogSummaryView {
  readonly total: number
  readonly since?: string
  /** 均值实际覆盖了多少次验收；面板用它写明依据，而不是写「最近若干次」。 */
  readonly averagedOver: number
  readonly byOutcome: Readonly<Record<string, number>>
  readonly byTool: readonly { readonly tool: string, readonly count: number }[]
  /** 每条计量项在最近若干次验收上的均值；看趋势，不看单次。 */
  readonly averages: Readonly<Record<string, number | null>>
  readonly recent: readonly DigestLogEntryView[]
}

/** Body of `GET /yon/api/digest/summary`. */
export interface DigestSummaryPayload {
  readonly summary: DigestLogSummaryView
  /** 日志文件的位置，方便直接打开看。 */
  readonly path: string
}

/** Body of `GET /yon/api/digest/log`. */
export interface DigestLogPayload {
  readonly entries: readonly DigestLogEntryView[]
  readonly path: string
}

// -------------------------------------------------------------------- 迭代表板

/**
 * 一条记录说的是哪一类问题。
 *
 * `gap` 是「这套插件做不到 / 做得不够」，`improvement` 是「做得到，但可以更好」。
 * 两者的处理方式不同——前者要补能力，后者只要改措辞或加一步——所以让记录的人
 * 当场分一次，比事后由读的人猜要省事。
 */
export type IterationKind = 'gap' | 'improvement'

/** 两种类型，按显示顺序。 */
export const ITERATION_KINDS: readonly IterationKind[] = ['gap', 'improvement']

/** 这条有多挡路。三档够用：要排序的是「先看哪条」，不是「精确到第几名」。 */
export type IterationSeverity = 'high' | 'medium' | 'low'

/** 三档，按显示顺序（由重到轻）。 */
export const ITERATION_SEVERITIES: readonly IterationSeverity[] = ['high', 'medium', 'low']

/**
 * 这条现在处于什么状态。
 *
 * `open` → `accepted`（决定要做）→ `fixed`（做完了）；`dropped` 是决定不做。
 * 只有人能改它——模型那侧没有改状态的工具，理由写在 `iteration-tools.ts` 的头注释里。
 */
export type IterationStatus = 'open' | 'accepted' | 'fixed' | 'dropped'

/** 四种状态，按显示顺序。 */
export const ITERATION_STATUSES: readonly IterationStatus[] = ['open', 'accepted', 'fixed', 'dropped']

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
  readonly id: string
  /**
   * ISO 时间戳，由宿主盖章。
   *
   * 不是模型传的参数：会话里没有可信的时钟，而一条记录「什么时候发生的」是它
   * 唯一的排序依据，让调用方自己填等于允许它写错。
   */
  readonly at: string
  readonly kind: IterationKind
  readonly severity: IterationSeverity
  /** 在什么场景下遇到的：当时在做的任务。 */
  readonly scene: string
  /** 当时实际发生了什么。写症状，不写诊断。 */
  readonly symptom: string
  /** 期望它变成什么样。可以空着——察觉的时候未必想得到怎么改。 */
  readonly suggestion: string
  /** 这条说的是哪件东西：工具名 / 面板名 / 文件名。 */
  readonly target: string
  /** 复现上下文：命令、路径、报错、环境。 */
  readonly context: string
  readonly status: IterationStatus
}

/** Body of `GET /yon/api/iterations`. */
export interface IterationListPayload {
  readonly rows: readonly IterationRowView[]
  /** 台账文件的位置，方便直接打开看。 */
  readonly path: string
  /** 文件在，但读不出来时才有：空列表和「还没记过」长得一样，所以要分开。 */
  readonly error?: string
}

/** Body of `POST /yon/api/iterations` — also what the model's tool takes. */
export interface SaveIterationInput {
  readonly kind: IterationKind
  readonly symptom: string
  readonly severity?: IterationSeverity
  readonly scene?: string
  readonly suggestion?: string
  readonly target?: string
  readonly context?: string
}

/**
 * Body of `PATCH /yon/api/iterations/<id>`.
 *
 * Two fields, and deliberately not the text: rewriting someone's account of what
 * happened is how a record of the past becomes a record of the present. A row can
 * be re-triaged and re-prioritised; what it says stays as it was written.
 */
export interface UpdateIterationInput {
  readonly status?: IterationStatus
  readonly severity?: IterationSeverity
}

/** Body of `POST /yon/api/iterations` as the route answers it. */
export interface IterationCreatedPayload {
  readonly row: IterationRowView
  /** False when an identical open row already existed and nothing was appended. */
  readonly created: boolean
}

// ------------------------------------------------------------------ 浏览器面板

/**
 * 一个浏览器属于哪一套调试协议。
 *
 * 这一栏不是给人看的分类，它决定**启动参数**和**怎么确认它起来了**：Chromium 系
 * 用 `--remote-debugging-port`，起来之后 `http://127.0.0.1:<端口>/json/version`
 * 会应答；Firefox 用 `-start-debugger-server`，那套协议**根本没有这个 HTTP 端点**，
 * 只能靠 TCP 能不能连上来判断。所以它必须存在，且必须一栏到底。
 */
export type BrowserFamily = 'chromium' | 'firefox'

/** 两个家族。 */
export const BROWSER_FAMILIES: readonly BrowserFamily[] = ['chromium', 'firefox']

/**
 * 调试端口的默认值与合法区间。
 *
 * 9222 是 Chromium 系那个约定俗成的端口，也是本仓 `preview/shots.mjs` 之外唯一一个
 * 使用者一眼认得的数字。下限取 1024 而不是 1：低于它的端口需要特权，而这件事没有
 * 任何需要特权的理由。三处共用一份——宿主校验、客户端当场拦、以及界面上的提示，
 * 各写一遍迟早就对不上。
 */
export const DEFAULT_BROWSER_PORT = 9222

/** @see DEFAULT_BROWSER_PORT */
export const MIN_BROWSER_PORT = 1024

/** @see DEFAULT_BROWSER_PORT */
export const MAX_BROWSER_PORT = 65535

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
  readonly id: string
  readonly family: BrowserFamily
  /** 产品名，如 `Google Chrome`、`Microsoft Edge`。 */
  readonly product: string
  /** exe 的绝对路径。存正斜杠形式，读起来两个平台一样。 */
  readonly path: string
  /** 这个浏览器的用户数据目录。默认在插件根目录下，可改。 */
  readonly profileDir: string
  /** 上次用过的端口，按行记住。 */
  readonly port: number
  /** 上次用过的起始网址；空串表示开新标签页。 */
  readonly startUrl: string
  /** 最近一次检查时这个路径还在不在。 */
  readonly pathExists: boolean
  /** 找到过、现在不在了。**不会被自动删掉**——删了它的 profile 就成了孤儿。 */
  readonly stale: boolean
  /** 启动日志的位置，就在 profile 目录里。 */
  readonly logPath: string
  /** 最后一次扫到它的时间。 */
  readonly lastFoundAt?: string
}

/** 一个实例还活着吗。`unknown` 表示问不出来（探测超时），不是「没了」。 */
export type BrowserRunLiveness = 'alive' | 'gone' | 'unknown'

/**
 * 本面板启动过的一个实例。
 *
 * 存下来是为了**跨 DSH 重启**仍然成立：浏览器是 detached 起的，DSH 退出它还在跑。
 * 不落盘的话，重启后的面板既看不到它、也停不掉它，而使用者的浏览器还占着那个端口。
 */
export interface BrowserRunView {
  readonly runId: string
  readonly browserId: string
  readonly label: string
  readonly family: BrowserFamily
  /**
   * `spawn` 返回的进程号，**只作线索**。
   *
   * 它可能只是浏览器的一个 stub：已经有一个同 profile 的实例在跑时，新进程会把请求
   * 转交给旧实例然后自己退出，所以这个号未必是真正占着端口的那个进程。停止的时候认的
   * 是端点身份，不是它。
   */
  readonly pid?: number
  readonly port: number
  readonly profileDir: string
  readonly startedAt: string
  /**
   * 怎么连它。
   *
   * Chromium 系是 `http://127.0.0.1:<端口>/json/version`；Firefox 是
   * `tcp://127.0.0.1:<端口>` —— 后者不是个能点开的地址，只是把「它监听在这儿」这件事
   * 说清楚，因为 Firefox 那套协议没有 HTTP 端点可给。
   */
  readonly endpoint: string
  /** 端口探测通了吗。**false 不等于失败**，只是没能在时限内确认。 */
  readonly ready: boolean
  readonly alive: BrowserRunLiveness
  /** Chromium 的身份令牌，停止时用来确认端口上那个还是不是本面板起的。 */
  readonly debuggerUrl?: string
  readonly note?: string
}

/** Body of `GET /yon/api/browsers`. */
export interface BrowserListPayload {
  readonly browsers: readonly BrowserView[]
  readonly runs: readonly BrowserRunView[]
  /** 登记文件的位置，方便直接打开看。 */
  readonly configPath: string
  /** 实例台账的位置。 */
  readonly runsPath: string
  readonly platform: string
  /** 当前平台支不支持自动扫描。false 时面板不显示扫描按钮。 */
  readonly scanSupported: boolean
  /** 上一次扫描的时间；没有过就是「还没扫过」。 */
  readonly scannedAt?: string
  /**
   * 这份清单是不是完整的。
   *
   * false 只可能是两个文档里有一个读不出来（手改坏了）。此时 `browsers`/`runs` 是空的
   * ——但它们**不代表本机没有浏览器**，所以必须有个字段把「读不出来」和「确实没有」分开，
   * 否则面板会把一个坏文件显示成一台干净的机器。
   */
  readonly complete: boolean
  /** 读不出来时的原话，直接给使用者看。 */
  readonly error?: string
  /** 平台不支持等说明，不是错误。 */
  readonly note?: string
}

/** Body of `POST /yon/api/browsers/scan`. */
export interface ScanBrowsersPayload {
  readonly browsers: readonly BrowserView[]
  /** 这次新扫到的 id。 */
  readonly added: readonly string[]
  /** 这次路径有变化的 id。 */
  readonly updated: readonly string[]
  /** 登记过、这次没扫到的 id。保留着，只是标了 stale。 */
  readonly stale: readonly string[]
  readonly scannedAt: string
  /** 扫描没做成时的说明，例如平台不支持。 */
  readonly note?: string
}

/**
 * Body of `PUT /yon/api/browsers/<id>`。
 *
 * 只能改这四项。`id`/`family`/`product` 不给改：它们决定启动参数与探测方式，改了
 * 就等于把这一行偷偷换成了另一个东西，而它的 profile 目录还挂在那儿。
 */
export interface SaveBrowserInput {
  readonly path?: string
  readonly profileDir?: string
  readonly port?: number
  readonly startUrl?: string
}

/** Body of `POST /yon/api/browsers/<id>/launch`。三项缺省即用该行记住的值。 */
export interface LaunchBrowserInput {
  readonly port?: number
  readonly startUrl?: string
  readonly profileDir?: string
}

/** 刚才那个实例是怎么结束的。`none` 表示没有动手。 */
export type BrowserStopMethod = 'cdp' | 'taskkill' | 'none'

/** Body of `POST /yon/api/browsers/runs/<runId>/stop`. */
export interface StopBrowserResult {
  /** 处理的哪一条。 */
  readonly runId: string
  /**
   * 这条记录从台账里清掉了没有。
   *
   * **和 `stopped` 不是一回事**：端口上已经是别人的东西时，本面板不动手，但也**不会**
   * 把这条记录清掉——那条记录正是「本面板起过一个浏览器、现在不知道它去哪了」的唯一在案
   * 记录。
   */
  readonly removed: boolean
  readonly stopped: boolean
  readonly method: BrowserStopMethod
  /**
   * 没停成、或停得不寻常时的说明。
   *
   * 「无法确认端口上那个还是不是本面板起的」会走到这里——那时候**不动手**比猜着杀
   * 一个进程重要得多。
   */
  readonly note?: string
}

/**
 * Build the identity both halves address one connection by.
 * @param configKey - the key the connection sits under in the configuration.
 * @param env - the environment branch under it.
 * @returns the composite key.
 */
export function dataSourceKey(configKey: string, env: string): string {
  return `${configKey}::${env}`
}

/**
 * Split a composite key back into its parts.
 *
 * The split takes the LAST separator, so a project name that itself contains
 * `::` still round-trips.
 * @param key - the composite key.
 * @returns the parts, or undefined when the key carries no usable separator.
 */
export function splitDataSourceKey(key: string): { configKey: string; env: string } | undefined {
  const at = key.lastIndexOf('::')
  if (at <= 0) return undefined
  const env = key.slice(at + 2)
  if (env === '') return undefined
  return { configKey: key.slice(0, at), env }
}

/** Where the API lives, shared by the host's route table and the client's calls. */
export const API_PREFIX = '/yon/api'
