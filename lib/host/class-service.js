/**
 * The class index, as the panel and the model use it.
 *
 * This layer owns three things the index file does not:
 *
 * - **One build per version at a time.** The panel's button is one click away from being
 *   pressed twice, and two walks of the same installation would both write the same file.
 * - **A build reported rather than awaited.** `startBuild` returns the moment the work is
 *   queued, and the state it reports is what the panel polls. A walk measured at 26.2 s on
 *   the reference Home is not something to hold an HTTP response open for.
 * - **A status that is cheap enough to poll.** It reads each index file's head rather than
 *   parsing it — see `summaryOf` in `class-index.ts` for the measurement. Without that,
 *   the panel's progress poll would parse a 43 MB document once a second.
 *
 * ## Where the Home comes from
 *
 * The service is handed a `resolve` function rather than the registrations themselves,
 * the same seam `meta-service.ts` uses and for the same reason: `home-service.ts` already
 * reads each row's class-index summary, so a direct import would be a cycle.
 *
 * ## Both callers, one implementation
 *
 * The tool waits for its build; the panel watches one. They are the same walk, so they
 * share the state map — a build the model started is visible in the panel, and starting
 * one from either side while the other runs joins it instead of racing it.
 */
import { listClassIndexes, removeClassIndex, } from "./class-index.js";
import { HomeError } from "./home-files.js";
/** How long a finished build's state is kept, so a poll can see it stop. */
const KEEP_DONE_MS = 30_000;
/**
 * Open the service.
 *
 * @param resolve - look one registered Home up by id.
 * @param build - the walker, injected so a case can run it without a real installation.
 * @param write - where a built index goes, injected for the same reason.
 * @param list - where the stored indexes come from. Defaults to the real directory; a
 *   case hands it its own answer so that neither half touches the operator's disk.
 * @param drop - how an index is removed, injected alongside `list`.
 * @returns the service.
 */
export function createYonClassService(resolve, build, write, list = listClassIndexes, drop = removeClassIndex) {
    /** Builds in flight or just finished, by version. */
    const running = new Map();
    /** The walk in flight, by version, so a second caller joins it rather than racing it. */
    const inFlight = new Map();
    const requireHome = async (id) => {
        const home = await resolve(id);
        if (home.version.trim() === '') {
            throw new HomeError('invalid-input', `这个 Home（${id}）没有版本号，而类索引是按版本存的，没有版本就没有索引可对应。请先补上版本。`);
        }
        return home;
    };
    /** The build state to show: one running now, or one that just finished. */
    const buildView = (version) => {
        const state = running.get(version);
        if (state === undefined)
            return undefined;
        if (!state.running && Date.now() - Date.parse(state.startedAt) > KEEP_DONE_MS) {
            running.delete(version);
            return undefined;
        }
        return {
            running: state.running,
            jars: state.progress.jars,
            classes: state.progress.classes,
            current: state.progress.current,
            startedAt: state.startedAt,
            ...state.error === undefined ? {} : { error: state.error },
        };
    };
    /** The walk, once per version: the second caller gets the first one's promise. */
    const ensure = (home) => {
        const existing = inFlight.get(home.version);
        if (existing !== undefined)
            return existing;
        const state = {
            startedAt: new Date().toISOString(),
            progress: { jars: 0, classes: 0, current: '' },
            running: true,
        };
        running.set(home.version, state);
        const walk = (async () => {
            const started = Date.now();
            try {
                const built = await build(home.path, home.version, progress => { state.progress = progress; });
                // A directory the walk found nothing in is not an installation this can index.
                // Checked here rather than by the caller so that every caller gets it, and
                // `totalClasses` counts the loose files too: a source-only checkout has no jar
                // and is still worth an index.
                if (built.totalJars === 0 && built.totalClasses === 0) {
                    throw new HomeError('not-found', `${home.path} 里既没有 .jar，也没有 modules/*/classes 下的 .class 或 .java —— `
                        + '确认这是 NCC/BIP 的 home 目录（不是项目目录或 jar 存放目录）。');
                }
                const path = await write(built);
                return {
                    home: home.id,
                    version: home.version,
                    totalJars: built.totalJars,
                    totalClasses: built.totalClasses,
                    path,
                    seconds: Math.round((Date.now() - started) / 100) / 10,
                };
            }
            catch (error) {
                state.error = error instanceof Error ? error.message : String(error);
                throw error;
            }
            finally {
                state.running = false;
                inFlight.delete(home.version);
            }
        })();
        inFlight.set(home.version, walk);
        return walk;
    };
    const service = {
        async status(homeId) {
            const home = await requireHome(homeId);
            const stored = (await list()).find(entry => entry.version === home.version);
            const view = buildView(home.version);
            if (stored === undefined) {
                return {
                    indexed: false,
                    version: home.version,
                    ...view === undefined ? {} : { build: view },
                };
            }
            return {
                indexed: true,
                version: home.version,
                builtAt: stored.builtAt,
                totalJars: stored.totalJars,
                totalClasses: stored.totalClasses,
                bytes: stored.bytes,
                ...view === undefined ? {} : { build: view },
            };
        },
        async startBuild(homeId) {
            const home = await requireHome(homeId);
            const already = inFlight.has(home.version);
            if (!already) {
                // Not awaited: the caller is an HTTP request that has to return. The rejection is
                // caught here rather than left to float, so a failed build becomes a state the
                // panel polls and shows, not an unhandled rejection.
                void ensure(home).catch(() => undefined);
            }
            return { started: !already, status: await service.status(homeId) };
        },
        async build(homeId) {
            return await ensure(await requireHome(homeId));
        },
        async remove(homeId) {
            const home = await requireHome(homeId);
            const removed = await drop(home.version);
            // The in-memory build state goes with the file: a view left behind would have the
            // panel report a build's progress for an index that is no longer there.
            running.delete(home.version);
            return removed;
        },
        dispose() {
            // A walk already in flight is not cancelled — it is a read of somebody's disk and
            // it will finish either way. What disposing drops is the state an unmounted panel
            // was watching. `inFlight` is deliberately not cleared: the walk still writes its
            // file, and clearing the map would only let a second walk start beside it.
            running.clear();
        },
    };
    return service;
}
