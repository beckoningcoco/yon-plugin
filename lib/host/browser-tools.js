/**
 * The debugging browser, as tools the model can call.
 *
 * WHY TOOLS AT ALL
 * The same argument `tools.ts` opens with: the model that reads "把后台里这个单子提交了"
 * is the one the operator is already talking to, and the agent loop already owns prompting,
 * credentials, retries and the transcript. Handing it tools means this package carries no
 * model client, and the operator keeps one place where the work is visible.
 *
 * WHAT IS DIFFERENT HERE
 * Every other store in this package belongs to us: a document we own, and a write is ours
 * to make. A browser does not. It is the operator's, it is already signed in, and the tab
 * in front of them is the one they care about — which is precisely why driving *their*
 * browser beats opening a private one. So these tools are deliberately lopsided: nearly
 * all of them read or act inside a page, and the single destructive verb is narrow enough
 * to be safe by construction rather than by asking.
 *
 * TWO WAYS TO ACT, AND WHEN EACH IS RIGHT
 * `browser_eval` can do anything the named verbs cannot — but it is a blunt instrument: the
 * page sees a script run, not a person interacting. `browser_click`, `browser_set_value`,
 * `browser_type` and `browser_key` dispatch real input through CDP, so a page that watches
 * mousedown, keystrokes or focus behaves exactly as it does for a person and the
 * framework's own state stays in step. Reach for the verbs first; let `browser_eval` be the
 * escape hatch for what they do not cover.
 *
 * THE BORROWED PAGE
 * `browser_attach` is the entry point, not a formality. Attaching creates nothing and
 * closes nothing: it resolves a page the operator opened, confirms it is still there, and
 * hands back the handle every other tool takes. Their tab keeps its login, its scroll
 * position and its place in their window, and no tool here can end it — `browser_close`
 * refuses anything this process did not create, and says why.
 *
 * `browser_eval` IS NOT BEHIND THE PRE-EXECUTE GATE
 * It runs arbitrary JavaScript in a page the operator is signed into. It is left ungated on
 * purpose: a task that has to approve every read is a task nobody runs, and the limits that
 * hold are structural rather than per-call (nothing here writes to our own documents, and
 * nothing can close a page that is not ours). An operator who wants a gate can add
 * `browser_eval` to a `tools/pre-execute` listener — the tool name is stable for that.
 *
 * @module yon-panel/browser-tools
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { CLICK_MODES, DRAG_MODES, KEY_NAMES, MOUSE_BUTTONS, describeHitRelation, reportDrag, } from "./browser-interact.js";
import { tipsOf } from "./browser-tips.js";
import { BrowserCdpError, } from "./browser-cdp-service.js";
/** The mark each kind of message gets, so an error does not read like a chatty confirmation. */
const TIP_MARKS = {
    error: '⛔',
    warn: '⚠',
    success: '✓',
    info: '·',
};
/**
 * The line an answer gains when the page said something while the operation ran.
 *
 * Empty for a quiet page — which is why this can be applied to every browser tool at once
 * without changing how any of them read today. An answer that suddenly grew a "no messages"
 * line on every call would be noise, and noise is how a feature like this gets switched off.
 *
 * @param tips - what the page said, in arrival order.
 * @returns the lines to append, or an empty string.
 */
function renderTips(tips) {
    if (tips.length === 0)
        return '';
    const shown = tips.slice(0, 5);
    const lines = [];
    const first = shown[0];
    if (tips.length === 1 && first !== undefined) {
        lines.push(`${TIP_MARKS[first.level]} 页面提示：${first.txt}`);
        return lines[0];
    }
    lines.push(`⚠ 页面提示（${String(tips.length)} 条）：`);
    for (const tip of shown)
        lines.push(`  ${TIP_MARKS[tip.level]} ${tip.txt}`);
    if (tips.length > shown.length)
        lines.push(`  …还有 ${String(tips.length - shown.length)} 条`);
    return lines.join('\n');
}
/**
 * A tool's schema, plus the field the tips ride in on.
 *
 * Declared for the same reason the value is: a caller reading the schema should be able to
 * see that an answer may carry messages, without every one of these tools repeating it.
 *
 * @param schema - the tool's own output schema.
 * @returns the schema with an optional `tips` array added.
 */
