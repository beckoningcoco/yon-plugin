/**
 * What our tools may do to a browser the panel started.
 *
 * WHY THIS IS NOT PART OF `browser-service.ts`
 * That service owns a browser's *life*: scanning for installations, launching one
 * detached, ending it by name. This one owns only the conversation with a browser that
 * is already running, and it ends nothing. Keeping them apart is what lets a tool call
 * be a client of the panel's own configuration rather than a second, weaker copy of it.
 *
 * WHY EVERY CALL RECONNECTS
 * A CDP session lives and dies with its socket: `Target.attachToTarget` on one
 * connection means nothing to the next one. A long-lived socket would mean answering
 * "is it still there" out of a cache, while the browser can be closed by a person at any
 * moment — the stale-socket failure that reads as "the page is gone" when the truth is
 * "you closed the browser". Probing, acting and closing per call costs a few
 * milliseconds on loopback and cannot go stale.
 *
 * WHOSE PAGE IS IT
 * Two orthogonal questions, and conflating them is the easy mistake:
 *   - *May we act on it?* Anything in the target list — including the page the operator
 *     opened and logged into themselves. That is the whole point of driving their
 *     browser instead of a private one.
 *   - *May we close it?* Only what this process created. A page we borrowed is
 *     detached, never closed: ending somebody's logged-in tab because a task finished
 *     would be the most annoying possible bug.
 * So `open` records the target it made, in memory, and `close` refuses anything not in
 * that set. Memory rather than a document on purpose: it describes *this process's*
 * behaviour, and after a restart there is nothing left that could legitimately claim to
 * have created a tab that is still open.
 *
 * CHROMIUM ONLY
 * `types.ts` states why a family is a column rather than a label: Firefox's
 * `-start-debugger-server` speaks a different protocol with no HTTP endpoint at all.
 * This layer therefore refuses a Firefox run by name instead of timing out against it.
 *
 * @module yon-panel/browser-cdp-service
 */
import { CdpError, CdpConnection, probeEndpoint } from "./cdp-client.js";
import { InteractError, capturePage, clickAt, collectElements, fillFields, goBack, goForward, pressKey, readValueOf, reloadPage, scrapeRows, scrollPage, selectOption, setValueOf, typeText, waitForPage, } from "./browser-interact.js";
import { collectPageTips } from "./browser-tips.js";
/** How much of a page's text one read returns before it says it truncated. */
const MAX_TEXT_CHARS = 40_000;
/** How much of an evaluation's value one call returns. */
const MAX_VALUE_CHARS = 40_000;
/** One refusal, with a code the tool layer renders as prose. */
export class BrowserCdpError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'BrowserCdpError';
    }
}
/**
 * Read the target list a `Target.getTargets` answer carries.
 * @param result - the command's result object.
 * @returns every `page` target, in the order the browser listed them.
 */
function targetInfosOf(result) {
    const raw = result['targetInfos'];
    if (!Array.isArray(raw))
        return [];
    const infos = [];
    for (const entry of raw) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const info = entry;
        const targetId = info['targetId'];
        const type = info['type'];
        if (typeof targetId !== 'string' || typeof type !== 'string')
            continue;
        infos.push({
            targetId,
            type,
            title: typeof info['title'] === 'string' ? info['title'] : '',
            url: typeof info['url'] === 'string' ? info['url'] : '',
        });
    }
    return infos;
}
/** Unwrap a CDP string field, or refuse rather than carry an unknown onward. */
function stringField(source, key, what) {
    const value = source[key];
    if (typeof value !== 'string' || value === '') {
        throw new BrowserCdpError('protocol', `浏览器的回答里没有 ${what}。`);
    }
    return value;
}
/** Translate a transport or in-page failure into the vocabulary the tools speak. */
function asCdpError(error) {
    if (error instanceof BrowserCdpError)
        return error;
    if (error instanceof InteractError) {
        const code = error.code === 'not-found' ? 'not-found'
            : error.code === 'invalid-target' ? 'invalid-input'
                : 'protocol';
        return new BrowserCdpError(code, error.message);
    }
    if (error instanceof CdpError) {
        const code = error.code === 'unreachable' ? 'unreachable'
            : error.code === 'timeout' ? 'timeout'
                : error.code === 'protocol' ? 'protocol'
                    : 'unreachable';
        return new BrowserCdpError(code, error.message);
    }
    return new BrowserCdpError('protocol', error instanceof Error ? error.message : String(error));
}
/** Wait, for the settle window in which a toast appears. */
function sleep(ms) {
    return new Promise(resolve => { setTimeout(resolve, ms); });
}
/** Writing verbs: push first, then give the page a moment to complain. */
const WRITE_TIPS = { pre: true, settleMs: 400 };
/**
 * Whether a reference is already a target id.
 *
 * Chromium target ids are 32 upper-case hex characters. Recognising one lets a call skip
 * the listing round-trip when the model is holding an id from an earlier answer, and it
 * is deliberately narrow: a title that happens to look like hex is a coincidence worth
 * losing to a listing that is cheap.
 */
