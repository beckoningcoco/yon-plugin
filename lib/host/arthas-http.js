import { ArthasHttpError } from "./arthas-errors.js";
/** The port an attached Arthas agent serves its HTTP API on. */
export const ARTHAS_HTTP_PORT = 8563;
/** The port the same agent serves telnet on. Not used; named so a report can say what it is. */
export const ARTHAS_TELNET_PORT = 3658;
/** Where the agent listens. Loopback only: Arthas binds locally by default. */
const ARTHAS_HOST = '127.0.0.1';
/**
 * How long a short command may take.
 *
 * Measured: `sc -d`, `jad`, `options` and a plain `ognl` all answer in well under
 * a second on a live NCC. Twenty seconds is not a performance budget, it is the
 * point at which "this agent is not going to answer" becomes more likely than
 * "this command is slow", and saying so beats hanging the tool call.
 */
export const SHORT_COMMAND_TIMEOUT_MS = 20_000;
/**
 * The command's own exit status.
 *
 * **Measured, and it contradicts the obvious reading of the API.** Arthas answers
 * `state: "SUCCEEDED"` for commands that failed. Three failures were issued
 * against a live agent and all three came back `SUCCEEDED`: a `watch` of a method
 * that does not exist, an `ognl` whose class cannot be resolved, and a
 * `sc -d` for a class that is nowhere on the classpath. `state` reports that the
 * *request* was handled, not that the *command* worked.
 *
 * What reports the command is the `status` result: `statusCode` 0 on success,
 * `-1` with a `message` on failure. A caller that trusted `state` would read
 * every failure as an empty success — which is the most expensive mistake this
 * API offers, because "the watch registered nothing" and "the watch is fine and
 * simply has not fired yet" would look identical.
 */
export function statusOf(response) {
    for (const result of response.results) {
        if (result.type !== 'status')
            continue;
        const statusCode = result.statusCode;
        if (typeof statusCode !== 'number')
            continue;
        const message = typeof result.message === 'string' ? result.message : undefined;
        return { statusCode, ...message === undefined ? {} : { message } };
    }
    return undefined;
}
/**
 * Did the command itself succeed?
 *
 * `state: "FAILED"` is the other way to fail, and it is the rarer one: it is what
 * an unparseable command line produces (`nosuchcommand: command not found`), with
 * no `body` at all. That shape has no `status` to read, so the absence of a
 * `status` is not treated as success.
 */
export function commandSucceeded(response) {
    if (response.state !== 'SUCCEEDED')
        return false;
    const status = statusOf(response);
    if (status !== undefined)
        return status.statusCode === 0;
    // No `status` result: an `enhancer` that registered something is the only other
    // shape measured to mean the command did its work.
    return enhancerOf(response)?.success === true;
}
/**
 * A message with terminal colour removed.
 *
 * Arthas's own hints carry ANSI escapes — the "No class or method is affected"
 * help text wraps every command name in `\u001b[32m` … `\u001b[m`. Passed through
 * to the model or the panel they are noise that costs tokens and renders as
 * garbage, so they are stripped once, here, rather than by every consumer.
 */
export function plainMessage(text) {
    return text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}
/**
 * The per-result text Arthas produced, when it produced any.
 *
 * Only interesting for `watch`: `value` is the expression's rendered output. A
 * caller printing results should prefer its own rendering; this is for the paths
 * that have to show whatever arrived.
 */
export function valueOf(result) {
    const value = result.value;
    return typeof value === 'string' ? value : undefined;
}
/** The `enhancer` result of a response, when the command registered something. */
export function enhancerOf(response) {
    for (const result of response.results) {
        if (result.type !== 'enhancer')
            continue;
        const effect = result.effect;
        const fields = effect !== null && typeof effect === 'object'
            ? effect
            : {};
        const message = typeof result.message === 'string' ? result.message : undefined;
        return {
            success: result.success === true,
            classCount: typeof fields.classCount === 'number' ? fields.classCount : 0,
            methodCount: typeof fields.methodCount === 'number' ? fields.methodCount : 0,
            ...message === undefined ? {} : { message },
        };
    }
    return undefined;
}
/**
 * How many classes still carry enhancements, read from a `reset`.
 *
 * **Measured, and the shape is not the one the design notes assumed.** Those
 * notes expected a `reset` to answer with an `enhancer` result carrying
 * `effect.classCount`. It actually answers:
 *
 * ```json
 * {"type":"reset","affect":{"classCount":0,"methodCount":0,"listenerId":0,"cost":0}}
 * ```
 *
 * This matters beyond tidiness: the cleanup rule is "keep issuing `reset <class>`
 * until the count reaches 0", and a count read from a field that is not there
 * comes back undefined, which a loop would treat as "done" and leave the
 * enhancement installed. The `enhancer` branch is kept as a fallback because a
 * `reset` racing a `watch` registration has been seen to answer in that shape.
 */
