/**
 * The browser panel's rules, over two documents and six ports.
 *
 * Everything that decides anything lives here: which rows a scan keeps, what a launch
 * is allowed to promise, and how a browser is ended. The machine is behind
 * `BrowserDeps`, so none of those decisions needs a machine to be checked.
 *
 * ## Three things this service refuses to say
 *
 * **"It failed" when the port was merely slow.** A launch has three outcomes, and the
 * middle one is the one a naive version gets wrong: the process is alive but the
 * debugging port has not opened within the window. That is reported as
 * `ready: false` with a note — not an error — because eight seconds is a guess about
 * somebody else's startup time, not a fact about the launch. Only a process that has
 * actually exited is a failure.
 *
 * **"It stopped" when the browser on the port is not ours.** Every stop begins by
 * asking the port to identify itself: for Chromium the `webSocketDebuggerUrl` read at
 * launch time must come back unchanged, because that string is the browser's own name
 * for itself and a different one means a different browser has the port. When it does
 * not match, nothing is killed — `stopped: false`, and the run **stays in the ledger**,
 * since that row is the only trace of a browser this plugin started and cannot now
 * account for. Killing a stranger's process to tidy up a list is not a trade this
 * makes.
 *
 * **"Gone" when the answer is unknown.** A probe has three outcomes, not two. A
 * refused connection is evidence about the port; a timeout or an unreadable answer is
 * evidence about the probe. Only the first may mean the browser is gone.
 *
 * ## No disposer, deliberately
 *
 * `createYonIterationService` has none for its own reason ("nothing outlives the call
 * that made it"); this one has a better one. A launch in flight when the plugin is
 * unloaded **should** finish and write its row: a browser that is running must be in
 * the ledger, or a later session cannot stop it. A `disposed` flag could only prevent
 * that. Ending the browsers is not this service's business either — they are detached
 * on purpose, so unloading the plugin never closes a window somebody is working in.
 */
import { join } from 'node:path';
import { DEFAULT_BROWSER_PORT, MAX_BROWSER_PORT, MIN_BROWSER_PORT, } from "../shared/types.js";
import { toForwardSlashes } from "./browser-scan.js";
import { GRACEFUL_CLOSE_MS, LIVENESS_TIMEOUT_MS, LOG_TAIL_LINES, READY_TIMEOUT_MS, imageMatchesFamily, } from "./browser-system.js";
import { defaultBrowserProfileRoot, } from "./browser-store.js";
/** Where the default user-data directory sits under the plugin root. */
const PROFILE_DIR_NAME = '.browser-profile';
/** How long a stop waits for a port to stop answering after it has been closed. */
const SILENCE_TIMEOUT_MS = 2_000;
/** How long a single attempt to identify a port gets while a stop is in progress. */
const STOP_PROBE_TIMEOUT_MS = 800;
/**
 * How long a recorded run that has not been seen to open its port is given the benefit
 * of the doubt before `list()` is willing to call it gone.
 *
 * A launch is recorded before its port is confirmed, so a run found absent right after
 * a slow start would otherwise be pruned while the browser is still coming up. Past
 * this margin the readiness window has been exceeded by a wide margin, and "gone" is
 * the honest reading.
 */
const PRUNE_GRACE_MS = 30_000;
/**
 * A refusal, with the code the HTTP face maps to a status.
 *
 * There is no `spawn-unavailable`, though an earlier design listed one: it existed for
 * a dependency that might be missing, and there is no longer such a dependency. What
 * took its place is `debugger.available === false`, which is not a failure to spawn but
 * the absence of the *graceful* way to stop. The forceful one still works, so it
 * changes a `method`, not an outcome.
 */
export class BrowserError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'BrowserError';
    }
}
/** An ISO timestamp, from the injected clock. */
function stamp(now) {
    return now.toISOString();
}
/**
 * The user-data directory a browser gets when nobody has chosen one.
 * @param root - the plugin root.
 * @param id - the browser's stable id.
 * @returns the directory, forward-slashed.
 */
