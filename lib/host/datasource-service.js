/**
 * What the panel and the model call: the store's contents, read as views; the
 * store's contents, changed one connection at a time; and statements run through
 * the bundled script.
 *
 * Every mutation is a read-modify-write of the whole document, so all three of
 * them run through one in-process queue. The store already makes each write
 * atomic, but atomicity is not isolation: two edits that both read, both change
 * one connection and both write back would still lose one of the two. The queue
 * below is what makes the pair indivisible.
 *
 * Nothing here logs, echoes or returns a secret. A password only ever travels
 * inward: it arrives in {@link SaveDataSourceInput}, goes straight into the
 * stored document, and no path in this module reads one back out.
 */
import { access } from 'node:fs/promises';
import { dataSourceKey, splitDataSourceKey, } from "../shared/types.js";
import { PROBEABLE_TYPES, connectionOf, environmentNames, toViews } from "./datasource-catalog.js";
import { DB_QUERY_SCRIPT_PATH, probeStatement, } from "./datasource-probe.js";
/** A failure the caller can act on; the HTTP layer maps it to a status code. */
export class DataSourceError extends Error {
    code;
    constructor(
    /** Machine code the API reports. */
    code, message) {
        super(message);
        this.code = code;
        this.name = 'DataSourceError';
    }
}
/** Reject a value that is not usable as a connection-group name. */
function assertConfigKey(value) {
    const trimmed = value.trim();
    if (trimmed === '')
        throw new DataSourceError('invalid-input', '数据源名称不能为空');
    if (trimmed.includes('::')) {
        throw new DataSourceError('invalid-input', '数据源名称不能包含 "::"，它是键的分隔符');
    }
    return trimmed;
}
/** Reject a value that is not usable as an environment branch name. */
function assertEnv(value) {
    const trimmed = value.trim();
    if (trimmed === '')
        throw new DataSourceError('invalid-input', '环境名不能为空');
    if (trimmed.includes('::')) {
        throw new DataSourceError('invalid-input', '环境名不能包含 "::"，它是键的分隔符');
    }
    return trimmed;
}
/** Read a port the stored document can hold. */
function assertPort(value) {
    if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        throw new DataSourceError('invalid-input', '端口必须是 1–65535 之间的整数');
    }
    return value;
}
/**
 * A shallow copy of the document, so a rejected edit cannot half-apply.
 * @param config - the document as it was read.
 * @returns a copy whose connections can be changed.
 */