export function classCountOf(response) {
    for (const result of response.results) {
        if (result.type !== 'reset')
            continue;
        const affect = result.affect;
        if (affect === null || typeof affect !== 'object')
            continue;
        const classCount = affect.classCount;
        if (typeof classCount === 'number')
            return classCount;
    }
    return enhancerOf(response)?.classCount;
}
/**
 * The calls a `trace` command observed — one entry per hit.
 *
 * **Measured, and better than the design notes assumed.** Those notes expected to parse
 * a rendered tree of text back into numbers. Arthas instead answers with structure: one
 * `{"type":"trace","root":{…}}` result per hit, where `root` is the *thread* and the
 * traced method sits in `root.children`. So nothing here parses prose, and a `trace`
 * costs no more parsing than a `watch` does.
 */
export function traceHits(results) {
    const hits = [];
    for (const result of results) {
        if (result.type !== 'trace')
            continue;
        const root = result.root;
        if (root === null || typeof root !== 'object')
            continue;
        const thread = root;
        // A result whose `children` is not a list is not one this reads. Answering with an
        // empty hit instead would count as having observed something, and a caller would then
        // report "1 hit, 0 ms" about a response it does not actually understand.
        if (!Array.isArray(thread.children))
            continue;
        const raw = thread.children;
        const calls = [];
        for (const child of raw) {
            if (child === null || typeof child !== 'object')
                continue;
            const node = asTraceNode(child);
            if (node !== undefined)
                calls.push(node);
        }
        hits.push({
            at: typeof thread.timestamp === 'string' ? thread.timestamp : '',
            thread: typeof thread.threadName === 'string' ? thread.threadName : '',
            calls,
        });
    }
    return hits;
}
/** Read one node of a trace tree, or reject a shape this does not understand. */
function asTraceNode(value) {
    const methodName = value.methodName;
    const cost = value.cost;
    if (typeof methodName !== 'string' || typeof cost !== 'number')
        return undefined;
    const raw = Array.isArray(value.children) ? value.children : [];
    const children = [];
    for (const child of raw) {
        if (child === null || typeof child !== 'object')
            continue;
        const node = asTraceNode(child);
        if (node !== undefined)
            children.push(node);
    }
    return {
        className: typeof value.className === 'string' ? value.className : '',
        methodName,
        costUs: cost,
        times: typeof value.times === 'number' ? value.times : 1,
        children,
    };
}
/** Turn a thrown transport failure into the code that names it. */
function classify(error, timedOut) {
    if (timedOut)
        return 'timeout';
    if (error instanceof Error) {
        // Node reports a refused loopback connection as a cause chain; the code sits
        // on whichever link carries it, and `cause` is where `fetch` puts it.
        const seen = new Set();
        let current = error;
        while (current !== null && typeof current === 'object' && !seen.has(current)) {
            seen.add(current);
            const code = current.code;
            if (code === 'ECONNREFUSED')
                return 'not-attached';
            if (code === 'ECONNRESET')
                return 'disconnected';
            if (code === 'ABORT_ERR')
                return 'cancelled';
            current = current.cause;
        }
        if (error.name === 'AbortError')
            return 'cancelled';
    }
    return 'transport';
}
/**
 * Run one command against one attached agent.
 *
 * @param request - the port, the command, and the deadline (or its absence).
 * @returns Arthas's own response, including the ones that report failure: a
 *          command that failed is a successful call that has a sad answer, and
 *          throwing would lose the `results` a caller needs to explain it.
 * @throws ArthasHttpError when nothing answered, or what answered was not Arthas.
 */
