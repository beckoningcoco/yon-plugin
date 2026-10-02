import { API_PREFIX, PROJECT_STATUSES, } from "../shared/types.js";
import { ProjectError } from "./service.js";
import { SkillError } from "./skill-registry.js";
import { DataSourceError } from "./datasource-service.js";
import { WikiError } from "./wiki-service.js";
import { digestLogPath } from "./digest-log.js";
import { HomeError } from "./home-service.js";
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
 * Read a Home registration body into the service's input shape.
 *
 * A caller that still sends a `label` gets it ignored rather than rejected: the name
 * is derived from the product line and the version (`homeLabelOf`), so there is
 * nothing for a body to say about it.
 */
function homeInputOf(body) {
    return {
        path: typeof body.path === 'string' ? body.path : '',
        product: body.product === 'bip' ? 'bip' : 'ncc',
        version: typeof body.version === 'string' ? body.version : '',
        ...body.isDefault === undefined ? {} : { isDefault: Boolean(body.isDefault) },
    };
}
/**
 * Serve the `/yon/api/homes` branch.
 *
 * A registration is identified by its generated id, and the id is not editable —
 * the same convention the datasource panel uses for a connection's key and
 * environment. Editing changes what an entry describes, never which entry it is,
 * so anything a conversation already referred to keeps meaning the same Home.
 *
 * @param req - the request; read for the body on writes.
 * @param res - the response.
 * @param method - HTTP method.
 * @param segments - the decoded path segments after the API prefix.
 * @param homes - the Home service.
 * @param meta - the metadata index over those Homes.
 * @param search - the request's query string, for the one route that has a flag.
 */
