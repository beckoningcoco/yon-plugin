/**
 * The real world, on the other side of the browser panel's ports.
 *
 * Everything in this file touches the machine: spawning an executable, writing a
 * profile, asking a port who is listening on it, ending a process. All of it is
 * gathered here and handed to `browser-service.ts` as six objects, so the service can
 * be tested against a machine that does not exist and this file can be read as the
 * single inventory of what this feature does to the operator's computer.
 *
 * ## This is the first `node:child_process` in `src/`
 *
 * The rest of the plugin goes through the harness's `subprocess` service, and this
 * does not. That is a decision, not an oversight, and `datasource-probe.ts:61-92` is
 * the file to read beside this one. Its contract has three properties that make it
 * unusable for a debug browser, and no amount of care on our side works around any of
 * them:
 *
 * - Its `stdio` declares `stdout`/`stderr` with a byte cap and requires the caller to
 *   keep draining them. A browser left open for an afternoon would fill that buffer
 *   and block.
 * - It has no `detached` and no `unref`. A child stays in DSH's process group, so
 *   quitting DSH takes the browser down with it — the opposite of what debugging
 *   needs.
 * - Its model is `done` + `terminate()`: a short-lived command whose result is the
 *   point. A debug browser outlives the HTTP request that started it, and it must
 *   outlive DSH itself.
 *
 * So the browser is spawned directly, detached, unref'd, with its output going to a
 * file. The fd is closed in the parent immediately after the spawn — the child holds
 * its own copy — because leaving it open keeps a handle alive and defeats the unref
 * that the whole design depends on. `stdio: 'ignore'` would also leave the child
 * alone, and it is not used: a launch that fails should be able to say what the
 * browser itself said, and that only exists if something is writing it down.
 *
 * ## Every command here was run before it was written
 *
 * `wmic` and `powershell` are not on `PATH` on the reference machine and `reg`,
 * `netstat`, `tasklist` and `taskkill` are. `reg query`'s output — value names and
 * error text alike — is localized, so nothing below matches a word: success is the
 * exit code and the payload is whatever follows `REG_SZ`. `netstat -ano`'s state
 * column stays English. These are the reasons the parsers look the way they do, and
 * each parser is pure and exported so a spec can hold it to a real transcript.
 *
 * The launch and stop path was measured too, on Chrome 156 / Node v24.16.0, and the
 * numbers are why the timeouts are what they are: the debugging port opened **865 ms**
 * after the spawn (so an 8 s readiness window is generous rather than tight),
 * `Browser.close` over our own WebSocket silenced the port in **229 ms** with the child
 * exiting 0 (so a 3 s graceful window and a 2 s wait-for-silence both have room), and
 * that WebSocket connected with **no `--remote-allow-origins` on the command line** —
 * which is the measurement that keeps that flag off by default, and with it the only
 * defence an unauthenticated debug port has.
 */
