/**
 * NCC OpenAPI 调用：取 token、签名、发请求。
 *
 * ## 为什么在插件里自己实现，而不是挂 MCP
 *
 * 插件只能向宿主注册**工具**（`ctx.tools.register`），没有注册 MCP 的入口；MCP 写进
 * DSH 配置，换一台机器就要重配一次。把「取 token → 签名 → 调用」做成插件原生工具，
 * 能力随插件走：装好插件、把环境写进本文件管理的 JSON，就能用。
 *
 * ## 与 Python 版（NCC-API-POSTER）的关系
 *
 * 算法逐行对齐 `ncc-api-tester.py`：
 *   - `sha256Hex`        ← `sha256()`
 *   - `javaSha1prngBytes`← `java_sha1prng_bytes()`（模拟 Java `SecureRandom("SHA1PRNG")`）
 *   - `javaBase64`       ← `java_base64_encode()`（每 76 字符 CRLF + 末尾 CRLF）
 *   - `saltedSha256`     ← `salted_sha256()`（NCC >= 2005 的 token 签名）
 *   - `rsaEncrypt`       ← `rsa_encrypt()`（new=OAEP-SHA256，old=PKCS1v15，按密钥长度分块）
 *
 * 两处刻意的差异：
 *   1. Python 里 https 跳过证书校验（`CERT_NONE`），这里同样设 `rejectUnauthorized: false`，
 *      否则内网自签证书的环境会直接连不上；
 *   2. token 不做进程内缓存——工具调用是离散的，缓存省不了多少，却会让「改了 secret
 *      还在用旧 token」变成排查难题。
 */
