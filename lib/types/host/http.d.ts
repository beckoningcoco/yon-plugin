import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './service.ts';
import { type YonSkillsService } from './skill-registry.ts';
import { type YonDataSourcesService } from './datasource-service.ts';
import { type YonWikiService } from './wiki-service.ts';
import { type DigestLog } from './digest-log.ts';
export declare function registerYonApi(ctx: Context, service: YonProjectsService, skills: YonSkillsService, sources: YonDataSourcesService, wiki: YonWikiService, digestLog: DigestLog): () => void;
