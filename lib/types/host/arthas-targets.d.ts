import type { RunSubprocess } from './datasource-probe.ts';
import { type ArthasResult } from './arthas-http.ts';
/** One JVM as `jps` reported it. */
export interface JavaProcess {
    readonly pid: number;
    /** The main class, as printed. */
    readonly mainClass: string;
    /** The JVM arguments, verbatim and space-joined. */
    readonly args: string;
    /**
     * The NCC installation this process serves, when it carries one.
     *
     * Present only for NCC processes — see the module note on why this is the
     * marker and the main class is not.
     */
    readonly home?: string;
}
/** One JVM plus what could be learned about an agent on it. */
export interface ArthasTarget {
    readonly pid: number;
    readonly mainClass: string;
    /** `ncc` when the process serves an installation, `java` otherwise. */
    readonly kind: 'ncc' | 'java';
    readonly home?: string;
    /** The JVM arguments, for a caller that wants to show why it guessed. */
    readonly args: string;
    /**
     * True when **this** process is the one the agent is running inside.
     *
     * Deliberately not "a port answered somewhere on this machine" — see
     * {@link agentPid} for why that distinction is the entire point of this field.
     */
    readonly attached: boolean;
}
/** Where a class was found, and by which loader. */
export interface ClassLocation {
    readonly className: string;
    /**
     * The classloader hash to pass as `-c`, when the class was found.
     *
     * Undefined means "`sc -d` matched nothing", which is a real and common answer
     * for a typo and is reported as such rather than as an error — measured, a
     * `sc -d` for a class that does not exist answers `state: "SUCCEEDED"` with a
     * `row_affect.rowCount` of 0 and no failure of any kind.
     */
    readonly hash?: string;
    /**
     * The URL the class was loaded from, normalised to a local path.
     *
     * Measured as `/E:/NCProject/.../ncc_scgf_v1909/bin/` — a file-URL path, so it
     * carries a leading slash that has to go before it can be used as a Windows
     * path. This is what makes "drop a helper class where the JVM will load it"
     * possible without asking the operator.
     */
    readonly codeSource?: string;
    /** The loader chain, outermost first, as `sc -d` printed it. */
    readonly loaders: readonly string[];
    readonly at: number;
}
/** The cache of `(pid, class)` → where that class lives. */
export interface ClassLoaderCache {
    get(pid: number, className: string): ClassLocation | undefined;
    put(pid: number, location: ClassLocation): void;
    forget(pid: number): void;
    clear(): void;
    /** How many entries are held, for a status line. */
    size(): number;
}
/**
 * Build the cache.
 *
 * Plain `Map`s with no expiry. A classloader's identity is fixed for the life of
 * the JVM that owns it, so an entry is valid until the process goes away — and
 * `forget(pid)` is called when a target disappears, which is the only event that
 * invalidates anything. A TTL would only add a way to be slow for no reason.
 */
export declare function createClassLoaderCache(): ClassLoaderCache;
/**
 * Where `jps` lives.
 *
 * A registered Home's own `ufjdk` is preferred over whatever is on `PATH` when
 * one is named: the JDK that launched the target is the one guaranteed to be able
 * to attach to it, and `jps` from a different major version can list nothing at
 * all while reporting no error.
 *
 * @param subprocess - the subprocess service, for `PATH` lookup.
 * @param jdkBin - a JDK's `bin` directory, when the caller knows one.
 * @returns the executable to run.
 */
export declare function resolveJps(subprocess: RunSubprocess, jdkBin?: string): Promise<string>;
/**
 * List the JVMs `jps` can see.
 *
 * @param subprocess - the subprocess service.
 * @param jpsPath - the executable, from {@link resolveJps}.
 * @param signal - cancellation from the tool call.
 * @returns every JVM, `jps`'s own row excluded, in the order reported.
 */
export declare function listJavaProcesses(subprocess: RunSubprocess, jpsPath: string, signal?: AbortSignal): Promise<readonly JavaProcess[]>;
/**
 * Which PID is the agent on this port running inside?
 *
 * **This exists because of the worst bug this feature had.** An Arthas agent
 * serves its HTTP API from *inside* the target JVM, so port 8563 is global: only
 * one process on a machine can hold it. The first implementation probed that one
 * port once per process and therefore reported **every JVM on the machine** as
 * attached — measured on this machine, Eclipse, two language servers and the NCC
 * all came back "✅ 已挂载".
 *
 * Showing that was merely wrong. Acting on it was not: `arthas_exec(pid=36496)`
 * would have sent the command to whichever agent held 8563 (the NCC, PID 45076)
 * and returned the answer as though it came from Eclipse — a model would have read
 * one process's variables and attributed them to another, with nothing in the
 * output to suggest it.
 *
 * The answer has to come from the agent, because nothing outside it knows: the
 * HTTP response carries no PID. Inside the JVM,
 * `ManagementFactory.getRuntimeMXBean().getName()` is `"<pid>@<host>"` (measured:
 * `@String[45076@Zhang]`). It touches only JDK classes, so the default system
 * classloader resolves it and no `-c` is needed.
 *
 * @param port - the agent's HTTP port.
 * @param signal - cancellation from the tool call.
 * @returns the PID the agent runs inside, or undefined when nothing is attached.
 */
export declare function agentPid(port: number, signal?: AbortSignal): Promise<number | undefined>;
/**
 * Mark which entry in a process list is the one holding the agent.
 *
 * The agent is asked **once**, not once per process (see {@link agentPid}): the
 * port is global, so the per-process probing this replaced was not merely slow —
 * it was the bug.
 *
 * @param processes - what {@link listJavaProcesses} returned.
 * @param holder - the PID {@link agentPid} reported, or undefined for none.
 * @returns one target per process, in the same order.
 */
export declare function toTargets(processes: readonly JavaProcess[], holder: number | undefined): readonly ArthasTarget[];
/** What {@link readClassLocation} reads. */
export type ScResults = readonly ArthasResult[];
/**
 * Read a class's location out of an already-fetched `sc -d` response.
 *
 * Split from running the command so the cache, the tool layer and the capture
 * path all read the shape through one function — the shape was measured once and
 * should be written down once.
 */
export declare function readClassLocation(results: ScResults, className: string): ClassLocation;
/**
 * The command that asks for a class's loader.
 *
 * `-d` is what makes it detailed; without it there is no `classLoaderHash` and
 * the answer is useless for `-c`.
 */
export declare function scCommand(className: string, detailed?: boolean): string;
/** A one-line identity for a target, for logs and diagnoses. */
export declare function describeTarget(target: ArthasTarget, port?: number): string;
