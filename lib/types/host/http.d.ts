import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './service.ts';
import { type YonSkillsService } from './skill-registry.ts';
/**
 * Register the project and skill APIs on the carrier service.
 * @param ctx - host context carrying `webServer`.
 * @param service - the project store to expose.
 * @param skills - the skill service to expose.
 * @returns the disposer removing the route.
 */
export declare function registerYonApi(ctx: Context, service: YonProjectsService, skills: YonSkillsService): () => void;
