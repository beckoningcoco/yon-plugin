import type { Context } from '@deepseek-ai/cordis';
/**
 * The bundled script, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL
 * works for the compiled plugin and for a spec running against the sources.
 */
export declare const DB_QUERY_SCRIPT_PATH: string;
/** A live child. */
export interface RunHandle {
    readonly done: Promise<{
        readonly exitCode: number | null;
        readonly signal: string | null;
    }>;
    readonly collected: {
        readonly stdout?: {
            readFrom(fromByte: number): {
                readonly text: string;
            };
        };
        readonly stderr?: {
            readFrom(fromByte: number): {
                readonly text: string;
            };
        };
    };
    terminate(): void;
}
/** One spawn request, fully specified. */
export interface RunSpawnSpec {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly stdio: {
        readonly stdin: 'ignore';
        readonly stdout: {
            readonly maxBytes: number;
        };
        readonly stderr: {
            readonly maxBytes: number;
        };
    };
    readonly graceMs: number;
    readonly signal?: AbortSignal;
}
/** The slice of the subprocess service this module uses. */
export interface RunSubprocess {
    resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>;
    spawn(spec: RunSpawnSpec): RunHandle;
}
/** One statement to run against one connection. */
export interface RunRequest {
    /** The connection group's key in the stored document; passed through as `-p`. */
    readonly configKey: string;
    /** The environment branch; passed through as `-e`. */
    readonly env: string;
    /** The statement to run. */
    readonly sql: string;
    /** A login to use; the script takes the first one when this is absent. */
    readonly user?: string;
    /** Deadline for this run, overriding the default. */
    readonly timeoutMs?: number;
}
/** How one run ended. */
export interface RunResult {
    readonly ok: boolean;
    readonly latencyMs: number;
    /** The script's report, banner stripped; the answer when `ok` is true. */
    readonly output: string;
    /** Rows the script said it produced, when it said. */
    readonly rowCount?: number;
    /** What went wrong, carrying the script's own diagnostic text. */
    readonly error?: string;
}
/** The runner the rest of the host calls. */
export interface DataSourceRunner {
    /** False when the subprocess service is missing; nothing can run then. */
    readonly available: boolean;
    /**
     * Why running is unavailable; undefined when it is available.
     *
     * Declared with an explicit `undefined` rather than as an optional member:
     * under `exactOptionalPropertyTypes` a getter that answers `undefined` cannot
     * satisfy `?: string`, and this is a compiler that means what it says.
     */
    readonly unavailableReason: string | undefined;
    /**
     * Run one statement.
     * @param request - what to run, and where.
     * @returns whether it succeeded, how long it took, and the script's output.
     */
    run(request: RunRequest): Promise<RunResult>;
}
/**
 * The statement that proves a connection works on every dialect involved.
 *
 * Oracle has no bare `SELECT`, so it needs its own form; PostgreSQL, MySQL and
 * 达梦 all accept the plain one.
 * @param dbType - the declared database type.
 * @returns the statement to run.
 */
export declare function probeStatement(dbType: string): string;
/**
 * Drop everything the script prints around its payload.
 *
 * The banner restates the connection the surface already shows, and `---` is
 * the rule that separates the two halves. The payload itself is passed through
 * untouched, including the trailing row count: a person reading this text is
 * reading the script's own report.
 * @param stdout - the child's collected standard output.
 * @returns the payload lines.
 */
export declare function stripBanner(stdout: string): string;
/**
 * Pull the row count out of the script's answer.
 * @param stdout - the child's collected standard output.
 * @returns the row count, or undefined when the answer carried none.
 */
export declare function parseRowCount(stdout: string): number | undefined;
/**
 * Reduce the script's diagnostics to something fit to show a person.
 *
 * The text is the script's own, never a string rebuilt here, so a driver's error
 * message survives intact. Banner lines are dropped: they restate the connection
 * the surface is already displaying.
 * @param stderr - the child's collected standard error.
 * @param stdout - the child's collected standard output, used when stderr is empty.
 * @returns the message, or undefined when the child said nothing.
 */
export declare function describeFailure(stderr: string, stdout: string): string | undefined;
/**
 * Build the runner over one host context.
 * @param ctx - host context, read for the `subprocess` service when it appears.
 * @param storePath - absolute path of the document the script must read.
 * @returns the runner.
 */
export declare function createDataSourceRunner(ctx: Context, storePath: string): DataSourceRunner;
