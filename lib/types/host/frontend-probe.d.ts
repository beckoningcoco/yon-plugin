import type { FrontendProfileView } from '../shared/types.ts';
/** Whether a path is a readable directory. */
declare function isDir(path: string): Promise<boolean>;
/**
 * Classify and count one directory.
 *
 * @param root - the directory the operator registered. It may be anything: a
 *   source project, an installation's `hotwebs/`, an empty folder, or a path that
 *   no longer exists.
 * @returns one profile, never a rejection — an unreadable path is a result
 *   (`shape: 'not-found'`) with the reason in `warnings`, because "the row is
 *   dimmed and says why" is more useful to the panel than a failed promise.
 */
export declare function probeFrontend(root: string): Promise<FrontendProfileView>;
export { isDir };
