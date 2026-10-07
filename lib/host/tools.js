import { PROJECT_STATUSES } from "../shared/types.js";
import { ProjectError } from "./service.js";
/** Every tool this package owns, in the order a caller should reach for them. */
export const YON_TOOL_NAMES = [
    'project_list',
    'project_read',
    'project_create',
    'project_update',
    'project_delete',
];
/** The subset that changes stored data; the gate inspects each of these. */
export const YON_WRITE_TOOL_NAMES = ['project_create', 'project_update', 'project_delete'];
const WRITE_TOOLS = new Set(YON_WRITE_TOOL_NAMES);
/** How many characters of a value the previews show before eliding. */
const PREVIEW_LIMIT = 80;
/** Copy for one status, as the operator reads it. */
const STATUS_TEXT = {
    active: '进行中',
    paused: '已暂停',
    done: '已完成',
};
/** The stored fields of one project, as JSON Schema and as prose. */
const FIELDS_SCHEMA = {
    type: 'object',
    additionalProperties: true,
    description: 'Field values keyed by the field name the operator uses.',
};
/** One project as a list reads it. */
const SUMMARY_PROPERTIES = {
    project_id: { type: 'string', description: 'Stable identity; pass this back as `project`.' },
    name: { type: 'string' },
    code: { type: 'string', description: 'Short code; empty when the operator left it unset.' },
    status: { type: 'string', enum: PROJECT_STATUSES },
    archived: { type: 'boolean', description: 'Archived projects stay readable but leave pickers.' },
    field_count: { type: 'integer' },
};
/** One project with its dynamic fields. */
const DETAIL_PROPERTIES = {
    ...SUMMARY_PROPERTIES,
    fields: FIELDS_SCHEMA,
};
const LIST_VALUE = {
    type: 'object',
    additionalProperties: false,
    required: ['matched', 'projects'],
    properties: {
        matched: { type: 'integer', description: 'How many projects the query matched.' },
        projects: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: Object.keys(SUMMARY_PROPERTIES), properties: SUMMARY_PROPERTIES },
        },
    },
};
const DETAIL_VALUE = {
    type: 'object',
    additionalProperties: false,
    required: ['project'],
    properties: {
        project: { type: 'object', additionalProperties: false, required: Object.keys(DETAIL_PROPERTIES), properties: DETAIL_PROPERTIES },
    },
};
const UPDATE_VALUE = {
    type: 'object',
    additionalProperties: false,
    required: ['project', 'changes'],
    properties: {
        project: { type: 'object', additionalProperties: false, required: Object.keys(DETAIL_PROPERTIES), properties: DETAIL_PROPERTIES },
        changes: {
            type: 'array',
            description: 'What this call actually changed, one line each.',
            items: { type: 'string' },
        },
    },
};
const DELETE_VALUE = {
    type: 'object',
    additionalProperties: false,
    required: ['removed', 'removed_fields'],
    properties: {
        removed: { type: 'string', description: 'Name of the project that is gone.' },
        removed_fields: { type: 'integer' },
    },
};
/** Project a stored detail onto the value the tools return. */
function projectValue(project) {
    return {
        project_id: project.projectId,
        name: project.name,
        code: project.code,
        status: project.status,
        archived: project.archived,
        field_count: project.fieldCount,
        fields: project.fields,
    };
}
/** Render one value the way a person writes it down. */
function brief(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined)
        return '';
    return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text;
}
/** One text block, which is all any of these tools returns. */
function textOf(content) {
    return [{ type: 'text', text: content }];
}
/** Define one tool over the registry's contract. */
function defineYonTool(spec) {
    const definition = {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => textOf(spec.render(value)),
        },
        async execute(args, exec) {
            // The registry hands over the model's arguments untouched, so a malformed
            // call is refused here with a message the model can act on.
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new ProjectError('invalid-input', `${spec.name} expects an object of arguments`);
            }
            if (exec.signal.aborted)
                throw new ProjectError('invalid-input', `${spec.name} was cancelled`);
            return await spec.execute(args, exec);
        },
    };
    if (spec.presentCall !== undefined) {
        definition.presentCall = (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall?.(args);
    }
    return definition;
}
/** Read an argument as a field map, refusing anything that is not an object. */
function asFieldMap(value, argument) {
    if (value === undefined)
        return {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ProjectError('invalid-input', `${argument} must be an object of field name to value`);
    }
    return value;
}
/**
 * Read an argument as a required project reference.
 *
 * Exported for the other tool families that name a project (`requirement-tools.ts`),
 * so the wording a caller gets for a missing reference is the same wherever it is
 * asked for.
 */