async function handleHomes(req, res, method, segments, homes, meta, search) {
    const id = segments[1];
    const tail = segments[2];
    // /yon/api/homes
    if (id === undefined) {
        if (method === 'GET') {
            sendJson(res, 200, await homes.list());
            return;
        }
        if (method === 'POST') {
            const home = await homes.save(homeInputOf(await objectBody(req)));
            sendJson(res, 201, { home });
            return;
        }
        sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
        return;
    }
    // /yon/api/homes/<id>
    if (tail === undefined) {
        if (method === 'PUT') {
            const home = await homes.save(homeInputOf(await objectBody(req)), id);
            sendJson(res, 200, { home });
            return;
        }
        if (method === 'DELETE') {
            await homes.remove(id);
            sendJson(res, 200, { removed: id });
            return;
        }
        sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
        return;
    }
    // /yon/api/homes/<id>/probe
    if (tail === 'probe' && method === 'POST') {
        sendJson(res, 200, { home: await homes.probe(id) });
        return;
    }
    // /yon/api/homes/<id>/default
    if (tail === 'default' && method === 'PUT') {
        sendJson(res, 200, { home: await homes.setDefault(id) });
        return;
    }
    // /yon/api/homes/<id>/meta-index
    //
    // GET is the status, and `fresh=0` skips the fingerprint comparison — a walk plus a
    // stat per file, measured at 0.61 s. A panel polling a running build wants the progress
    // and not a disk scan per second, so it asks for the cheap answer and takes the full
    // one when it opens and when the build finishes.
    if (tail === 'meta-index') {
        if (method === 'GET') {
            const status = await meta.status(id, search.get('fresh') !== '0');
            sendJson(res, 200, { home: id, status });
            return;
        }
        if (method === 'POST') {
            // Returns as soon as the build is queued rather than when it finishes: the panel
            // polls GET for progress, and a request that blocks for minutes is one a proxy
            // will cut. `started: false` means one was already running for this version.
            const handle = await meta.startBuild(id);
            sendJson(res, 202, { home: id, ...handle });
            return;
        }
        sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
        return;
    }
    sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/homes/...`);
}
/**
 * Serve `POST /yon/api/pick-directory`: ask the host to open its folder chooser.
 *
 * This has to live on the host because the answer is an absolute path and the
 * browser cannot produce one. `showDirectoryPicker()` returns a handle, and an
 * `<input webkitdirectory>` returns names relative to the picked root; neither
 * yields `E:/NCProject/NCC/jixieyuan/home`. The host's native chooser does, and
 * the operator is sitting at the host — this is a desktop app, so "open a dialog
 * on the server" and "open a dialog in front of me" are the same sentence.
 *
 * An empty `path` means the operator cancelled. That is a normal answer, not an
 * error: the caller leaves the field as it was.
 *
 * @param res - the response.
 * @param method - the HTTP method.
 * @param ctx - the host context, for the picker service.
 */
async function handlePickDirectory(res, method, ctx) {
    if (method !== 'POST') {
        sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
        return;
    }
    const picker = ctx.get('directoryPicker');
    const capability = picker?.capability();
    // Only `native` is driven here, and that is checked before `pick` is trusted. The
    // harness's other backend lists a directory in the browser instead of opening a
    // dialog, and a `pick` appearing on some future kind promises nothing about what
    // it returns — while this field has to hold an absolute path. Anything else is
    // left alone rather than guessed at, which is the harness's own rule for a shape
    // a consumer does not implement: hide the affordance, do not fail.
    const native = capability?.kind === 'native' ? capability : undefined;
    const pick = typeof native?.pick === 'function' ? native.pick.bind(native) : undefined;
    if (pick === undefined) {
        // Never echo `native` back without a usable `pick`: the panel shows its button
        // on that one word, so saying it here would offer a control that can never
        // answer. Any other kind is passed through as-is — it is the host's vocabulary,
        // and the panel reads everything but `native` as "type the path".
        //
        // 200 rather than an error status either way: "this host has no chooser" is an
        // answer the form acts on, not a failure it should render as one.
        const kind = capability === undefined || capability.kind === 'native'
            ? 'unavailable'
            : capability.kind;
        sendJson(res, 200, { kind });
        return;
    }
    // A native dialog outlives the request that opened it. If the operator closes
    // the panel while it is up, nothing is left waiting on the answer, so abort the
    // pick instead of leaving an orphaned OS window with no one to receive it.
    const abort = new AbortController();
    const onClose = () => { abort.abort(); };
    res.on('close', onClose);
    try {
        const path = await pick(abort.signal);
        // `native` literally rather than `native.kind`: reaching here is what makes it
        // native, and a kind that is not is not routed here at all.
        sendJson(res, 200, { kind: 'native', path });
    }
    finally {
        res.off('close', onClose);
    }
}
/**
 * Serve the `/yon/api/wiki` branch.
 *
 * Six routes, in two groups. The first group is registration: which vaults exist,
 * how big they are, and a rebuild. The second is what the vault's own contents
 * say — its health, a search, one page as a card, and who cites a missing entity.
 *
 * Search lives here rather than being left to the model's `wiki_lookup` because
 * the panel is where somebody looks something up for themselves. Reading a whole
 * page stays the model's business through `wiki_read`: the panel shows cards, and
 * a card is answerable from the index without opening a 70 KB file.
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
async function handleWiki(req, res, method, segments, url, wiki) {
    const tail = segments[1];
    /** The `vault` query parameter, or undefined when absent or empty. */
    const vaultParam = () => {
        const value = url.searchParams.get('vault');
        return value === null || value === '' ? undefined : value;
    };
    /** A `limit`-style query parameter, or undefined when absent or unparsable. */
    const numberParam = (name, cap) => {
        const raw = Number.parseInt(url.searchParams.get(name) ?? '', 10);
        if (!Number.isFinite(raw))
            return undefined;
        return Math.min(Math.max(raw, 1), cap);
    };
    // /yon/api/wiki
    if (tail === undefined) {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        sendJson(res, 200, { vaults: await wiki.list() });
        return;
    }
    // /yon/api/wiki/recent
    if (tail === 'recent') {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        sendJson(res, 200, { entries: await wiki.recent(vaultParam(), numberParam('limit', 200)) });
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
    // /yon/api/wiki/health
    if (tail === 'health') {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        const reports = await wiki.health(vaultParam(), numberParam('gaps', 200));
        sendJson(res, 200, { reports });
        return;
    }
    // /yon/api/wiki/search
    if (tail === 'search') {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        const answer = await wiki.lookup(url.searchParams.get('term') ?? '', vaultParam());
        const limit = numberParam('limit', 200) ?? 40;
        sendJson(res, 200, {
            term: answer.term,
            scanned: answer.scanned,
            hits: answer.hits.slice(0, limit).map(hit => ({
                page: hit.page,
                uri: hit.uri,
                name: hit.name,
                ...(hit.table === undefined ? {} : { table: hit.table }),
                ...(hit.app === undefined ? {} : { app: hit.app }),
                level: hit.level,
                ...(hit.fieldCount === undefined ? {} : { fieldCount: hit.fieldCount }),
                matchedBy: hit.matchedBy,
            })),
        });
        return;
    }
    // /yon/api/wiki/card
    if (tail === 'card') {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        sendJson(res, 200, { card: await wiki.card(url.searchParams.get('page') ?? '', vaultParam()) });
        return;
    }
    // /yon/api/wiki/citers
    if (tail === 'citers') {
        if (method !== 'GET') {
            sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
            return;
        }
        const uri = url.searchParams.get('uri') ?? '';
        sendJson(res, 200, { uri, pages: await wiki.citers(uri, vaultParam()) });
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
/**
 * Serve the `/yon/api/digest` branch.
 *
 * The digestion checker's own ledger, read-only. It answers what the checker has
 * been asked and how those answers went — which is exactly what a report shown
 * once inside a session cannot tell you afterwards.
 *
 * Nothing here writes: the ledger is appended by the tools themselves, and a
 * browser tab has no business adding a verdict it did not compute.
 *
 * @param res - the response.
 * @param method - the HTTP method.
 * @param segments - path segments after the prefix.
 * @param url - the parsed request URL, for the query parameters.
 * @param log - the ledger.
 */
async function handleDigest(res, method, segments, url, log) {
    if (method !== 'GET') {
        sendFailure(res, 405, 'method-not-allowed', `${method} is not allowed here`);
        return;
    }
    const num = (name, max) => {
        const raw = url.searchParams.get(name);
        if (raw === null || raw === '')
            return undefined;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0)
            return undefined;
        return Math.min(Math.floor(value), max);
    };
    const tail = segments[1];
    // /yon/api/digest/summary
    if (tail === 'summary') {
        const recent = num('recent', 200) ?? 50;
        const window = num('window', 1000) ?? 100;
        sendJson(res, 200, { summary: await log.summary(recent, window), path: digestLogPath() });
        return;
    }
    // /yon/api/digest/log  （也是这一段默认的取法）
    if (tail === 'log' || tail === undefined) {
        const limit = num('limit', 2000) ?? 200;
        sendJson(res, 200, { entries: await log.read(limit), path: digestLogPath() });
        return;
    }
    sendFailure(res, 404, 'not-found', `no route for ${method} /yon/api/digest/...`);
}
export function registerYonApi(ctx, service, skills, sources, wiki, digestLog, homes, meta) {
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
                    await handleWiki(req, res, method, segments, url, wiki);
                    return;
                }
                if (segments[0] === 'digest') {
                    await handleDigest(res, method, segments, url, digestLog);
                    return;
                }
                if (segments[0] === 'homes') {
                    await handleHomes(req, res, method, segments, homes, meta, url.searchParams);
                    return;
                }
                // A segment of its own, not `/homes/pick-directory`: `handleHomes` reads
                // `segments[1]` as an id, so that spelling would be a "no Home named
                // pick-directory" 404 long before any picker ran.
                if (segments[0] === 'pick-directory') {
                    await handlePickDirectory(res, method, ctx);
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
                        || error instanceof WikiError
                        || error instanceof HomeError) {
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
