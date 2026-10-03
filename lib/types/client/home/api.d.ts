import type { ClassIndexStatusView, DirectoryPickResult, HomeListPayload, HomeView, MetaIndexStatusView, SaveHomeInput } from '../../shared/types.ts';
export { ApiError as HomeApiError } from '../request.ts';
/** The Home operations the UI drives. */
export interface HomeApi {
    /**
     * Every registered Home, with its last probe and its index status.
     * @returns the rows plus where they were read from.
     */
    listHomes(): Promise<HomeListPayload>;
    /**
     * Register a Home, or edit one that is already registered.
     * @param id - the registration to edit; absent to create.
     * @param input - the label, path, product line and version.
     * @returns the stored row, probed.
     */
    saveHome(id: string | undefined, input: SaveHomeInput): Promise<HomeView>;
    /**
     * Drop one registration.
     * @param id - the registration to remove.
     */
    removeHome(id: string): Promise<void>;
    /**
     * Read the directory again and store what is there now.
     * @param id - the registration to re-probe.
     * @returns the stored row with its fresh profile.
     */
    probeHome(id: string): Promise<HomeView>;
    /**
     * Make this the Home a bare version refers to.
     * @param id - the registration to promote.
     * @returns the stored row.
     */
    setDefaultHome(id: string): Promise<HomeView>;
    /**
     * The metadata index built for this Home's version.
     *
     * `fresh` decides whether the answer carries the fingerprint comparison, which costs
     * a walk of the installation — worth paying when the pane opens, and not worth paying
     * on every tick of a progress poll.
     * @param id - the registration to ask about.
     * @param fresh - compare the stored fingerprint against the directory as it is now.
     * @returns what is stored, and what a running build is doing.
     */
    metaStatus(id: string, fresh: boolean): Promise<MetaIndexStatusView>;
    /**
     * Start building, or rebuilding, the metadata index. Returns as soon as it is queued.
     * @param id - the registration to build for.
     * @returns whether a build actually started, and the state to show meanwhile.
     */
    buildMeta(id: string): Promise<{
        started: boolean;
        status: MetaIndexStatusView;
    }>;
    /**
     * The class index built for this Home's version.
     *
     * No `fresh` counterpart to the metadata call above: this status reads each stored
     * index file's head rather than parsing it, so it is cheap enough for the progress
     * poll to ask for it directly.
     * @param id - the registration to ask about.
     * @returns what is stored, and what a running build is doing.
     */
    classStatus(id: string): Promise<ClassIndexStatusView>;
    /**
     * Start building, or rebuilding, the class index. Returns as soon as it is queued.
     * @param id - the registration to build for.
     * @returns whether a build actually started, and the state to show meanwhile.
     */
    buildClass(id: string): Promise<{
        started: boolean;
        status: ClassIndexStatusView;
    }>;
    /**
     * Drop the stored index. A derived file, so this asks for no confirmation beyond
     * whatever the panel puts in front of the click.
     * @param id - the registration whose index should go.
     * @returns whether a file was actually removed.
     */
    removeClassIndex(id: string): Promise<boolean>;
    /**
     * Ask the host to open its own folder chooser.
     *
     * Here rather than in the component because the browser half cannot produce an
     * absolute path — see `handlePickDirectory` in the host. The component only
     * decides what to draw with the answer.
     * @returns the host's kind, and the chosen path when it has one to give.
     */
    pickPath(): Promise<DirectoryPickResult>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createHomeApi(): HomeApi;
