/** 这个模块拥有的工具。 */
export const ITERATION_TOOL_NAMES = ['iteration_add', 'iteration_list'];
/** 一次 list 最多回多少行。 */
const LIST_LIMIT = 200;
/** 一个文本块。 */
function text(content) {
    return [{ type: 'text', text: content }];
}
/** 待办状态卡片。 */
function card(title, kind) {
    return { card: 'generic', title, kind };
}
/** 类型的中文名。 */
const KIND_LABELS = {
    gap: '能力不足',
    improvement: '优化建议',
};
/** 优先级的中文名。 */
const SEVERITY_LABELS = {
    high: '高',
    medium: '中',
    low: '低',
};
/** 状态的中文名。 */
const STATUS_LABELS = {
    open: '待处理',
    accepted: '已采纳',
    fixed: '已修复',
    dropped: '已忽略',
};
/** 一行怎么念：够调用方在后续调用里配对，不多不少。 */
function rowLine(row) {
    const head = `${row.id}  ${KIND_LABELS[row.kind] ?? row.kind} · ${SEVERITY_LABELS[row.severity] ?? row.severity}`
        + ` · ${STATUS_LABELS[row.status] ?? row.status}`;
    const target = row.target === '' ? '' : `（${row.target}）`;
    return `${head}  ${row.symptom}${target}`;
}
/** 一行开头的短标记，让「这条记下了」在一屏里看得见。 */
function kindMark(row) {
    return row.kind === 'gap' ? '【不足】' : '【建议】';
}
/** 读一个字符串参数，两端去空白。 */
function textOf(input, key) {
    const value = input[key];
    return typeof value === 'string' ? value.trim() : '';
}
/**
 * 注册迭代表板的工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param iteration - 台账服务。
 * @returns 撤回全部注册的处置函数。
 */
