import type { BrowserFamily } from '../shared/types.ts';
import { type ScanDeps, type ScanEnvironment, type ScanOutcome } from './browser-scan.ts';
/** How long a browser gets to open its debugging port before it is called slow. */
export declare const READY_TIMEOUT_MS = 8000;
/**
 * How long `list()` waits for a liveness answer.
 *
 * Short on purpose: it runs once per recorded launch, and the panel opens on the
 * strength of the whole call. A run whose port says nothing within this window is
 * reported as `unknown`, which is the honest answer and costs the operator nothing.
 */
export declare const LIVENESS_TIMEOUT_MS = 400;
/** How long `Browser.close` gets to work before the forceful path is used. */
export declare const GRACEFUL_CLOSE_MS = 3000;
/** How many lines of a browser's own output are quoted back after a failed launch. */
export declare const LOG_TAIL_LINES = 20;
/** What a launch is asked to do. */
export interface LaunchRequest {
    /** Absolute path of the executable to start. */
    readonly executable: string;
    readonly family: BrowserFamily;
    readonly port: number;
    readonly profileDir: string;
    /** The page to open; empty means the browser's own start page. */
    readonly startUrl: string;
    /** Where the browser's own output goes; the parent's only record of a failed start. */
    readonly logPath: string;
}
/** A child that is running, as far as this process can tell. */
export interface LaunchedProcess {
    /** The spawned process id, when the spawn got far enough to have one. */
    readonly pid: number | undefined;
    /**
     * Settles when the child leaves — including when it never really started, which is
     * how a missing executable arrives. Never rejects: a launch failure is a result.
     */
    readonly exited: Promise<{
        readonly exitCode: number | null;
        readonly signal: string | null;
        readonly error?: string;
    }>;
    /** Stop watching. Does not end the child: it is detached by design. */
    release(): void;
}
/** How a launch ended. The failure codes are the port's, not the caller's strings. */
export type LaunchOutcome = {
    readonly ok: true;
    readonly handle: LaunchedProcess;
} | {
    readonly ok: false;
    readonly code: 'profile-unwritable' | 'spawn-failed';
    readonly message: string;
};
/** What a probe learned about a port. */
export interface ProbeOutcome {
    /**
     * `ready` — something answered the way this browser family answers.
     * `absent` — nothing is listening there.
     * `unknown` — the probe could not finish, which is not the same as either.
     */
    readonly state: 'ready' | 'absent' | 'unknown';
    /** Chromium's identity token, from `/json/version`. Never set for Firefox. */
    readonly debuggerUrl?: string;
    readonly note?: string;
}
/** A process listening on a port. */
export interface PortListener {
    readonly address: string;
    readonly port: number;
    readonly pid: number;
}
/** The process currently holding a port, with the image name that identifies it. */
export interface PortOwner {
    readonly pid: number;
    readonly imageName: string;
}
/** Starting and stopping executables. */
export interface BrowserLauncherPort {
    /**
     * Prepare the profile directory and start the browser.
     * @param request - what to start and where.
     */
    launch(request: LaunchRequest): Promise<LaunchOutcome>;
    /**
     * Read the last lines of a browser's own output.
     * @param logPath - the file the launch wrote to.
     * @param maxLines - how many trailing lines to keep.
     */
    readLogTail(logPath: string, maxLines: number): Promise<string>;
}
/** Asking a port whether a debug browser is behind it. */
export interface BrowserProbePort {
    /**
     * Ask once.
     * @param request - which family's protocol to speak, on which port, for how long.
     */
    probe(request: {
        readonly family: BrowserFamily;
        readonly port: number;
        readonly timeoutMs: number;
    }): Promise<ProbeOutcome>;
    /**
     * Ask repeatedly until it answers or the window closes.
     *
     * The polling is here, not in the service, because a closed port refuses a connection
     * in *milliseconds* — a single attempt with an eight-second timeout would give up
     * immediately on a browser that is still starting. The window is the budget for the
     * whole wait, so this belongs with the timers.
     * @param request - the family, the port, and how long the wait may last in total.
     */
    waitReady(request: {
        readonly family: BrowserFamily;
        readonly port: number;
        readonly timeoutMs: number;
    }): Promise<ProbeOutcome>;
    /**
     * Wait for a port to stop answering, which is what makes a stop's answer evidence
     * rather than a claim about having sent a signal.
     * @param request - the family, the port, and how long to wait.
     * @returns whether the port went quiet inside the window.
     */
    waitSilent(request: {
        readonly family: BrowserFamily;
        readonly port: number;
        readonly timeoutMs: number;
    }): Promise<boolean>;
}
/** Asking Windows who holds a port, and ending them. */
export interface BrowserProcessPort {
    /**
     * The process listening on a port right now.
     *
     * The live answer, never a recorded pid: the pid handed back by a Chromium spawn may
     * belong to a stub that hands the work to an existing instance and exits, and pids
     * are recycled besides. What is holding the port is the evidence; a recorded pid is
     * a hint.
     * @param port - the port to ask about.
     */
    owner(port: number): Promise<PortOwner | undefined>;
    /**
     * End a process and its children.
     * @param pid - the process to end.
     */
    kill(pid: number): Promise<void>;
}
/** Asking a browser to close itself, which is the way that keeps its profile intact. */
export interface BrowserDebuggerPort {
    /** False when this runtime has no `WebSocket`, in which case only the forceful path exists. */
    readonly available: boolean;
    /**
     * Send `Browser.close` and wait for the socket to go.
     * @param debuggerUrl - the token read from `/json/version` at launch time.
     * @param timeoutMs - how long to wait for the browser to comply.
     * @returns whether the browser was reached and asked.
     */
    close(debuggerUrl: string, timeoutMs: number): Promise<boolean>;
}
/** Everything the service needs from outside itself. */
export interface SystemPorts {
    scan(): Promise<ScanOutcome>;
    readonly launcher: BrowserLauncherPort;
    readonly probe: BrowserProbePort;
    readonly processes: BrowserProcessPort;
    /** Named for what it is used for: the one graceful way to end a Chromium browser. */
    readonly debugger: BrowserDebuggerPort;
    now(): Date;
}
/** The process and environment a scan reads, as one call. */
export declare function systemScanEnvironment(): ScanEnvironment;
/**
 * Build the switches that make a browser a debug browser.
 *
 * Pure, and pinned by a spec, because this is the whole of what the feature asks the
 * browser to do — everything else is bookkeeping around these few strings.
 *
 * Three of them are load-bearing rather than convenient:
 *
 * - **`--user-data-dir` is mandatory, not a nicety.** Without it a launch is handed
 *   to the Chrome instance already running, which then ignores the debugging port
 *   entirely: the process starts, the port never opens, and nothing says why.
 * - **`--remote-debugging-address=127.0.0.1` is spelled out.** The default would be
 *   fine, but the debugging port has no authentication at all, and stating the bind
 *   address is the only thing standing between it and the network.
 * - **`--remote-allow-origins=*` is deliberately absent.** It is needed only by a
 *   client running inside a browser page. Our stop path speaks CDP from Node, which
 *   sends no `Origin` header, so the flag would buy us nothing and would let any web
 *   page on this machine drive the debug browser. If a browser-side consumer ever
 *   appears it becomes an opt-in, with this paragraph as the price list.
 * @param request - the family, and the three values the switches carry.
 * @returns the arguments, not including the executable.
 */
