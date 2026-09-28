import type { WikiListPayload } from '../../shared/types.ts';
export { ApiError as WikiApiError } from '../request.ts';
/** The knowledge base operations the UI drives. */
export interface WikiApi {
    /**
     * Every registered vault, with its page count and index timestamp.
     * @returns the vaults, each marked ready or not.
     */
    listVaults(): Promise<WikiListPayload>;
    /**
     * Rebuild one vault's index, or every vault's when none is named.
     * @param vault - a vault id; all of them when omitted.
     * @returns the vaults as they stand after the rebuild.
     */
    rebuildVault(vault?: string): Promise<WikiListPayload>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createWikiApi(): WikiApi;
