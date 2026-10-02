/**
 * Reading inside a Home: containment, encoding, and the credential mask.
 *
 * Three unrelated rules live here because all three are about *the bytes of a file
 * the operator pointed us at*, and the service above them is about *which files
 * exist to point at*. Splitting them by rule would put the containment check in a
 * file that cannot see the root and the root in a file that cannot see the check.
 *
 * ## Containment
 *
 * `knowledge-tools.ts:125-152` resolves its targets the same way, and it is right
 * to be simpler there: that root is the plugin's own `resources/knowledge/`, which
 * nobody types. This root is a path the operator typed into a text box, so two
 * things are added:
 *
 * - **`realpath` on both sides.** A symlink or an NTFS junction inside the Home
 *   can point anywhere; comparing the textual paths would let `home/modules/link`
 *   resolve to `C:\Windows`. Both ends are canonicalised first, and the check is
 *   repeated on the resolved target.
 * - **Case-insensitive compare on Windows**, where `E:\Home` and `e:\home` are the
 *   same directory and a case-sensitive prefix test would call a real file outside.
 *
 * The relation itself is `path.relative()`, not a `startsWith(root + sep)`: a
 * sibling directory named `home-old` shares the prefix `home` and would pass a
 * string test while sitting outside the root.
 *
 * ## Encoding
 *
 * NCC sources are GBK on disk (measured: 286 of the first 400 `.java` files under
 * a real `modules/`), `.bmf` metadata is UTF-8 XML, and `prop.xml` declares
 * GB2312. So the rule is *whole-file* probing, never a prefix sample: `prop.xml`
 * is ASCII for its first few hundred bytes and Chinese further in, and a reader
 * that judged by the head would decide "UTF-8" and then mangle it. The order is
 *
 * 1. an explicit `encoding` from the caller,
 * 2. a byte-order mark,
 * 3. an `encoding="…"` declaration, honoured only inside an XML prologue,
 * 4. strict whole-file UTF-8, falling back to GB18030.
 *
 * ## Credentials
 *
 * A Home holds plaintext secrets — `resources/config.properties` carries
 * `client_secret`, `ierp/bin/prop.xml` carries a database password. The rule is
 * that the **key name and every non-secret value come back unchanged, and only
 * the value of a secret key is masked**: an operator debugging a connection still
 * needs to see the host, the port and the user. This is the same stance
 * `datasource-catalog.ts` takes when it keeps the password out of `DataSourceView`
 * and leaves `hasPassword` behind.
 */
import { open, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isJdk } from "./class-index.js";
/** Most a single read pulls off disk, before any line or character window. */
const MAX_READ_BYTES = 1_000_000;
/** Most characters one read returns; a line boundary is always respected. */
const MAX_READ_CHARS = 60_000;
/** Matches `ncc_home_find` returns when the caller does not say. */
const DEFAULT_FIND_LIMIT = 50;
/** Ceiling on `limit`, so one call cannot fill the conversation. */
const MAX_FIND_LIMIT = 200;
/** Directory entries one find visits before it gives up. */
const FIND_WALK_CAP = 200_000;
/** How deep a find descends. */
const FIND_DEPTH = 12;
/** The first N bytes examined for a NUL, which is what makes a file binary. */
const BINARY_HEAD = 64;
/**
 * One failure a Home call reports.
 *
 * Defined here rather than beside the service because this is the module that
 * raises most of them, and the service imports this one — the reverse would be a
 * cycle for a value, which ESM resolves but readers do not.
 */
export class HomeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'HomeError';
    }
}
/**
 * Whether `target` is `root` or sits inside it.
 * @param root - the canonical root, already resolved.
 * @param target - the canonical target, already resolved.
 * @returns true when the target is contained.
 */
