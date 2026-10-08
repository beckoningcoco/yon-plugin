import { DataSourceError } from "./datasource-service.js";
import { dispositionOf, permissionsOf } from "./tools.js";
import { memoryHintLine, withMemoryHint } from "./memory-session.js";
/** Every tool this module owns. */
export const DATASOURCE_TOOL_NAMES = ['datasource_list', 'datasource_query'];
/**
 * Statements that could change data.
 *
 * Kept word-for-word in step with `resources/db-query/db_query.py`, so a
 * statement the script would stop for is one this gate stops for too. A
 * divergence in either direction is a bug: too narrow lets a write through
 * unapproved, too wide asks about a read.
 */
const DESTRUCTIVE_SQL = /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|MERGE|GRANT|REVOKE)\b/i;
/**
 * Whether one statement could change data.
 * @param sql - the statement a call wants to run.
 * @returns true when it carries a keyword that can write.
 */
export function isDestructiveSql(sql) {
    return typeof sql === 'string' && DESTRUCTIVE_SQL.test(sql);
}
/** One content block carrying text; the registry's only shape this package uses. */
function text(content) {
    return [{ type: 'text', text: content }];
}
/** The pending-state card a UI renders for one call. */
function card(title, kind, rawInput) {
    return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } };
}
/** One connection line for the model's list answer. */
function summarize(source) {
    const parts = [
        source.key,
        `[${source.dbType === '' ? '类型未填' : source.dbType}]`,
        `${source.host}:${source.port}`,
    ];
    if (source.serviceName !== '')
        parts.push(`service=${source.serviceName}`);
    parts.push(source.userNames.length === 0 ? '无登录名' : `登录名 ${source.userNames.join('/')}`);
    if (!source.hasPassword)
        parts.push('未存密码');
    if (!source.probeable)
        parts.push('无连接器');
    if (source.binding !== undefined)
        parts.push(`已绑定项目「${source.binding.projectName}」`);
    return parts.join(' · ');
}
/** Read one argument as a required string. */
function asString(value, argument) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new DataSourceError('invalid-input', `${argument} 必须是非空字符串`);
    }
    return value.trim();
}
/** One tool definition over the registry's contract. */
function defineTool(spec, hint) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
            schema: spec.outputSchema,
            render: (_args, value) => text(spec.render(value) + memoryHintLine(value)),
        },
        async execute(args, exec) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
                throw new DataSourceError('invalid-input', `${spec.name} 需要一个对象参数`);
            }
            if (exec.signal.aborted)
                throw new DataSourceError('invalid-input', `${spec.name} 已被取消`);
            const value = await spec.execute(args, exec.signal);
            // The signpost, when this tool is one of the four that carry it. Injected here
            // rather than in the tool's own `execute` so that each of those four stays about its
            // own subject, and so the four cannot drift in how they say the same sentence.
            return hint === undefined ? value : await withMemoryHint(value, hint, exec);
        },
        presentCall: (args) => (args === null || typeof args !== 'object' || Array.isArray(args))
            ? undefined
            : spec.presentCall(args),
    };
}
/** The JSON Schema of the list's answer. */
const LIST_VALUE = {
    type: 'object',
    required: ['count', 'sources'],
    properties: {
        count: { type: 'number' },
        sources: { type: 'array', items: { type: 'object' } },
    },
};
/** The JSON Schema of a query's answer. */
const QUERY_VALUE = {
    type: 'object',
    required: ['ok', 'configKey', 'env', 'output'],
    properties: {
        ok: { type: 'boolean' },
        configKey: { type: 'string' },
        env: { type: 'string' },
        output: { type: 'string' },
        rowCount: { type: 'number' },
        error: { type: 'string' },
    },
};
/**
 * Register the datasource tools and their write gate.
 * @param ctx - host context carrying the tool registry.
 * @param sources - the service the tools read and run against.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonDataSourceTools(ctx, sources, hint) {
    const disposers = [];
    disposers.push(ctx.tools.register(defineTool({
        name: 'datasource_list',
        description: 'List the database connections the operator registered, one row per environment, '
            + 'with the connection\'s key, type, address and login names. Use this before running any '
            + 'statement: the key it returns is the only identifier datasource_query accepts, and it is '
            + 'never a guess — the list is the single source of truth. Passwords are not included and are '
            + 'not available to you.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
                query: {
                    type: 'string',
                    description: 'Optional keyword; keeps connections whose key, address or type contains it.',
                },
            },
        },
        outputSchema: LIST_VALUE,
        async execute(args) {
            const payload = await sources.list();
            const needle = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
            const matched = needle === ''
                ? payload.sources
                : payload.sources.filter(source => source.key.toLowerCase().includes(needle)
                    || source.host.toLowerCase().includes(needle)
                    || source.dbType.toLowerCase().includes(needle));
            return { count: matched.length, sources: matched };
        },
        render(value) {
            const list = value;
            if (list.count === 0)
                return '没有登记任何数据源。可以在 Yon 面板的数据库入口里添加。';
            return [
                `${list.count} 个数据源（key · 类型 · 地址 · 登录名）：`,
                ...list.sources.map(source => `  ${summarize(source)}`),
                '',
                '用 datasource_query 时把完整 key 原样传入。',
            ].join('\n');
        },
        presentCall: () => card('列出数据源', 'read'),
    })));
    disposers.push(ctx.tools.register(defineTool({
        name: 'datasource_query',
        description: 'Run one SQL statement against one registered connection and return the rows the '
            + 'database sent. Pass the key exactly as datasource_list returned it, not a short name: keys '
            + 'are matched exactly. Send one statement at a time and narrow large results with COUNT or a '
            + 'WHERE clause first — the whole result lands in the conversation. A statement that could '
            + 'change data stops for the operator\'s approval before it runs, and a read-only session '
            + 'refuses it.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'sql'],
            properties: {
                key: {
                    type: 'string',
                    description: 'The connection key from datasource_list, exactly as returned (for example "天九(NCC2312)::test").',
                },
                sql: { type: 'string', description: 'One SQL statement. Oracle needs FROM DUAL for a bare SELECT.' },
                user: { type: 'string', description: 'Optional login name; the connection\'s first one is used when omitted.' },
            },
        },
        outputSchema: QUERY_VALUE,
        async execute(args) {
            const result = await sources.query(asString(args.key, 'key'), asString(args.sql, 'sql'), typeof args.user === 'string' ? args.user : undefined);
            return result;
        },
        render(value) {
            const result = value;
            const head = `${result.configKey} / ${result.env}`;
            if (!result.ok)
                return `${head} 查询失败：\n${result.error ?? '（没有更多信息）'}`;
            return [head, result.output === '' ? '（没有输出）' : result.output].join('\n');
        },
        presentCall(args) {
            const sql = String(args.sql ?? '');
            return card(`执行 SQL：${sql.length > 80 ? `${sql.slice(0, 80)}…` : sql}`, 'other', args.key);
        },
    }, hint)));
    // The gate. A read never reaches it; a statement that could change data
    // inherits exactly the disposition the project tools use for their writes, so
    // one session-wide permission preset governs both, and an unapproved write
    // still cannot run.
    disposers.push(ctx.on('tools/pre-execute', (exec, next) => {
        if (exec.name !== 'datasource_query')
            return next();
        const args = exec.arguments;
        const sql = args !== null && typeof args === 'object' && !Array.isArray(args)
            ? args.sql
            : undefined;
        if (!isDestructiveSql(sql))
            return next();
        const disposition = dispositionOf(true, permissionsOf(exec.agent?.session));
        if (disposition === 'run')
            return next();
        if (disposition === 'refuse') {
            return {
                kind: 'deny',
                reason: '当前会话是「仅可查看」权限，不能执行会改动数据的语句。'
                    + '要执行请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。',
            };
        }
        return {
            kind: 'ask',
            reason: `这条语句可能改动数据，执行前请确认：\n\n  ${String(sql).slice(0, 400)}\n\n`
                + '生产库上的改动不可撤销。',
        };
    }));
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