import { execFile, spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { parseRegistryDefault, registryKeysFor, scanBrowsers, } from "./browser-scan.js";
/** How long a browser gets to open its debugging port before it is called slow. */
export const READY_TIMEOUT_MS = 8_000;
/**
 * How long `list()` waits for a liveness answer.
 *
 * Short on purpose: it runs once per recorded launch, and the panel opens on the
 * strength of the whole call. A run whose port says nothing within this window is
 * reported as `unknown`, which is the honest answer and costs the operator nothing.
 */
export const LIVENESS_TIMEOUT_MS = 400;
/** How long `Browser.close` gets to work before the forceful path is used. */
export const GRACEFUL_CLOSE_MS = 3_000;
/** How many lines of a browser's own output are quoted back after a failed launch. */
export const LOG_TAIL_LINES = 20;
/** The loopback address the debugging port is bound to. */
const LOOPBACK = '127.0.0.1';
/** Firefox prefs that make an unattended debug session possible. */
const FIREFOX_PREFS = [
    ['devtools.debugger.remote-enabled', 'true'],
    // The devtools protocol has no authentication, and its only access control is
    // whether it asks first. A prompt would hang an unattended launch forever.
    ['devtools.debugger.prompt-connection', 'false'],
    // Firefox's equivalent of Chromium's `--remote-debugging-address=127.0.0.1`: without
    // it the server may listen on every interface, which would offer an unauthenticated
    // debugger to the network.
    ['devtools.debugger.force-local', 'true'],
];
/** The process and environment a scan reads, as one call. */
export function systemScanEnvironment() {
    return { platform: process.platform, env: process.env };
}
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
export function argvOf(request) {
    const url = request.startUrl.trim() === '' ? [] : [request.startUrl.trim()];
    if (request.family === 'firefox') {
        // Firefox's remote debugging is not CDP: a different protocol, a different switch,
        // and no HTTP endpoint anywhere. `-no-remote` keeps the launch from being absorbed
        // by an instance that is already running, which would never open the debugger.
        return [
            '-profile', request.profileDir,
            '-no-remote',
            '-start-debugger-server', String(request.port),
            ...url,
        ];
    }
    return [
        `--remote-debugging-port=${String(request.port)}`,
        `--remote-debugging-address=${LOOPBACK}`,
        `--user-data-dir=${request.profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        ...url,
    ];
}
/** The image names a family's browsers run as. */
const FAMILY_IMAGES = {
    chromium: ['chrome.exe', 'msedge.exe', 'chromium.exe'],
    firefox: ['firefox.exe'],
};
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
export function imageMatchesFamily(imageName, family) {
    return FAMILY_IMAGES[family].includes(imageName.trim().toLowerCase());
}
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
export function parseNetstatListeners(stdout) {
    const listeners = [];
    for (const line of stdout.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        const proto = parts[0] ?? '';
        const local = parts[1] ?? '';
        const state = parts[3] ?? '';
        if (proto.toUpperCase() !== 'TCP' || state.toUpperCase() !== 'LISTENING')
            continue;
        const at = local.lastIndexOf(':');
        if (at < 0)
            continue;
        const address = local.slice(0, at).replace(/^\[/, '').replace(/\]$/, '');
        const port = Number.parseInt(local.slice(at + 1), 10);
        const pid = Number.parseInt(parts[4] ?? '', 10);
        if (!Number.isInteger(port) || !Number.isInteger(pid) || pid <= 0)
            continue;
        listeners.push({ address, port, pid });
    }
    return listeners;
}
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
export function ownerOnPort(listeners, port) {
    const matching = listeners.filter(listener => listener.port === port);
    return matching.find(listener => listener.address === LOOPBACK || listener.address === '::1')
        ?? matching[0];
}
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
export function parseTasklistImage(stdout) {
    const match = /^"([^"]+)"/m.exec(stdout);
    return match?.[1];
}
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
export function decodeConsole(bytes) {
    try {
        return new TextDecoder('gbk').decode(bytes);
    }
    catch {
        return bytes.toString('utf8');
    }
}
/**
 * Run a console program and collect its output.
 *
 * `shell: false` throughout, so a path with spaces or Chinese in it is one argument
 * and nothing in it is ever interpreted. Failures are returned rather than thrown:
 * every caller here has a sensible answer for "the command did not work".
 * @param file - the program to run.
 * @param args - its arguments.
 * @returns the exit code and decoded standard output.
 */
async function runCommand(file, args) {
    return new Promise(resolve => {
        execFile(file, [...args], { encoding: 'buffer', windowsHide: true }, (error, stdout) => {
            const code = error === null
                ? 0
                : typeof error.code === 'number'
                    ? error.code
                    : 1;
            resolve({ code, stdout: decodeConsole(stdout) });
        });
    });
}
/**
 * The two things `scanBrowsers` cannot do for itself, wired to the real machine.
 * @returns the filesystem and registry readers a scan needs.
 */
export function createScanDeps() {
    return {
        exists: path => existsSync(path),
        registryDefault: async (executable) => {
            for (const key of registryKeysFor(executable)) {
                // `/ve` asks for the default value by switch. Its *name* is localized in the
                // output (`(默认)` here), so the name is never matched; the switch is what makes
                // that possible.
                //
                // One trap, for whoever tests this by hand: in Git Bash `reg query KEY /ve` fails
                // with 「错误: 无效语法。」 and exit code 1, because MSYS rewrites `/ve` into a
                // path before `reg` ever sees it. The same command with `MSYS_NO_PATHCONV=1`, or
                // through `execFile` as here, succeeds — so that failure says nothing about `/ve`.
                const result = await runCommand('reg', ['query', key, '/ve']);
                if (result.code !== 0)
                    continue;
                const parsed = parseRegistryDefault(result.stdout);
                if (parsed !== undefined)
                    return parsed;
            }
            return undefined;
        },
    };
}
/** Starting executables, with the browser's own output kept in a file. */
class WindowsLauncher {
    async launch(request) {
        try {
            await mkdir(request.profileDir, { recursive: true });
            if (request.family === 'firefox')
                await ensureFirefoxPrefs(request.profileDir);
        }
        catch (error) {
            return {
                ok: false,
                code: 'profile-unwritable',
                message: `无法使用用户数据目录 ${request.profileDir}：${describe(error)}`,
            };
        }
        let fd;
        try {
            // Append: a second launch of the same browser should add to the record, not erase
            // the failed attempt that came before it.
            fd = openSync(request.logPath, 'a');
        }
        catch (error) {
            return {
                ok: false,
                code: 'profile-unwritable',
                message: `无法写入启动日志 ${request.logPath}：${describe(error)}`,
            };
        }
        try {
            const child = spawn(request.executable, [...argvOf(request)], {
                // Detached is the point of this whole file: the browser must outlive the HTTP
                // request and DSH itself. It also means unloading the plugin cannot close a
                // browser somebody is debugging.
                detached: true,
                // The browser's output goes to the log file. `ignore` would also leave the child
                // alone, but then a failed launch could only report an exit code.
                stdio: ['ignore', fd, fd],
                windowsHide: true,
                // Never a shell: the executable path can contain spaces and Chinese, and a
                // shell would put every argument through a parser that has opinions.
                shell: false,
            });
            let release = () => { };
            const exited = new Promise(resolve => {
                // A spawn that cannot start emits `error` and never emits `exit`; both are
                // watched so the promise always settles.
                child.once('error', (error) => {
                    resolve({ exitCode: null, signal: null, error: error.message });
                });
                child.once('exit', (exitCode, signal) => {
                    resolve({ exitCode, signal: signal ?? null });
                });
                release = () => {
                    child.removeAllListeners('exit');
                    child.removeAllListeners('error');
                };
            });
            // The child holds its own copy of the fd; this one would otherwise keep a handle
            // alive and defeat the unref below.
            closeSync(fd);
            child.unref();
            return { ok: true, handle: { pid: child.pid, exited, release } };
        }
        catch (error) {
            closeSync(fd);
            return { ok: false, code: 'spawn-failed', message: `无法启动 ${request.executable}：${describe(error)}` };
        }
    }
    async readLogTail(logPath, maxLines) {
        const text = await readFile(logPath, 'utf8').catch(() => '');
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.slice(-maxLines).join('\n');
    }
}
/**
 * Put the remote-debugging prefs into a Firefox profile.
 *
 * Firefox has no command-line switch for them, so a profile without `user.js` starts
 * with debugging off — the port never opens and the launch looks like a hang.
 *
 * An existing `user.js` is **appended to, never rewritten**: a profile directory may
 * be one the operator chose deliberately, and their prefs are theirs. A duplicate pref
 * in `user.js` takes the last value, so appending the lines that are missing is both
 * safe and sufficient.
 * @param profileDir - the profile to prepare.
 */
async function ensureFirefoxPrefs(profileDir) {
    const path = `${profileDir}/user.js`;
    const existing = await readFile(path, 'utf8').catch(() => undefined);
    const wanted = existing === undefined
        ? FIREFOX_PREFS
        : FIREFOX_PREFS.filter(([name]) => !existing.includes(name));
    if (wanted.length === 0)
        return;
    const body = wanted.map(([name, value]) => `user_pref("${name}", ${value});`).join('\n');
    await appendFile(path, existing === undefined ? `${body}\n` : `\n${body}\n`, 'utf8');
}
/** Asking a port whether the browser behind it is still speaking its protocol. */
class SystemProbe {
    async probe(request) {
        return request.family === 'firefox'
            ? await probeTcp(request.port, request.timeoutMs)
            : await probeCdp(request.port, request.timeoutMs);
    }
    async waitReady(request) {
        const deadline = Date.now() + request.timeoutMs;
        let last = { state: 'absent' };
        for (;;) {
            // A single attempt gets a fraction of the window, so one slow attempt cannot eat
            // the whole budget before the browser has had a chance to open the port.
            last = await this.probe({
                family: request.family,
                port: request.port,
                timeoutMs: Math.min(PROBE_ATTEMPT_MS, Math.max(1, deadline - Date.now())),
            });
            if (last.state === 'ready')
                return last;
            const remaining = deadline - Date.now();
            if (remaining <= 0)
                return last;
            await delay(Math.min(POLL_INTERVAL_MS, remaining));
        }
    }
    async waitSilent(request) {
        const deadline = Date.now() + request.timeoutMs;
        for (;;) {
            // Silence is `absent`, and only `absent`: `unknown` means the probe could not
            // finish, which is not evidence that the browser left. Waiting out the window on
            // an unanswerable port is the honest outcome, and the caller says so.
            const outcome = await this.probe({
                family: request.family,
                port: request.port,
                timeoutMs: Math.min(PROBE_ATTEMPT_MS, Math.max(1, deadline - Date.now())),
            });
            if (outcome.state === 'absent')
                return true;
            const remaining = deadline - Date.now();
            if (remaining <= 0)
                return false;
            await delay(Math.min(POLL_INTERVAL_MS, remaining));
        }
    }
}
/** How long one probe attempt inside a polling wait may take. */
const PROBE_ATTEMPT_MS = 1_000;
/** How long a polling wait rests between attempts. */
const POLL_INTERVAL_MS = 300;
/**
 * Wait, without holding anything else up.
 * @param ms - how long.
 */
async function delay(ms) {
    await new Promise(resolve => { setTimeout(resolve, ms); });
}
/**
 * Ask a Chromium browser's HTTP endpoint who it is.
 *
 * `/json/version` is the one endpoint every Chromium build answers, and its
 * `webSocketDebuggerUrl` is the browser's own name for itself — the token the stop
 * path compares against. Fetching it is also the only thing that proves the thing on
 * this port speaks CDP rather than merely accepting connections.
 * @param port - the debugging port.
 * @param timeoutMs - how long to wait.
 * @returns what answered, or that nothing did.
 */
async function probeCdp(port, timeoutMs) {
    let response;
    try {
        response = await fetch(`http://${LOOPBACK}:${String(port)}/json/version`, {
            signal: AbortSignal.timeout(timeoutMs),
        });
    }
    catch (error) {
        return isRefusal(error)
            ? { state: 'absent' }
            : { state: 'unknown', note: `无法确认端口 ${String(port)}：${describe(error)}` };
    }
    if (!response.ok) {
        return { state: 'unknown', note: `端口 ${String(port)} 上有应答，但返回 HTTP ${String(response.status)}。` };
    }
    const body = await response.json().catch(() => undefined);
    const debuggerUrl = typeof body?.webSocketDebuggerUrl === 'string' ? body.webSocketDebuggerUrl : '';
    if (debuggerUrl === '') {
        // Something is on the port and it is not a CDP endpoint. Said as `unknown` rather
        // than `absent`, because the port is demonstrably occupied by *something*.
        return { state: 'unknown', note: `端口 ${String(port)} 上有应答，但它不是 Chrome 调试端点。` };
    }
    return { state: 'ready', debuggerUrl };
}
/**
 * Ask a Firefox debugger port whether anything is there.
 *
 * All a TCP connect can establish, and worth being plain about: Firefox's devtools
 * protocol has no greeting and no HTTP endpoint, so this proves a listener on the
 * port and not that the listener is Firefox. Nothing better is on offer; the stop path
 * says as much in its note rather than pretending otherwise.
 * @param port - the debugging port.
 * @param timeoutMs - how long to wait.
 * @returns whether something accepted the connection.
 */