function looksLikeTargetId(text) {
    return /^[0-9A-F]{32}$/.test(text);
}
/**
 * Build the service over the panel's own browser service.
 * @param browsers - the panel's service, for the runs it knows about.
 * @returns the CDP-facing surface.
 */
export function createYonBrowserCdpService(browsers) {
    /** Target ids this process created, and the only ones `close` will end. */
    const ours = new Set();
    /**
     * Pick the run a call means.
     *
     * A single live run is used without being named — that is the common case, and making
     * the model type a run id it would have to look up first would be friction with no
     * safety value. Two or more, and the call has to say which: guessing between two
     * browsers is exactly the mistake this error prevents.
     */
    async function resolveRun(named) {
        const payload = await browsers.list();
        const live = payload.runs.filter(run => run.alive !== 'gone');
        if (live.length === 0) {
            throw new BrowserCdpError('no-browser', '面板里没有正在运行的调试浏览器。先在 Yon 面板的「调试浏览器」里启动一个，再调工具。');
        }
        if (named === undefined || named === '') {
            const first = live[0];
            if (live.length === 1 && first !== undefined)
                return first;
            const names = live
                .map(run => `${run.label === '' ? run.browserId : run.label}（run ${run.runId}，端口 ${String(run.port)}）`)
                .join('、');
            throw new BrowserCdpError('ambiguous', `有 ${String(live.length)} 个调试浏览器在跑，得说清用哪个：${names}。`
                + '把 runId、浏览器 id 或名字放进 run 参数。');
        }
        const needle = named.toLowerCase();
        const match = live.find(run => run.runId === named
            || run.browserId.toLowerCase() === needle
            || run.label.toLowerCase() === needle)
            ?? live.find(run => run.runId.includes(named)
                || run.browserId.toLowerCase().includes(needle)
                || run.label.toLowerCase().includes(needle));
        if (match === undefined) {
            throw new BrowserCdpError('not-found', `没有找到叫「${named}」的调试浏览器。现有：`
                + live.map(run => run.label === '' ? run.browserId : run.label).join('、') + '。');
        }
        return match;
    }
    /** Refuse a family whose protocol is not CDP, with the reason rather than a timeout. */
    function requireChromium(run) {
        if (run.family !== 'chromium') {
            throw new BrowserCdpError('not-chromium', `「${run.label === '' ? run.browserId : run.label}」是 ${run.family} 系浏览器，`
                + '它的调试协议不是 CDP（Firefox 用 -start-debugger-server，没有 /json/version 这个端点），'
                + '所以这套工具驱动不了它。要用 CDP 的话，请在面板里启一个 Chromium 系的浏览器。');
        }
    }
    /**
     * Probe a run's endpoint and open a connection.
     *
     * The panel records the debugger URL a browser reported when it was launched, and an
     * earlier version of this compared that record before acting — on the theory that a
     * different string means a different browser has taken the port. It does not. Chromium
     * generates that GUID per launch, so simply restarting the same browser (same profile,
     * same port, same executable) changes it too, and the comparison then refused every call
     * until somebody went to the panel and relaunched — measured here, on the first restart.
     * The check could never tell a stranger from a restart, so it broke the common case while
     * guarding against a rare one. What remains is the part that does carry information:
     * whatever answers on the port has to speak CDP at all.
     */
    async function connect(run, signal) {
        const endpoint = await probeEndpoint(run.endpoint, signal);
        const connection = await CdpConnection.open(endpoint, signal);
        return { connection, webSocket: endpoint.webSocket };
    }
    /** List the page targets of one connection. */
    async function listPages(connection) {
        const result = await connection.send('Target.getTargets');
        const pages = [];
        let index = 0;
        for (const info of targetInfosOf(result)) {
            if (info.type !== 'page')
                continue;
            pages.push({
                targetId: info.targetId,
                index: index++,
                title: info.title,
                url: info.url,
                ours: ours.has(info.targetId),
            });
        }
        return pages;
    }
    /** Resolve a page reference against a freshly read listing. */
    function matchPage(pages, ref) {
        const text = ref.trim();
        if (text === '') {
            throw new BrowserCdpError('not-found', 'page 参数是空的。先调 browser_targets 看有哪些页面，再用序号、标题或地址指定一个。');
        }
        if (looksLikeTargetId(text)) {
            const byId = pages.find(page => page.targetId === text);
            if (byId !== undefined)
                return byId;
            throw new BrowserCdpError('not-found', `目标 id ${text} 不在当前的页面清单里；它可能已经被关掉了。先调 browser_targets 重新看一遍。`);
        }
        const asIndex = /^\d+$/.test(text) ? Number(text) : Number.NaN;
        if (Number.isInteger(asIndex)) {
            const byIndex = pages.find(page => page.index === asIndex);
            if (byIndex !== undefined)
                return byIndex;
            throw new BrowserCdpError('not-found', `序号 ${String(asIndex)} 超出范围：现在有 ${String(pages.length)} 个页面（序号 0 起）。`);
        }
        const needle = text.toLowerCase();
        const byText = pages.filter(page => page.title.toLowerCase().includes(needle) || page.url.toLowerCase().includes(needle));
        const exactly = byText.find(page => page.title.toLowerCase() === needle || page.url.toLowerCase() === needle);
        const chosen = exactly ?? byText[0];
        if (chosen === undefined) {
            const listing = pages.length === 0
                ? '当前一个页面都没有。'
                : '当前有：' + pages.map(page => `[${String(page.index)}] ${page.title || page.url}`).join('、') + '。';
            throw new BrowserCdpError('not-found', `没有哪个页面的标题或地址包含「${text}」。${listing}`);
        }
        return chosen;
    }
    /**
     * Attach to one page and hand the session to a callback.
     *
     * The connection is closed on every exit path — success, refusal, or a throw — because
     * a socket left open is a second owner of a browser we do not own.
     */
    async function withPage(ref, signal, body, tipMode = {}) {
        const run = await resolveRun(ref.run);
        requireChromium(run);
        let connection;
        try {
            const opened = await connect(run, signal);
            connection = opened.connection;
            const pages = await listPages(connection);
            const page = matchPage(pages, ref.page);
            const attached = await connection.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
            const sessionId = stringField(attached, 'sessionId', '会话 id');
            const context = { connection, sessionId, targetId: page.targetId };
            const drain = async () => {
                await collectPageTips(expression => evaluateIn(context, expression));
            };
            if (tipMode.pre === true)
                await drain();
            const value = await body(context, page, run);
            const settleMs = tipMode.settleMs ?? 0;
            if (settleMs > 0)
                await sleep(settleMs);
            const tips = await collectPageTips(expression => evaluateIn(context, expression));
            return tips.length === 0 ? value : { ...value, tips };
        }
        catch (error) {
            throw asCdpError(error);
        }
        finally {
            connection?.close();
        }
    }
    /** Run one expression in an attached session and return its value as text. */
    async function evaluateIn(context, expression) {
        const result = await context.connection.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        }, context.sessionId);
        const exception = result['exceptionDetails'];
        if (exception !== null && exception !== undefined && typeof exception === 'object') {
            const detail = exception;
            const described = detail['exception'];
            const text = described !== null && typeof described === 'object'
                ? described['description']
                : undefined;
            throw new BrowserCdpError('protocol', `页面里的这段代码报错了：${typeof text === 'string' ? text : JSON.stringify(detail)}`);
        }
        const remote = result['result'];
        if (remote === null || typeof remote !== 'object')
            return '';
        const value = remote['value'];
        if (value === undefined)
            return '';
        return typeof value === 'string' ? value : JSON.stringify(value);
    }
    /** One listing, against one resolved run. */
    async function pagesOf(ref, signal) {
        const run = await resolveRun(ref.run);
        requireChromium(run);
        let connection;
        try {
            const opened = await connect(run, signal);
            connection = opened.connection;
            return { run, pages: await listPages(connection) };
        }
        catch (error) {
            throw asCdpError(error);
        }
        finally {
            connection?.close();
        }
    }
    return {
        pages: pagesOf,
        async click(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await clickAt(context, input.target);
                return { page, tag: outcome.tag, text: outcome.text };
            }, WRITE_TIPS);
        },
        async type(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                await typeText(context, input.text, input.target);
                return page;
            }, WRITE_TIPS);
        },
        async setValue(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await setValueOf(context, input.target, input.value);
                return {
                    page,
                    tag: outcome.tag,
                    value: outcome.value,
                    ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
                };
            }, WRITE_TIPS);
        },
        async pressKey(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                await pressKey(context, input.key);
                return page;
            }, WRITE_TIPS);
        },
        async scroll(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await scrollPage(context, input.deltaY ?? 600, input.target);
                return { page, y: outcome.y, maxY: outcome.maxY };
            }, WRITE_TIPS);
        },
        async screenshot(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const shot = await capturePage(context, input);
                return { page, ...shot };
            });
        },
        async attach(input, signal) {
            const listing = await pagesOf({ ...(input.run === undefined ? {} : { run: input.run }) }, signal);
            const page = matchPage(listing.pages, input.page);
            return { run: listing.run, pages: [page] };
        },
        async open(input, signal) {
            const run = await resolveRun(input.run);
            requireChromium(run);
            let connection;
            try {
                const opened = await connect(run, signal);
                connection = opened.connection;
                const created = await connection.send('Target.createTarget', { url: input.url });
                const targetId = stringField(created, 'targetId', '新页面的 id');
                ours.add(targetId);
                return { targetId, index: -1, title: '', url: input.url, ours: true };
            }
            catch (error) {
                throw asCdpError(error);
            }
            finally {
                connection?.close();
            }
        },
        async read(input, signal) {
            const format = input.format ?? 'text';
            const limit = input.maxChars ?? MAX_TEXT_CHARS;
            return await withPage(input, signal, async (context, page) => {
                const expression = format === 'html'
                    ? 'document.documentElement.outerHTML'
                    : '(document.body ? document.body.innerText : document.documentElement.innerText)';
                const text = await evaluateIn(context, expression);
                const truncated = text.length > limit;
                return {
                    page,
                    format,
                    text: truncated ? text.slice(0, limit) : text,
                    chars: text.length,
                    truncated,
                };
            });
        },
        async evaluate(input, signal) {
            const limit = input.maxChars ?? MAX_VALUE_CHARS;
            return await withPage(input, signal, async (context, page) => {
                const value = await evaluateIn(context, input.expression);
                const truncated = value.length > limit;
                return {
                    page,
                    value: truncated ? value.slice(0, limit) : value,
                    chars: value.length,
                    truncated,
                };
            });
        },
        async close(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                if (!page.ours) {
                    throw new BrowserCdpError('not-ours', `「${page.title === '' ? page.url : page.title}」不是这个进程开的页面，所以不会关它`
                        + '（你自己的页面，关不关由你决定）。要关的话请在浏览器里自己关。');
                }
                await context.connection.send('Target.closeTarget', { targetId: page.targetId });
                ours.delete(page.targetId);
                return page;
            });
        },
        async snapshot(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const listing = await collectElements(context, input.maxNodes ?? 60);
                return { page, elements: listing.elements, total: listing.total };
            });
        },
        async getValue(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await readValueOf(context, input.target);
                return {
                    page,
                    tag: outcome.tag,
                    value: outcome.value,
                    ...(outcome.checked === undefined ? {} : { checked: outcome.checked }),
                };
            });
        },
        async wait(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await waitForPage(context, {
                    ...(input.url === undefined ? {} : { url: input.url }),
                    ...(input.selector === undefined ? {} : { selector: input.selector }),
                    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
                });
                return { page, ok: outcome.ok, url: outcome.url, readyState: outcome.readyState, reason: outcome.reason };
            });
        },
        async history(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                if (input.how === 'reload') {
                    await reloadPage(context, input.hard === true);
                    return { page, moved: true, url: page.url };
                }
                const outcome = input.how === 'back' ? await goBack(context) : await goForward(context);
                return { page, moved: outcome.moved, url: outcome.url };
            }, WRITE_TIPS);
        },
        async select(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await selectOption(context, input.target, input.value, input.match ?? 'auto');
                return { page, value: outcome.value, label: outcome.label };
            }, WRITE_TIPS);
        },
        async fill(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const fields = input.fields.map(field => ({ target: field.target, value: field.value }));
                const outcome = await fillFields(context, fields, input.submit === true);
                return { page, fields: outcome.fields, submitted: outcome.submitted };
            }, WRITE_TIPS);
        },
        async messages(input, signal) {
            return await withPage(input, signal, async (_context, page) => ({ page }));
        },
        async scrape(input, signal) {
            return await withPage(input, signal, async (context, page) => {
                const outcome = await scrapeRows(context, input.rows, input.fields, input.limit ?? 100);
                return { page, rows: outcome.rows, count: outcome.count, truncated: outcome.truncated };
            });
        },
    };
}
