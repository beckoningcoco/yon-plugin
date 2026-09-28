import type { Context } from '@deepseek-ai/cordis';
import { type YonProjectsService } from './service.ts';
/**
 * Register the project API on the carrier service.
 * @param ctx - host context carrying `webServer`.
 * @param service - the store to expose.
 * @returns the disposer removing the route.
 */
export declare function registerYonApi(ctx: Context, service: YonProjectsService): () => void;
