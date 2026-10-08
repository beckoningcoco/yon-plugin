/**
 * 项目记忆，暴露给 agent 的四个工具。
 *
 * ## 这个工具族在做什么
 *
 * 需求条目记的是「他说过什么」，知识库记的是「跨项目仍然成立的东西」，两者都不装
 * 「这个项目上踩过的坑」。于是那类东西的归宿只有两个：丢掉，或者塞进语义错位的柜
 * 子。`memory_write` 是第三个归宿。
 *
 * 它与需求条目的关键差别是**可改**：条目是当时的原话，改了就不叫记录了；记忆是
 * 当前事实，事实变了就得改。所以这里有一个 `memory_update`，而 `requirement_update`
 * 之后紧接着就是这个差别带来的第二件事——**模型不提供删除**。真删只在面板里，由人
 * 做。改写走审批（`tools.ts` 的 `isDestructiveWrite` 里显式列了 `memory_update`：
 * 新建不丢东西，追加重写也不丢，但改写正文会盖掉原来那段话）。
 *
 * ## 为什么注入不在这里
 *
 * 记忆的价值一半在「模型会想起来去查」——而它不会，它不知道自己不知道。所以
 * `project_read` 的返回值里带这个项目最近的几条（`tools.ts`），`memory_recall` 的
 * 描述里也写了「开工前先调」。两处都不是这个模块的事：注入点在别人的返回值里。
 */
import { MEMORY_TYPE_TEXT, MEMORY_TYPES, } from "../shared/types.js";
import { BODY_SOFT_MAX } from "./memory-service.js";
/** 这个模块拥有的工具。 */
export const MEMORY_TOOL_NAMES = ['memory_write', 'memory_update', 'memory_recall', 'memory_read'];
/** 一次 recall 最多回多少条。 */
const RECALL_LIMIT = 50;
/** 一个文本块。 */
function text(content) {
    return [{ type: 'text', text: content }];
}
/** 待办状态卡片。 */
function card(title, kind) {
    return { card: 'generic', title, kind };
}
/** 读一个字符串参数，两端去空白。 */
function textOf(input, key) {
    const value = input[key];
    return typeof value === 'string' ? value.trim() : '';
}
/** 类型的中文名，读不出来时退回原文。 */
function typeLabel(type) {
    return MEMORY_TYPE_TEXT[type] ?? type;
}
/** 一条记忆在 recall 里怎么念：够模型决定要不要读全文，不多不少。 */
function recallLine(row) {
    const head = `- [${typeLabel(row.type)}] ${row.title}`;
    const where = `  (${row.id} · ${row.projectName} · ${row.createdAt.slice(0, 10)})`;
    const body = row.snippet === '' ? '' : `\n  ${row.snippet}`;
    return `${head}${where}${body}`;
}
/** 日期部分。时间戳是 ISO，人只读日期。 */
function dayOf(stamp) {
    return stamp.slice(0, 10);
}
/**
 * 注册项目记忆的工具。
 * @param ctx - 宿主上下文，带工具注册表。
 * @param memory - 记忆服务。
 * @returns 撤回全部注册的处置函数。
 */
