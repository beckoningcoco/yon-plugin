/**
 * The data contract both halves share: the host serves these shapes over
 * `/yon/api`, and the browser half renders them. Keeping it in one module is
 * what stops the two sides from drifting.
 */
/** Every status, in display order (the client renders these as options). */
export const PROJECT_STATUSES = ['active', 'paused', 'done'];
/**
 * Build the identity both halves address one connection by.
 * @param configKey - the key the connection sits under in the configuration.
 * @param env - the environment branch under it.
 * @returns the composite key.
 */
export function dataSourceKey(configKey, env) {
    return `${configKey}::${env}`;
}
/**
 * Split a composite key back into its parts.
 *
 * The split takes the LAST separator, so a project name that itself contains
 * `::` still round-trips.
 * @param key - the composite key.
 * @returns the parts, or undefined when the key carries no usable separator.
 */
export function splitDataSourceKey(key) {
    const at = key.lastIndexOf('::');
    if (at <= 0)
        return undefined;
    const env = key.slice(at + 2);
    if (env === '')
        return undefined;
    return { configKey: key.slice(0, at), env };
}
/** Where the API lives, shared by the host's route table and the client's calls. */
export const API_PREFIX = '/yon/api';