function defaultProfileDirOf(root, id) {
    return toForwardSlashes(join(root, PROFILE_DIR_NAME, id));
}
/** The launch log, which lives in the profile directory so it travels with it. */
function logPathOf(profileDir) {
    return `${profileDir}/browser-launch.log`;
}
/** One debugging port, validated. */
function requirePort(value) {
    const port = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isInteger(port) || port < MIN_BROWSER_PORT || port > MAX_BROWSER_PORT) {
        throw new BrowserError('port-out-of-range', `端口要在 ${String(MIN_BROWSER_PORT)}–${String(MAX_BROWSER_PORT)} 之间；收到的是「${String(value)}」。`
            + `1024 以下的号要管理员权限，默认用 ${String(DEFAULT_BROWSER_PORT)}。`);
    }
    return port;
}
/**
 * The address a launch should open, validated.
 *
 * A scheme is required rather than assumed. `localhost:3000` parses as the scheme
 * `localhost`, so handing it to a browser unchanged opens a search for the text instead
 * of the site — a failure that looks like the input was accepted. Refusing it, with the
 * fix in the message, is the only outcome that does not cost the operator the next five
 * minutes.
 * @param value - the input, or undefined to leave it as it was.
 * @returns the address, or the empty string for "the browser's own start page".
 */
function requireStartUrl(value) {
    if (value === undefined || value === null)
        return '';
    if (typeof value !== 'string') {
        throw new BrowserError('invalid-input', '启动时打开的地址要是一段文字。');
    }
    const text = value.trim();
    if (text === '')
        return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^about:[a-z]/i.test(text)) {
        throw new BrowserError('invalid-input', `启动时打开的地址要带协议，例如 http://localhost:3000；收到的是「${text}」。`);
    }
    return text;
}
/** How a row is named in a message: the product when there is one, else the id. */
function nameOf(row) {
    return row.product === '' ? row.id : row.product;
}
/**
 * Open the service over its two documents.
 * @param config - the registration document.
 * @param runs - the launch ledger.
 * @param deps - the machine, injected.
 * @returns the service.
 */