function schemaWithTips(schema) {
    const properties = schema['properties'];
    if (properties === null || typeof properties !== 'object')
        return schema;
    return {
        ...schema,
        properties: {
            ...properties,
            tips: { type: 'array', items: { type: 'object' } },
        },
    };
}
/** One tool definition over the registry's contract. */
function defineTool(spec) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: schemaWithTips(spec.outputSchema),
            render: (_args, value) => {
                const base = spec.render(value);
                if (spec.tipsInRender === false)
                    return [{ type: 'text', text: base }];
                const tips = renderTips(tipsOf(value));
                return [{ type: 'text', text: tips === '' ? base : `${base}\n${tips}` }];
            },
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new BrowserCdpError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new BrowserCdpError('invalid-input', `${spec.name} 已被取消`);
            return await spec.execute(args, exec.signal);
        },
        presentCall: (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall(args),
    };
}
/** A required string argument, or a refusal naming what was missing. */
function asString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new BrowserCdpError('invalid-input', `${name} 要是一个非空的字符串。`);
    }
    return value.trim();
}
/** An optional string argument. */
function optionalString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
/** An optional positive integer argument. */
function optionalCount(value, name) {
    if (value === undefined || value === null)
        return undefined;
    const asNumber = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isInteger(asNumber) || asNumber <= 0) {
        throw new BrowserCdpError('invalid-input', `${name} 要是一个正整数。`);
    }
    return asNumber;
}
/** How a page is named in prose: its title, else its address, else its position. */
function nameOfPage(page) {
    if (page.title !== '')
        return page.title;
    if (page.url !== '')
        return page.url;
    return page.index >= 0 ? `序号 ${String(page.index)}` : page.targetId;
}
/** Who opened one page, as the listing says it. */
function ownerOf(page) {
    return page.ours ? '本插件开的，可关' : '你开的，不会被关';
}
/** How a run is named in prose. */
function nameOfRun(listing) {
    const label = listing.run.label === '' ? listing.run.browserId : listing.run.label;
    return `${label}（端口 ${String(listing.run.port)}，run ${listing.run.runId}）`;
}
/** One listing, rendered so the model can pick from it without another call. */
function renderListing(listing) {
    const head = `调试浏览器：${nameOfRun(listing)}`;
    if (listing.pages.length === 0) {
        return [head, '当前一个页面都没有。可以用 browser_open 开一个，或者在使用者的浏览器里打开一个再列一次。'].join('\n');
    }
    const lines = listing.pages.map(page => `  [${String(page.index)}] ${nameOfPage(page)}\n        ${page.url}\n        ${ownerOf(page)}  target=${page.targetId}`);
    return [
        head,
        `页面 ${String(listing.pages.length)} 个：`,
        ...lines,
        '',
        '序号是这一次列出来的顺序，页面增减后会变；要跨调用稳定引用就用 target= 后面那串 id，或者用标题/地址里的片段。',
    ].join('\n');
}
/** The JSON Schema of a page listing. */
const LISTING_VALUE = {
    type: 'object',
    required: ['run', 'pages'],
    properties: {
        run: { type: 'object' },
        pages: { type: 'array', items: { type: 'object' } },
    },
};
/** The JSON Schema of one page. */
const PAGE_VALUE = {
    type: 'object',
    required: ['targetId', 'index', 'title', 'url', 'ours'],
    properties: {
        targetId: { type: 'string' },
        index: { type: 'number' },
        title: { type: 'string' },
        url: { type: 'string' },
        ours: { type: 'boolean' },
    },
};
/** The JSON Schema of a read's answer. */
const READ_VALUE = {
    type: 'object',
    required: ['page', 'format', 'text', 'chars', 'truncated'],
    properties: {
        page: { type: 'object' },
        format: { type: 'string' },
        text: { type: 'string' },
        chars: { type: 'number' },
        truncated: { type: 'boolean' },
    },
};
/** The JSON Schema of an evaluation's answer. */
const EVAL_VALUE = {
    type: 'object',
    required: ['page', 'value', 'chars', 'truncated'],
    properties: {
        page: { type: 'object' },
        value: { type: 'string' },
        chars: { type: 'number' },
        truncated: { type: 'boolean' },
    },
};
/** How every tool here names the page it acts on. */
const PAGE_ARG = {
    type: 'string',
    description: 'Which page: a position from browser_targets ("0"), a target id, or a piece '
        + 'of its title or address. An id is the only form that survives the page list changing.',
};
/** How every tool here may name the browser it acts on. */
const RUN_ARG = {
    type: 'string',
    description: 'Which debugging browser, when more than one is running: a run id, a browser '
        + 'id such as "edge", or part of its label. Omit it when only one is running.',
};
/** How a click, a fill or a scroll names the element it acts on. */
const TARGET_ARG = {
    type: 'string',
    description: 'The element: a CSS selector ("#submit", "[name=user]", "button.primary"), or the '
        + 'visible text on the control ("登录") when by is "text", or an XPath when by is "xpath".',
};
/** How `target` is read. */
const BY_ARG = {
    type: 'string',
    enum: ['css', 'text', 'xpath'],
    description: 'How to interpret target. Default "css". "text" matches what the control says, which '
        + 'is usually easier than writing a selector for it.',
};
/** Which match to take when several match. */
const INDEX_ARG = {
    type: 'number',
    description: 'Which match to take when several match, 0-based. Default 0. Text matching prefers the '
        + 'deepest element, so 0 is normally the control itself rather than a wrapper around it.',
};
/** How a click is delivered, when a synthesized pointer is not enough. */
const CLICK_MODE_ARG = {
    type: 'string',
    enum: [...CLICK_MODES],
    description: 'How the click is delivered. Default "real" — a genuine CDP pointer, which is what a '
        + 'person would do and what nearly every widget needs. The other three run INSIDE the page and '
        + 'are progressively further from a person: "dom" is el.click(), "seq" dispatches '
        + 'mouseenter→over→down→up→click, "react" walks up to the nearest React handler and calls its '
        + 'onClick. Use them in that order, only when "real" provably does nothing.',
};
/** Which mouse button a click presses. */
const CLICK_BUTTON_ARG = {
    type: 'string',
    enum: [...MOUSE_BUTTONS],
    description: 'Which mouse button. Default "left". Use "right" to reach a context menu: the page gets a '
        + 'real contextmenu event, and that is the only thing that works on menus which ignore a dispatched '
        + 'DOM event (measured: 用友 wui 的树与表格 both ignore a synthesized contextmenu). Chromium rarely '
        + 'shows its own native menu for a CDP right-press; if one does appear, dismiss it with browser_key '
        + 'Escape.',
};
/** How a drag is delivered. */
const DRAG_MODE_ARG = {
    type: 'string',
    enum: [...DRAG_MODES],
    description: 'How the drag is delivered. Default "html5" — for a draggable="true" source, where the '
        + 'browser must be told to hand the drag over (Input.setInterceptDrags) and what it carries replayed at '
        + 'the target. Use "mouse" for anything built on mousedown/mousemove/mouseup: sliders, sortable tables, '
        + 'canvas panning. Picking the wrong one does not error in the page, it simply does nothing — which is '
        + 'why the html5 failure names the other mode.',
};
/** The element a drag starts from. */
const DRAG_FROM_ARG = {
    type: 'string',
    description: 'The element to drag: a CSS selector, its visible text (when fromBy is "text"), or an XPath '
        + 'when fromBy is "xpath".',
};
/** The element a drag drops on. */
const DRAG_TO_ARG = {
    type: 'string',
    description: 'The element to drop on, named the same ways as from. Both ends must be visible at once — '
        + 'the page is scrolled to the source, and a target that ends up outside the viewport is refused '
        + 'rather than silently missed.',
};
/** How one end of a drag is read. */
const DRAG_BY_ARG = {
    type: 'string',
    enum: ['css', 'text', 'xpath'],
    description: 'How to interpret the from/to argument it belongs to (fromBy / toBy). Default "css".',
};
/** Which match to take at one end of a drag. */
const DRAG_INDEX_ARG = {
    type: 'number',
    description: 'Which match to take when several match at this end (fromIndex / toIndex), 0-based. Default 0.',
};
/** How many interpolated moves a drag makes between its two ends. */
const DRAG_STEPS_ARG = {
    type: 'number',
    description: 'How many interpolated moves between the two ends. Default 12. A drag delivered as one jump '
        + 'is read as a teleport by most widgets, so this stays high enough to look like a hand.',
};
/** Milliseconds between two moves of a drag. */
const DRAG_STEP_MS_ARG = {
    type: 'number',
    description: 'Milliseconds between two moves of a drag. Default 60. Lower is faster and more likely to '
        + 'outrun a widget that does its work on a timer; higher is slower and more forgiving.',
};
/** How long to rest on the element before pressing it. */
const HOVER_MS_ARG = {
    type: 'number',
    description: 'Milliseconds to rest on the element after the pointer arrives and before pressing. '
        + 'Reach for it when the control only EXISTS while its row is hovered: a synthesized click moves '
        + 'and presses in the same instant, so there is nothing there yet to receive the press. '
        + '200–500 is usually enough. Default 0.',
};
/** How long a hover rests before it returns. */
const HOLD_MS_ARG = {
    type: 'number',
    description: 'Milliseconds to rest on the element before returning. Default 900. Pass 0 to return '
        + 'as soon as the pointer has arrived.',
};
/** An optional whole number that may be zero, as `index` must be. */
function optionalIndex(value) {
    if (value === undefined || value === null)
        return undefined;
    const asNumber = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isInteger(asNumber) || asNumber < 0) {
        throw new BrowserCdpError('invalid-input', 'index 要是一个非负整数（第一个匹配是 0）。');
    }
    return asNumber;
}
/** An optional duration in milliseconds, which may be zero. */
function optionalDurationMs(value, name) {
    if (value === undefined || value === null)
        return undefined;
    const asNumber = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(asNumber) || asNumber < 0) {
        throw new BrowserCdpError('invalid-input', `${name} 要是一个不小于 0 的毫秒数。`);
    }
    return asNumber;
}
/** The element a call names, assembled from the flat arguments the model writes. */
function elementTargetOf(args, required) {
    const raw = args.target;
    if (raw === undefined || raw === null) {
        if (required) {
            throw new BrowserCdpError('invalid-input', 'target 是必填的：写一个 CSS 选择器（#submit、[name=user]），或者把 by 设成 text 后写控件上的可见文字。');
        }
        return undefined;
    }
    const value = asString(raw, 'target');
    const rawBy = args.by;
    let by;
    if (rawBy === undefined || rawBy === null)
        by = undefined;
    else if (rawBy === 'css' || rawBy === 'text' || rawBy === 'xpath')
        by = rawBy;
    else
        throw new BrowserCdpError('invalid-input', 'by 只能是 "css"、"text" 或 "xpath"。');
    const index = optionalIndex(args.index);
    return {
        value,
        ...(by === undefined ? {} : { by }),
        ...(index === undefined ? {} : { index }),
    };
}
/**
 * One end of a drag, from the flat arguments the model writes.
 *
 * Separate from `elementTargetOf` because a drag names TWO elements: reusing `target`/`by`
 * would make the second end overwrite the first, and the failure would look like "it dragged
 * the wrong thing" rather than "the arguments collided".
 */
function dragEndOf(args, end) {
    const raw = args[end];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
        throw new BrowserCdpError('invalid-input', `${end} 是必填的：拖拽的起点和落点都要说清（选择器，或用 ${end}By="text" 写可见文字）。`);
    }
    const value = asString(raw, end);
    const rawBy = args[`${end}By`];
    let by;
    if (rawBy === undefined || rawBy === null)
        by = undefined;
    else if (rawBy === 'css' || rawBy === 'text' || rawBy === 'xpath')
        by = rawBy;
    else
        throw new BrowserCdpError('invalid-input', `${end}By 只能是 "css"、"text" 或 "xpath"。`);
    const index = optionalIndex(args[`${end}Index`]);
    return {
        value,
        ...(by === undefined ? {} : { by }),
        ...(index === undefined ? {} : { index }),
    };
}
/** Where captures land when the call names no path. */
function shotsDir() {
    return join(homedir(), '.dsh', 'yon-panel', 'browser-shots');
}
/**
 * Write one capture to disk and say where it landed.
 *
 * A named path is refused when a file is already there: an operator's file is not something
 * an agent should silently replace, and a screenshot is regenerable in a way their file is
 * not.
 * @param base64 - the image the browser returned.
 * @param mime - its media type, which decides the extension.
 * @param savePath - an absolute path the caller named, if any.
 * @param page - the page it came from, used only to name the default file.
 * @returns the absolute path written.
 */