export function asRef(value, argument = 'project') {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ProjectError('invalid-input', `${argument} must be a project id, name, or code`);
    }
    return value.trim();
}
/**
 * Resolve a reference or explain why it could not be resolved.
 *
 * Exported alongside {@link asRef} for the same reason: a second family resolving
 * project names would otherwise grow a second copy of the ambiguous/not-found
 * wording, and the two copies would disagree the first time either changed.
 */
export function locate(projects, ref) {
    const resolution = projects.resolve(ref);
    if (resolution.kind === 'found')
        return resolution.project;
    if (resolution.kind === 'ambiguous') {
        const names = resolution.candidates.map(candidate => `"${candidate.name}" (${candidate.projectId})`);
        throw new ProjectError('invalid-input', `"${ref}" matches ${resolution.candidates.length} projects: ${names.join(', ')}; pass the project_id`);
    }
    throw new ProjectError('not-found', `no project matches "${ref}"`);
}
/** One project line for the model's list answer. */
function summarize(project) {
    const parts = [project.name];
    if (project.code !== '')
        parts.push(`[${project.code}]`);
    parts.push(`(${STATUS_TEXT[project.status]}, ${project.field_count} 个字段${project.archived ? ', 已归档' : ''})`);
    parts.push(project.project_id);
    return parts.join(' ');
}
/** One line describing a project column this call changed. */
function columnChange(column, value, before) {
    switch (column) {
        case 'name':
            return `名称已改为「${String(value)}」`;
        case 'code':
            return String(value) === '' ? '编码已清空' : `编码已改为「${String(value)}」`;
        case 'status':
            return `状态已改为「${STATUS_TEXT[value] ?? String(value)}」`;
        case 'archived':
            return value === true ? '已归档' : '已恢复';
        default:
            return `${column} 已更新（原值 ${brief(before[column])}）`;
    }
}
/** The model-facing text of one project and its fields. */
function projectText(value) {
    const entries = Object.entries(value.fields);
    return [
        `${value.name}${value.code === '' ? '' : ` [${value.code}]`}`,
        `id: ${value.project_id}`,
        `status: ${value.status}${value.archived ? ' (archived)' : ''}`,
        ...entries.length === 0
            ? ['  (没有字段)']
            : entries.map(([fieldKey, field]) => `  ${fieldKey} = ${brief(field)}`),
    ].join('\n');
}
/**
 * Whether one write destroys something.
 *
 * The split the operator asked for is not "which tool" but "what would be lost":
 * a change that only adds or updates is cheap to make and cheap to notice — the
 * result lists exactly what changed — while removing a field, deleting a project
 * or archiving it out of the default list is neither. Creating a project
 * destroys nothing.
 * @param name - the tool being called.
 * @param args - the arguments of that call.
 * @returns true when running the call could lose data.
 */