async function probeTcp(port, timeoutMs) {
    return new Promise(resolve => {
        const socket = connect({ port, host: LOOPBACK });
        let settled = false;
        const finish = (outcome) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            resolve(outcome);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => { finish({ state: 'ready' }); });
        socket.once('timeout', () => { finish({ state: 'unknown', note: `连接端口 ${String(port)} 超时。` }); });
        socket.once('error', (error) => {
            finish(isRefusal(error) ? { state: 'absent' } : { state: 'unknown', note: describe(error) });
        });
    });
}
/**
 * Whether an error means "nothing is listening" rather than "the check did not work".
 *
 * The distinction is the whole reason the probe has three states: a refused connection
 * is evidence about the port, and anything else is evidence about the probe. Reporting
 * the second as the first would make an antivirus or a firewall look like a closed
 * browser — and the stop path would then clean up a record for a browser still running.
 * @param error - the thrown or emitted value.
 * @returns whether the port actively refused.
 */
function isRefusal(error) {
    const code = error?.code;
    if (code === 'ECONNREFUSED')
        return true;
    // `fetch` wraps the reason, so the code is one level down.
    const cause = error?.cause;
    return cause?.code === 'ECONNREFUSED';
}
/** Asking Windows who holds a port, and ending them. */
class WindowsProcesses {
    async owner(port) {
        const netstat = await runCommand('netstat', ['-ano', '-p', 'tcp']);
        if (netstat.code !== 0)
            return undefined;
        const listener = ownerOnPort(parseNetstatListeners(netstat.stdout), port);
        if (listener === undefined)
            return undefined;
        // A pid on its own is not enough to act on: it may have been recycled, and the
        // image name is what makes the evidence specific to a browser.
        const tasklist = await runCommand('tasklist', [
            '/FI', `PID eq ${String(listener.pid)}`, '/FO', 'CSV', '/NH',
        ]);
        const imageName = parseTasklistImage(tasklist.stdout);
        return imageName === undefined ? undefined : { pid: listener.pid, imageName };
    }
    async kill(pid) {
        // `/T` takes the children with it — a Chromium browser is a tree of renderers, and
        // ending only the root leaves them behind holding the port.
        await runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
    }
}
/** Asking a Chromium browser to close itself. */
class NodeWebSocketDebugger {
    get available() {
        // Feature detection, not a version check: the Node this plugin runs under is the
        // host's business, and a browser unable to close gracefully still has the forceful
        // path below.
        return typeof globalThis.WebSocket === 'function';
    }
    async close(debuggerUrl, timeoutMs) {
        if (!this.available)
            return false;
        return await new Promise(resolve => {
            let settled = false;
            /** Whether the request actually went out. The only thing this call can promise. */
            let sent = false;
            const socket = new globalThis.WebSocket(debuggerUrl);
            const finish = (reached = sent) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                try {
                    socket.close();
                }
                catch {
                    // Closing an already-closed socket is not a failure worth reporting.
                }
                resolve(reached);
            };
            const timer = setTimeout(() => { finish(); }, timeoutMs);
            socket.addEventListener('open', () => {
                // `Browser.close` is the graceful end: the profile is written out properly and
                // the next launch does not offer to restore a session that crashed.
                socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
                sent = true;
            });
            // Chrome tears the socket down as it exits, and the event that arrives is `error`
            // rather than `close` — measured on a close that worked perfectly (225 ms, exit
            // code 0). So a post-send `error` means "the browser went away", which is the
            // success this call is asking for; reporting it as a failure would send the stop
            // path down the forceful branch for a browser that had already closed itself.
            //
            // What this returns is therefore exactly what the port documents: the request was
            // sent. Whether the browser complied is settled by the caller waiting for the port
            // to go quiet, which is evidence rather than a claim about a signal.
            socket.addEventListener('close', () => { finish(); });
            socket.addEventListener('error', () => { finish(); });
        });
    }
}
/**
 * The real ports, wired to this machine.
 * @returns the six objects `browser-service.ts` consumes.
 */
export function createSystemPorts() {
    const launcher = new WindowsLauncher();
    return {
        // The scan is bound to this machine's environment and readers here rather than in
        // the service, so the service never learns that a filesystem exists.
        scan: () => scanBrowsers(systemScanEnvironment(), createScanDeps()),
        launcher,
        probe: new SystemProbe(),
        processes: new WindowsProcesses(),
        debugger: new NodeWebSocketDebugger(),
        now: () => new Date(),
    };
}
/** Read a thrown value as text, for a message a person will read. */
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