function inside(root, target) {
    const [a, b] = process.platform === 'win32'
        ? [root.toLowerCase(), target.toLowerCase()]
        : [root, target];
    const rel = path.relative(a, b);
    return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
/**
 * Resolve one caller-supplied path inside a Home, or refuse it.
 *
 * @param root - the registered Home root.
 * @param requested - a relative path, or an absolute one that is inside the root.
 * @returns the canonical absolute path, which exists and is inside the root.
 * @throws HomeError `not-found` when the root or the target cannot be resolved,
 *   `invalid-input` when the target escapes the root.
 */
export async function resolveInside(root, requested) {
    const trimmed = requested.trim();
    if (trimmed === '')
        throw new HomeError('invalid-input', 'path 不能为空');
    const realRoot = await realpath(root).catch(() => undefined);
    if (realRoot === undefined) {
        throw new HomeError('not-found', `登记的这个 Home 目录读不出来，先确认它还在：${root}`);
    }
    // A leading separator is dropped so `/modules/x.java` reads as a path inside the
    // Home rather than as an absolute path on the current drive. A Windows-style
    // absolute path keeps its drive letter and is then tested like any other.
    const target = path.resolve(realRoot, trimmed.replace(/^[/\\]+/, ''));
    if (!inside(realRoot, target)) {
        throw new HomeError('invalid-input', `路径必须在这个 Home 之内：${requested}`);
    }
    const real = await realpath(target).catch(() => undefined);
    if (real === undefined)
        throw new HomeError('not-found', `Home 里没有这个文件：${requested}`);
    // Checked again on the resolved path: the first test saw the typed path, and a
    // symlink inside the Home is exactly the case where the two differ.
    if (!inside(realRoot, real)) {
        throw new HomeError('invalid-input', `路径必须在这个 Home 之内：${requested}`);
    }
    return real;
}
/** Whether a buffer looks like binary data. */
export function isBinary(bytes) {
    return bytes.subarray(0, BINARY_HEAD).includes(0);
}
/** Encodings this reader will name, keyed by a normalised spelling. */
const KNOWN_ENCODINGS = new Map([
    ['utf8', 'utf-8'],
    ['gbk', 'gb18030'],
    ['gb2312', 'gb18030'],
    ['gb18030', 'gb18030'],
    ['utf16le', 'utf-16le'],
    ['utf16be', 'utf-16be'],
    ['big5', 'big5'],
    ['latin1', 'iso-8859-1'],
    ['iso88591', 'iso-8859-1'],
]);
/** Lower-case and strip the separators people write in encoding names. */
function normalise(name) {
    return name.trim().toLowerCase().replace(/[_\s-]/g, '');
}
/** The encoding a byte-order mark announces, if there is one. */
function bomEncoding(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
        return 'utf-8';
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE)
        return 'utf-16le';
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF)
        return 'utf-16be';
    return undefined;
}
/**
 * The encoding an XML prologue declares, if this file has one.
 *
 * Only honoured when the file actually starts with a prologue. A `.java` file may
 * mention `encoding="UTF-8"` in a licence header or a comment, and treating that
 * as a declaration would decode a GBK file as UTF-8 — the exact failure the
 * whole-file probe exists to avoid, reintroduced from the other side.
 */
export function declaredEncoding(head) {
    const text = head.toString('latin1').trimStart();
    if (!text.startsWith('<?xml'))
        return undefined;
    const match = /^<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/i.exec(text);
    return match?.[1];
}
/** Decode as UTF-8 only if every byte is valid UTF-8; the whole file, not a prefix. */
function strictUtf8(bytes) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        return undefined;
    }
}
/**
 * Turn a file's bytes into text.
 *
 * @param bytes - the whole file (or the first `MAX_READ_BYTES` of it).
 * @param override - an explicit encoding from the caller, which wins over every
 *   guess.
 * @returns the text and the encoding used, so the answer can say which.
 * @throws HomeError `invalid-input` when `override` names an encoding this reader
 *   does not know — silently falling back would hide a typo behind mojibake.
 */