export async function execArthas(request) {
    const url = `http://${ARTHAS_HOST}:${request.port}/api`;
    const controller = new AbortController();
    let timedOut = false;
    const onOuterAbort = () => { controller.abort(); };
    if (request.signal !== undefined) {
        if (request.signal.aborted)
            throw new ArthasHttpError('cancelled', `调用已取消，命令没有发给 ${request.port}。`);
        request.signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    const timer = request.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, request.timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'exec', command: request.command }),
            signal: controller.signal,
        });
    }
    catch (error) {
        throw new ArthasHttpError(classify(error, timedOut), timedOut
            ? `命令在 ${request.timeoutMs ?? 0} 毫秒内没有返回，已放弃：${request.command}`
            : `连不上 ${ARTHAS_HOST}:${request.port} 上的 Arthas：${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        if (request.signal !== undefined)
            request.signal.removeEventListener('abort', onOuterAbort);
    }
    const text = await response.text();
    if (!response.ok) {
        throw new ArthasHttpError('transport', `Arthas 的 HTTP 接口返回 ${response.status}：${text.slice(0, 400)}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new ArthasHttpError('bad-response', `这个端口上回的不是 Arthas 的 JSON（可能是别的进程占了 ${request.port}）：${text.slice(0, 200)}`);
    }
    return asResponse(parsed, request.command, request.port);
}
/**
 * Read one fetched body as a response.
 *
 * Two shapes arrive. A command that ran has `body.results`; a command Arthas
 * refused has a top-level `message` and no `body` at all (`GET /api` answers
 * `{"message":"Unsupported http method: GET","state":"REFUSED"}`). Both are
 * returned rather than thrown, because the second is how a caller learns that its
 * `action` was wrong.
 */
function asResponse(parsed, command, port) {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new ArthasHttpError('bad-response', `Arthas 返回的不是一个对象：${JSON.stringify(parsed).slice(0, 200)}`);
    }
    const top = parsed;
    const state = typeof top.state === 'string' ? top.state : 'UNKNOWN';
    const message = typeof top.message === 'string' ? top.message : undefined;
    const body = top.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        // No body: the response is Arthas complaining, and the state says what about.
        return {
            command,
            results: [],
            state,
            ...message === undefined ? {} : { message },
            raw: parsed,
        };
    }
    const fields = body;
    const rawResults = Array.isArray(fields.results) ? fields.results : [];
    const results = [];
    for (const entry of rawResults) {
        if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
            const record = entry;
            const type = typeof record.type === 'string' ? record.type : 'unknown';
            results.push({ ...record, type });
        }
    }
    return {
        command: typeof fields.command === 'string' ? fields.command : command,
        ...typeof fields.jobId === 'number' ? { jobId: fields.jobId } : {},
        ...typeof fields.jobStatus === 'string' ? { jobStatus: fields.jobStatus } : {},
        ...typeof fields.timeExpired === 'boolean' ? { timeExpired: fields.timeExpired } : {},
        results,
        ...typeof top.sessionId === 'string' ? { sessionId: top.sessionId } : {},
        state,
        ...message === undefined ? {} : { message },
        raw: parsed,
    };
}
/**
 * Is anything listening on this agent's HTTP port?
 *
 * Used before a command rather than instead of one: `execArthas` is the only
 * thing that can tell a live agent from a process that merely holds the port, and
 * this exists so a caller can say "nothing is attached to PID 45076" instead of
 * quoting a connection error.
 *
 * @param port - the HTTP port to probe.
 * @param timeoutMs - how long to wait for the probe; kept short, it is a hint.
 * @returns true when a TCP connection is accepted.
 */
export async function isAgentListening(port, timeoutMs = 700) {
    const { connect } = await import('node:net');
    return await new Promise(resolve => {
        const socket = connect({ host: ARTHAS_HOST, port });
        let settled = false;
        const finish = (answer) => {
            if (settled)
                return;
            settled = true;
            socket.destroy();
            resolve(answer);
        };
        socket.setTimeout(timeoutMs, () => finish(false));
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
    });
}
/**
 * Why a response's command did not work, in words a caller can act on.
 *
 * **This is the function that exists because `state` lies.** Arthas answers
 * `state: "SUCCEEDED"` for commands that failed, so the only honest reading comes
 * from `status.statusCode` — and, for a registration, from `enhancer.success`.
 *
 * A caller that skipped this would report "the watch is fine and simply has not
 * fired yet" for a watch that never registered at all. Those two look identical
 * from `state` alone and they call for opposite next steps, which is why this
 * lives beside the response types rather than in whichever caller needed it first.
 *
 * @param response - whatever Arthas answered.
 * @returns the reason, with terminal colour stripped, or undefined on success.
 */
export function failureText(response) {
    const status = statusOf(response);
    if (status !== undefined && status.statusCode !== 0) {
        return status.message === undefined
            ? `命令失败（statusCode=${status.statusCode}）`
            : plainMessage(status.message);
    }
    const enhancer = enhancerOf(response);
    if (enhancer !== undefined && !enhancer.success) {
        return enhancer.message === undefined ? '增强注册失败' : plainMessage(enhancer.message);
    }
    if (response.state !== 'SUCCEEDED') {
        return response.message === undefined ? `state=${response.state}` : plainMessage(response.message);
    }
    return undefined;
}