export function createYonBrowsersService(config, runs, deps) {
    // One line for both documents' read-modify-write cycles, and it is held for the whole
    // of a launch or a stop — seconds, because a readiness wait or a graceful close
    // happens inside it. Taken deliberately: the answer to "did it start" and the ledger
    // row that answer leaves behind have to agree, and a concurrent `list()` arriving
    // mid-launch would otherwise read a ledger that is about to change. These are
    // hand-driven operations, seconds apart.
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    /**
     * Read the registrations, refusing to act on a document that is unreadable.
     *
     * Every mutation goes through here: writing one row on top of a file that could not be
     * parsed would delete registrations the operator typed by hand, and a scan only finds
     * browsers that are still installed.
     */
    const readConfig = async () => {
        const read = await config.read();
        if (read.error !== undefined)
            throw new BrowserError('invalid-input', read.error);
        return read.rows;
    };
    /** The refusal for an id that is not registered, naming what is. */
    const unknownBrowser = (rows, id) => {
        const known = rows.map(row => row.id).join('、');
        return new BrowserError('not-found', `没有登记这个浏览器：${id}。已登记：${known === '' ? '（还没有，先点「重新扫描」）' : known}`);
    };
    /** The effective user-data directory of a row: what is stored, or the default. */
    const profileDirOf = (row) => toForwardSlashes(row.profileDir) === '' ? defaultProfileDirOf(deps.hostRoot, row.id) : toForwardSlashes(row.profileDir);
    /**
     * A registration as both halves read it.
     *
     * `pathExists` and `stale` are computed here rather than stored: a stored answer would
     * be a second truth about the filesystem that is wrong from the moment it is written,
     * and `stale` has to mean "the last scan did not find it and it is not there now",
     * which no single stored field can say. `profileDir` is reported as the one a launch
     * will actually use, so a row with the field left blank shows what it will get rather
     * than a blank.
     */
    const viewOf = (row) => {
        const profileDir = profileDirOf(row);
        const pathExists = deps.exists(row.path);
        return {
            ...row,
            profileDir,
            pathExists,
            stale: !pathExists && row.lastFoundAt !== undefined,
            logPath: logPathOf(profileDir),
        };
    };
    /** One ledger row as the panel reads it, after a liveness check. */
    const runViewOf = (row, alive, note) => ({
        runId: row.runId,
        browserId: row.browserId,
        label: row.label,
        family: row.family,
        ...row.pid === undefined ? {} : { pid: row.pid },
        port: row.port,
        profileDir: row.profileDir,
        startedAt: row.startedAt,
        endpoint: row.endpoint,
        ready: row.ready,
        alive,
        ...row.debuggerUrl === undefined ? {} : { debuggerUrl: row.debuggerUrl },
        ...note === undefined ? {} : { note },
    });
    /**
     * Merge one scan into the stored registrations.
     *
     * The merge, not a replacement, and that is the load-bearing decision: a row this scan
     * did not find is **kept** and marked `stale` (by `viewOf`, which is what notices that
     * the path is not there). Deleting it would strand its profile directory — the logins
     * inside it, the one thing here that cannot be regenerated — and the browser may
     * simply be installed somewhere the table does not know about. "Not found this time"
     * is reported, never acted on.
     * @param outcome - what the scan found.
     * @param stored - the registrations on file.
     * @returns the rows to store, and the counts to report.
     */
    const merge = (outcome, stored) => {
        const at = stamp(deps.now());
        const added = [];
        const updated = [];
        const rows = [];
        for (const found of outcome.browsers) {
            const existing = stored.find(row => row.id === found.id);
            if (existing === undefined)
                added.push(found.id);
            else if (existing.path !== found.path
                || existing.family !== found.family
                || existing.product !== found.product) {
                // A path change is the interesting one — the browser moved — but a changed
                // product or family means the table itself changed, and that is worth reporting
                // for the same reason: the row the operator was looking at is not quite the row
                // they had.
                updated.push(found.id);
            }
            rows.push({
                id: found.id,
                family: found.family,
                product: found.product,
                path: found.path,
                // Everything the operator chose survives the scan. Only the four fields the scan
                // is about are taken from it.
                profileDir: existing === undefined || toForwardSlashes(existing.profileDir) === ''
                    ? defaultProfileDirOf(deps.hostRoot, found.id)
                    : existing.profileDir,
                port: existing?.port ?? DEFAULT_BROWSER_PORT,
                startUrl: existing?.startUrl ?? '',
                lastFoundAt: at,
            });
        }
        const foundIds = new Set(outcome.browsers.map(found => found.id));
        // Kept rows go after the live ones: this order is what the dropdown opens on, and a
        // browser whose start button is disabled should not be the first thing in it.
        const kept = stored.filter(row => !foundIds.has(row.id));
        return {
            rows: [...rows, ...kept],
            payload: {
                browsers: [...rows, ...kept].map(viewOf),
                added,
                updated,
                stale: kept.map(row => row.id),
                scannedAt: at,
                ...outcome.supported ? {} : { note: outcome.note },
            },
        };
    };
    /**
     * Ask whether a recorded run is still there.
     * @param row - the ledger row.
     * @returns the liveness, and a note when one is owed.
     */
    const livenessOf = async (row) => {
        const outcome = await deps.probe.probe({
            family: row.family,
            port: row.port,
            timeoutMs: LIVENESS_TIMEOUT_MS,
        });
        if (outcome.state === 'ready')
            return { alive: 'alive' };
        if (outcome.state === 'unknown') {
            return { alive: 'unknown', ...outcome.note === undefined ? {} : { note: outcome.note } };
        }
        // Nothing is listening. For a run still inside its startup window that is not proof
        // of anything: the row is recorded before the port is confirmed, so a slow start
        // looks exactly like this.
        const started = Date.parse(row.startedAt);
        const recent = Number.isFinite(started) && deps.now().getTime() - started < PRUNE_GRACE_MS;
        return recent ? { alive: 'unknown', note: '刚启动不久，端口还没起来。' } : { alive: 'gone' };
    };
    /** An id no other run holds. */
    const uniqueRunId = (existing) => {
        const taken = new Set(existing.map(row => row.runId));
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const candidate = `br-${deps.now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            if (!taken.has(candidate))
                return candidate;
        }
        return `br-${deps.now().getTime().toString(36)}-${existing.length.toString(36)}`;
    };
    /** How the panel should reach the browser, per family. */
    const endpointOf = (family, port) => family === 'firefox'
        ? `tcp://127.0.0.1:${String(port)}`
        : `http://127.0.0.1:${String(port)}/json/version`;
    /** The owner of a port, when there is one and the question can be answered. */
    const ownerOf = async (port) => {
        try {
            return await deps.processes.owner(port);
        }
        catch {
            // A stop must not fail because `netstat` did. The caller treats "nobody found"
            // and "could not look" alike on purpose: both mean this service cannot name a
            // process it is willing to end, and the answer in that case is not to end one.
            return undefined;
        }
    };
    return {
        configPath: config.path,
        runsPath: runs.path,
        async list() {
            return await inLine(async () => {
                const read = await config.read();
                const ledger = await runs.read();
                const problems = [read.error, ledger.error]
                    .filter((text) => text !== undefined);
                // A document that cannot be read is reported rather than papered over with an
                // empty list: "no browsers registered" and "the file is broken" must not look
                // alike, or the panel shows a clean machine that does not exist.
                if (problems.length > 0) {
                    return {
                        browsers: [],
                        runs: [],
                        configPath: config.path,
                        runsPath: runs.path,
                        platform: process.platform,
                        scanSupported: false,
                        complete: false,
                        error: problems.join(' '),
                    };
                }
                let rows = read.rows;
                let scannedAt = read.scannedAt;
                let scanSupported = process.platform === 'win32';
                let note;
                if (scannedAt === undefined) {
                    // Never scanned: scan now, once, and record that we did. This is the whole of
                    // "不用每次都查目录" — from here on `list()` only stats the stored paths, and
                    // another scan happens because the operator pressed a button.
                    //
                    // Asked even where the platform check says it cannot answer, because the scanner
                    // is the authority on what it can look at and it returns immediately without
                    // touching anything: the alternative is an empty dropdown with no reason given
                    // for being empty.
                    const outcome = await deps.scan();
                    if (outcome.supported) {
                        const merged = merge(outcome, rows);
                        await config.write(merged.rows, merged.payload.scannedAt);
                        rows = merged.rows;
                        scannedAt = merged.payload.scannedAt;
                    }
                    else {
                        // Nothing was looked at, so nothing was written: marking hand-written rows
                        // because a scan could not run would be a claim it is in no position to make.
                        scanSupported = false;
                        note = outcome.note;
                    }
                }
                const views = [];
                const stillThere = [];
                for (const row of ledger.rows) {
                    const result = await livenessOf(row);
                    // Pruned, not killed: a browser that stopped answering is already gone, and
                    // this is bookkeeping. Nothing here ends a process.
                    if (result.alive === 'gone')
                        continue;
                    stillThere.push(row);
                    views.push(runViewOf(row, result.alive, result.note));
                }
                if (stillThere.length !== ledger.rows.length)
                    await runs.write(stillThere);
                return {
                    browsers: rows.map(viewOf),
                    runs: views,
                    configPath: config.path,
                    runsPath: runs.path,
                    platform: process.platform,
                    scanSupported,
                    complete: true,
                    ...scannedAt === undefined ? {} : { scannedAt },
                    ...note === undefined ? {} : { note },
                };
            });
        },
        async scan() {
            return await inLine(async () => {
                const rows = await readConfig();
                const outcome = await deps.scan();
                if (!outcome.supported) {
                    return {
                        browsers: rows.map(viewOf),
                        added: [],
                        updated: [],
                        stale: [],
                        scannedAt: stamp(deps.now()),
                        ...outcome.note === undefined ? {} : { note: outcome.note },
                    };
                }
                const merged = merge(outcome, rows);
                await config.write(merged.rows, merged.payload.scannedAt);
                return merged.payload;
            });
        },
        async save(id, input) {
            return await inLine(async () => {
                const rows = await readConfig();
                const index = rows.findIndex(row => row.id === id);
                if (index < 0)
                    throw unknownBrowser(rows, id);
                const current = rows[index];
                // Named fields, read one at a time — never a spread of the input. An HTTP body
                // may carry anything; `id`, `family` and `product` are not in the input type
                // precisely because changing them here would turn this row into a different
                // browser while its profile directory stayed where it was.
                const next = {
                    ...current,
                    path: input.path === undefined ? current.path : toForwardSlashes(input.path),
                    profileDir: input.profileDir === undefined
                        ? current.profileDir
                        : toForwardSlashes(input.profileDir) === ''
                            // Blank means "back to the default", which is also what the panel's
                            // 「恢复默认」 does. The PUT's answer carries the value, so it is visible
                            // the moment it is saved rather than at the next launch.
                            ? defaultProfileDirOf(deps.hostRoot, id)
                            : toForwardSlashes(input.profileDir),
                    port: input.port === undefined ? current.port : requirePort(input.port),
                    startUrl: input.startUrl === undefined ? current.startUrl : requireStartUrl(input.startUrl),
                };
                if (next.path === '') {
                    throw new BrowserError('invalid-input', '可执行文件路径不能为空。要换浏览器请重新扫描，不要改这一行的路径。');
                }
                if (!deps.exists(next.path)) {
                    // What keeps the panel from offering a button that always fails. The stored row
                    // is left untouched rather than marked stale: the operator is mid-edit and may
                    // be about to fix it.
                    throw new BrowserError('path-missing', `这个路径上没有可执行文件：${next.path}。确认之后再填，或者换个浏览器。`);
                }
                // A stored port is a preference, never a reservation, so it is not checked for
                // being free here: what is free now says nothing about what will be free at
                // launch, and refusing the save would block remembering a merely busy port.
                const written = [...rows];
                written[index] = next;
                await config.write(written);
                return viewOf(next);
            });
        },
        async launch(id, input) {
            return await inLine(async () => {
                const rows = await readConfig();
                const row = rows.find(entry => entry.id === id);
                if (row === undefined)
                    throw unknownBrowser(rows, id);
                if (!deps.exists(row.path)) {
                    throw new BrowserError('path-missing', `${nameOf(row)} 的可执行文件不在了：${row.path}。点「重新扫描」看看它装到哪去了。`);
                }
                const port = requirePort(input.port === undefined ? row.port : input.port);
                const startUrl = input.startUrl === undefined ? row.startUrl : requireStartUrl(input.startUrl);
                const profileInput = input.profileDir === undefined ? row.profileDir : input.profileDir;
                const profileDir = toForwardSlashes(profileInput) === ''
                    ? defaultProfileDirOf(deps.hostRoot, id)
                    : toForwardSlashes(profileInput);
                // Looked at before starting, so a busy port produces a sentence naming what holds
                // it instead of a browser that opens and then silently has no debugging port.
                // Deliberately not authoritative: between this check and the spawn somebody else
                // could take the port, and the readiness probe after the launch is what actually
                // adjudicates. This is here for the better error message.
                const holder = await ownerOf(port);
                if (holder !== undefined) {
                    throw new BrowserError('port-in-use', `端口 ${String(port)} 已经被占用（PID ${String(holder.pid)}，${holder.imageName}）。`
                        + `换一个试试，例如 ${String(port + 1)}。`);
                }
                const logPath = logPathOf(profileDir);
                const startedAt = stamp(deps.now());
                const launched = await deps.launcher.launch({
                    executable: row.path, family: row.family, port, profileDir, startUrl, logPath,
                });
                if (!launched.ok) {
                    if (launched.code === 'profile-unwritable') {
                        // The alternative is spelled out here rather than left to be asked for. Never
                        // a bare EACCES, and never a silent fallback either: where the profile lives
                        // is the operator's choice, and this only says what the other choice costs.
                        throw new BrowserError('profile-unwritable', `${launched.message} 可以改成 DSH 数据目录下的 `
                            + `${defaultProfileDirOf(defaultBrowserProfileRoot(), id)}（面板上有一键改用）。`
                            + '注意：插件目录在重装时会被整个替换，放在那里的登录态会随之消失。');
                    }
                    throw new BrowserError('launch-failed', launched.message);
                }
                const handle = launched.handle;
                let settled;
                try {
                    // Raced against the child: a browser that exits within the window would
                    // otherwise look like one that is merely slow, and the operator would be told
                    // to wait for something that is already gone.
                    const outcome = await Promise.race([
                        deps.probe.waitReady({ family: row.family, port, timeoutMs: READY_TIMEOUT_MS })
                            .then(probe => ({ kind: 'probe', probe })),
                        handle.exited.then(exit => ({ kind: 'exit', exit })),
                    ]);
                    if (outcome.kind === 'exit') {
                        const tail = await deps.launcher.readLogTail(logPath, LOG_TAIL_LINES);
                        const why = outcome.exit.error !== undefined
                            ? outcome.exit.error
                            : `退出码 ${String(outcome.exit.exitCode)}`
                                + `${outcome.exit.signal === null ? '' : `，信号 ${outcome.exit.signal}`}`;
                        throw new BrowserError('launch-failed', `${nameOf(row)} 启动后立刻退出了（${why}）。`
                            + (tail === '' ? `日志：${logPath}` : `日志最后几行：\n${tail}`));
                    }
                    settled = outcome.probe.state === 'ready'
                        ? {
                            ready: true,
                            ...outcome.probe.debuggerUrl === undefined ? {} : { debuggerUrl: outcome.probe.debuggerUrl },
                        }
                        // Not a failure. Eight seconds is a guess about somebody else's startup time
                        // and the process is alive; the note says what to look at if it never opens.
                        : {
                            ready: false,
                            note: `${String(Math.round(READY_TIMEOUT_MS / 1000))} 秒内没等到调试端口`
                                + `${outcome.probe.note === undefined ? '' : `（${outcome.probe.note}）`}。`
                                + `进程还在跑${handle.pid === undefined ? '' : `（PID ${String(handle.pid)}）`}，日志：${logPath}`,
                        };
                }
                finally {
                    // Stop watching the child: from here on it is the ledger's business, and a
                    // listener left on a detached process is a handle the host does not need.
                    handle.release();
                }
                // Remembered only now, on a launch that got somewhere: what the browser was
                // actually given. A failed attempt changes nothing, so a retry starts from the
                // values the operator had before it.
                const index = rows.findIndex(entry => entry.id === id);
                const written = [...rows];
                written[index] = { ...row, port, profileDir, startUrl };
                await config.write(written);
                const ledger = await runs.read();
                const run = {
                    runId: uniqueRunId(ledger.rows),
                    browserId: id,
                    label: nameOf(row),
                    family: row.family,
                    ...handle.pid === undefined ? {} : { pid: handle.pid },
                    port,
                    profileDir,
                    startedAt,
                    endpoint: endpointOf(row.family, port),
                    ready: settled.ready,
                    ...settled.debuggerUrl === undefined ? {} : { debuggerUrl: settled.debuggerUrl },
                };
                await runs.write([...ledger.rows, run]);
                // `alive`, not `ready`: the process is running — that is what the race above
                // established. Whether its debugging port opened is the separate question
                // `ready` answers, and a browser that is up but not listening is still one the
                // panel must be able to stop.
                return runViewOf(run, 'alive', settled.note);
            });
        },
        async stop(runId) {
            return await inLine(async () => {
                const ledger = await runs.read();
                if (ledger.error !== undefined)
                    throw new BrowserError('invalid-input', ledger.error);
                const run = ledger.rows.find(row => row.runId === runId);
                if (run === undefined) {
                    throw new BrowserError('not-found', `台账里没有这个实例：${runId}。它可能已经被停掉了。`);
                }
                const drop = async () => {
                    await runs.write(ledger.rows.filter(row => row.runId !== runId));
                };
                /** The record is kept — it is the only trace of a browser this plugin started. */
                const keep = (stopped, method, note) => ({ runId, removed: false, stopped, method, note });
                const probe = await deps.probe.probe({
                    family: run.family,
                    port: run.port,
                    timeoutMs: STOP_PROBE_TIMEOUT_MS,
                });
                if (probe.state === 'absent') {
                    // Already gone, though the ledger said otherwise. The record is cleared because
                    // there is nothing to stop, and `stopped: false` because this call did not stop
                    // anything — the two fields answer different questions.
                    await drop();
                    return {
                        runId, removed: true, stopped: false, method: 'none',
                        note: '这个实例已经不在运行了，已从列表里清掉。',
                    };
                }
                if (probe.state === 'unknown') {
                    return keep(false, 'none', `无法确认端口 ${String(run.port)} 上那个还是不是本面板启动的浏览器`
                        + `（${probe.note ?? '探测没做成'}）。没有执行结束操作，记录保留；要关请手动关闭窗口。`);
                }
                if (run.family === 'chromium') {
                    // Identity before action, and identity is not the pid: `spawn` may hand back a
                    // stub that exits after passing the request to an existing instance, and pids
                    // get recycled. The token is the browser's own name for this endpoint.
                    if (run.debuggerUrl === undefined) {
                        return keep(false, 'none', `台账里没有记下端口 ${String(run.port)} 的身份令牌，没法确认端口上那个还是不是本面板启动的浏览器。`
                            + '没有执行结束操作，记录保留；要关请手动关闭窗口。');
                    }
                    if (probe.debuggerUrl !== run.debuggerUrl) {
                        return keep(false, 'none', `端口 ${String(run.port)} 上的调试端点不是本面板启动的那个（令牌对不上），可能是别的浏览器占了这个端口。`
                            + '没有执行结束操作，记录保留。');
                    }
                }
                let method = 'none';
                if (run.family === 'chromium' && run.debuggerUrl !== undefined && deps.debugger.available) {
                    // Graceful first: `Browser.close` lets the browser write its profile out, so the
                    // next launch does not offer to restore a crashed session. `/F` leaves a profile
                    // lock behind, which Firefox in particular handles badly.
                    if (await deps.debugger.close(run.debuggerUrl, GRACEFUL_CLOSE_MS))
                        method = 'cdp';
                }
                if (method === 'cdp' && await deps.probe.waitSilent({
                    family: run.family, port: run.port, timeoutMs: SILENCE_TIMEOUT_MS,
                })) {
                    await drop();
                    // No caveat merged in here, unlike the forceful path below: reaching this branch
                    // means the identity token above matched, and only Chromium has one.
                    return { runId, removed: true, stopped: true, method };
                }
                // The forceful path. The pid is resolved now, from the port, rather than taken
                // from the ledger: what is holding the port is the evidence, and the recorded pid
                // is a hint that may belong to a stub which has already exited.
                const owner = await ownerOf(run.port);
                if (owner === undefined) {
                    if (method === 'cdp') {
                        await drop();
                        return {
                            runId, removed: true, stopped: true, method,
                            note: '已发出关闭指令，端口也随之停止应答。',
                        };
                    }
                    await drop();
                    return {
                        runId, removed: true, stopped: false, method: 'none',
                        note: '端口上没有进程了，已从列表里清掉。',
                    };
                }
                if (!imageMatchesFamily(owner.imageName, run.family)) {
                    // The one thing this path may never do: end a process that is not ours because
                    // it happened to be holding the port.
                    return keep(false, method, `端口 ${String(run.port)} 现在被 ${owner.imageName}（PID ${String(owner.pid)}）占着，`
                        + '它不是本面板启动的浏览器。没有执行结束操作，记录保留。');
                }
                await deps.processes.kill(owner.pid);
                method = 'taskkill';
                if (!await deps.probe.waitSilent({
                    family: run.family, port: run.port, timeoutMs: SILENCE_TIMEOUT_MS,
                })) {
                    return keep(false, method, `已经结束了 PID ${String(owner.pid)}（${owner.imageName}），但端口 ${String(run.port)} 仍在应答，`
                        + '可能有子进程还占着它。记录保留。');
                }
                await drop();
                return {
                    runId, removed: true, stopped: true, method,
                    note: [
                        firefoxIdentityCaveat(run.family),
                        '浏览器没能正常落盘就被结束了；它留下的用户数据目录锁，可能让下次启动提示「配置文件夹正在使用中」。',
                    ].filter((part) => part !== undefined).join(' '),
                };
            });
        },
    };
}
/**
 * The one caveat a Firefox stop owes, on the path a Firefox stop actually finishes on.
 *
 * Chromium's stop compares an identity token, which is why the graceful branch above needs
 * no such sentence — and why this one cannot live there. Firefox's protocol has no
 * greeting to compare, so the strongest evidence available is that something accepted a
 * TCP connection on the port and the image holding it is called `firefox.exe`. A Firefox
 * stop always ends in the forceful branch, so that is where the caveat is merged in rather
 * than left as a note no Firefox stop could ever carry.
 * @param family - the family being stopped.
 * @returns the sentence, or nothing for Chromium.
 */
function firefoxIdentityCaveat(family) {
    return family === 'firefox'
        ? 'Firefox 的调试端口没有身份令牌可核对，这次只能确认「端口上有一个监听者」。'
        : undefined;
}
