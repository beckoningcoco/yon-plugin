import { API_PREFIX, PROJECT_STATUSES, } from "../shared/types.js";
import { ProjectError } from "./service.js";
import { SkillError } from "./skill-registry.js";
import { DataSourceError } from "./datasource-service.js";
import { WikiError } from "./wiki-service.js";
/** Largest request body accepted, in bytes. */
const MAX_BODY_BYTES = 1_000_000;
/** Write one JSON response. */
function sendJson(res, status, payload) {
    if (res.headersSent)
        return;
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
    });
    res.end(body);
}
/** Write one {@link ApiError} response. */
function sendFailure(res, status, code, message) {
    sendJson(res, status, { code, message });
}
/** Read a JSON request body; an absent body reads as undefined. */
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > MAX_BODY_BYTES) {
            throw new ProjectError('invalid-input', `body exceeds ${MAX_BODY_BYTES} bytes`);
        }
        chunks.push(buffer);
    }
    if (size === 0)
        return undefined;
    const text = Buffer.concat(chunks).toString('utf8');
    try {
        return JSON.parse(text);
    }
    catch {
        throw new ProjectError('invalid-input', 'body must be JSON');
    }
}
/** Read one object body, rejecting a non-object payload. */
async function objectBody(req) {
    const body = await readJsonBody(req);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new ProjectError('invalid-input', 'body must be a JSON object');
    }
    return body;
}
/** Read a dynamic-field bag, rejecting a non-object payload. */
function fieldsOf(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ProjectError('invalid-input', 'fields must be a JSON object');
    }
    return value;
}
/** Read a status field, rejecting anything outside the declared vocabulary. */
function statusOf(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !PROJECT_STATUSES.includes(value)) {
        throw new ProjectError('invalid-input', `status must be one of ${PROJECT_STATUSES.join(', ')}`);
    }
    return value;
}
/** Split a pathname into the decoded segments following the API prefix. */
function segmentsOf(pathname) {
    if (!pathname.startsWith(API_PREFIX))
        return undefined;
    const rest = pathname.slice(API_PREFIX.length);
    if (rest === '' || rest === '/')
        return [];
    if (!rest.startsWith('/'))
        return undefined;
    return rest.slice(1).split('/').map(segment => decodeURIComponent(segment));
}
/**
 * Split one datasource key into the group name and the environment branch.
 *
 * The split takes the LAST separator, the same way the shared helper does, so a
 * group name that itself contains `::` still round-trips.
 * @param key - the composite key from the URL.
 * @returns the parts, or undefined when the key carries no separator.
 */
function keyParts(key) {
    const at = key.lastIndexOf('::');
    if (at <= 0)
        return undefined;
    const env = key.slice(at + 2);
    if (env === '')
        return undefined;
    return { configKey: key.slice(0, at), env };
}
/**
 * Serve the `/yon/api/datasources` branch.
 *
 * Writes here touch the operator's own document, which is the same file the
 * panel edits; there is no privileged verb, so a key the caller cannot name is
 * simply not found.
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param sources - the datasource service.
 */