export declare function argvOf(request: {
    readonly family: BrowserFamily;
    readonly port: number;
    readonly profileDir: string;
    readonly startUrl: string;
}): readonly string[];
/**
 * Whether a process image is one of a family's browsers.
 *
 * The check that stands between "end the process on this port" and ending a stranger's
 * process: a pid read from `netstat` is only trustworthy once the image behind it has
 * been looked at. Firefox is the weaker case of the two — the port carries no identity
 * token to compare, so the image name is all there is, and the panel says so.
 * @param imageName - the image name as reported by the system.
 * @param family - the family we launched.
 * @returns whether that image is one of the family's browsers.
 */
export declare function imageMatchesFamily(imageName: string, family: BrowserFamily): boolean;
/**
 * Read the TCP listeners out of `netstat -ano` output.
 *
 * Tokens rather than columns: the state column reads `LISTENING` on a Chinese Windows
 * too (measured — the *header* is localized and unreadable, the state never is), and the
 * pid is last.
 *
 * The state test is doing more work than it looks like. Measured on a live debug Chrome,
 * one port produces three lines: a `LISTENING` row and an `ESTABLISHED` row for the
 * browser, plus an `ESTABLISHED` row for the client's ephemeral socket that merely
 * mentions the port. Matching on "the line contains :9222" would pick a client
 * connection and end up naming the wrong pid — or none.
 * @param stdout - the command's output, already decoded.
 * @returns every listening TCP socket, with the process behind it.
 */
export declare function parseNetstatListeners(stdout: string): readonly PortListener[];
/**
 * Pick the listener that a launch of ours would have created.
 *
 * Loopback first, because that is the only address this feature ever binds; a
 * `0.0.0.0` listener on the same port is somebody else's program. The fallback keeps
 * the stop path able to speak about what it found instead of silently finding nothing.
 * @param listeners - what `parseNetstatListeners` returned.
 * @param port - the port to look for.
 * @returns the listener, or undefined when nothing is listening there.
 */
export declare function ownerOnPort(listeners: readonly PortListener[], port: number): PortListener | undefined;
/**
 * Read the image name out of `tasklist /FO CSV /NH` output.
 *
 * The header is suppressed and the filter is applied, so the first quoted field is the
 * image name (`"chrome.exe","52032","Console","1","199,824 K"`).
 *
 * A miss answers undefined, and that matters more than it looks like: the "no tasks
 * match" case is a localized sentence with no quotes at all **and it still exits 0**
 * (measured). There is therefore no exit code to fall back on, and this parser's refusal
 * to invent a name is the only thing between a recycled pid and a process that gets ended
 * because it happened to inherit a number.
 * @param stdout - the command's output, already decoded.
 * @returns the image name, or undefined when the output names no process.
 */
export declare function parseTasklistImage(stdout: string): string | undefined;
/**
 * Decode console output written in the machine's own code page.
 *
 * `reg`, `tasklist` and `netstat` write through the console's OEM code page, which on
 * a Chinese Windows is GBK — measured, and visible as mojibake when the bytes are read
 * as UTF-8. Node can decode it when built with full ICU (the official builds are);
 * where it cannot, UTF-8 is used and only non-ASCII characters in a path would suffer.
 *
 * The commands' *structure* is ASCII either way, which is why the parsers above work
 * on whatever this returns: a path with Chinese in it is the only thing at stake.
 * @param bytes - the child's raw output.
 * @returns the text.
 */
export declare function decodeConsole(bytes: Buffer): string;
/**
 * The two things `scanBrowsers` cannot do for itself, wired to the real machine.
 * @returns the filesystem and registry readers a scan needs.
 */
export declare function createScanDeps(): ScanDeps;
/**
 * The real ports, wired to this machine.
 * @returns the six objects `browser-service.ts` consumes.
 */
export declare function createSystemPorts(): SystemPorts;
