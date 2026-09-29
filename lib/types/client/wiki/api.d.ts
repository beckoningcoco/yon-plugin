import type { WikiListPayload, WikiLogEntry } from '../../shared/types.ts';
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
    /**
     * The tail of a vault's own history, newest first.
     *
     * Every write appends a line to the vault's `log.md`, so this is what the
     * knowledge base has been told lately — reported from a file that is already
     * maintained rather than from a second record kept only for display.
     * @param vault - a vault id; all of them when omitted.
     * @param limit - how many entries; the host defaults to 20 and caps at 200.
     * @returns the entries.
     */
    recentWrites(vault?: string, limit?: number): Promise<readonly WikiLogEntry[]>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createWikiApi(): WikiApi;
