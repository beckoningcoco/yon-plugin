/**
 * Yon panel, host half: opens the project, skill-switch and datasource domains,
 * publishes them as `ctx.yonProjects`, `ctx.yonSkills` and `ctx.yonDataSources`,
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
export { classIndexDir, classIndexPath } from './host/class-index.ts'
export { defaultWikiStorePath } from './host/wiki-store.ts'
export { guessVaults } from './host/wiki-index.ts'
export type {
  WikiHit, WikiLookupResult, WikiMatch, WikiPageContent, WikiVaultView, YonWikiService,
} from './host/wiki-service.ts'
export type { WikiIndex, WikiPage, WikiVault } from './host/wiki-index.ts'
export { defaultStorePath } from './host/datasource-store.ts'
export type {
  CreateProjectInput, DataSourceBinding, DataSourceListPayload, DataSourceProbeResult,
  DataSourceView, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus,
  SaveDataSourceInput, SkillDetail, SkillView, UpdateProjectInput,
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

  // The GBK editor: one tool over the script this package ships, because a NCC
  // customisation tree is GBK on disk and a general-purpose save corrupts it
  // silently rather than failing.
  ctx.effect(() => registerYonGbkTools(ctx), 'yon-panel: gbk tools')

  // The reference library: the 450 documents migrated out of the operator's skill
  // directories. A bundled skill body cannot name a runtime path, so without these
  // two tools the documents would ship and stay unreachable.
  ctx.effect(() => registerYonKnowledgeTools(ctx), 'yon-panel: knowledge tools')

  // The class index: build one over an installation, then ask it which jar holds a
  // class. The other half of "read the platform's own implementation" — the
  // reference documents cover what someone wrote down, this covers what did not
  // get written down.
  ctx.effect(() => registerYonClassTools(ctx), 'yon-panel: class index tools')

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
      () => registerYonApi(web, service, skills.service, dataSources.service, wiki),
      'yon-panel: project api',
    )
  })
}
