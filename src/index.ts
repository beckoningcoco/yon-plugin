/**
 * Yon panel, host half: opens the project, skill-switch and datasource domains,
 * publishes them as `ctx.yonProjects`, `ctx.yonSkills`, `ctx.yonDataSources`,
 * `ctx.yonWiki`, `ctx.yonHomes`, `ctx.yonIteration` and `ctx.yonBrowsers`,
 * offers the projects and the data sources to the agent as tools, contributes
 * this plugin's own skills to the skill registry, and — where a web server
 * exists — serves all three over `/yon/api`.
 *
 * Other plugins reach the data in three stable ways, none of which requires
 * importing this package: in-process through the services (`inject:
 * ['yonProjects']`, for a picker), by the agent through the tools, or from any
 * browser half through the prefix route (`fetch('/yon/api/projects')`).
 *
 * The data sources are the one part that is not stored in a storage domain.
 * They live in a JSON document under the operator's DSH directory because the
 * bundled query script reads that file directly — see `datasource-store.ts` for
 * why that trade is worth making.
 */

import { existsSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts'
import { createYonProjectsService, type YonProjectsService } from './host/service.ts'
import { registerYonApi } from './host/http.ts'
import { registerYonProjectTools, YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from './host/tools.ts'
import { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from './host/skill-domain.ts'
import {
  createYonSkillsService, SkillError, YON_SKILL_SOURCE, type YonSkillsService,
} from './host/skill-registry.ts'
import { createDataSourceStore } from './host/datasource-store.ts'
import { createDataSourceRunner } from './host/datasource-probe.ts'
import { createYonDataSourcesService, type YonDataSourcesService } from './host/datasource-service.ts'
import { DATASOURCE_TOOL_NAMES, registerYonDataSourceTools } from './host/datasource-tools.ts'
import { createWikiStore } from './host/wiki-store.ts'
import { createYonWikiService, type YonWikiService } from './host/wiki-service.ts'
import { registerYonWikiTools, WIKI_TOOL_NAMES } from './host/wiki-tools.ts'
import { GBK_TOOL_NAMES, registerYonGbkTools } from './host/gbk-tool.ts'
import { KNOWLEDGE_TOOL_NAMES, registerYonKnowledgeTools } from './host/knowledge-tools.ts'
import { CLASS_TOOL_NAMES, registerYonClassTools } from './host/class-tools.ts'
import { buildClassIndex, writeClassIndex } from './host/class-index.ts'
import { createYonClassService, type YonClassService } from './host/class-service.ts'
import { registerYonWikiWriteTools, WIKI_WRITE_TOOL_NAMES } from './host/wiki-write.ts'
import { DIGEST_TOOL_NAMES, registerYonDigestTools } from './host/digest-tools.ts'
import { createDigestLog, digestLogPath } from './host/digest-log.ts'
import {
  createBrowserConfigStore, createBrowserRunStore, pluginRoot,
} from './host/browser-store.ts'
import {
  createYonBrowsersService, BrowserError, type YonBrowsersService,
} from './host/browser-service.ts'
import { createSystemPorts } from './host/browser-system.ts'
import { createIterationStore } from './host/iteration-store.ts'
import { createYonIterationService, type YonIterationService } from './host/iteration-service.ts'
import { ITERATION_TOOL_NAMES, registerYonIterationTools } from './host/iteration-tools.ts'
import { createHomeStore } from './host/home-store.ts'
import { createYonHomesService, HomeError as HomesError, type YonHomesService } from './host/home-service.ts'
import { registerYonHomeTools } from './host/home-tools.ts'
import { buildMetaIndex, writeMetaIndex } from './host/meta-index.ts'
import { createYonMetaService, type YonMetaService } from './host/meta-service.ts'
import { registerYonMetaTools } from './host/meta-tools.ts'
import { registerYonBipMetaTools } from './host/bip-meta-tools.ts'
import { registerYonPromptSection } from './host/prompt.ts'

export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts'
export { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from './host/skill-domain.ts'
export { SkillError, YON_SKILL_SOURCE } from './host/skill-registry.ts'
export type { YonSkillRegistry, YonSkillsService } from './host/skill-registry.ts'
export { YON_BUNDLED_SKILLS } from './host/skill-catalog.generated.ts'
export type { YonBundledSkill } from './host/skill-catalog.ts'
export { ProjectError } from './host/service.ts'
export type { YonProjectsService } from './host/service.ts'
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from './host/tools.ts'
export { DataSourceError } from './host/datasource-service.ts'
export type { YonDataSourcesService } from './host/datasource-service.ts'
export { DATASOURCE_TOOL_NAMES } from './host/datasource-tools.ts'
export { WikiError } from './host/wiki-service.ts'
export { WIKI_TOOL_NAMES } from './host/wiki-tools.ts'
export { GBK_TOOL_NAMES, GbkError } from './host/gbk-tool.ts'
export { KNOWLEDGE_TOOL_NAMES, KnowledgeError } from './host/knowledge-tools.ts'
export { CLASS_TOOL_NAMES, ClassIndexError } from './host/class-tools.ts'
export { WIKI_WRITE_TOOL_NAMES, WikiWriteError } from './host/wiki-write.ts'
export { DIGEST_TOOL_NAMES } from './host/digest-tools.ts'
export { YON_PROMPT_SECTION, YON_PROMPT_ORDER, YON_PROMPT_TEXT } from './host/prompt.ts'
export { createDigestLog, digestLogPath, DIGEST_METRIC_KEYS, DIGEST_METRIC_LABELS } from './host/digest-log.ts'
export type { DigestLog, DigestLogEntry, DigestLogSummary, DigestOutcome } from './host/digest-log.ts'
export { sweepDigests, sourcePathOf, frontmatterValueOf } from './host/digest-sweep.ts'
export type { DigestSweep, SweepEntry, SweepStatus } from './host/digest-sweep.ts'
export { planDigest, headingsOf } from './host/digest-plan.ts'
export type { DigestPlan, PlanChapter, Heading } from './host/digest-plan.ts'
export {
  DEFAULT_DIGEST_CONFIG, digestConfigPath, loadDigestConfig, saveDigestConfig,
} from './host/digest-config.ts'
export { auditDigest } from './host/digest-audit.ts'
export type { DigestAudit, CountRate, Verdicts } from './host/digest-audit.ts'
export type { DigestConfig, DigestThresholds } from './host/digest-config.ts'
export { classIndexDir, classIndexPath, removeClassIndex, listClassIndexes, summaryOf } from './host/class-index.ts'
export { createYonClassService } from './host/class-service.ts'
export type { YonClassService, ClassBuildResult, ClassBuildHandle } from './host/class-service.ts'
export { defaultWikiStorePath } from './host/wiki-store.ts'
export { guessVaults } from './host/wiki-index.ts'
export type {
  WikiHit, WikiLookupResult, WikiMatch, WikiPageContent, WikiVaultView, YonWikiService,
} from './host/wiki-service.ts'
export type { WikiIndex, WikiPage, WikiVault } from './host/wiki-index.ts'
export { defaultStorePath } from './host/datasource-store.ts'
export { createHomeStore, defaultHomeStorePath } from './host/home-store.ts'
export type { HomeStore, StoredHome } from './host/home-store.ts'
export { createYonHomesService, HomeError } from './host/home-service.ts'
export type { YonHomesService, HomeFindQuery } from './host/home-service.ts'
export { probeHome } from './host/home-probe.ts'
export { mirrorHomes, mirrorPathOf } from './host/home-mirror.ts'
export { HOME_TOOL_NAMES } from './host/home-tools.ts'
export { defaultIterationStorePath, createIterationStore } from './host/iteration-store.ts'
export type { IterationStore, IterationRow } from './host/iteration-store.ts'
export { createYonIterationService, IterationError } from './host/iteration-service.ts'
export type { YonIterationService, IterationQuery, IterationCreated } from './host/iteration-service.ts'
export { ITERATION_TOOL_NAMES } from './host/iteration-tools.ts'
export {
  createBrowserConfigStore, createBrowserRunStore, defaultBrowserConfigPath,
  defaultBrowserProfileRoot, defaultBrowserRunsPath, pluginRoot,
} from './host/browser-store.ts'
export type { BrowserConfigStore, BrowserRunStore, JsonDocument, StoredBrowser, StoredRun }
  from './host/browser-store.ts'
export { BrowserError, createYonBrowsersService } from './host/browser-service.ts'
export type { BrowserDeps, BrowserErrorCode, YonBrowsersService } from './host/browser-service.ts'
export { argvOf, createSystemPorts } from './host/browser-system.ts'
export type { SystemPorts } from './host/browser-system.ts'
export { BROWSER_RECIPES, scanBrowsers, toForwardSlashes } from './host/browser-scan.ts'
export type { ScannedBrowser, ScanOutcome } from './host/browser-scan.ts'
export { decodeText, declaredEncoding, isBinary, redactSecrets, resolveInside } from './host/home-files.ts'
export { META_TOOL_NAMES } from './host/meta-tools.ts'
export { BIP_META_TOOL_NAMES } from './host/bip-meta-tools.ts'
export { BIP_META_ROOT, BipMetaError, loadBipMetadata, clearBipMetadataCache } from './host/bip-meta.ts'
export type { BipColumn, BipChild, BipCorpus, BipEntity } from './host/bip-meta.ts'
export { buildMetaIndex, readMetaIndex, writeMetaIndex, metaIndexPath, metaIndexDir } from './host/meta-index.ts'
export { createYonMetaService } from './host/meta-service.ts'
export type { YonMetaService, MetaQueryAnswer, MetaDetailAnswer } from './host/meta-service.ts'
export { parseBmf } from './host/meta-bmf.ts'
export type { BmfComponent, BmfEntity, BmfEnum, BmfField } from './host/meta-bmf.ts'
export type {
  ClassBuildView, ClassIndexPayload, ClassIndexStatusView, HomeFileView, HomeFindPayload,
  HomeIndexView, HomeKeyView, HomeListPayload, HomeMetaIndexView,
  HomeProduct, HomeProfileView, HomeReadPayload, HomeShape, HomeView, MetaBuildView, MetaCountsView,
  MetaFreshnessView, MetaIndexPayload, MetaIndexStatusView, SaveHomeInput,
} from './shared/types.ts'
export { HOME_PRODUCTS } from './shared/types.ts'
export {
  ITERATION_KINDS, ITERATION_SEVERITIES, ITERATION_STATUSES,
} from './shared/types.ts'
export type {
  IterationCreatedPayload, IterationKind, IterationListPayload, IterationRowView, IterationSeverity,
  IterationStatus, SaveIterationInput, UpdateIterationInput,
} from './shared/types.ts'
export type {
  CreateProjectInput, DataSourceBinding, DataSourceListPayload, DataSourceProbeResult,
  DataSourceView, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus,
  SaveDataSourceInput, SkillDetail, SkillView, UpdateProjectInput,
} from './shared/types.ts'
export type {
  BrowserFamily, BrowserListPayload, BrowserRunLiveness, BrowserRunView, BrowserStopMethod,
  BrowserView, LaunchBrowserInput, SaveBrowserInput, ScanBrowsersPayload, StopBrowserResult,
} from './shared/types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The project store, provided by this plugin while it is mounted. */
    yonProjects: YonProjectsService
    /** This plugin's bundled skills and their switches. */
    yonSkills: YonSkillsService
    /** The operator's database connections, and the runner that tries them. */
    yonDataSources: YonDataSourcesService
    /** The operator's Obsidian knowledge base, read through its own tools. */
    yonWiki: YonWikiService
    /** The NCC/BIP installation directories the operator registered. */
    yonHomes: YonHomesService
    /** The metadata index over those installations' `.bmf` files. */
    yonMeta: YonMetaService
    /** The class index over the same installations, built and reported on here. */
    yonClass: YonClassService
    /** The ledger of this plugin's own shortcomings, as the model records them. */
    yonIteration: YonIterationService
    /** The machine's browsers, and the debug instances this panel started. */
    yonBrowsers: YonBrowsersService
  }
}

/**
 * What this half cannot work without: durable storage for the records, and the
 * tool registry that carries them to the model.
 *
 * The web server, the skill registry and the subprocess service are deliberately
 * NOT here. Listing one makes this plugin sit pending forever on any deployment
 * that has none — and a pending entry takes the whole profile down (`--profile
 * headless` fails with "1 entry did not activate"). All three are waited for
 * separately, below, and the datasource runner reads its own service lazily on
 * every call for the same reason.
 */
export const inject = ['storageDomain', 'tools']

/**
 * Open all three stores, publish the services, and serve their API.
 * @param ctx - host context.
 */
export async function apply(ctx: Context): Promise<void> {
  // The domain loads into memory and owns its unit; the caller closes it, and
  // the facility closes anything still open when this plugin unmounts first.
  const domain = await ctx.storageDomain.open(YON_DOMAIN)
  ctx.effect(() => () => { void domain.close() }, 'yon-panel: project domain')

  const { service, dispose } = createYonProjectsService(ctx, domain)
  ctx.effect(() => dispose, 'yon-panel: project store')
  ctx.provide('yonProjects', service)

  // The same store, also reachable by the agent as tools: the operator asks in
  // words, the model picks the call, and every write stops for approval with a
  // before/after preview before it touches anything.
  ctx.effect(() => registerYonProjectTools(ctx, service), 'yon-panel: model tools')

  const skillDomain = await ctx.storageDomain.open(YON_SKILL_DOMAIN)
  ctx.effect(() => () => { void skillDomain.close() }, 'yon-panel: skill domain')

  const skills = createYonSkillsService(skillDomain)
  ctx.effect(() => skills.dispose, 'yon-panel: bundled skills')
  ctx.provide('yonSkills', skills.service)

  // The data sources: one JSON document the operator owns, plus the runner that
  // executes statements against it through the script this package ships. The
  // runner is built with the store's own path, so the file the panel edits and
  // the file the script reads cannot be two different files.
  const store = createDataSourceStore()
  const runner = createDataSourceRunner(ctx, store.path)
  const dataSources = createYonDataSourcesService(store, service, runner)
  ctx.effect(() => dataSources.dispose, 'yon-panel: datasource store')
  ctx.provide('yonDataSources', dataSources.service)

  ctx.effect(
    () => registerYonDataSourceTools(ctx, dataSources.service),
    'yon-panel: datasource tools',
  )

  // The knowledge base: one small document listing the operator's Obsidian
  // vaults, and two read-only tools over the entity index each vault caches for
  // itself. Nothing here writes into a vault, and nothing here needs Obsidian to
  // be installed — a vault is a directory of markdown files.
  const wikiStore = createWikiStore()
  const wiki = createYonWikiService(wikiStore)
  ctx.effect(() => wiki.dispose, 'yon-panel: wiki service')
  ctx.provide('yonWiki', wiki)

  ctx.effect(() => registerYonWikiTools(ctx, wiki), 'yon-panel: wiki tools')

  // The way back into the vault. Until something can write, a lookup that comes
  // back empty stays empty forever: what the model learns from the database is
  // gone when the session ends. Three modes, and no way to replace a page's text —
  // see wiki-write.ts for why that operation does not exist rather than being
  // merely gated.
  ctx.effect(
    () => registerYonWikiWriteTools(ctx, wiki, wikiStore),
    'yon-panel: wiki write tool',
  )

  // The GBK editor: one tool over the script this package ships, because a NCC
  // customisation tree is GBK on disk and a general-purpose save corrupts it
  // silently rather than failing.
  ctx.effect(() => registerYonGbkTools(ctx), 'yon-panel: gbk tools')

  // The reference library: the 415 documents migrated out of the operator's skill
  // directories. A bundled skill body cannot name a runtime path, so without these
  // two tools the documents would ship and stay unreachable.
  ctx.effect(() => registerYonKnowledgeTools(ctx), 'yon-panel: knowledge tools')

  // Where the installations are. The operator registers a Home once — path,
  // product line, version — and afterwards the model looks it up instead of
  // asking, which is the whole point of the feature. The same registration is
  // written back to the skills' own `*_home_path.json`, so Claude Code's half of
  // the toolchain benefits from the same fact.
  const homeStore = createHomeStore()
  const homes = createYonHomesService(homeStore)
  ctx.effect(() => homes.dispose, 'yon-panel: home store')
  ctx.provide('yonHomes', homes.service)

  // Look one registered Home up by id, for the two index services below. Neither
  // imports `YonHomesService` for it: the Home list already carries each row's index
  // summaries, so a direct import would be a cycle. One function is the seam either
  // way, and this direction is the one with no cycle.
  const resolveHome = async (id: string): Promise<{ id: string; path: string; version: string; product: string }> => {
    const found = (await homes.service.list()).homes.find(home => home.id === id)
    if (found === undefined) {
      throw new HomesError('not-found', `没有登记这个 Home：${id}。先调 ncc_home_list 拿 id。`)
    }
    return { id: found.id, path: found.path, version: found.version, product: found.product }
  }

  // The class index: build one over an installation, then ask it which jar holds a
  // class. The other half of "read the platform's own implementation" — the
  // reference documents cover what someone wrote down, this covers what did not
  // get written down.
  //
  // One service for both callers. The model builds and waits for its index; the panel
  // starts one and watches it, because a 26.2 s walk is not something to hold a
  // response open for. Sharing the service is what makes a build started on either side
  // visible — and joined — on the other.
  const classes = createYonClassService(resolveHome, buildClassIndex, writeClassIndex)
  ctx.effect(() => classes.dispose, 'yon-panel: class index')
  ctx.provide('yonClass', classes)

  // The default Home is also passed in because it is the one thing a registration
  // changes about an existing tool: a search that names no version should mean "the
  // installation I am working on", and without this it means "whichever index was
  // built last".
  ctx.effect(
    () => registerYonClassTools(ctx, classes, () => homes.service.defaultVersion()),
    'yon-panel: class index tools',
  )

  // The Home tools: what is registered, what is inside it, and how to read a file
  // out of it in the encoding it is actually stored in.
  ctx.effect(() => registerYonHomeTools(ctx, homes.service), 'yon-panel: home tools')

  // The metadata index: what the installation's `.bmf` files say, flattened so that
  // "which table is 报销单据类型" and "which entities have a 员工 field" are questions
  // with answers. It resolves a Home through the same function the class index uses.
  const meta = createYonMetaService(resolveHome, buildMetaIndex, writeMetaIndex)
  ctx.effect(() => meta.dispose, 'yon-panel: metadata index')
  ctx.provide('yonMeta', meta)
  ctx.effect(() => registerYonMetaTools(ctx, meta), 'yon-panel: metadata tools')

  // The other metadata line. NCC's index is built from an installation the operator
  // registered; the flagship edition's metadata is not on disk at all, so what answers
  // for it is a set of snapshots shipped with the package. That difference is why this
  // is a separate pair of tools rather than a `product` argument on the pair above: the
  // two product lines share no table, entity or column name, and a switch would make
  // crossing them a one-character mistake with a wrong answer as the result.
  ctx.effect(() => registerYonBipMetaTools(ctx), 'yon-panel: flagship metadata tools')

  // The digestion auditor: the one tool that judges the other tools' output.
  //
  // Everything else here produces knowledge; this one asks whether what was
  // produced is actually there. It needs the wiki service only to resolve a
  // vault id into a path for the overlap gate, which is why it is registered
  // here rather than alongside the knowledge tools.
  //
  // The ledger it writes is what makes its verdicts observable after the fact:
  // a report shown once in a session leaves nothing behind, so "was this ever
  // checked, and how did it go" had no answer. The panel reads it back.
  const digestLog = createDigestLog()
  ctx.effect(() => registerYonDigestTools(ctx, wiki, digestLog), 'yon-panel: digest audit tool')

  // The iteration ledger: the model's notes about this plugin's own shortcomings.
  //
  // The one place in this package where the model writes something that outlives
  // its session about the *plugin* rather than about the operator's material. It
  // gets two tools and no gate, because the entire value of the feature is that
  // recording costs nothing and bothers nobody — an approval step would teach the
  // model not to bother, which is the only way this can fail. What keeps it honest
  // is on the other side: the model can append and nothing else, and the triage
  // (accept / fix / drop / delete) lives in the panel, where a person does it.
  const iteration = createYonIterationService(createIterationStore())
  ctx.provide('yonIteration', iteration)
  ctx.effect(() => registerYonIterationTools(ctx, iteration), 'yon-panel: iteration tools')

  // The debug browser: which browsers this machine has, the path and profile directory
  // each one is remembered by, and the instances this panel started.
  //
  // The only place in this package that starts a process (`browser-system.ts` says why
  // the harness's subprocess service could not be used for a browser that has to outlive
  // the request that opened it), and the one service here with nothing to release: no
  // timer, no listener, and both of its documents are opened per call. So there is no
  // `ctx.effect` for it, deliberately. The browsers it starts are not ended when this
  // plugin unmounts — they are spawned detached precisely so that closing a panel, or
  // upgrading the plugin, cannot close a browser somebody is in the middle of debugging.
  // Ending one is something the panel asks for by name, on the runs list.
  const browsers = createYonBrowsersService(
    createBrowserConfigStore(),
    createBrowserRunStore(),
    { ...createSystemPorts(), exists: existsSync, hostRoot: pluginRoot() },
  )
  ctx.provide('yonBrowsers', browsers)

  // The one paragraph the model reads before it ever calls a tool: what this
  // panel brings, and the rules that no single tool description can state. It
  // is global (the profile loads this plugin, not an agent scope), so every
  // conversation the panel is installed into carries it.
  registerYonPromptSection(ctx)

  // A skill registered through the registry exists exactly as long as this
  // plugin does, which is what makes these skills shippable without ever
  // writing into the operator's own skill directories: installing the plugin
  // offers them, uninstalling it withdraws them, and there is no bundle left on
  // disk to clean up. Registration waits for the registry rather than requiring
  // it, so a deployment without one still gets the stores, the tools, and the
  // panel's skill list.
  ctx.inject(['skills'], (scope) => {
    scope.effect(() => skills.attach(scope.skills), 'yon-panel: skill registration')
  })

  // The HTTP face is optional, for the same reason. A deployment without a web
  // server (headless, a terminal profile) still gets the stores and the tools;
  // the route simply never appears there.
  ctx.inject(['webServer'], (web) => {
    web.effect(
      () => registerYonApi(web, service, skills.service, dataSources.service, wiki, digestLog,
        homes.service, meta, classes, iteration, browsers),
      'yon-panel: project api',
    )
  })
}