async function handleDataSources(req, res, method, segments, sources) {
    const key = segments[1];
    const tail = segments[2];
    // /yon/api/datasources
    if (key === undefined) {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        sendJson(res, 200, await sources.list());
        return;
    }
    // /yon/api/datasources/<key>
    if (tail === undefined) {
        if (method === 'PUT') {
            const parts = keyParts(key);
            if (parts === undefined) {
                sendFailure(res, 400, 'invalid-input', `无法解析数据源键「${key}」`);
                return;
            }
            const body = await objectBody(req);
            const row = await sources.save({
                configKey: parts.configKey,
                env: parts.env,
                dbType: typeof body.dbType === 'string' ? body.dbType : '',
                host: typeof body.host === 'string' ? body.host : '',
                port: typeof body.port === 'number' ? body.port : Number.parseInt(String(body.port), 10),
                ...typeof body.serviceName === 'string' ? { serviceName: body.serviceName } : {},
                ...body.users === undefined || body.users === null || typeof body.users !== 'object'
                    ? {}
                    : { users: body.users },
                ...typeof body.projectId === 'string' ? { projectId: body.projectId } : {},
            });
            sendJson(res, 200, { source: row });
            return;
        }
        if (method === 'DELETE') {
            await sources.remove(key);
            sendJson(res, 200, { removed: key });
            return;
        }
        sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
        return;
    }
    // /yon/api/datasources/<key>/probe
    if (tail === 'probe' && method === 'POST') {
        const body = await readJsonBody(req).then(value => (value !== null && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {}));
        const result = await sources.probe(key, typeof body.user === 'string' ? body.user : undefined);
        sendJson(res, 200, { result });
        return;
    }
    // /yon/api/datasources/<key>/binding
    if (tail === 'binding' && method === 'PUT') {
        const body = await objectBody(req);
        const projectId = body.projectId;
        await sources.bind(key, typeof projectId === 'string' ? projectId : undefined);
        sendJson(res, 200, { bound: typeof projectId === 'string' ? projectId : '' });
        return;
    }
    sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/datasources/...`);
}
/**
 * Serve the `/yon/api/wiki` branch.
 *
 * Two routes, which are the two things a surface can usefully do: see which
 * vaults are registered and how big they are, and ask for a rebuild. Reading a
 * page is the model's business through `wiki_read`, not the panel's.
 *
 * The vault paths are returned as they are. They are the operator's own machine
 * paths, the panel displays them, and the operator may edit them — there is no
 * secret in any of this, unlike a datasource password.
 *
 * @param req - the request; read for the rebuild body.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param wiki - the knowledge base service.
 */
async function handleWiki(req, res, method, segments, wiki) {
    const tail = segments[1];
    // /yon/api/wiki
    if (tail === undefined) {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        sendJson(res, 200, { vaults: await wiki.list() });
        return;
    }
    // /yon/api/wiki/rebuild
    if (tail === 'rebuild') {
        if (method !== 'POST') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        const body = await objectBody(req);
        const vaultId = typeof body.vault === 'string' && body.vault !== '' ? body.vault : undefined;
        sendJson(res, 200, { vaults: await wiki.rebuild(vaultId) });
        return;
    }
    sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/wiki/...`);
}
/**
 * Serve the `/yon/api/skills` branch.
 *
 * A skill the operator owns is listed and readable but can never be switched:
 * `setEnabled` accepts only a name this plugin ships, and the service refuses
 * anything else. The panel therefore cannot use this route to disturb a skill
 * living in `~/.agents/skills`.
 * @param req - the request; read for the switch body.
 * @param res - the response.
 * @param method - HTTP method.
 * @param name - the skill-name segment, absent for the collection.
 * @param skills - the skill service.
 */
async function handleSkills(req, res, method, name, skills) {
    if (name === undefined) {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        sendJson(res, 200, await skills.list());
        return;
    }
    if (method === 'GET') {
        const skill = await skills.read(name);
        if (skill === undefined) {
            sendFailure(res, 404, 'not-found', `no skill "${name}"`);
            return;
        }
        sendJson(res, 200, { skill });
        return;
    }
    if (method === 'PATCH') {
        const body = await objectBody(req);
        if (typeof body.enabled !== 'boolean') {
            throw new SkillError('invalid-input', 'body must carry a boolean "enabled"');
        }
        sendJson(res, 200, { skill: await skills.setEnabled(name, body.enabled) });
        return;
    }
    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
}
/**
 * Register the project, skill and datasource APIs on the carrier service.
 * @param ctx - host context carrying `webServer`.
 * @param service - the project store to expose.
 * @param skills - the skill service to expose.
 * @param sources - the datasource service to expose.
 * @param wiki - the knowledge base service to expose.
 * @returns the disposer removing the route.
 */
