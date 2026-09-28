/**
 * Running statements, through the script this package ships.
 *
 * The work is handed to `resources/db-query/db_query.py` rather than done here,
 * and that is a deliberate division: the script already speaks every dialect
 * this operator uses — including 达梦, which has no usable Node driver — and it
 * already carries the Oracle thin→thick fallback. Re-implementing any of that in
 * TypeScript would be a second implementation to keep in step, and the Node side
 * would lose 达梦 entirely.
 *
 * Four properties shape the code below, and each one is a failure this file
 * exists to prevent:
 *
 * 1. **The script's path is derived, never configured.** `resources/` sits one
 *    level above `lib/` (and above `src/`), so a single relative URL resolves
 *    the same way from source and from the compiled artifact.
 * 2. **The child is spawned with no stdin.** The script prompts before running a
 *    statement it reads as destructive; with an inherited stdin that prompt would
 *    wait on a terminal nobody is watching and the call would hang instead of
 *    failing. `-y` closes the same door from the other side.
 * 3. **Success is the exit code, not the text.** The script's banner, its `---`
 *    rule and its trailing `(N 行)` are parsed for display only; a banner this
 *    parser has never seen cannot turn a working statement into a reported
 *    failure.
 * 4. **The deadline kills the tree.** `ctx.subprocess` terminates a process tree
 *    (Windows included), so an unreachable host cannot leave a python behind.
 *
 * The subprocess contract is declared here rather than imported, for the reason
 * `tools.ts` and `skill-registry.ts` give: the harness's subprocess package is
 * not something a third-party plugin can depend on and pin. What is declared is
 * the documented shape this module calls, and nothing more.
 */
import { fileURLToPath } from 'node:url';
/** How long one run may take before its process tree is terminated. */
const RUN_TIMEOUT_MS = 30_000;
/** How long a terminated child gets to exit before it is killed outright. */
const RUN_GRACE_MS = 3_000;
/** Memory cap per stream; anything larger is noise, not an answer. */
const MAX_STREAM_BYTES = 256 * 1024;
/** How much of the script's own diagnostic text is echoed back. */
const MAX_DIAGNOSTIC_CHARS = 800;
/** The executable name looked up on the operator's PATH. */
const PYTHON_COMMAND = 'python';
/**
 * The bundled script, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL
 * works for the compiled plugin and for a spec running against the sources.
 */
export const DB_QUERY_SCRIPT_PATH = fileURLToPath(new URL('../../resources/db-query/db_query.py', import.meta.url));
/**
 * The statement that proves a connection works on every dialect involved.
 *
 * Oracle has no bare `SELECT`, so it needs its own form; PostgreSQL, MySQL and
 * 达梦 all accept the plain one.
 * @param dbType - the declared database type.
 * @returns the statement to run.
 */
export function probeStatement(dbType) {
    return dbType === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1';
}
/** Lines the script prints around its payload, which a display must drop. */
const BANNER_LINE = /^\s*(项目|数据库|SQL|\[DEBUG\])\s*:/;
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
export function stripBanner(stdout) {
    return stdout
        .split('\n')
        .filter(line => !BANNER_LINE.test(line) && line.trim() !== '---')
        .join('\n')
        .trim();
}
/**
 * Pull the row count out of the script's answer.
 * @param stdout - the child's collected standard output.
 * @returns the row count, or undefined when the answer carried none.
 */
export function parseRowCount(stdout) {
    const match = /^\((\d+)\s*行\)\s*$/m.exec(stdout);
    if (match === null)
        return undefined;
    const rows = Number.parseInt(match[1], 10);
    return Number.isFinite(rows) ? rows : undefined;
}
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
export function describeFailure(stderr, stdout) {
    const text = stripBanner(stderr.trim() === '' ? stdout : stderr);
    if (text === '')
        return undefined;
    return text.length > MAX_DIAGNOSTIC_CHARS ? `${text.slice(0, MAX_DIAGNOSTIC_CHARS)}…` : text;
}
/**
 * Build the runner over one host context.
 * @param ctx - host context, read for the `subprocess` service when it appears.
 * @param storePath - absolute path of the document the script must read.
 * @returns the runner.
 */