export function registerYonMemoryTools(ctx, memory) {
    const disposers = [];
    disposers.push(ctx.tools.register({
        name: 'memory_write',
        description: 'Record one thing this project has taught you — a pitfall, an environment fact, a decision, '
            + 'a preference of this customer\'s — so that a later session (yours or another\'s) does not '
            + 'have to learn it again.\n'
            + 'Write it when you find it out, not at the end: the table name you had to probe for, the '
            + 'connection that rejects a query without a time range, the field this customer calls '
            + 'something else. A memory states what is TRUE NOW, so when it turns out to be wrong, correct '
            + 'it with `memory_update` — do not write a second memory that argues with the first.\n'
            + 'This is per project. Something that stays true after you change projects is not a memory: '
            + 'that belongs in the knowledge base, through `wiki_write`. Nothing becomes verified by being '
            + 'written — `source` says where to look to check it, and it is required.\n'
            + 'Do not write a memory the operator has not said and you have not seen: a guess recorded as '
            + 'a fact is worse than a gap, because the next session will trust it.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['project', 'title', 'body', 'source'],
            properties: {
                project: {
                    type: 'string',
                    description: 'Project id, exact name, or exact code. The memory is filed under it.',
                },
                title: {
                    type: 'string',
                    description: 'One line, <= 40 characters, stating the finding — this is what gets injected '
                        + 'into later sessions, so it has to stand alone.',
                },
                body: {
                    type: 'string',
                    description: 'The finding: what happens, why, and how to work around it. Around 200 '
                        + 'characters is the comfortable length; longer is accepted and reported rather than '
                        + 'refused, but a memory that needs a page is a page.',
                },
                type: {
                    type: 'string',
                    enum: [...MEMORY_TYPES],
                    description: 'pitfall = it hurts to not know this; env-fact = a fact about this '
                        + 'environment; decision = why it was done this way; preference = this customer\'s '
                        + 'habit; lesson = a reusable way of doing it. Defaults to lesson.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Short keywords, for later recall.',
                },
                source: {
                    type: 'string',
                    description: 'Where this came from — the session, the statement you ran, the file you '
                        + 'read. Required: it is what a later reader follows to check the claim before acting '
                        + 'on it.',
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
                throw new Error('memory_write 需要一个对象参数');
            }
            const input = args;
            const project = textOf(input, 'project');
            if (project === '')
                throw new Error('memory_write 需要 project（项目 id / 名字 / code）');
            const title = textOf(input, 'title');
            if (title === '')
                throw new Error('memory_write 需要 title（一句话说清这条是什么）');
            const body = textOf(input, 'body');
            if (body === '')
                throw new Error('memory_write 需要 body（现象、结论、怎么绕）');
            const source = textOf(input, 'source');
            if (source === '') {
                throw new Error('memory_write 需要 source：这条从哪来（哪次会话、哪条实测、哪个文件）。'
                    + '没有出处的记忆，下次没人敢信也不敢删。');
            }
            const type = textOf(input, 'type');
            const tags = input.tags;
            const save = {
                project,
                title,
                body,
                // 枚举与类型都交给服务判：它是唯一的权威，且它回的消息会列出允许的取值。
                // 在这里再抄一份列表，就是那份会过期的副本（`iteration-tools.ts:198-204`）。
                ...type === '' ? {} : { type: type },
                ...tags === undefined || tags === null ? {} : { tags: tags },
                source,
            };
            const { memory: saved, created } = await memory.create(save, { dedupe: true });
            const head = `【${typeLabel(saved.type)}】`;
            const lines = created
                ? [`${head}已记下 ${saved.id}：${saved.title}`]
                : [`${head}这个项目里已经有一条同样的记录（${saved.id}），没有重复添加：${saved.title}`];
            if (created && saved.body.length > BODY_SOFT_MAX) {
                lines.push(`（正文 ${saved.body.length} 字，超过 ${BODY_SOFT_MAX} 字的软上限——不影响使用，`
                    + '但如果里面装的是两件事，下次拆成两条更好找。）');
            }
            lines.push('这是一条记录，不会打断任何人。回到手上的活。');
            return { id: saved.id, created, report: lines.join('\n') };
        },
        presentCall(args) {
            const input = (args ?? {});
            const title = textOf(input, 'title');
            const head = title.length > 28 ? `${title.slice(0, 28)}…` : title;
            return card(`记一条项目记忆：${head === '' ? '（未填）' : head}`, 'other');
        },
    }));
    disposers.push(ctx.tools.register({
        name: 'memory_update',
        description: 'Correct a memory that is no longer true, or sharpen one that was written badly. This is the '
            + 'difference between a memory and a ledger entry: a memory states what is true now, so a wrong '
            + 'one is FIXED here rather than answered by a second memory that contradicts it.\n'
            + 'Pass only the fields you are changing; the rest are left alone. The previous text is '
            + 'replaced — this is a destructive write, so a session that approves writes will show the '
            + 'operator what is about to be lost before it happens. Read the memory first, so you are '
            + 'rewriting what is there and not what you remember writing.\n'
            + 'This is not how you retire a memory. If the finding is simply obsolete and nothing replaces '
            + 'it, say so to the operator: deleting is theirs to do, in the panel.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
                id: { type: 'string', description: 'The memory to rewrite, as `memory_recall` printed it.' },
                title: { type: 'string', description: 'New title, if it changed.' },
                body: { type: 'string', description: 'New body, replacing the old one entirely.' },
                type: {
                    type: 'string',
                    enum: [...MEMORY_TYPES],
                    description: 'New category, if you filed it under the wrong one.',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'New tags, replacing the old list.',
                },
                source: { type: 'string', description: 'New provenance — e.g. the measurement that corrected it.' },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['id', 'changed', 'report'],
                properties: {
                    id: { type: 'string' },
                    changed: { type: 'array', items: { type: 'string' } },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => text(value.report),
        },
        async execute(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('memory_update 需要一个对象参数');
            }
            const input = args;
            const id = textOf(input, 'id');
            if (id === '')
                throw new Error('memory_update 需要 id（memory_recall 打印的那个）');
            // Read before writing, for two reasons: the report can say what changed, and the
            // model gets the current text back so a rewrite is a correction rather than a
            // guess at what it remembers having filed.
            const before = await memory.read(id);
            const patch = {
                ...input.title === undefined ? {} : { title: textOf(input, 'title') },
                ...input.body === undefined ? {} : { body: typeof input.body === 'string' ? input.body.trim() : '' },
                ...input.source === undefined ? {} : { source: textOf(input, 'source') },
                ...input.type === undefined ? {} : { type: textOf(input, 'type') },
                ...input.tags === undefined ? {} : { tags: input.tags },
            };
            const after = await memory.update(id, patch);
            const changed = [];
            if (after.title !== before.title)
                changed.push(`标题：「${before.title}」→「${after.title}」`);
            if (after.body !== before.body)
                changed.push(`正文已改写（${before.body.length} → ${after.body.length} 字）`);
            if (after.source !== before.source)
                changed.push('出处已更新');
            if (after.type !== before.type)
                changed.push(`分类：${typeLabel(before.type)} → ${typeLabel(after.type)}`);
            if (after.tags.join(',') !== before.tags.join(','))
                changed.push(`标签：${after.tags.join(' / ') || '（已清空）'}`);
            const report = changed.length === 0
                ? `${after.id} 没有任何改动。`
                : [`已更新 ${after.id}：`, ...changed.map(line => `· ${line}`)].join('\n');
            return { id: after.id, changed, report };
        },
        presentCall(args) {
            const input = (args ?? {});
            return card(`改写一条记忆：${textOf(input, 'id') || '（未填）'}`, 'other');
        },
    }));
    disposers.push(ctx.tools.register({
        name: 'memory_recall',
        description: 'What is already known about a project — the pitfalls, environment facts, decisions and '
            + 'preferences recorded by earlier sessions.\n'
            + '**Call this before you start on a project**, and again before writing SQL or code in an '
            + 'area a past session may already have got wrong. You cannot search for what you do not know '
            + 'you do not know, which is why this has to be a deliberate stop rather than a memory you poke '
            + 'at when something looks unfamiliar.\n'
            + 'Returns titles and one-line snippets, newest first. Read the ones that matter with '
            + '`memory_read` — the snippet is deliberately short so that a recall does not fill the '
            + 'conversation.\n'
            + 'A memory is a past session\'s finding, not a fact about the platform: check a table name or '
            + 'a version-specific claim against the database or the metadata index before you act on it.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                query: {
                    type: 'string',
                    description: 'Free text, matched against title, tags, source and body. Omit for everything.',
                },
                project: { type: 'string', description: 'Narrow to one project (id, name or code).' },
                type: {
                    type: 'string',
                    enum: [...MEMORY_TYPES],
                    description: 'Narrow to one category.',
                },
                tag: { type: 'string', description: 'Narrow to memories carrying this tag.' },
                limit: {
                    type: 'integer',
                    description: `How many to return, newest first. Defaults to 10, capped at ${RECALL_LIMIT}.`,
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
            const query = textOf(input, 'query');
            const project = textOf(input, 'project');
            const type = textOf(input, 'type');
            const tag = textOf(input, 'tag');
            const raw = input.limit;
            const asked = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 10;
            const limit = Math.max(1, Math.min(asked, RECALL_LIMIT));
            const payload = await memory.list({
                ...query === '' ? {} : { query },
                ...project === '' ? {} : { project },
                ...type === '' ? {} : { type: type },
                ...tag === '' ? {} : { tag },
                limit,
            });
            const lines = [];
            if (payload.error !== undefined)
                lines.push(`记忆库读取失败：${payload.error}`, '');
            if (payload.rows.length === 0) {
                lines.push(payload.error === undefined
                    ? '这个条件下没有任何记忆。'
                    : '（读不出来，所以这一屏看不到任何记忆。）');
            }
            else {
                for (const row of payload.rows)
                    lines.push(recallLine(row));
            }
            lines.push('', `（记忆库：${payload.path}）`);
            return { count: payload.rows.length, report: lines.join('\n') };
        },
        presentCall(args) {
            const input = (args ?? {});
            const query = textOf(input, 'query');
            return card(query === '' ? '翻项目记忆' : `翻项目记忆：${query}`, 'read');
        },
    }));
    disposers.push(ctx.tools.register({
        name: 'memory_read',
        description: 'Read one memory in full, by the id `memory_recall` (or a tool result\'s memory list) printed.\n'
            + 'Use it after a recall when a title looks relevant: the snippet stops at about a line, and '
            + 'the part that changes what you do next — the exact table, the workaround, the value the '
            + 'customer uses — is usually past it.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
                id: { type: 'string', description: 'The memory id, e.g. mem-20261005-141230-a1b2.' },
            },
        },
        output: {
            schema: {
                type: 'object',
                required: ['id', 'report'],
                properties: {
                    id: { type: 'string' },
                    report: { type: 'string' },
                },
            },
            render: (_args, value) => text(value.report),
        },
        async execute(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new Error('memory_read 需要一个对象参数');
            }
            const input = args;
            const id = textOf(input, 'id');
            if (id === '')
                throw new Error('memory_read 需要 id');
            const found = await memory.read(id);
            const lines = [
                `【${typeLabel(found.type)}】${found.title}`,
                `${found.id} · ${found.projectName} · 记于 ${dayOf(found.createdAt)}`
                    + (found.updatedAt.slice(0, 10) === dayOf(found.createdAt) ? '' : `，改于 ${dayOf(found.updatedAt)}`),
                found.tags.length === 0 ? '' : `标签：${found.tags.join(' / ')}`,
                `出处：${found.source}`,
                '',
                found.body,
            ].filter(line => line !== '');
            return { id: found.id, report: lines.join('\n') };
        },
        presentCall(args) {
            const input = (args ?? {});
            return card(`读记忆 ${textOf(input, 'id') || '（未填）'}`, 'read');
        },
    }));
    return () => {
        for (const dispose of disposers.splice(0))
            dispose();
    };
}
