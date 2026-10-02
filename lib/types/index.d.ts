/**
 * Yon panel, host half: opens the project, skill-switch and datasource domains,
 * publishes them as `ctx.yonProjects`, `ctx.yonSkills`, `ctx.yonDataSources`,
 * `ctx.yonWiki` and `ctx.yonHomes`,
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
import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './host/service.ts';
import { type YonSkillsService } from './host/skill-registry.ts';
import { type YonDataSourcesService } from './host/datasource-service.ts';
import { type YonWikiService } from './host/wiki-service.ts';
import { type YonHomesService } from './host/home-service.ts';
import { type YonMetaService } from './host/meta-service.ts';
export { DOMAIN_NAME, YON_DOMAIN } from './host/domain.ts';
export { SKILL_DOMAIN_NAME, YON_SKILL_DOMAIN } from './host/skill-domain.ts';
export { SkillError, YON_SKILL_SOURCE } from './host/skill-registry.ts';
export type { YonSkillRegistry, YonSkillsService } from './host/skill-registry.ts';
export { YON_BUNDLED_SKILLS } from './host/skill-catalog.generated.ts';
export type { YonBundledSkill } from './host/skill-catalog.ts';
export { ProjectError } from './host/service.ts';
export type { YonProjectsService } from './host/service.ts';
export { YON_TOOL_NAMES, YON_WRITE_TOOL_NAMES } from './host/tools.ts';
export { DataSourceError } from './host/datasource-service.ts';
export type { YonDataSourcesService } from './host/datasource-service.ts';
export { DATASOURCE_TOOL_NAMES } from './host/datasource-tools.ts';
export { WikiError } from './host/wiki-service.ts';
export { WIKI_TOOL_NAMES } from './host/wiki-tools.ts';
export { GBK_TOOL_NAMES, GbkError } from './host/gbk-tool.ts';
export { KNOWLEDGE_TOOL_NAMES, KnowledgeError } from './host/knowledge-tools.ts';
export { CLASS_TOOL_NAMES, ClassIndexError } from './host/class-tools.ts';
export { WIKI_WRITE_TOOL_NAMES, WikiWriteError } from './host/wiki-write.ts';
export { DIGEST_TOOL_NAMES } from './host/digest-tools.ts';
export { YON_PROMPT_SECTION, YON_PROMPT_ORDER, YON_PROMPT_TEXT } from './host/prompt.ts';
export { createDigestLog, digestLogPath, DIGEST_METRIC_KEYS, DIGEST_METRIC_LABELS } from './host/digest-log.ts';
export type { DigestLog, DigestLogEntry, DigestLogSummary, DigestOutcome } from './host/digest-log.ts';
export { sweepDigests, sourcePathOf, frontmatterValueOf } from './host/digest-sweep.ts';
export type { DigestSweep, SweepEntry, SweepStatus } from './host/digest-sweep.ts';
export { planDigest, headingsOf } from './host/digest-plan.ts';
export type { DigestPlan, PlanChapter, Heading } from './host/digest-plan.ts';
export { DEFAULT_DIGEST_CONFIG, digestConfigPath, loadDigestConfig, saveDigestConfig, } from './host/digest-config.ts';
export { auditDigest } from './host/digest-audit.ts';
export type { DigestAudit, CountRate, Verdicts } from './host/digest-audit.ts';
export type { DigestConfig, DigestThresholds } from './host/digest-config.ts';
export { classIndexDir, classIndexPath } from './host/class-index.ts';
export { defaultWikiStorePath } from './host/wiki-store.ts';
export { guessVaults } from './host/wiki-index.ts';
export type { WikiHit, WikiLookupResult, WikiMatch, WikiPageContent, WikiVaultView, YonWikiService, } from './host/wiki-service.ts';
export type { WikiIndex, WikiPage, WikiVault } from './host/wiki-index.ts';
export { defaultStorePath } from './host/datasource-store.ts';
export { createHomeStore, defaultHomeStorePath } from './host/home-store.ts';
export type { HomeStore, StoredHome } from './host/home-store.ts';
export { createYonHomesService, HomeError } from './host/home-service.ts';
export type { YonHomesService, HomeFindQuery } from './host/home-service.ts';
export { probeHome } from './host/home-probe.ts';
export { mirrorHomes, mirrorPathOf } from './host/home-mirror.ts';
export { HOME_TOOL_NAMES } from './host/home-tools.ts';
export { decodeText, declaredEncoding, isBinary, redactSecrets, resolveInside } from './host/home-files.ts';
export { META_TOOL_NAMES } from './host/meta-tools.ts';
export { buildMetaIndex, readMetaIndex, writeMetaIndex, metaIndexPath, metaIndexDir } from './host/meta-index.ts';
export { createYonMetaService } from './host/meta-service.ts';
export type { YonMetaService, MetaQueryAnswer, MetaDetailAnswer } from './host/meta-service.ts';
export { parseBmf } from './host/meta-bmf.ts';
export type { BmfComponent, BmfEntity, BmfEnum, BmfField } from './host/meta-bmf.ts';
export type { HomeFileView, HomeFindPayload, HomeIndexView, HomeKeyView, HomeListPayload, HomeMetaIndexView, HomeProduct, HomeProfileView, HomeReadPayload, HomeShape, HomeView, MetaBuildView, MetaCountsView, MetaFreshnessView, MetaIndexPayload, MetaIndexStatusView, SaveHomeInput, } from './shared/types.ts';
export { HOME_PRODUCTS } from './shared/types.ts';
export type { CreateProjectInput, DataSourceBinding, DataSourceListPayload, DataSourceProbeResult, DataSourceView, JsonValue, ProjectDetail, ProjectSummary, ProjectStatus, SaveDataSourceInput, SkillDetail, SkillView, UpdateProjectInput, } from './shared/types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The project store, provided by this plugin while it is mounted. */
        yonProjects: YonProjectsService;
        /** This plugin's bundled skills and their switches. */
        yonSkills: YonSkillsService;
        /** The operator's database connections, and the runner that tries them. */
        yonDataSources: YonDataSourcesService;
        /** The operator's Obsidian knowledge base, read through its own tools. */
        yonWiki: YonWikiService;
        /** The NCC/BIP installation directories the operator registered. */
        yonHomes: YonHomesService;
        /** The metadata index over those installations' `.bmf` files. */
        yonMeta: YonMetaService;
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
export declare const inject: string[];
/**
 * Open all three stores, publish the services, and serve their API.
 * @param ctx - host context.
 */
export declare function apply(ctx: Context): Promise<void>;