export function createDataSourceRunner(ctx, storePath) {
    const service = () => ctx.get('subprocess');
    const missing = '这个部署没有挂载子进程服务，无法启动查询脚本。';
    return {
        get available() {
            return service() !== undefined;
        },
        get unavailableReason() {
            return service() === undefined ? missing : undefined;
        },
        async run(request) {
            const subprocess = service();
            if (subprocess === undefined)
                return { ok: false, latencyMs: 0, output: '', error: missing };
            let python;
            try {
                python = await subprocess.resolveExecutable(PYTHON_COMMAND);
            }
            catch {
                return {
                    ok: false,
                    latencyMs: 0,
                    output: '',
                    error: `找不到可执行的 ${PYTHON_COMMAND}。请确认它已安装并在 PATH 上。`,
                };
            }
            const deadline = request.timeoutMs ?? RUN_TIMEOUT_MS;
            const started = Date.now();
            const controller = new AbortController();
            const timer = setTimeout(() => { controller.abort(); }, deadline);
            let handle;
            try {
                handle = subprocess.spawn({
                    argv: [
                        python,
                        DB_QUERY_SCRIPT_PATH,
                        '--config', storePath,
                        '-p', request.configKey,
                        '-e', request.env,
                        ...request.user === undefined || request.user === '' ? [] : ['-u', request.user],
                        '-s', request.sql,
                        '-j',
                        // The script's confirmation prompt is unreachable either way, but this
                        // flag also keeps a destructive statement from blocking on stdin.
                        '-y',
                    ],
                    cwd: fileURLToPath(new URL('../../resources/db-query/', import.meta.url)),
                    // `ignore`, not `pipe`: an open stdin could leave the script's prompt
                    // waiting on a terminal nobody is watching.
                    stdio: {
                        stdin: 'ignore',
                        stdout: { maxBytes: MAX_STREAM_BYTES },
                        stderr: { maxBytes: MAX_STREAM_BYTES },
                    },
                    graceMs: RUN_GRACE_MS,
                    signal: controller.signal,
                });
            }
            catch (error) {
                clearTimeout(timer);
                return { ok: false, latencyMs: Date.now() - started, output: '', error: asText(error) };
            }
            try {
                const outcome = await handle.done;
                const latencyMs = Date.now() - started;
                const stdout = handle.collected.stdout?.readFrom(0).text ?? '';
                const stderr = handle.collected.stderr?.readFrom(0).text ?? '';
                if (controller.signal.aborted) {
                    return {
                        ok: false,
                        latencyMs,
                        output: stripBanner(stdout),
                        error: `超过 ${Math.round(deadline / 1000)} 秒仍未返回，已中断。可能是网络不通、地址不可达，或这条语句本身太慢。`,
                    };
                }
                const output = stripBanner(stdout);
                if (outcome.exitCode === 0) {
                    const rows = parseRowCount(stdout);
                    return { ok: true, latencyMs, output, ...rows === undefined ? {} : { rowCount: rows } };
                }
                return {
                    ok: false,
                    latencyMs,
                    output,
                    error: describeFailure(stderr, stdout) ?? `查询脚本以退出码 ${String(outcome.exitCode)} 结束。`,
                };
            }
            catch (error) {
                return { ok: false, latencyMs: Date.now() - started, output: '', error: asText(error) };
            }
            finally {
                clearTimeout(timer);
                // Idempotent and a no-op once the tree is gone; calling it also covers a
                // `done` that settled without the child having actually left.
                handle.terminate();
            }
        },
    };
}
/** Read a thrown value as text. */
function asText(error) {
    return error instanceof Error ? error.message : String(error);
}