function saveShot(base64, mime, savePath, page) {
    const bytes = Buffer.from(base64, 'base64');
    const extension = mime === 'image/jpeg' ? 'jpg' : 'png';
    if (savePath !== undefined) {
        if (!isAbsolute(savePath)) {
            throw new BrowserCdpError('invalid-input', `savePath 要是绝对路径；收到的是「${savePath}」。`);
        }
        if (existsSync(savePath)) {
            throw new BrowserCdpError('invalid-input', `savePath 上已经有一个文件了：${savePath}。换个名字，或者先把它挪走——截图可以重来，那个文件不一定。`);
        }
        mkdirSync(dirname(savePath), { recursive: true });
        writeFileSync(savePath, bytes);
        return savePath;
    }
    const directory = shotsDir();
    mkdirSync(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = (page.title === '' ? page.url : page.title)
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    const full = join(directory, `${stamp}${slug === '' ? '' : `-${slug}`}.${extension}`);
    writeFileSync(full, bytes);
    return full;
}
/**
 * Register the debugging browser tools.
 * @param ctx - host context carrying the tool registry.
 * @param cdp - the service over the panel's running browsers.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonBrowserTools(ctx, cdp) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_targets',
        description: 'List the pages open in the debugging browser this panel started, with each '
            + 'page\'s position, title, address and target id. This is the entry point for driving the '
            + 'operator\'s own browser: a page they opened and signed into appears here exactly like one '
            + 'this plugin created, and either can be acted on. Call it before browser_attach, '
            + 'browser_read or browser_eval when you do not already hold a page reference, and again '
            + 'after anything that may have changed the page list.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: { run: RUN_ARG },
        },
        outputSchema: LISTING_VALUE,
        async execute(args, signal) {
            const run = optionalString(args.run);
            return await cdp.pages(run === undefined ? {} : { run }, signal);
        },
        render: renderListing,
        presentCall() {
            return { card: 'generic', title: '列出调试浏览器里的页面', kind: 'read' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_attach',
        description: 'Point at one page and confirm it is there, returning the handle the other '
            + 'browser tools take as their page argument. Use it to act on a page the operator opened '
            + 'and signed into: attaching creates nothing and closes nothing, so their tab keeps its '
            + 'login and its place in their window. The page argument accepts a position from '
            + 'browser_targets, a target id, or a piece of the title or address.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: { page: PAGE_ARG, run: RUN_ARG },
        },
        outputSchema: LISTING_VALUE,
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            return await cdp.attach(run === undefined ? { page } : { page, run }, signal);
        },
        render(value) {
            const listing = value;
            const page = listing.pages[0];
            if (page === undefined)
                return '没有选中任何页面。';
            return [
                `已接管：[${String(page.index)}] ${nameOfPage(page)}`,
                `  ${page.url}`,
                `  ${ownerOf(page)}  target=${page.targetId}`,
                '',
                '后面的 browser_read / browser_eval 把这个页面填进 page 参数即可。',
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `接管页面「${typeof args.page === 'string' ? args.page : ''}」`,
                kind: 'read',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_open',
        description: 'Open a new page in the debugging browser and return its handle. The page is '
            + 'created by this plugin, which makes it the one kind of page browser_close will agree to '
            + 'close. Prefer browser_attach when the task is about something the operator is already '
            + 'looking at, or when the site needs a login they have already given.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['url'],
            properties: {
                url: {
                    type: 'string',
                    description: 'The address to open. Include the scheme, e.g. https://example.com/path.',
                },
                run: RUN_ARG,
            },
        },
        outputSchema: PAGE_VALUE,
        async execute(args, signal) {
            const url = asString(args.url, 'url');
            const run = optionalString(args.run);
            return await cdp.open(run === undefined ? { url } : { url, run }, signal);
        },
        render(value) {
            return [
                `已新开页面：${value.url}`,
                `  target=${value.targetId}`,
                '',
                '这是本插件开的页面，用完可以用 browser_close 关掉。页面加载完成前读它可能读到空白，'
                    + '需要等就用 browser_eval 查 document.readyState。',
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `打开 ${typeof args.url === 'string' ? args.url : ''}`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_read',
        description: 'Read one page as it is right now. format defaults to text (the visible text); '
            + 'html returns the document element\'s outer markup. The answer is capped and says when it '
            + 'truncated — when that happens, narrow the page first with browser_eval (select the region '
            + 'or the list you need) instead of asking for more text. This reads the operator\'s own '
            + 'logged-in page, so it is usually the fastest way to see data behind a login.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                format: {
                    type: 'string',
                    enum: ['text', 'html'],
                    description: 'text for the visible text (default), html for the markup.',
                },
                maxChars: {
                    type: 'number',
                    description: 'How much text to return before truncating. Default 40000.',
                },
            },
        },
        outputSchema: READ_VALUE,
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const formatArg = args.format;
            if (formatArg !== undefined && formatArg !== 'text' && formatArg !== 'html') {
                throw new BrowserCdpError('invalid-input', 'format 只能是 text 或 html。');
            }
            const maxChars = optionalCount(args.maxChars, 'maxChars');
            return await cdp.read({
                page,
                ...(run === undefined ? {} : { run }),
                ...(formatArg === undefined ? {} : { format: formatArg }),
                ...(maxChars === undefined ? {} : { maxChars }),
            }, signal);
        },
        render(value) {
            const result = value;
            const head = `页面 ${nameOfPage(result.page)} — ${result.page.url}`;
            const size = result.truncated
                ? `（${result.format}，共 ${String(result.chars)} 字符，已截断）`
                : `（${result.format}，${String(result.chars)} 字符）`;
            return [head, size, '', result.text].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `读取页面「${typeof args.page === 'string' ? args.page : ''}」`,
                kind: 'read',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_eval',
        description: 'Run one JavaScript expression in the page and return what it evaluates to, as '
            + 'text. This is the escape hatch for everything the other tools do not cover: reading a '
            + 'specific field, collecting the rows of a table, calling a function the page exposes. It '
            + 'runs in the page\'s own origin with the page\'s own login. returnByValue is on, so return '
            + 'data rather than DOM nodes; awaitPromise is on, so an async expression is fine. A value '
            + 'that is not a string is returned as JSON. The result is capped at maxChars.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'expression'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                expression: {
                    type: 'string',
                    description: 'The JavaScript to evaluate. Its value is returned; keep it to what you need.',
                },
                maxChars: {
                    type: 'number',
                    description: 'How much of the result to return before truncating. Default 40000.',
                },
            },
        },
        outputSchema: EVAL_VALUE,
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const expression = asString(args.expression, 'expression');
            const run = optionalString(args.run);
            const maxChars = optionalCount(args.maxChars, 'maxChars');
            return await cdp.evaluate({
                page,
                expression,
                ...(run === undefined ? {} : { run }),
                ...(maxChars === undefined ? {} : { maxChars }),
            }, signal);
        },
        render(value) {
            const result = value;
            const size = result.truncated
                ? `结果共 ${String(result.chars)} 字符，已截断`
                : `结果 ${String(result.chars)} 字符`;
            return [
                `在 ${nameOfPage(result.page)} 上执行完毕（${size}）：`,
                '',
                result.value === '' ? '(空)' : result.value,
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `在页面里执行脚本`,
                kind: 'other',
                rawInput: args.expression,
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_close',
        description: 'Close a page this plugin opened. It refuses a page the operator opened '
            + 'themselves — that tab is theirs, and the refusal says so rather than closing it. To stop '
            + 'driving a borrowed page you simply stop referring to it; nothing needs to be closed, and '
            + 'closing the browser itself is the panel\'s job, not a tool\'s.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: { page: PAGE_ARG, run: RUN_ARG },
        },
        outputSchema: PAGE_VALUE,
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            return await cdp.close(run === undefined ? { page } : { page, run }, signal);
        },
        render(value) {
            return `已关闭本插件开的页面：${nameOfPage(value)}（target=${value.targetId}）。`;
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `关闭页面「${typeof args.page === 'string' ? args.page : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_activate',
        description: 'Bring a page to the front: the operator\'s own window switches to that tab. This is the '
            + 'tool-layer form of scripts/activate-tab.mjs, and it works only because Target.activateTarget is a '
            + 'BROWSER-level command — issued on an attached page session it is ignored without an error. '
            + 'Use it BEFORE a writing action, so the operator can see which page is being changed. Do NOT use '
            + 'it before reads: driving a background tab works exactly the same, and moving their window for a '
            + 'read takes their focus for nothing.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: { page: PAGE_ARG, run: RUN_ARG },
        },
        outputSchema: PAGE_VALUE,
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            return await cdp.activate(run === undefined ? { page } : { page, run }, signal);
        },
        render(value) {
            return [
                `已把页面切到前台：${nameOfPage(value)}。`,
                '使用者的窗口已经跳到这个标签上了——这是刻意的（只在"要动手改"的页面前切，纯读不切）。',
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `切到页面「${typeof args.page === 'string' ? args.page : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_click',
        description: 'Click an element in the page by locating it from the DOM — a CSS selector, its '
            + 'visible text, or an XPath — and dispatching a real pointer press at its centre. Prefer this '
            + 'over clicking through browser_eval when the page reacts to a genuine mouse event (menus, drag '
            + 'handles, anything listening for mousedown). The element is scrolled into view first, and the '
            + 'pointer is moved before it presses: Chromium delivers a synthesized press to whatever the page '
            + 'currently considers hovered, so a tab that has never seen a mouse event would swallow the '
            + 'first click while reporting success. '
            + 'It moves and presses in the SAME instant, though, and some controls only exist while their row '
            + 'is hovered (旗舰版 list rows render 重命名/复制到/移动到/更多 on hover and drop them on leave). '
            + 'For those, pass hoverMs to leave the gap a hand would, or use browser_hover first to see what '
            + 'appears. If a real pointer provably does nothing, `mode` escalates inside the page: "dom", '
            + '"seq", then "react" — each further from a person than the last, so try them in order. '
            + 'Before it presses, it checks the press point: the element has to be inside the viewport and the '
            + 'point has to actually reach it, so an element a CSS transform has pushed off-screen, or one '
            + 'something else is sitting on top of, is refused as `not-hit` instead of being reported as a '
            + 'click that happened. A success therefore means the pointer really pressed on that element; the '
            + 'three in-page modes ("dom"/"seq"/"react") fire inside the DOM and are not checked this way, and '
            + 'nothing is claimed when the point cannot be read at all (a cross-origin frame).',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'target'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                target: TARGET_ARG,
                by: BY_ARG,
                index: INDEX_ARG,
                mode: CLICK_MODE_ARG,
                hoverMs: HOVER_MS_ARG,
                button: CLICK_BUTTON_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'tag', 'text', 'via', 'button', 'hitTag', 'hitText', 'hitRelation'],
            properties: {
                page: { type: 'object' },
                tag: { type: 'string' },
                text: { type: 'string' },
                via: { type: 'string' },
                button: { type: 'string' },
                hitTag: { type: 'string' },
                hitText: { type: 'string' },
                hitRelation: { type: 'string' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const target = elementTargetOf(args, true);
            const modeArg = optionalString(args.mode);
            if (modeArg !== undefined && !CLICK_MODES.includes(modeArg)) {
                throw new BrowserCdpError('invalid-input', `mode 只能是 ${CLICK_MODES.join(' / ')}，收到「${modeArg}」。`);
            }
            const mode = modeArg;
            const buttonArg = optionalString(args.button);
            if (buttonArg !== undefined && !MOUSE_BUTTONS.includes(buttonArg)) {
                throw new BrowserCdpError('invalid-input', `button 只能是 ${MOUSE_BUTTONS.join(' / ')}，收到「${buttonArg}」。`);
            }
            const button = buttonArg;
            const hoverMs = optionalDurationMs(args.hoverMs, 'hoverMs');
            return await cdp.click({
                page,
                target,
                ...(run === undefined ? {} : { run }),
                ...(mode === undefined ? {} : { mode }),
                ...(hoverMs === undefined ? {} : { hoverMs }),
                ...(button === undefined ? {} : { button }),
            }, signal);
        },
        render(value) {
            const what = value.text === '' ? value.tag : `${value.tag}「${value.text}」`;
            const synthesized = value.via === 'real'
                ? ''
                : `（${value.via} 方式在页面内合成，不是真实指针）`;
            const byWord = value.button === 'right' ? '右键' : value.button === 'middle' ? '中键' : '';
            const nativeMenu = value.button === 'right' && value.via === 'real'
                ? ['右键会打开页面自己的上下文菜单；若弹出的是 Chromium 的原生菜单，用 browser_key Escape 收掉。']
                : [];
            // 真实指针才有按点：合成路径在页面内触发，没有「指针底下是谁」这回事。
            const landed = value.hitText === '' ? value.hitTag : `${value.hitTag}「${value.hitText}」`;
            const pressed = value.via !== 'real' || value.hitRelation === 'unavailable'
                ? []
                : [`按下的那一点底下是 ${landed}（${describeHitRelation(value.hitRelation)}）。`];
            return [
                `已在页面 ${nameOfPage(value.page)} 上${byWord}点击了 ${what}${synthesized}。`,
                ...pressed,
                '点击常常会改变页面（跳转、弹出、局部刷新）；要确认结果就读一遍，或者稍等再 browser_read。',
                ...nativeMenu,
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `点击「${typeof args.target === 'string' ? args.target : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_hover',
        description: 'Move the pointer onto an element and LEAVE it there, without pressing. This is the '
            + 'tool for controls that do not exist until something is hovered: 旗舰版 semantic-model rows '
            + 'render 重命名/复制到/移动到/更多 only while the row is hovered, and they vanish the moment the '
            + 'pointer leaves — so browser_click can neither open that menu nor reveal what is in it. '
            + 'The pointer STAYS where this put it. Read the page with browser_eval, which does not move it. '
            + 'Do NOT follow with browser_click or another hover: either ends the very hover you are relying '
            + 'on, and the elements it rendered disappear with it. The hover belongs to the shared pointer, so '
            + 'the operator moving their own mouse, or switching tabs, ends it too. '
            + 'The answer reports what the pointer actually landed on (hitTag/hitText), so a hover that missed '
            + '— an overlay, a sticky column, a coordinate from before a scroll — is visible instead of '
            + 'silently wrong.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'target'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                target: TARGET_ARG,
                by: BY_ARG,
                index: INDEX_ARG,
                holdMs: HOLD_MS_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'tag', 'text', 'hitTag', 'hitText', 'hitRelation'],
            properties: {
                page: { type: 'object' },
                tag: { type: 'string' },
                text: { type: 'string' },
                hitTag: { type: 'string' },
                hitText: { type: 'string' },
                hitRelation: { type: 'string' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const target = elementTargetOf(args, true);
            const holdMs = optionalDurationMs(args.holdMs, 'holdMs');
            return await cdp.hover({
                page,
                target,
                ...(run === undefined ? {} : { run }),
                ...(holdMs === undefined ? {} : { holdMs }),
            }, signal);
        },
        render(value) {
            const aimed = value.text === '' ? value.tag : `${value.tag}「${value.text}」`;
            const landed = value.hitTag === ''
                ? '（没探到——页面可能正在重绘）'
                : value.hitText === '' ? value.hitTag : `${value.hitTag}「${value.hitText}」`;
            const relation = value.hitRelation;
            // 只有「真的落到了别处」「已经认不出目标」「压根没探到」才值得拦一下；命中的是它自己的子元素、
            // 或包着它的外层元素，都算落对了地方，报出来是给人看细节的，不是报警。
            const astray = relation === 'unrelated' || relation === 'target-is-detached'
                || relation === 'unavailable';
            return [
                `已把指针停在页面 ${nameOfPage(value.page)} 上的 ${aimed}，没有点击。`,
                `指针底下现在是 ${landed}（${describeHitRelation(relation)}）。`,
                ...(astray
                    ? ['⚠️ 指针底下不是你要的那个元素——多半被浮层或固定列挡住了，也可能是滚动让坐标变了，'
                            + '或者页面把原来的节点重绘换掉了；先用 browser_eval 看清实际命中的是谁，再决定下一步。']
                    : []),
                '要读悬停后出现的 DOM，用 browser_eval（它不移动指针）。**不要**接着 browser_click 或再 '
                    + 'hover 一次——那会把指针挪走，悬停出来的东西立刻消失。',
            ].join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `悬停「${typeof args.target === 'string' ? args.target : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_drag',
        description: 'Drag one element onto another with a real pointer. Use it where a drop zone refuses '
            + 'everything else: 用友\'s designer drop targets ("值字段：拖入维度或度量") accept only a genuine HTML5 '
            + 'drag, and a synthesized dragstart/drop — or a plain click — does nothing there. '
            + 'mode picks the mechanism, and the two are NOT interchangeable: "html5" (default) for '
            + 'draggable="true" sources, "mouse" for sliders, sortable tables and canvas panning, which listen to '
            + 'mousemove. Running the wrong one produces no error in the page, only nothing happening. '
            + 'Both ends must be visible at once — the page is scrolled to the source, and a drag whose target '
            + 'ends up outside the viewport is refused with an explanation rather than silently missed. '
            + 'The answer says what was actually dragged and where it actually landed, not just that the gesture '
            + 'was played: both ends come back as they were located and matched (how many elements matched, which '
            + 'one was taken, whether a text match landed on a text-only leaf), and four points of the gesture are '
            + 'read back from the page — who was under the press, who was under the drop point before the gesture, '
            + 'who was under it after the last move, and who was under it after the release — each reported as a '
            + 'RELATION to the element aimed at. A press swallowed by an overlay, the wrong one of several matches, '
            + 'or a drop that landed somewhere else is visible there. It also reports whether real drag data '
            + 'actually moved (intercepted); when it did not, the source was probably not draggable and the other '
            + 'mode is what you want.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'from', 'to'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                from: DRAG_FROM_ARG,
                fromBy: DRAG_BY_ARG,
                fromIndex: DRAG_INDEX_ARG,
                to: DRAG_TO_ARG,
                toBy: DRAG_BY_ARG,
                toIndex: DRAG_INDEX_ARG,
                mode: DRAG_MODE_ARG,
                steps: DRAG_STEPS_ARG,
                stepMs: DRAG_STEP_MS_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: [
                'page', 'mode', 'delivery', 'verification', 'from', 'to',
                'fromPressHit', 'toBeforeHit', 'toMidHit', 'toReleaseHit', 'intercepted',
            ],
            properties: {
                page: { type: 'object' },
                mode: { type: 'string' },
                delivery: { type: 'string' },
                verification: { type: 'string' },
                from: { type: 'object' },
                to: { type: 'object' },
                fromPressHit: { type: 'object' },
                toBeforeHit: { type: 'object' },
                toMidHit: { type: 'object' },
                toReleaseHit: { type: 'object' },
                intercepted: { type: 'boolean' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const from = dragEndOf(args, 'from');
            const to = dragEndOf(args, 'to');
            const modeArg = optionalString(args.mode);
            if (modeArg !== undefined && !DRAG_MODES.includes(modeArg)) {
                throw new BrowserCdpError('invalid-input', `mode 只能是 ${DRAG_MODES.join(' / ')}，收到「${modeArg}」。`);
            }
            const mode = modeArg;
            const steps = optionalIndex(args.steps);
            const stepMs = optionalDurationMs(args.stepMs, 'stepMs');
            return await cdp.drag({
                page,
                from,
                to,
                ...(run === undefined ? {} : { run }),
                ...(mode === undefined ? {} : { mode }),
                ...(steps === undefined ? {} : { steps }),
                ...(stepMs === undefined ? {} : { stepMs }),
            }, signal);
        },
        render(value) {
            const got = value;
            // 四个时刻的实际落点、两端的匹配情况、以及该拦下来的那几条警告，都在 reportDrag 里：
            // 这套措辞要能被单独测到，不然一句错话没人会发现。
            return reportDrag(nameOfPage(got.page), got);
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `拖拽「${typeof args.from === 'string' ? args.from : ''}」→「${typeof args.to === 'string' ? args.to : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_set_value',
        description: 'Set a form control\'s value the way the page\'s own framework does: through the '
            + 'prototype setter, followed by input and change events. That is the only form that survives a '
            + 'React or Vue re-render — assigning the DOM property directly looks like it worked and is then '
            + 'quietly overwritten, so the form submits empty. Works on input, textarea, select and '
            + 'contenteditable. Use browser_type instead when the page must see real keystrokes.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'target', 'value'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                target: TARGET_ARG,
                by: BY_ARG,
                index: INDEX_ARG,
                value: { type: 'string', description: 'The value to write into the control.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'tag', 'value'],
            properties: {
                page: { type: 'object' },
                tag: { type: 'string' },
                value: { type: 'string' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const target = elementTargetOf(args, true);
            const value = typeof args.value === 'string' ? args.value : String(args.value ?? '');
            return await cdp.setValue({ page, target, value, ...(run === undefined ? {} : { run }) }, signal);
        },
        render(value) {
            const shown = value.checked === undefined
                ? `设成 ${JSON.stringify(value.value)}`
                : `设为 checked=${String(value.checked)}`;
            return `已在页面 ${nameOfPage(value.page)} 上把 ${value.tag} ${shown}。`
                + '\n（回显的是控件里的实际值——如果和写进去的不一样，说明页面自己改写或截断过。）';
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `填写「${typeof args.target === 'string' ? args.target : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_type',
        description: 'Insert text through the browser\'s own input pipeline (CDP Input.insertText), which '
            + 'raises the same events a person typing would. Pass target to focus a field first; without it, '
            + 'the text goes to whatever already has focus. Prefer browser_set_value for filling a known '
            + 'field; use this when the page watches keystrokes (search boxes with suggestions, input masks).',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'text'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                text: { type: 'string', description: 'The text to insert.' },
                target: TARGET_ARG,
                by: BY_ARG,
                index: INDEX_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'text', 'chars'],
            properties: {
                page: { type: 'object' },
                text: { type: 'string' },
                chars: { type: 'number' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const text = asString(args.text, 'text');
            const target = elementTargetOf(args, false);
            const at = await cdp.type({
                page,
                text,
                ...(run === undefined ? {} : { run }),
                ...(target === undefined ? {} : { target }),
            }, signal);
            return { page: at, text, chars: text.length };
        },
        render(value) {
            const shown = value.chars > 60 ? '（内容较长，未回显）' : `：「${value.text}」`;
            return `已在页面 ${nameOfPage(value.page)} 上插入 ${String(value.chars)} 个字符${shown}。`;
        },
        presentCall() {
            return { card: 'generic', title: '向页面输入文本', kind: 'other' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_key',
        description: `Press one named key. Supported: ${KEY_NAMES.join(', ')}. The key is dispatched as a `
            + 'real keyDown/keyUp pair, so the page\'s own handlers run — Enter to submit, Tab to move '
            + 'between fields, Escape to close a dialog, arrows to move inside a list. The release is '
            + 'retried if the press fails, so a stuck modifier cannot leak into later input.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'key'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                key: { type: 'string', enum: [...KEY_NAMES], description: 'Which key to press.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'key'],
            properties: {
                page: { type: 'object' },
                key: { type: 'string' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const key = asString(args.key, 'key');
            const at = await cdp.pressKey({ page, key, ...(run === undefined ? {} : { run }) }, signal);
            return { page: at, key };
        },
        render(value) {
            return `已在页面 ${nameOfPage(value.page)} 上按下 ${value.key}。`;
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `按键 ${typeof args.key === 'string' ? args.key : ''}`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_scroll',
        description: 'Scroll the page by a pixel delta, or bring an element to the middle of the viewport '
            + 'by naming it. Scrolling the page rather than dispatching a wheel event on purpose: a wheel '
            + 'event only moves whatever is under the pointer, so "go further down" would depend on where the '
            + 'mouse happens to sit. Reports where it came to rest and how far the page can go.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                deltaY: { type: 'number', description: 'Pixels to scroll down (negative scrolls up). Default 600.' },
                target: TARGET_ARG,
                by: BY_ARG,
                index: INDEX_ARG,
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'y', 'maxY'],
            properties: {
                page: { type: 'object' },
                y: { type: 'number' },
                maxY: { type: 'number' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const target = elementTargetOf(args, false);
            const deltaY = args.deltaY === undefined ? undefined : Number(args.deltaY);
            return await cdp.scroll({
                page,
                ...(run === undefined ? {} : { run }),
                ...(target === undefined ? {} : { target }),
                ...(deltaY === undefined || Number.isNaN(deltaY) ? {} : { deltaY }),
            }, signal);
        },
        render(value) {
            const atEnd = value.maxY > 0 && value.y >= value.maxY - 2;
            return `页面 ${nameOfPage(value.page)} 现在在 y=${String(value.y)}（最远 ${String(value.maxY)}）`
                + `${atEnd ? '——已经到底了' : ''}。`;
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: args.target === undefined ? '滚动页面' : `滚动到「${String(args.target)}」`,
                kind: 'read',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_screenshot',
        description: 'Capture the page as an image and write it to disk, returning the path. The page is '
            + 'not something this model reads by itself, so this exists for the cases that genuinely need '
            + 'pixels — layout, a chart, a visual check — and for handing the file to something that can look '
            + 'at it. Reading text is far cheaper through browser_read; try that first.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                fullPage: { type: 'boolean', description: 'Capture the whole scrollable page, not just the viewport.' },
                format: { type: 'string', enum: ['png', 'jpeg'], description: 'png (default) or jpeg.' },
                quality: { type: 'number', description: 'jpeg quality, 0-100. Default 80.' },
                maxWidth: { type: 'number', description: 'Downscale so the image is at most this many pixels wide.' },
                maxHeight: { type: 'number', description: 'Downscale so the image is at most this many pixels tall.' },
                savePath: {
                    type: 'string',
                    description: 'Absolute path to write. Refused if a file is already there. Omit to get a '
                        + 'timestamped name under ~/.dsh/yon-panel/browser-shots/.',
                },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'path', 'mime', 'bytes'],
            properties: {
                page: { type: 'object' },
                path: { type: 'string' },
                mime: { type: 'string' },
                bytes: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
                degraded: { type: 'boolean', description: '原参数失败、这张是用最保守的参数重试拿到的。' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const quality = optionalCount(args.quality, 'quality');
            const maxWidth = optionalCount(args.maxWidth, 'maxWidth');
            const maxHeight = optionalCount(args.maxHeight, 'maxHeight');
            const shot = await cdp.screenshot({
                page,
                ...(run === undefined ? {} : { run }),
                ...(args.fullPage === true ? { fullPage: true } : {}),
                format: args.format === 'jpeg' ? 'jpeg' : 'png',
                ...(quality === undefined ? {} : { quality }),
                ...(maxWidth === undefined ? {} : { maxWidth }),
                ...(maxHeight === undefined ? {} : { maxHeight }),
            }, signal);
            const path = saveShot(shot.base64, shot.mime, optionalString(args.savePath), shot.page);
            return {
                page: shot.page,
                path,
                mime: shot.mime,
                bytes: Buffer.from(shot.base64, 'base64').length,
                ...(shot.width === undefined ? {} : { width: shot.width }),
                ...(shot.height === undefined ? {} : { height: shot.height }),
                ...shot.degraded === true ? { degraded: true } : {},
            };
        },
        render(value) {
            const size = value.width === undefined || value.height === undefined
                ? ''
                : `，${String(value.width)}×${String(value.height)}`;
            const lines = [
                `已截图：${value.path}`,
                `（${value.mime}，${String(Math.round(value.bytes / 1024))} KB${size}）`,
            ];
            // 静默降级会让人以为拿到的是他点名要的那张图：它是另一张（只截可视区、没有缩放）。
            if (value.degraded === true) {
                lines.push('⚠ 原参数没能截到图，这张是**降级重试**的结果：jpeg、质量 60、只截可视区'
                    + '（没有整页，也没有缩放）。要原来那种，先滚动到目标区域再截一次。');
            }
            return lines.join('\n');
        },
        presentCall() {
            return { card: 'generic', title: '页面截图', kind: 'read' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_snapshot',
        description: 'List the page\'s interactive elements — every input, button, link, select and '
            + 'checkbox that is actually visible — each with the name a person would call it and, when the '
            + 'element carries an id or a name, a selector that survives scrolling and layout changes. This '
            + 'is how to find out what is on a page before acting on it: browser_read says what it reads, '
            + 'this says what you can do. Elements inside shadow roots and same-origin frames are included. '
            + 'Nothing is invented: a control with neither an id nor a name comes back with an empty '
            + 'selector and is meant to be reached by its text.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                maxNodes: { type: 'number', description: 'How many elements to return. Default 60.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'elements', 'total'],
            properties: {
                page: { type: 'object' },
                elements: { type: 'array', items: { type: 'object' } },
                total: { type: 'number' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const maxNodes = optionalCount(args.maxNodes, 'maxNodes');
            return await cdp.snapshot({
                page,
                ...(run === undefined ? {} : { run }),
                ...(maxNodes === undefined ? {} : { maxNodes }),
            }, signal);
        },
        render(value) {
            const head = `页面 ${nameOfPage(value.page)} — ${value.page.url}`;
            if (value.elements.length === 0) {
                return [
                    head,
                    '没有找到可见的可交互元素。页面可能还没渲染完（先 browser_wait），或者它确实没有表单、按钮和链接。',
                ].join('\n');
            }
            const lines = value.elements.map(element => {
                const who = element.name === '' ? '(无名称)' : element.name;
                const where = element.selector === '' ? `text=${who}` : `css=${element.selector}`;
                const held = element.value === '' ? '' : `  value=${JSON.stringify(element.value)}`;
                const state = element.state.length === 0 ? '' : `  state=${element.state.join(',')}`;
                return `  [${String(element.index)}] ${element.role}  ${who}  ${where}${state}${held}`;
            });
            const count = value.total > value.elements.length
                ? `页面上一共 ${String(value.total)} 个，这里只列了前 ${String(value.elements.length)} 个（要更多就调大 maxNodes）`
                : `共 ${String(value.total)} 个`;
            return [
                head,
                `可见的可交互元素（${count}）：`,
                ...lines,
                '',
                '怎么用：`css=` 后面那串直接填进 target（by 默认就是 css）；`text=` 后面那段文字填进 target 并把 by 设成 "text"。',
                '勾选框、单选框用 browser_click 点它；下拉框用 browser_set_value。',
            ].join('\n');
        },
        presentCall() {
            return { card: 'generic', title: '列出页面可交互元素', kind: 'read' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_get_value',
        description: 'Read one control\'s current value. This is the follow-up to every write: it reports '
            + 'what the control actually holds now, which is the only way to tell a fill that worked from one '
            + 'the page quietly reverted. Covers the three shapes — value for a text box, textarea or select, '
            + 'checked for a checkbox or radio, text content for an editable region.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'target'],
            properties: { page: PAGE_ARG, run: RUN_ARG, target: TARGET_ARG, by: BY_ARG, index: INDEX_ARG },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'tag', 'value'],
            properties: {
                page: { type: 'object' },
                tag: { type: 'string' },
                value: { type: 'string' },
                checked: { type: 'boolean' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const target = elementTargetOf(args, true);
            return await cdp.getValue({ page, target, ...(run === undefined ? {} : { run }) }, signal);
        },
        render(value) {
            const what = value.checked === undefined
                ? `当前值 ${JSON.stringify(value.value)}`
                : `checked=${String(value.checked)}`;
            return `页面 ${nameOfPage(value.page)} 上的 ${value.tag}：${what}`;
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `读取「${typeof args.target === 'string' ? args.target : ''}」的值`,
                kind: 'read',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_wait',
        description: 'Wait until the page is loaded, and optionally until its address contains a string or '
            + 'a selector exists. Call it after a navigation or a click that loads something, and before '
            + 'reading or snapshotting — otherwise you photograph the old page or an empty one. It reports '
            + 'which condition failed, because "still loading" and "that element never appeared" call for '
            + 'opposite next steps.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                url: { type: 'string', description: 'A substring the address must contain, e.g. "/orders".' },
                selector: { type: 'string', description: 'A CSS selector that must exist, e.g. "table tbody tr".' },
                timeoutMs: { type: 'number', description: 'How long to keep polling. Default 10000.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'ok', 'url', 'readyState', 'reason'],
            properties: {
                page: { type: 'object' },
                ok: { type: 'boolean' },
                url: { type: 'string' },
                readyState: { type: 'string' },
                reason: { type: 'string' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const url = optionalString(args.url);
            const selector = optionalString(args.selector);
            const timeoutMs = optionalCount(args.timeoutMs, 'timeoutMs');
            return await cdp.wait({
                page,
                ...(run === undefined ? {} : { run }),
                ...(url === undefined ? {} : { url }),
                ...(selector === undefined ? {} : { selector }),
                ...(timeoutMs === undefined ? {} : { timeoutMs }),
            }, signal);
        },
        render(value) {
            const head = `页面 ${nameOfPage(value.page)}：${value.url}`;
            if (value.ok)
                return [head, `已就绪（readyState=${value.readyState}）。`].join('\n');
            const why = value.reason.startsWith('bad-selector')
                ? `选择器写错了 —— ${value.reason.slice('bad-selector: '.length)}`
                : value.reason === 'selector-missing' ? '那个选择器在等待期间一直没出现'
                    : value.reason === 'url-mismatch' ? '地址一直不匹配'
                        : value.reason === 'loading' ? '文档一直没加载完'
                            : '等超时了';
            return [
                head,
                `没等到（${value.reason}，readyState=${value.readyState}）：${why}。`,
                '可以把超时调大，或者用 browser_read / browser_snapshot 看看现在页面上到底有什么。',
            ].join('\n');
        },
        presentCall(args) {
            const what = typeof args.selector === 'string' && args.selector !== ''
                ? `等「${args.selector}」出现`
                : typeof args.url === 'string' && args.url !== '' ? `等地址变成「${args.url}」` : '等页面加载完';
            return { card: 'generic', title: what, kind: 'read' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_back',
        description: 'Go back one step in the page\'s own history. Reports where it landed, or that there '
            + 'was nowhere to go — which is worth knowing before assuming a click failed.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: { page: PAGE_ARG, run: RUN_ARG },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'moved', 'url'],
            properties: { page: { type: 'object' }, moved: { type: 'boolean' }, url: { type: 'string' } },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            return await cdp.history({ page, how: 'back', ...(run === undefined ? {} : { run }) }, signal);
        },
        render(value) {
            return value.moved ? `已后退到：${value.url}` : '已经是历史记录的开头了，没得后退。';
        },
        presentCall() {
            return { card: 'generic', title: '后退', kind: 'other' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_forward',
        description: 'Go forward one step in the page\'s own history, after a browser_back. Reports where '
            + 'it landed, or that there is nothing ahead.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: { page: PAGE_ARG, run: RUN_ARG },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'moved', 'url'],
            properties: { page: { type: 'object' }, moved: { type: 'boolean' }, url: { type: 'string' } },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            return await cdp.history({ page, how: 'forward', ...(run === undefined ? {} : { run }) }, signal);
        },
        render(value) {
            return value.moved ? `已前进到：${value.url}` : '已经是历史记录的末尾了，没得前进。';
        },
        presentCall() {
            return { card: 'generic', title: '前进', kind: 'other' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_refresh',
        description: 'Reload the current page, as the browser\'s own reload button does. Pass hard to '
            + 'bypass the cache — worth trying when a page looks like it is serving something stale.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                hard: { type: 'boolean', description: 'Ignore the cache. Default false.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'moved', 'url'],
            properties: { page: { type: 'object' }, moved: { type: 'boolean' }, url: { type: 'string' } },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            return await cdp.history({
                page,
                how: 'reload',
                ...(run === undefined ? {} : { run }),
                ...(args.hard === true ? { hard: true } : {}),
            }, signal);
        },
        render(value) {
            return `已刷新页面 ${nameOfPage(value.page)}${value.url === '' ? '' : `（${value.url}）`}。`
                + '\n刷新会重建文档，之前拿到的 ref 和页面状态都没了；要接着操作就先 browser_wait 再 browser_snapshot。';
        },
        presentCall() {
            return { card: 'generic', title: '刷新页面', kind: 'other' };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_select',
        description: 'Choose an option in a <select>. A select is the one control where setting a value '
            + 'is not enough: the operator knows the words written on the option, while the value attribute '
            + 'is usually an internal code. The default matches the value first, then the exact label, then a '
            + 'label containing the text — and when nothing matches, the answer lists the options the control '
            + 'actually offers, because the next move is to correct the request rather than repeat it.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'target', 'value'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                target: TARGET_ARG,
                by: BY_ARG,
                index: INDEX_ARG,
                value: { type: 'string', description: 'What to select: the option label, its value, or its position when match is "index".' },
                match: {
                    type: 'string',
                    enum: ['auto', 'value', 'label', 'index'],
                    description: 'How to read value. Default "auto": the value attribute, then the exact label, '
                        + 'then a label containing it.',
                },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'value', 'label'],
            properties: {
                page: { type: 'object' },
                value: { type: 'string' },
                label: { type: 'string' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const target = elementTargetOf(args, true);
            const value = asString(args.value, 'value');
            const rawMatch = args.match;
            let match;
            if (rawMatch === undefined || rawMatch === null)
                match = undefined;
            else if (rawMatch === 'auto' || rawMatch === 'value' || rawMatch === 'label' || rawMatch === 'index')
                match = rawMatch;
            else
                throw new BrowserCdpError('invalid-input', 'match 只能是 "auto"、"value"、"label" 或 "index"。');
            return await cdp.select({
                page,
                target,
                value,
                ...(run === undefined ? {} : { run }),
                ...(match === undefined ? {} : { match }),
            }, signal);
        },
        render(value) {
            return `已在页面 ${nameOfPage(value.page)} 上选中「${value.label}」（value=${JSON.stringify(value.value)}）。`;
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `选择「${typeof args.value === 'string' ? args.value : ''}」`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_fill',
        description: 'Fill several fields in one call, optionally submitting afterwards. One call rather '
            + 'than many because a form is one thing: its fields appear together, and paying a round-trip per '
            + 'field is both slower and less coherent. Each field is written independently, so one that is '
            + 'missing or refuses the value leaves the others done — a partial fill is information, whereas '
            + 'failing the whole batch would hide which control was the problem. Submission goes through '
            + 'form.requestSubmit(), which runs the page\'s own validation and handlers.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'fields'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                fields: {
                    type: 'array',
                    description: 'The fields to write, in order.',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['target', 'value'],
                        properties: {
                            target: TARGET_ARG,
                            by: BY_ARG,
                            index: INDEX_ARG,
                            value: { type: 'string', description: 'What to put in this field.' },
                        },
                    },
                },
                submit: { type: 'boolean', description: 'Submit the form these fields belong to. Default false.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'fields', 'submitted'],
            properties: {
                page: { type: 'object' },
                fields: { type: 'array', items: { type: 'object' } },
                submitted: { type: 'boolean' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const raw = args.fields;
            if (!Array.isArray(raw) || raw.length === 0) {
                throw new BrowserCdpError('invalid-input', 'fields 要是一个非空数组，每一项是 { target, value }。');
            }
            const fields = raw.map((entry, position) => {
                if (entry === null || typeof entry !== 'object') {
                    throw new BrowserCdpError('invalid-input', `fields[${String(position)}] 要是一个对象。`);
                }
                const record = entry;
                const target = elementTargetOf(record, true);
                const value = typeof record.value === 'string' ? record.value : String(record.value ?? '');
                return { target, value };
            });
            return await cdp.fill({
                page,
                fields,
                ...(run === undefined ? {} : { run }),
                ...(args.submit === true ? { submit: true } : {}),
            }, signal);
        },
        render(value) {
            const lines = value.fields.map(field => field.ok
                ? `  [${String(field.index)}] 已填写 ${field.tag} = ${JSON.stringify(field.value)}`
                : `  [${String(field.index)}] 失败：${field.reason}${field.tag === '' ? '' : `（${field.tag}）`}`);
            const done = value.fields.filter(field => field.ok).length;
            return [
                `页面 ${nameOfPage(value.page)} 上填写了 ${String(done)}/${String(value.fields.length)} 个字段：`,
                ...lines,
                value.submitted
                    ? '已经提交（走了 form.requestSubmit，页面自己的校验和提交逻辑都会跑）。'
                    : '没有提交（没给 submit，或者这些字段不在同一个 form 里）。',
            ].join('\n');
        },
        presentCall(args) {
            const count = Array.isArray(args.fields) ? args.fields.length : 0;
            return {
                card: 'generic',
                title: `填写 ${String(count)} 个字段${args.submit === true ? '并提交' : ''}`,
                kind: 'other',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_scrape',
        description: 'Pull repeated rows out of a table or a list as data: a row selector plus a field map, '
            + 'returning one object per row. browser_read returns the page as prose, which for a two-hundred '
            + 'row list costs everything the page says and leaves the structure to be guessed back out of it. '
            + 'A field whose selector matches nothing comes back null — a missing column is a fact about the '
            + 'page, and an invented empty string would hide it. Use browser_snapshot first when you do not '
            + 'know the markup.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page', 'rows', 'fields'],
            properties: {
                page: PAGE_ARG,
                run: RUN_ARG,
                rows: { type: 'string', description: 'A CSS selector matching each row, e.g. "table tbody tr".' },
                fields: {
                    type: 'array',
                    description: 'What to take from each row.',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['name', 'selector'],
                        properties: {
                            name: { type: 'string', description: 'The key this column gets in each row object.' },
                            selector: { type: 'string', description: 'Resolved inside each row, e.g. "td:nth-child(2)".' },
                            attribute: { type: 'string', description: 'Read this attribute instead of the text, e.g. "href".' },
                        },
                    },
                },
                limit: { type: 'number', description: 'How many rows to return. Default 100.' },
            },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'rows', 'count', 'truncated'],
            properties: {
                page: { type: 'object' },
                rows: { type: 'array', items: { type: 'object' } },
                count: { type: 'number', description: '匹配到的行数——DOM 里的行数，虚拟化表格下会小于真实行数。' },
                truncated: { type: 'boolean' },
                truncation: { type: 'object', description: '有证据说明只渲染了可视区时才有。' },
                frames: { type: 'array', items: { type: 'object' }, description: '顶层没匹配到、而同源 iframe 里有的时候才有。' },
            },
        },
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const rows = asString(args.rows, 'rows');
            const raw = args.fields;
            if (!Array.isArray(raw) || raw.length === 0) {
                throw new BrowserCdpError('invalid-input', 'fields 要是一个非空数组，每一项是 { name, selector }。');
            }
            const fields = raw.map((entry, position) => {
                if (entry === null || typeof entry !== 'object') {
                    throw new BrowserCdpError('invalid-input', `fields[${String(position)}] 要是一个对象。`);
                }
                const record = entry;
                const name = asString(record.name, `fields[${String(position)}].name`);
                const selector = asString(record.selector, `fields[${String(position)}].selector`);
                const attribute = optionalString(record.attribute);
                return { name, selector, ...(attribute === undefined ? {} : { attribute }) };
            });
            const limit = optionalCount(args.limit, 'limit');
            return await cdp.scrape({
                page,
                rows,
                fields,
                ...(run === undefined ? {} : { run }),
                ...(limit === undefined ? {} : { limit }),
            }, signal);
        },
        render(value) {
            const head = `页面 ${nameOfPage(value.page)}：抓到 ${String(value.rows.length)} 行`
                + `${value.truncated ? `（匹配到 ${String(value.count)} 行，只返回了前 ${String(value.rows.length)} 行，要更多就调大 limit）` : ''}。`;
            const lines = [head];
            // 这个工具最危险的地方不是抓错，而是**看上去抓全了**：虚拟化的报表网格只渲染可视区，
            // 而"只渲染了 18 行"与"这张表就 18 行"在返回值里长得一模一样（实测一张报表：DOM 68 行、
            // 真实 114 行）。抓到的数据一个字不改，但这件事必须说出来。
            const truncation = value.truncation;
            if (truncation !== undefined) {
                lines.push(truncation.source === 'hot'
                    ? `⚠ 这只是**可视区域**的 ${String(truncation.shown)} 行；这张网格实际有 ${String(truncation.total ?? '?')} 行`
                        + '（从组件实例的 getData() 读到的真值）。要全量：读页面自己的取数接口，别抠 DOM；'
                        + '或在 browser_eval 里取 fiber.stateNode.hotInstance 再调 getData()。'
                    : `⚠ 这只是**可视区域**的 ${String(truncation.shown)} 行：装它的容器内容高 ${String(truncation.contentHeight ?? '?')}px、`
                        + `可视 ${String(truncation.visibleHeight ?? '?')}px，所以还有没渲染的行。DOM 抓不到它们，`
                        + '行数也算不出来（这套表格的量出来的行高是 0，按高度折算只会编一个数字）。要全量：读接口。');
            }
            const frames = value.frames;
            if (frames !== undefined) {
                const where = frames
                    .map(frame => `iframe「${frame.url}」（${String(frame.rows)} 行）`)
                    .join('、');
                lines.push(`⚠ 顶层文档里一行都没匹配到，但同源 ${where} 里有。`
                    + 'browser_scrape 只在顶层文档里查——业务页常常整个装在 iframe 里。'
                    + '要那一屏：在 browser_eval 里遍历 iframe 取它的 contentDocument。');
            }
            if (value.rows.length === 0) {
                if (frames === undefined) {
                    lines.push('一行都没抓到——先确认 rows 选择器真的匹配每一行（browser_eval 里数一下 document.querySelectorAll(rows).length 最快）。');
                }
                return lines.join('\n');
            }
            const body = JSON.stringify(value.rows, null, 1);
            lines.push(body.length > 8000 ? `${body.slice(0, 8000)}\n…（JSON 太长，已截断；调小 limit 或去掉不用的字段）` : body);
            return lines.join('\n');
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `抓取列表「${typeof args.rows === 'string' ? args.rows : ''}」`,
                kind: 'read',
            };
        },
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'browser_messages',
        description: 'Read the messages the page has shown since the last time they were read — toasts and '
            + 'message bars, the "下列字段不能为空" kind of complaint. Every other browser tool already carries '
            + 'these back when they appear while it runs; this verb is for afterwards, when something looked '
            + 'wrong and the question is "what did the page actually say". '
            + 'A message can arrive seconds after the operation that caused it (measured: nine seconds), which '
            + 'is why the buffer is drained rather than sampled — what this returns will not be returned again.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['page'],
            properties: { page: PAGE_ARG, run: RUN_ARG },
        },
        outputSchema: {
            type: 'object',
            required: ['page', 'tips'],
            properties: {
                page: { type: 'object' },
                tips: { type: 'array', items: { type: 'object' } },
            },
        },
        tipsInRender: false,
        async execute(args, signal) {
            const page = asString(args.page, 'page');
            const run = optionalString(args.run);
            const result = await cdp.messages({ page, ...(run === undefined ? {} : { run }) }, signal);
            return { page: result.page, tips: tipsOf(result) };
        },
        render(value) {
            const body = renderTips(value.tips);
            return body === ''
                ? `页面 ${nameOfPage(value.page)} 自上次读取以来没有新的提示消息。`
                : `页面 ${nameOfPage(value.page)} 上说：\n${body}`;
        },
        presentCall() {
            return { card: 'generic', title: '读取页面提示消息', kind: 'read' };
        },
    })));
    return () => { for (const dispose of disposers)
        dispose(); };
}
/**
 * Every tool this module registers, **in the order it registers them**.
 *
 * That order is what `host-plugin.spec.ts` holds every family to (`toEqual` against
 * the list of calls the registry saw), and this list was written from the "order a
 * caller should reach for them" instead — leaving the two out of step for as long
 * as the family existed, invisible because the spec's own list did not name these
 * tools yet. The registration order is the truth; this now states it.
 */
export const YON_BROWSER_TOOL_NAMES = [
    'browser_targets',
    'browser_attach',
    'browser_open',
    'browser_read',
    'browser_eval',
    'browser_close',
    'browser_activate',
    'browser_click',
    'browser_hover',
    'browser_drag',
    'browser_set_value',
    'browser_type',
    'browser_key',
    'browser_scroll',
    'browser_screenshot',
    'browser_snapshot',
    'browser_get_value',
    'browser_wait',
    'browser_back',
    'browser_forward',
    'browser_refresh',
    'browser_select',
    'browser_fill',
    'browser_scrape',
    'browser_messages',
];