export function registerYonIterationTools(ctx, iteration) {
    const disposers = [];
    disposers.push(ctx.tools.register({
        name: 'iteration_add',
        description: 'Record one shortcoming of THIS plugin (the Yon panel and its tools/skills), the moment you '
            + 'notice it while using it. This is a notebook, not a fix: nothing here changes the plugin, '
            + 'and nobody acts on a row until the operator reads it.\n'
            + 'Write a row when you hit a hard signal — you took a detour to get an answer the tools '
            + 'should have given directly; you asked the operator the same thing twice in one session; '
            + 'you had to guess because nothing could tell you; a tool answered confidently and turned '
            + 'out to be wrong, with a table, entity or enum that did not line up; or the operator '
            + 'complained about the tools themselves. Note it right then, not at the end: the details '
            + 'are only in front of you for this moment, and the session ends with them.\n'
            + 'One call, and the note is filed. Only `kind` and `symptom` are required — fill in what '
            + 'you actually know and leave the rest empty; the operator can add to it later.\n'
            + 'Do NOT file: general programming complaints, the complexity of the 用友 platform itself, '
            + 'your own mistakes, or suggestions about the notebook rather than the plugin.\n'
            + 'File each distinct problem once per session. If you are unsure whether you already '
            + 'filed it, call iteration_list first and check. When the operator says "记一条", use this '
            + 'tool too — write down what they said, in their words rather than a summary of your own.\n'
            + 'Nothing worth recording is the normal case. A ledger full of nitpicks is a ledger nobody '
            + 'reads, so record nothing rather than something marginal. After filing, carry on with the '
            + 'work you were doing. Do not change the plugin because of what you wrote, and do not sort, '
            + 'rank or treat these rows as a to-do list — they are a person\'s notes.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'symptom'],
            properties: {
                kind: {
                    type: 'string',
                    enum: ['gap', 'improvement'],
                    description: 'gap = this could not be done at all or fell short; '
                        + 'improvement = it worked, but it could be better.',
                },
                symptom: {
                    type: 'string',
                    description: 'What actually happened, in your own words. The symptom, not a diagnosis — '
                        + 'what you had to do, and what you expected instead.',
                },
                severity: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description: 'How much it got in the way. Defaults to medium.',
                },
                scene: {
                    type: 'string',
                    description: 'What you were doing when it happened — the task, not the tool.',
                },
                suggestion: {
                    type: 'string',
                    description: 'What you would want it to do instead. Leave empty if you do not know yet.',
                },
                target: {
                    type: 'string',
                    description: 'Which thing this is about: a tool name, a panel name, a file. Keep it short '
                        + 'and stable — it is what the next session matches against to avoid filing a twin.',
                },
                context: {
                    type: 'string',
                    description: 'What would be needed to reproduce it: the command, the path, the error text, '
                        + 'the environment.',
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['id', 'created', 'report'],
                properties: {
                    id: { type: 'string' },
                    created: { type: 'boolean' },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => text(value.report),
        },
        async execute(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('iteration_add 需要一个对象参数');
            }
            const input = args;
            const kind = textOf(input, 'kind');
            if (kind !== 'gap' && kind !== 'improvement') {
                throw new Error('iteration_add 需要 kind，取值是 gap 或 improvement');
            }
            const symptom = textOf(input, 'symptom');
            if (symptom === '')
                throw new Error('iteration_add 需要 symptom（当时实际发生了什么）');
            const severity = textOf(input, 'severity');
            const save = {
                kind,
                symptom,
                // Passed through unvalidated on purpose: the service is the one authority
                // on what a `severity` may be, and it answers with a message naming the
                // three allowed values. Checking here too would be a second copy of that
                // list, which is the copy that goes stale.
                ...severity === '' ? {} : { severity: severity },
                scene: textOf(input, 'scene'),
                suggestion: textOf(input, 'suggestion'),
                target: textOf(input, 'target'),
                context: textOf(input, 'context'),
            };
            const { row, created } = await iteration.create(save, { dedupe: true });
            const report = created
                ? `${kindMark(row)}已记下 ${row.id}：${row.symptom}`
                    + '\n这是一条记录，不是一项改动——改不改由使用者决定。回到手上的活。'
                : `${kindMark(row)}已经记过这一条了（${row.id}），没有重复添加：${row.symptom}`
                    + '\n回到手上的活。';
            return { id: row.id, created, report };
        },
        presentCall(args) {
            const input = (args ?? {});
            const symptom = textOf(input, 'symptom');
            const head = symptom.length > 28 ? `${symptom.slice(0, 28)}…` : symptom;
            return card(`记一条迭代：${head === '' ? '（未填）' : head}`, 'other');
        },
    }));
    disposers.push(ctx.tools.register({
        name: 'iteration_list',
        description: 'Read back the notebook of this plugin\'s own shortcomings — rows filed by you or by earlier '
            + 'sessions, with the operator\'s triage on them (待处理 / 已采纳 / 已修复 / 已忽略).\n'
            + 'Call it when the operator says "记一条" and you suspect it is already recorded, or when '
            + 'they ask what has been written down. Checking first is how one problem stays one row '
            + 'instead of twenty.\n'
            + 'These rows are a record of what somebody noticed, NOT a to-do list. Do not start work '
            + 'from them, do not present them as your plan, and do not rank or pick between them — '
            + 'which one gets done, and when, is the operator\'s call, and they have to read it first.\n'
            + 'Defaults to the untriaged rows (待处理), which is what a fresh session cares about.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                status: {
                    type: 'string',
                    enum: ['open', 'accepted', 'fixed', 'dropped', 'all'],
                    description: 'Which rows to list. Defaults to open; pass "all" for every row.',
                },
                kind: {
                    type: 'string',
                    enum: ['gap', 'improvement'],
                    description: 'Narrow to one kind.',
                },
                limit: {
                    type: 'integer',
                    description: `How many rows to return, newest first. Defaults to 20, capped at ${LIST_LIMIT}.`,
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['count', 'report'],
                properties: {
                    count: { type: 'number' },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => text(value.report),
        },
        async execute(args) {
            const input = (args ?? {});
            // The default belongs here rather than in the service: the service answers
            // 「整份台账」 because the panel counts what it holds, while a fresh session
            // cares about the untriaged rows and would be flooded by the closed ones.
            const askedStatus = textOf(input, 'status');
            const status = askedStatus === '' ? 'open' : askedStatus;
            const kind = textOf(input, 'kind');
            const raw = input.limit;
            const asked = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 20;
            const limit = Math.max(1, Math.min(asked, LIST_LIMIT));
            const payload = await iteration.list({
                status: status,
                ...kind === '' ? {} : { kind: kind },
            });
            const rows = payload.rows.slice(0, limit);
            const lines = [];
            if (payload.error !== undefined) {
                lines.push(`台账读取失败：${payload.error}`, '');
            }
            if (rows.length === 0) {
                lines.push(payload.error === undefined
                    ? '台账里没有符合条件的记录。'
                    : '（读不出来，所以这一屏看不到任何记录。）');
            }
            else {
                for (const row of rows)
                    lines.push(rowLine(row));
                if (payload.rows.length > rows.length) {
                    lines.push('', `（共 ${payload.rows.length} 条符合条件，这里显示 ${rows.length} 条）`);
                }
            }
            lines.push('', '这些是使用者的笔记，不是待办：不要据此开工，也不要替他排序。');
            return { count: rows.length, report: lines.join('\n') };
        },
        presentCall() {
            return card('翻阅迭代表板', 'read');
        },
    }));
    return () => {
        for (const dispose of disposers.splice(0))
            dispose();
    };
}