export function decodeText(bytes, override) {
    if (override !== undefined && override.trim() !== '') {
        const name = KNOWN_ENCODINGS.get(normalise(override));
        if (name === undefined) {
            throw new HomeError('invalid-input', `不认识的编码「${override}」；可用：utf-8、gb18030、utf-16le、utf-16be、big5、iso-8859-1。`);
        }
        return { text: new TextDecoder(name).decode(bytes), encoding: name };
    }
    const bom = bomEncoding(bytes);
    if (bom !== undefined)
        return { text: new TextDecoder(bom).decode(bytes), encoding: bom };
    const declared = declaredEncoding(bytes.subarray(0, 400));
    if (declared !== undefined) {
        const name = KNOWN_ENCODINGS.get(normalise(declared));
        if (name !== undefined) {
            // A declaration is honoured, not trusted: one that says UTF-8 over GBK bytes
            // is a real thing in the wild, and the strict pass catches it.
            if (name === 'utf-8') {
                const text = strictUtf8(bytes);
                if (text !== undefined)
                    return { text, encoding: 'utf-8' };
            }
            else {
                return { text: new TextDecoder(name).decode(bytes), encoding: name };
            }
        }
    }
    const utf8 = strictUtf8(bytes);
    if (utf8 !== undefined)
        return { text: utf8, encoding: 'utf-8' };
    return { text: new TextDecoder('gb18030').decode(bytes), encoding: 'gb18030' };
}
/**
 * Names whose value is a secret.
 *
 * Compared against the last dot/dash/underscore-separated word and against the
 * name with separators removed, so `password`, `db.password`, `client_secret` and
 * `clientSecret` all land while `keyType` and `pubKey` do not — the second of
 * those is a certificate's public half, and masking it would hide a value the
 * operator needs when wiring a signature.
 */
const SECRET_NAMES = new Set([
    'key',
    'password',
    'passwd',
    'pwd',
    'pass',
    'secret',
    'token',
    'privatekey',
    'accesskey',
    'clientsecret',
    'appsecret',
    'dbpassword',
    'userpassword',
]);
/** Whether a key name holds a secret. */
function isSecretName(name) {
    const parts = name.toLowerCase().split(/[^a-z0-9]+/).filter(part => part !== '');
    if (parts.length === 0)
        return false;
    return SECRET_NAMES.has(parts[parts.length - 1] ?? '') || SECRET_NAMES.has(parts.join(''));
}
/**
 * Replace the values of secret keys with a length hint.
 *
 * @param text - the document about to be handed to the model.
 * @returns the text with secret values masked, and the names that were hit.
 */
export function redactSecrets(text) {
    const masked = new Set();
    const mask = (name, value) => {
        if (value === '' || !isSecretName(name))
            return value;
        masked.add(name);
        return `***（${value.length} 字符）`;
    };
    // `key = value` and `key: value`, the .properties and YAML shapes.
    let out = text.replace(/^([ \t]*)([A-Za-z0-9_.-]+)([ \t]*[=:][ \t]*)(.*)$/gm, (_whole, indent, name, separator, value) => {
        const cr = value.endsWith('\r') ? '\r' : '';
        const body = cr === '' ? value : value.slice(0, -1);
        return `${indent}${name}${separator}${mask(name, body)}${cr}`;
    });
    // `<property name="db.password" value="…"/>`: the key is in another attribute.
    out = out.replace(/(\bname\s*=\s*["'])([^"']*)(["'][^>]*?\bvalue\s*=\s*["'])([^"']*)(["'])/gi, (_whole, before, name, between, value, after) => `${before}${name}${between}${mask(name, value)}${after}`);
    // `"client_secret": "…"` and `key="…"`: the key names itself.
    out = out.replace(/(["']?)([A-Za-z0-9_.-]+)\1(\s*[:=]\s*)(["'])([^"']*)\4/g, (_whole, open, name, separator, quote, value) => `${open}${name}${open}${separator}${quote}${mask(name, value)}${quote}`);
    return { text: out, masked: [...masked] };
}
/** Clamp a caller's limit into the range one answer may carry. */
export function clampFindLimit(limit) {
    if (typeof limit !== 'number' || !Number.isFinite(limit))
        return DEFAULT_FIND_LIMIT;
    return Math.max(1, Math.min(MAX_FIND_LIMIT, Math.floor(limit)));
}
/**
 * Find files under a Home by name and extension.
 *
 * @param root - the registered Home root.
 * @param query - what to match, where to start, and how many to return.
 * @returns matches with Home-relative paths, plus how much was walked.
 * @throws HomeError when `under` escapes the root or does not exist.
 */
