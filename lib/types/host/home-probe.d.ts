import type { HomeProfileView } from '../shared/types.ts';
/**
 * Whether a path is a readable directory.
 *
 * Exported because the service asks the same question of every registered path on
 * every listing — "is this row still live?" is the same test as "does this Home
 * have a `modules/`?".
 */
export declare function isDir(path: string): Promise<boolean>;
/**
 * Classify and count one directory.
 *
 * @param root - the directory the operator registered. It may be anything: a Home,
 *   a jar collection, an empty folder, or a path that no longer exists.
 * @returns one profile, never a rejection — an unreadable path is a result
 *   (`shape: 'not-found'`) with the reason in `warnings`, because "the row is
 *   dimmed and says why" is more useful to the panel than a failed promise.
 */
export declare function probeHome(root: string): Promise<HomeProfileView>;
