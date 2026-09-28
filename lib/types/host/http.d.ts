import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './service.ts';
import { type YonSkillsService } from './skill-registry.ts';
import { type YonDataSourcesService } from './datasource-service.ts';
/**
 * Register the project, skill and datasource APIs on the carrier service.
 * @param ctx - host context carrying `webServer`.
 * @param service - the project store to expose.
 * @param skills - the skill service to expose.
 * @param sources - the datasource service to expose.
 * @returns the disposer removing the route.
 */
export declare function registerYonApi(ctx: Context, service: YonProjectsService, skills: YonSkillsService, sources: YonDataSourcesService): () => void;