export function registerYonApi(ctx, service, skills, sources, wiki) {
    const carrier = ctx.get('webServer');
    if (carrier === undefined) {
        throw new Error('yon-panel: the webServer service is unavailable, so /yon/api cannot be served');
    }
    return carrier.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: async (req, res) => {
            try {
                const url = new URL(req.url ?? '/', 'http://localhost');
                const method = req.method ?? 'GET';
                const segments = segmentsOf(url.pathname);
                if (segments === undefined) {
                    sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`);
                    return;
                }
                if (segments[0] === 'skills') {
                    await handleSkills(req, res, method, segments[1], skills);
                    return;
                }
                if (segments[0] === 'datasources') {
                    await handleDataSources(req, res, method, segments, sources);
                    return;
                }
                if (segments[0] === 'wiki') {
                    await handleWiki(req, res, method, segments, wiki);
                    return;
                }
                if (segments[0] !== 'projects') {
                    sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`);
                    return;
                }
                const [, projectId, tail, fieldKey] = segments;
                // /yon/api/projects
                if (projectId === undefined) {
                    if (method === 'GET') {
                        const includeArchived = url.searchParams.get('archived') === '1';
                        sendJson(res, 200, { projects: service.list({ includeArchived }) });
                        return;
                    }
                    if (method === 'POST') {
                        const body = await objectBody(req);
                        const status = statusOf(body.status);
                        const project = await service.create({
                            name: typeof body.name === 'string' ? body.name : '',
                            ...(body.code === undefined ? {} : { code: String(body.code) }),
                            ...(status === undefined ? {} : { status }),
                            ...(body.fields === undefined ? {} : { fields: fieldsOf(body.fields) }),
                        });
                        sendJson(res, 201, { project });
                        return;
                    }
                    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
                    return;
                }
                // /yon/api/projects/<id>
                if (tail === undefined) {
                    if (method === 'GET') {
                        const project = service.get(projectId);
                        if (project === undefined) {
                            sendFailure(res, 404, 'not-found', `no project "${projectId}"`);
                            return;
                        }
                        sendJson(res, 200, { project });
                        return;
                    }
                    if (method === 'PATCH') {
                        const body = await objectBody(req);
                        const status = statusOf(body.status);
                        const project = await service.update(projectId, {
                            ...(body.name === undefined ? {} : { name: String(body.name) }),
                            ...(body.code === undefined ? {} : { code: String(body.code) }),
                            ...(status === undefined ? {} : { status }),
                            ...(body.archived === undefined ? {} : { archived: Boolean(body.archived) }),
                        });
                        sendJson(res, 200, { project });
                        return;
                    }
                    if (method === 'DELETE') {
                        await service.remove(projectId);
                        sendJson(res, 200, { removed: projectId });
                        return;
                    }
                    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
                    return;
                }
                // /yon/api/projects/<id>/archive
                if (tail === 'archive' && method === 'POST') {
                    const body = await readJsonBody(req).then(value => (value !== null && typeof value === 'object' && !Array.isArray(value)
                        ? value
                        : {}));
                    const project = await service.update(projectId, {
                        archived: body.archived === undefined ? true : Boolean(body.archived),
                    });
                    sendJson(res, 200, { project });
                    return;
                }
                // /yon/api/projects/<id>/fields/<fieldKey>
                if (tail === 'fields' && fieldKey !== undefined) {
                    if (method === 'PUT') {
                        const body = await objectBody(req);
                        if (!('value' in body)) {
                            throw new ProjectError('invalid-input', 'body must carry a "value" member');
                        }
                        const project = await service.setField(projectId, fieldKey, body.value ?? null);
                        sendJson(res, 200, { project });
                        return;
                    }
                    if (method === 'DELETE') {
                        const project = await service.removeField(projectId, fieldKey);
                        sendJson(res, 200, { project });
                        return;
                    }
                    sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
                    return;
                }
                sendFailure(res, 404, 'not-found', `no route for ${method} ${url.pathname}`);
            }
            catch (error) {
                // Diagnostics first: the response may already be committed, and a
                // swallowed cause would leave nothing to debug with.
                console.error('[yon-panel] /yon/api failure', error);
                try {
                    if (error instanceof ProjectError
                        || error instanceof SkillError
                        || error instanceof DataSourceError
                        || error instanceof WikiError) {
                        sendFailure(res, error.code === 'not-found' ? 404 : 400, error.code, error.message);
                    }
                    else {
                        sendFailure(res, 500, 'internal', error instanceof Error ? error.message : String(error));
                    }
                }
                catch (writeError) {
                    // Writing the failure response is itself failing: end the socket so the
                    // caller sees a broken response rather than a hung one.
                    console.error('[yon-panel] /yon/api could not write its failure response', writeError);
                    res.destroy();
                }
            }
        },
    });
}