export function isDestructiveWrite(name, args) {
    if (name === 'project_delete')
        return true;
    // The requirement family answers here too. Its gate is registered by
    // `requirement-tools.ts`, but the ruling belongs to one function: "what would be
    // lost" is one question, and a family that kept its own copy is a family whose
    // copy could drift from this one.
    if (name === 'requirement_update' || name === 'requirement_archive')
        return true;
    if (name === 'requirement_create') {
        // A create loses nothing unless the caller is knowingly duplicating a name in
        // use, and the only half of that this function can judge is the flag: whether
        // the name really is in use lives on disk, where `requirement-service.ts`
        // decides it and hands back the entry it collided with. So presence is what is
        // checked here, and the tool verifies the value names the entry that actually
        // conflicts before anything is written.
        if (args === null || typeof args !== 'object' || Array.isArray(args))
            return true;
        const acknowledged = args.acknowledgeDuplicate;
        return typeof acknowledged === 'string' && acknowledged.trim() !== '';
    }
    // Everything else in that family is additive (annotate, artifact_write) or a
    // read. A new requirement tool that could lose data must be named above, or it
    // will be treated as harmless here.
    if (name.startsWith('requirement_'))
        return false;
    if (name !== 'project_update')
        return false;
    // Unreadable arguments are the tool's problem to reject, but they are not a
    // reason to treat a call as harmless.
    if (args === null || typeof args !== 'object' || Array.isArray(args))
        return true;
    const input = args;
    if (typeof input.archived === 'boolean')
        return true;
    const removeFields = Array.isArray(input.remove_fields) ? input.remove_fields : [];
    return removeFields.some(entry => typeof entry === 'string' && entry.trim() !== '');
}
/**
 * Read the permission knobs from one session's log, newest value winning.
 * @param session - the calling agent's session, when the call has one.
 * @returns the effective knobs; an absent field means the log never set it.
 */
export function permissionsOf(session) {
    let sandbox = undefined;
    let approval = undefined;
    if (session === undefined)
        return { sandbox, approval };
    for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
        const event = session.eventAt(seq);
        if (event === undefined)
            continue;
        if (event.type === 'sandbox/mode' && sandbox === undefined) {
            const mode = event.data?.mode;
            if (mode === 'read-only' || mode === 'workspace-write' || mode === 'danger-full-access') {
                sandbox = mode;
            }
        }
        else if (event.type === 'approval/policy' && approval === undefined) {
            const policy = event.data?.policy;
            if (policy === 'ask' || policy === 'never')
                approval = policy;
        }
        if (sandbox !== undefined && approval !== undefined)
            break;
    }
    return { sandbox, approval };
}
/**
 * Decide one write from what it would cost and what its session permits.
 *
 * The policy follows the session instead of overruling it. A read-only session
 * refuses every write, because that is what read-only means. An additive write
 * runs wherever writing is allowed at all. A destructive write asks in a session
 * that wants to be asked, and — deliberately — runs in one that has said it does
 * not: `never` there means "nobody is available to approve", which is the
 * operator's own choice rather than an accident to fail closed on. An unset
 * policy keeps the safe default and asks.
 * @param destructive - whether the call could lose data.
 * @param permissions - the session's effective knobs.
 * @returns how the gate should answer.
 */
export function dispositionOf(destructive, permissions) {
    if (permissions.sandbox === 'read-only')
        return 'refuse';
    if (!destructive)
        return 'run';
    return permissions.approval === 'never' ? 'run' : 'ask';
}
/**
 * Explain one write in the terms a person checks before approving it.
 *
 * This is the whole preview: the approval card shows this text, so an update
 * that would change nothing says so, and an update that changes three things
 * lists exactly those three.
 * @param projects - the store, read for the current values.
 * @param name - the tool being previewed.
 * @param args - the arguments of that call.
 * @returns the preview, or undefined when the arguments are unusable (the tool
 *   itself reports that, and asking about a call that cannot run is noise).
 */