import { createHash, createPublicKey, constants, publicEncrypt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** 本模块自己的错误：带一个可分辨的 code，方便工具层翻译成人话。 */
export class NccApiError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'NccApiError';
    }
}
/** 配置落点：与 `db_config.json`、`home_config.json` 同一目录，换机器时随插件家目录走。 */
export function nccApiConfigPath() {
    return join(homedir(), '.dsh', 'yon-panel', 'ncc_api_config.json');
}
/** 读配置。文件不存在时给空文档，而不是抛错——第一次用本来就没有。 */
export function loadNccApiConfig(path = nccApiConfigPath()) {
    if (!existsSync(path))
        return { active: '', envs: [] };
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        throw new NccApiError('bad-config', `配置文件不是合法 JSON：${path}`);
    }
    const doc = parsed;
    const active = typeof doc.active === 'string' ? doc.active : '';
    const envs = Array.isArray(doc.envs) ? doc.envs : [];
    return { active, envs };
}
/** 写配置（整份覆盖）。 */
export function saveNccApiConfig(doc, path = nccApiConfigPath()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(doc, null, 2), 'utf8');
}
/** 按名字找环境；没有就抛，消息里带上可选值。 */
export function findNccApiEnv(config, name) {
    const wanted = name.trim();
    const found = config.envs.find(env => env.name === wanted);
    if (found !== undefined)
        return found;
    if (config.envs.length === 0) {
        throw new NccApiError('no-env', `还没有配置任何环境（${nccApiConfigPath()}）。先用 ncc_api_save_env 存一条。`);
    }
    const names = config.envs.map(env => env.name).join('、');
    throw new NccApiError('unknown-env', `没有名为「${wanted}」的环境。已配置的是：${names}`);
}
// ---------------------------------------------------------------------------
// 签名与加密：与 Python 版逐行对齐
// ---------------------------------------------------------------------------
function sha256Hex(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
function sha1(...parts) {
    const hash = createHash('sha1');
    for (const part of parts)
        hash.update(part);
    return hash.digest();
}
/**
 * 模拟 Java `SecureRandom("SHA1PRNG")` 以 pubKey 为种子的前 16 字节。
 *
 * `state = SHA1(seed); output += SHA1(state); state = SHA1(state + seed)` —— 与
 * `java_sha1prng_bytes()` 完全一致。这一步是整条链路上最容易写错的地方，所以它单独成函数。
 */
function javaSha1prngBytes(seed) {
    let state = sha1(seed);
    const blocks = [];
    let length = 0;
    while (length < 16) {
        const block = sha1(state);
        blocks.push(block);
        length += block.length;
        state = sha1(state, seed);
    }
    return Buffer.concat(blocks).subarray(0, 16);
}
/** 模拟 `sun.misc.BASE64Encoder.encodeBuffer`：每 76 字符 CRLF 换行，末尾再补一个 CRLF。 */
function javaBase64(data) {
    const encoded = data.toString('base64');
    const lines = [];
    for (let index = 0; index < encoded.length; index += 76) {
        lines.push(encoded.slice(index, index + 76));
    }
    return `${lines.join('\r\n')}\r\n`;
}
/** NCC >= 2005 的 token 签名：`SHA256(data + base64(sha1prng(pubkey)))`。 */
export function saltedSha256(data, pubkey) {
    const salt = javaBase64(javaSha1prngBytes(Buffer.from(pubkey, 'utf8'))).replace(/[\r\n]/g, '');
    return sha256Hex(data + salt);
}
/** RSA 加密 client_secret：new 用 OAEP-SHA256，old 用 PKCS1v15；按密钥长度分块。 */
function rsaEncrypt(pubkey, plaintext, version) {
    const pem = `-----BEGIN PUBLIC KEY-----\n${pubkey.trim()}\n-----END PUBLIC KEY-----`;
    const key = createPublicKey(pem);
    const keyBytes = Math.floor((key.asymmetricKeyDetails?.modulusLength ?? 2048) / 8);
    const data = Buffer.from(plaintext, 'utf8');
    const blockSize = version === 'old' ? keyBytes - 11 : keyBytes - 66;
    if (blockSize <= 0) {
        throw new NccApiError('bad-pubkey', `公钥长度异常（${keyBytes} 字节），无法分块加密。`);
    }
    const chunks = [];
    for (let offset = 0; offset < data.length; offset += blockSize) {
        chunks.push(publicEncrypt(version === 'old'
            ? { key, padding: constants.RSA_PKCS1_PADDING }
            : { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, data.subarray(offset, offset + blockSize)));
    }
    return Buffer.concat(chunks).toString('base64');
}
/**
 * 发一个 POST。
 *
 * 单独实现而不用 `fetch`：这条链路要能对内网自签证书的 NCC 说“别校验证书”，
 * 也要能在连接卡住时自己超时，两件事在裸 `http`/`https` 上都只有一行。
 */
function postRaw(host, path, headers, body, timeoutMs) {
    return new Promise((resolve, reject) => {
        let target = host.trim();
        let secure = false;
        if (target.startsWith('https://')) {
            secure = true;
            target = target.slice('https://'.length);
        }
        else if (target.startsWith('http://')) {
            target = target.slice('http://'.length);
        }
        target = target.replace(/\/+$/, '');
        let hostname = target;
        let port = secure ? 443 : 80;
        const colon = target.lastIndexOf(':');
        if (colon > 0) {
            const maybePort = target.slice(colon + 1);
            if (/^\d+$/.test(maybePort)) {
                hostname = target.slice(0, colon);
                port = Number(maybePort);
            }
        }
        const payload = Buffer.from(body, 'utf8');
        const options = {
            hostname,
            port,
            path,
            method: 'POST',
            headers: { ...headers, 'Content-Length': String(payload.length) },
            ...(secure ? { rejectUnauthorized: false } : {}),
        };
        const onResponse = (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
            });
        };
        const req = secure ? httpsRequest(options, onResponse) : httpRequest(options, onResponse);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new NccApiError('timeout', `请求超时（${timeoutMs}ms）：${host}${path}`));
        });
        req.on('error', (error) => {
            reject(error instanceof NccApiError ? error : new NccApiError('network', `请求失败：${error.message}`));
        });
        req.end(payload);
    });
}
/** 步骤 1：用 client_id / secret / 公钥换 access_token。 */
export async function fetchNccApiToken(env, timeoutMs = 120_000) {
    const version = env.version === 'old' ? 'old' : 'new';
    const signature = version === 'old'
        ? sha256Hex(env.client_id + env.client_secret + env.pubkey)
        : saltedSha256(env.client_id + env.client_secret + env.pubkey, env.pubkey);
    const secret = rsaEncrypt(env.pubkey, env.client_secret, version)
        .replace(/\+/g, '%2B')
        .replace(/\//g, '%2F');
    const query = [
        'grant_type=client_credentials',
        `biz_center=${env.biz_center}`,
        `client_id=${env.client_id}`,
        `client_secret=${secret}`,
        `signature=${signature}`,
    ];
    if (env.dsname !== '')
        query.push(`dsname=${env.dsname}`);
    const answer = await postRaw(env.host, `/nccloud/opm/accesstoken?${query.join('&')}`, { 'Content-Type': 'application/x-www-form-urlencoded' }, '', timeoutMs);
    if (answer.status !== 200) {
        throw new NccApiError('token-http', `取 token 失败（HTTP ${answer.status}）：${answer.body.slice(0, 300)}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(answer.body);
    }
    catch {
        throw new NccApiError('token-json', `token 响应不是 JSON：${answer.body.slice(0, 200)}`);
    }
    const record = parsed;
    const token = typeof record.access_token === 'string'
        ? record.access_token
        : (typeof record.data?.access_token === 'string' ? record.data.access_token : '');
    if (token === '') {
        throw new NccApiError('token-missing', `响应里没有 access_token：${answer.body.slice(0, 300)}`);
    }
    const raw = record.expires_in ?? record.data?.expires_in;
    const expiresIn = typeof raw === 'number'
        ? raw
        : (typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 7200);
    return { token, expiresIn };
}
/** 步骤 2：带 token 调业务接口。 */
export async function callNccApi(env, apiPath, requestBody, timeoutMs = 120_000) {
    const started = Date.now();
    const { token } = await fetchNccApiToken(env, timeoutMs);
    const tokenCostMs = Date.now() - started;
    const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    const signature = sha256Hex(env.client_id + requestBody + env.pubkey);
    const answer = await postRaw(env.host, path, {
        'content-type': 'application/json;charset=utf-8',
        access_token: token,
        client_id: env.client_id,
        ucg_flag: 'y',
        signature,
    }, requestBody, timeoutMs);
    return { ...answer, tokenCostMs, apiPath: path, env: env.name };
}