export async function findIn(root, query) {
    const start = query.under === undefined || query.under.trim() === ''
        ? await resolveInside(root, '.')
        : await resolveInside(root, query.under);
    const startInfo = await stat(start).catch(() => undefined);
    if (startInfo === undefined || !startInfo.isDirectory()) {
        throw new HomeError('invalid-input', `under 得是 Home 里的一个目录：${query.under ?? ''}`);
    }
    const realRoot = await realpath(root).catch(() => root);
    const needle = query.name === undefined || query.name.trim() === ''
        ? undefined
        : query.name.trim().toLowerCase();
    const rawExt = query.ext === undefined ? '' : query.ext.trim().toLowerCase();
    const suffix = rawExt === '' ? undefined : rawExt.startsWith('.') ? rawExt : `.${rawExt}`;
    const matches = [];
    let scanned = 0;
    let capped = false;
    const walk = async (dir, depth) => {
        if (capped || depth > FIND_DEPTH || matches.length >= query.limit)
            return;
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
            if (capped || matches.length >= query.limit)
                return;
            scanned += 1;
            if (scanned > FIND_WALK_CAP) {
                capped = true;
                return;
            }
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (isJdk(full))
                    continue;
                await walk(full, depth + 1);
                continue;
            }
            const lowered = entry.name.toLowerCase();
            if (needle !== undefined && !lowered.includes(needle))
                continue;
            if (suffix !== undefined && !lowered.endsWith(suffix))
                continue;
            const info = await stat(full).catch(() => undefined);
            matches.push({
                rel: path.relative(realRoot, full).split(path.sep).join('/'),
                size: info?.size ?? 0,
            });
        }
    };
    await walk(start, 0);
    return { home: root, matches, scanned, capped };
}
/**
 * Read one text file inside a Home.
 *
 * @param root - the registered Home root.
 * @param requested - a path relative to it.
 * @param options - an encoding override and an optional 1-based line window.
 * @returns the decoded text, the encoding, the line window actually returned, and
 *   which secret keys were masked.
 * @throws HomeError `not-found`, `invalid-input` (escape, directory, binary,
 *   unknown encoding, empty line range).
 */
export async function readIn(root, requested, options = {}) {
    const target = await resolveInside(root, requested);
    const info = await stat(target).catch(() => undefined);
    if (info === undefined)
        throw new HomeError('not-found', `读不到这个文件：${requested}`);
    if (info.isDirectory()) {
        throw new HomeError('invalid-input', `${requested} 是个目录；要找文件用 ncc_home_find。`);
    }
    const wanted = Math.min(info.size, MAX_READ_BYTES);
    const handle = await open(target, 'r');
    let bytes;
    try {
        const buffer = Buffer.alloc(wanted);
        const { bytesRead } = await handle.read(buffer, 0, wanted, 0);
        bytes = buffer.subarray(0, bytesRead);
    }
    finally {
        await handle.close();
    }
    if (isBinary(bytes)) {
        throw new HomeError('invalid-input', `${requested} 是二进制文件（头部有 NUL 字节）。要找类用 ncc_class_search；jar 里的源码这一批读不到。`);
    }
    const decoded = decodeText(bytes, options.encoding);
    const lines = decoded.text.split('\n');
    const totalLines = lines.length;
    const from = Math.max(1, Math.floor(options.from ?? 1));
    const to = Math.min(totalLines, Math.floor(options.to ?? totalLines));
    if (from > totalLines || from > to) {
        throw new HomeError('invalid-input', `lines 的范围是空的：这个文件一共 ${totalLines} 行。`);
    }
    // Accumulated line by line rather than sliced by character, so the answer never
    // ends mid-line and the window it reports is the window it returned.
    const picked = [];
    let chars = 0;
    let cut = false;
    for (let index = from - 1; index < to; index += 1) {
        const line = lines[index] ?? '';
        if (chars + line.length + 1 > MAX_READ_CHARS) {
            cut = true;
            break;
        }
        picked.push(line);
        chars += line.length + 1;
    }
    const shownTo = from - 1 + picked.length;
    const redacted = redactSecrets(picked.join('\n'));
    const notes = [];
    if (info.size > wanted) {
        notes.push(`文件共 ${info.size} 字节，只读了前 ${wanted} 字节。`);
    }
    if (cut) {
        notes.push(`输出到 ${MAX_READ_CHARS} 字符为止，用 lines 参数取后面的部分。`);
    }
    const text = notes.length === 0
        ? redacted.text
        : `${redacted.text}\n\n…（${notes.join('')}）`;
    return {
        home: root,
        rel: requested,
        encoding: decoded.encoding,
        bytes: info.size,
        totalLines,
        from,
        to: shownTo,
        // "Truncated" covers both the file and the output, because from the caller's
        // side they are the same fact: there is more file than this answer.
        truncated: notes.length > 0,
        masked: redacted.masked,
        text,
    };
}