function cloneConfig(config) {
    const projects = {};
    for (const [key, value] of Object.entries(config.projects ?? {})) {
        if (value === null || typeof value !== 'object' || Array.isArray(value))
            continue;
        projects[key] = { ...value };
    }
    return { projects };
}
/** Whether the bundled script is actually on disk. */
async function scriptExists() {
    try {
        await access(DB_QUERY_SCRIPT_PATH);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Build the service over the store, the project store and the runner.
 * @param store - the document store.
 * @param projects - the project store, read for a binding's display name.
 * @param runner - the statement runner.
 * @returns the service and its disposer.
 */
export function createYonDataSourcesService(store, projects, runner) {
    /** Serialises read-modify-write rounds; see this module's header. */
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    /** Resolve one binding to a display name, without holding the whole project. */
    const lookup = (projectId) => {
        const project = projects.get(projectId);
        return project === undefined ? undefined : { name: project.name };
    };
    /** Resolve a composite key to a stored connection, or explain why it cannot be. */
    const requireTarget = async (key) => {
        const parts = splitDataSourceKey(key);
        if (parts === undefined) {
            throw new DataSourceError('invalid-input', `无法解析数据源键「${key}」`);
        }
        const read = await store.read();
        const connection = connectionOf(read.config, parts.configKey);
        if (connection === undefined) {
            throw new DataSourceError('not-found', `没有数据源「${parts.configKey}」`);
        }
        if (!environmentNames(connection).includes(parts.env)) {
            throw new DataSourceError('not-found', `数据源「${parts.configKey}」没有「${parts.env}」环境`);
        }
        // Read the type straight from the stored connection rather than back out of
        // a rendered view: the key already proved the branch exists, so there is
        // nothing left for a second lookup to establish.
        return {
            configKey: parts.configKey,
            env: parts.env,
            dbType: typeof connection.type === 'string' ? connection.type : '',
        };
    };
    /** One row of the document as the panel reads it. */
    const viewOf = async (configKey, env) => {
        const read = await store.read();
        const row = toViews(read.config, lookup).find(candidate => candidate.configKey === configKey && candidate.env === env);
        if (row === undefined) {
            throw new DataSourceError('not-found', `没有数据源 ${dataSourceKey(configKey, env)}`);
        }
        return row;
    };
    /** Refuse a run against a type the bundled script has no connector for. */
    const unsupported = (dbType) => `查询脚本没有 ${dbType === '' ? '（未填写类型）' : dbType} 的连接器，`
        + `目前支持：${PROBEABLE_TYPES.join(' / ')}。`;
    const service = {
        path: store.path,
        async list() {
            const read = await store.read();
            const sources = toViews(read.config, lookup);
            const available = runner.available && await scriptExists();
            return {
                sources,
                configPath: read.path,
                complete: read.error === undefined,
                probeAvailable: available,
                ...read.error === undefined ? {} : { error: read.error },
                ...read.seededFrom === undefined ? {} : { seededFrom: read.seededFrom },
            };
        },
        async probe(key, user) {
            const target = await requireTarget(key);
            if (!PROBEABLE_TYPES.includes(target.dbType)) {
                return { ok: false, latencyMs: 0, error: unsupported(target.dbType) };
            }
            if (!runner.available) {
                return { ok: false, latencyMs: 0, error: runner.unavailableReason ?? '探测不可用' };
            }
            const result = await runner.run({
                configKey: target.configKey,
                env: target.env,
                sql: probeStatement(target.dbType),
                ...user === undefined || user === '' ? {} : { user },
                // A probe proves reachability, not throughput: failing fast is the point.
                timeoutMs: 15_000,
            });
            return {
                ok: result.ok,
                latencyMs: result.latencyMs,
                ...user === undefined || user === '' ? {} : { user },
                ...result.rowCount === undefined ? {} : { rowCount: result.rowCount },
                ...result.error === undefined ? {} : { error: result.error },
            };
        },
        async query(key, sql, user) {
            const statement = sql.trim();
            if (statement === '')
                throw new DataSourceError('invalid-input', 'SQL 不能为空');
            const target = await requireTarget(key);
            if (!PROBEABLE_TYPES.includes(target.dbType)) {
                return {
                    ok: false,
                    latencyMs: 0,
                    configKey: target.configKey,
                    env: target.env,
                    output: '',
                    error: unsupported(target.dbType),
                };
            }
            if (!runner.available) {
                return {
                    ok: false,
                    latencyMs: 0,
                    configKey: target.configKey,
                    env: target.env,
                    output: '',
                    error: runner.unavailableReason ?? '查询不可用',
                };
            }
            const result = await runner.run({
                configKey: target.configKey,
                env: target.env,
                sql: statement,
                ...user === undefined || user === '' ? {} : { user },
            });
            return {
                ok: result.ok,
                latencyMs: result.latencyMs,
                configKey: target.configKey,
                env: target.env,
                output: result.output,
                ...result.rowCount === undefined ? {} : { rowCount: result.rowCount },
                ...result.error === undefined ? {} : { error: result.error },
            };
        },
        save(input) {
            return inLine(async () => {
                const configKey = assertConfigKey(input.configKey);
                const env = assertEnv(input.env);
                const dbType = input.dbType.trim();
                if (dbType === '')
                    throw new DataSourceError('invalid-input', '数据库类型不能为空');
                const port = assertPort(input.port);
                const host = input.host.trim();
                if (host === '')
                    throw new DataSourceError('invalid-input', '地址不能为空');
                const read = await store.read();
                const next = cloneConfig(read.config);
                const connection = { ...next.projects[configKey], type: dbType };
                if (input.projectId !== undefined) {
                    if (input.projectId === '')
                        Reflect.deleteProperty(connection, 'projectId');
                    else
                        connection.projectId = input.projectId;
                }
                const existing = connection[env];
                const previous = existing !== null && typeof existing === 'object' && !Array.isArray(existing)
                    ? existing
                    : {};
                connection[env] = {
                    ...previous,
                    host,
                    port,
                    service_name: input.serviceName?.trim() ?? '',
                    // Absent means "leave the stored logins alone": the surface never
                    // receives a password, so it cannot send one back unchanged, and a save
                    // that silently dropped the secret would be a data loss disguised as an
                    // edit.
                    ...input.users === undefined ? {} : { users: input.users },
                };
                next.projects[configKey] = connection;
                await store.write(next);
                return viewOf(configKey, env);
            });
        },
        remove(key) {
            return inLine(async () => {
                const parts = splitDataSourceKey(key);
                if (parts === undefined) {
                    throw new DataSourceError('invalid-input', `无法解析数据源键「${key}」`);
                }
                const read = await store.read();
                const next = cloneConfig(read.config);
                const connection = next.projects[parts.configKey];
                if (connection === undefined) {
                    throw new DataSourceError('not-found', `没有数据源「${parts.configKey}」`);
                }
                Reflect.deleteProperty(connection, parts.env);
                // A group with no branches left is not a connection: keeping it would
                // leave a row the surface must explain and the script cannot use.
                if (environmentNames(connection).length === 0) {
                    Reflect.deleteProperty(next.projects, parts.configKey);
                }
                await store.write(next);
            });
        },
        bind(key, projectId) {
            return inLine(async () => {
                const parts = splitDataSourceKey(key);
                if (parts === undefined) {
                    throw new DataSourceError('invalid-input', `无法解析数据源键「${key}」`);
                }
                const read = await store.read();
                const next = cloneConfig(read.config);
                const connection = next.projects[parts.configKey];
                if (connection === undefined) {
                    throw new DataSourceError('not-found', `没有数据源「${parts.configKey}」`);
                }
                if (projectId === undefined || projectId === '') {
                    Reflect.deleteProperty(connection, 'projectId');
                }
                else {
                    if (projects.get(projectId) === undefined) {
                        throw new DataSourceError('not-found', `没有项目「${projectId}」`);
                    }
                    connection.projectId = projectId;
                }
                await store.write(next);
            });
        },
    };
    return {
        service,
        dispose() {
            // Nothing to release: every write already settled through the queue, and
            // the store holds no open handle.
        },
    };
}