export function previewWrite(projects, name, args) {
    if (args === null || typeof args !== 'object' || Array.isArray(args))
        return undefined;
    const input = args;
    if (name === 'project_create') {
        const projectName = typeof input.name === 'string' ? input.name.trim() : '';
        if (projectName === '')
            return undefined;
        let fields;
        try {
            fields = asFieldMap(input.fields, 'fields');
        }
        catch {
            return undefined;
        }
        const lines = [`新建项目「${projectName}」`];
        if (typeof input.code === 'string' && input.code.trim() !== '')
            lines.push(`· 编码：${input.code.trim()}`);
        if (typeof input.status === 'string') {
            lines.push(`· 状态：${STATUS_TEXT[input.status] ?? input.status}`);
        }
        for (const [fieldKey, value] of Object.entries(fields)) {
            lines.push(`· 初始字段「${fieldKey}」= ${brief(value)}`);
        }
        return lines.join('\n');
    }
    const ref = typeof input.project === 'string' ? input.project.trim() : '';
    if (ref === '')
        return undefined;
    const resolution = projects.resolve(ref);
    if (resolution.kind !== 'found')
        return undefined;
    const current = resolution.project;
    if (name === 'project_delete') {
        return [
            `彻底删除项目「${current.name}」及其 ${current.fieldCount} 个字段。`,
            '此操作无法撤销。',
        ].join('\n');
    }
    if (name !== 'project_update')
        return undefined;
    let setFields;
    try {
        setFields = asFieldMap(input.set_fields, 'set_fields');
    }
    catch {
        return undefined;
    }
    const removeFields = Array.isArray(input.remove_fields)
        ? input.remove_fields.filter((entry) => typeof entry === 'string')
        : [];
    const changes = [];
    const nextName = typeof input.name === 'string' ? input.name.trim() : '';
    if (nextName !== '' && nextName !== current.name) {
        changes.push(`名称：「${current.name}」→「${nextName}」`);
    }
    if (typeof input.code === 'string' && input.code.trim() !== current.code) {
        const shown = (code) => (code === '' ? '未填写' : code);
        changes.push(`编码：「${shown(current.code)}」→「${shown(input.code.trim())}」`);
    }
    if (typeof input.status === 'string' && input.status !== current.status) {
        const next = STATUS_TEXT[input.status] ?? input.status;
        changes.push(`状态：${STATUS_TEXT[current.status]} → ${next}`);
    }
    if (typeof input.archived === 'boolean' && input.archived !== current.archived) {
        changes.push(input.archived ? '归档这个项目（默认列表里不再出现）' : '恢复这个项目');
    }
    for (const [fieldKey, value] of Object.entries(setFields)) {
        const existing = current.fields[fieldKey];
        changes.push(existing === undefined
            ? `新增字段「${fieldKey}」= ${brief(value)}`
            : `字段「${fieldKey}」：「${brief(existing)}」→「${brief(value)}」`);
    }
    for (const fieldKey of removeFields) {
        const existing = current.fields[fieldKey];
        if (existing === undefined)
            continue;
        changes.push(`删除字段「${fieldKey}」（原值 ${brief(existing)}）`);
    }
    if (changes.length === 0)
        return `项目「${current.name}」没有任何改动。`;
    return [`修改项目「${current.name}」：`, ...changes.map(change => `· ${change}`)].join('\n');
}
/** The pending card for one call. */
function card(title, kind, rawInput) {
    return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } };
}
/**
 * Register the project tools and their preview gate.
 * @param ctx - host context carrying the tool registry.
 * @param projects - the store the tools read and write.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonProjectTools(ctx, projects) {
    const disposers = [];
    /**
     * Register one definition, keeping its disposer in this function's teardown.
     * @param definition - the tool to register.
     */
    const register = (definition) => {
        disposers.push(ctx.tools.register(definition));
    };
    register(defineYonTool({
        name: 'project_list',
        description: 'List the projects in the operator\'s project store, with how many dynamic fields each '
            + 'one carries. Use this to find a project before reading or changing it; the store is small, so '
            + 'listing everything and choosing yourself beats guessing a name.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                query: {
                    type: 'string',
                    description: 'Optional keyword; keeps projects whose name or code contains it (case-insensitive).',
                },
                include_archived: {
                    type: 'boolean',
                    description: 'Include archived projects. Defaults to false.',
                },
            },
        },
        outputSchema: LIST_VALUE,
        render: value => {
            const list = value;
            if (list.matched === 0)
                return '没有匹配的项目。';
            return [`${list.matched} 个项目：`, ...list.projects.map(project => `  ${summarize(project)}`)].join('\n');
        },
        execute(args) {
            const everything = projects.list({ includeArchived: args.include_archived === true });
            const needle = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
            const matched = needle === ''
                ? everything
                : everything.filter(project => project.name.toLowerCase().includes(needle) || project.code.toLowerCase().includes(needle));
            return Promise.resolve({
                matched: matched.length,
                projects: matched.map(project => ({
                    project_id: project.projectId,
                    name: project.name,
                    code: project.code,
                    status: project.status,
                    archived: project.archived,
                    field_count: project.fieldCount,
                })),
            });
        },
        presentCall: () => card('List projects', 'read'),
    }));
    register(defineYonTool({
        name: 'project_read',
        description: 'Read one project and every dynamic field it carries. Read before you change anything: '
            + 'the field names belong to the operator, so the current values are the only way to know what a '
            + 'change would replace.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['project'],
            properties: {
                project: { type: 'string', description: 'Project id, exact name, or exact code.' },
            },
        },
        outputSchema: DETAIL_VALUE,
        render: value => projectText(value.project),
        execute(args) {
            const project = locate(projects, asRef(args.project));
            return Promise.resolve({ project: projectValue(project) });
        },
        presentCall: args => card(`Read project “${String(args.project)}”`, 'read'),
    }));
    register(defineYonTool({
        name: 'project_create',
        description: 'Create one project, optionally with its first fields. The operator approves the exact '
            + 'name and starting fields before anything is stored. Prefer creating the project and then adding '
            + 'fields as the operator names them over inventing fields they did not ask for.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: {
                name: { type: 'string', description: 'Project name as the operator says it.' },
                code: { type: 'string', description: 'Optional short code.' },
                status: { type: 'string', enum: PROJECT_STATUSES, description: 'Defaults to active.' },
                fields: { ...FIELDS_SCHEMA, description: 'Optional starting fields, keyed by field name.' },
            },
        },
        outputSchema: DETAIL_VALUE,
        render: value => `已创建：\n${projectText(value.project)}`,
        async execute(args) {
            const status = args.status;
            const project = await projects.create({
                name: asRef(args.name, 'name'),
                ...typeof args.code === 'string' ? { code: args.code } : {},
                ...typeof status === 'string' && PROJECT_STATUSES.includes(status)
                    ? { status: status }
                    : {},
                fields: asFieldMap(args.fields, 'fields'),
            });
            return { project: projectValue(project) };
        },
        presentCall: args => card(`Create project “${String(args.name)}”`, 'other', args.code),
    }));
    register(defineYonTool({
        name: 'project_update',
        description: 'Change one project: its name, code, status, or archived state, and any of its dynamic '
            + 'fields. Setting a field replaces that field only, and a new name creates it; listing a field in '
            + 'remove_fields deletes it. Changes that only add or update are applied at once and reported back as '
            + 'a list of what changed; removing a field or archiving the project stops for the operator\'s '
            + 'approval first, so pass exactly the changes they asked for.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['project'],
            properties: {
                project: { type: 'string', description: 'Project id, exact name, or exact code.' },
                name: { type: 'string', description: 'New project name.' },
                code: { type: 'string', description: 'New short code; an empty string clears it.' },
                status: { type: 'string', enum: PROJECT_STATUSES, description: 'New lifecycle status.' },
                archived: { type: 'boolean', description: 'true archives the project, false restores it.' },
                set_fields: {
                    ...FIELDS_SCHEMA,
                    description: 'Fields to write, keyed by field name; an existing name is replaced, a new one is added.',
                },
                remove_fields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Field names to delete.',
                },
            },
        },
        outputSchema: UPDATE_VALUE,
        render: value => {
            const result = value;
            return [
                result.changes.length === 0 ? '没有任何改动。' : `已应用 ${result.changes.length} 项改动：`,
                ...result.changes.map(change => `· ${change}`),
                projectText(result.project),
            ].join('\n');
        },
        async execute(args) {
            const current = locate(projects, asRef(args.project));
            const changes = [];
            const setFields = asFieldMap(args.set_fields, 'set_fields');
            const removeFields = (Array.isArray(args.remove_fields) ? args.remove_fields : [])
                .filter((entry) => typeof entry === 'string')
                .map(entry => entry.trim())
                .filter(entry => entry !== '');
            const nextName = typeof args.name === 'string' ? args.name.trim() : '';
            const nextCode = typeof args.code === 'string' ? args.code.trim() : undefined;
            const nextStatus = typeof args.status === 'string' ? args.status : undefined;
            const nextArchived = typeof args.archived === 'boolean' ? args.archived : undefined;
            const patch = {
                ...nextName === '' || nextName === current.name ? {} : { name: nextName },
                ...nextCode === undefined || nextCode === current.code ? {} : { code: nextCode },
                ...nextStatus === undefined || nextStatus === current.status
                    ? {}
                    : { status: nextStatus },
                ...nextArchived === undefined || nextArchived === current.archived ? {} : { archived: nextArchived },
            };
            if (Object.keys(patch).length > 0)
                await projects.update(current.projectId, patch);
            for (const [column, value] of Object.entries(patch)) {
                changes.push(columnChange(column, value, current));
            }
            for (const [fieldKey, value] of Object.entries(setFields)) {
                await projects.setField(current.projectId, fieldKey, value);
                changes.push(current.fields[fieldKey] === undefined
                    ? `新增字段「${fieldKey}」`
                    : `字段「${fieldKey}」已更新`);
            }
            for (const fieldKey of removeFields) {
                if (current.fields[fieldKey] === undefined)
                    continue;
                await projects.removeField(current.projectId, fieldKey);
                changes.push(`删除字段「${fieldKey}」`);
            }
            // Re-read rather than patching the copy: the answer is what the store now
            // holds, including anything another editor changed meanwhile.
            const project = locate(projects, current.projectId);
            return { project: projectValue(project), changes };
        },
        presentCall: args => card(`Update project “${String(args.project)}”`, 'other'),
    }));
    register(defineYonTool({
        name: 'project_delete',
        description: 'Delete one project permanently, together with every field it carries. The operator '
            + 'approves this by name and field count, and it cannot be undone. To take a project out of the way '
            + 'without losing it, use project_update with archived instead.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['project'],
            properties: {
                project: { type: 'string', description: 'Project id, exact name, or exact code.' },
            },
        },
        outputSchema: DELETE_VALUE,
        render: value => {
            const removed = value;
            return `已彻底删除项目「${removed.removed}」及其 ${removed.removed_fields} 个字段。`;
        },
        async execute(args) {
            const project = locate(projects, asRef(args.project));
            await projects.remove(project.projectId);
            return { removed: project.name, removed_fields: project.fieldCount };
        },
        presentCall: args => card(`Delete project “${String(args.project)}”`, 'other'),
    }));
    // The gate: the session's own permission preset decides, and this package
    // follows it rather than overruling it. Read-only refuses every write; an
    // additive write runs wherever writing is allowed; a destructive write asks in
    // a session that wants to be asked and runs in one that asked not to be. The
    // `ask` branch resolves only through an approval, so a call nobody saw still
    // cannot run.
    disposers.push(ctx.on('tools/pre-execute', (exec, next) => {
        if (!WRITE_TOOLS.has(exec.name))
            return next();
        const destructive = isDestructiveWrite(exec.name, exec.arguments);
        const disposition = dispositionOf(destructive, permissionsOf(exec.agent?.session));
        if (disposition === 'run')
            return next();
        if (disposition === 'refuse') {
            return {
                kind: 'deny',
                reason: '当前会话是「仅可查看」权限，不能改动项目配置。'
                    + '要完成改动，请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。',
            };
        }
        const preview = previewWrite(projects, exec.name, exec.arguments);
        return Promise.resolve(preview === undefined ? next() : { kind: 'ask', reason: preview });
    }));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
/**
 * Whether one tool name is a write this package gates behind an approval.
 * @param name - the tool name to test.
 * @returns true for the tools that change stored data.
 */
export function isYonWriteTool(name) {
    return WRITE_TOOLS.has(name);
}
