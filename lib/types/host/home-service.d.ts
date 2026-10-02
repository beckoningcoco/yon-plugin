import { HomeError, type ReadOptions } from './home-files.ts';
import type { HomeStore } from './home-store.ts';
import { type HomeFindPayload, type HomeListPayload, type HomeReadPayload, type HomeView, type SaveHomeInput } from '../shared/types.ts';
/** What a caller may ask `find` for; `limit` is clamped by the service. */
export interface HomeFindQuery {
    readonly name?: string;
    readonly ext?: string;
    readonly under?: string;
    readonly limit?: number;
}
/** The registered Homes, as the host and the tools use them. */
export interface YonHomesService {
    /** The document the registrations live in, for the panel to name. */
    readonly storePath: string;
    list(): Promise<HomeListPayload>;
    save(input: SaveHomeInput, id?: string): Promise<HomeView>;
    remove(id: string): Promise<void>;
    setDefault(id: string): Promise<HomeView>;
    probe(id: string): Promise<HomeView>;
    find(id: string, query: HomeFindQuery): Promise<HomeFindPayload>;
    read(id: string, requested: string, options: ReadOptions): Promise<HomeReadPayload>;
    /** The version to fall back on when a caller names none. */
    defaultVersion(): Promise<string | undefined>;
}
/** The service and the disposer that drops its state. */
export interface YonHomesHandle {
    readonly service: YonHomesService;
    dispose(): void;
}
/**
 * Open the service over a store.
 * @param store - the registration document.
 * @param skillsRoot - the skills tree the mirror writes into; defaults to the
 *   operator's own. The same seam `mirrorHomes` has, and for the same reason: the
 *   operator's home directory is not a fixture a case can assert against, and a
 *   test that had to write it to exercise `save` would be editing the toolchain it
 *   is checking.
 * @returns the service and its disposer.
 */
export declare function createYonHomesService(store: HomeStore, skillsRoot?: string): YonHomesHandle;
export { HomeError };
