/**
 * The disk layer of the requirement ledger: the root, the per-entry directory, the
 * `entry.md` files, and the `index.json` that lists them.
 *
 * Shaped after `iteration-store.ts` on purpose — same constructor-takes-a-path
 * seam, same queue-then-write-atomically discipline, same habit of reporting a
 * broken document as a field rather than throwing. The differences are the ones
 * the requirement ledger forced:
 *
 * - **an entry is a directory, not a value.** `entry.md` plus the three folders the
 *   operator and the model fill in (`user/`, `generated/`, `patches/`). Creating an
 *   entry is therefore creating a tree, and the tree has to exist before the first
 *   attachment lands in it.
 * - **two documents, one of them a list.** `index.json` is the directory card: id,
 *   owning project, path, creation time — and nothing else. Names and statuses live
 *   in `entry.md`'s frontmatter, so there is exactly one place to change them. The
 *   cost is that listing reads every `entry.md`; the store pays it in `readEntry`
 *   and the service decides how often to ask.
 * - **ids become paths.** Unlike an iteration row, a requirement id is looked up by
 *   the model, so a hostile or mangled id would otherwise walk out of the root.
 *   {@link isSafeId} is the gate, and callers must pass it before {@link
 *   RequirementStore.entryPath}.
 * - **attachments are bytes, not text.** `writeArtifact` takes a string because the
 *   model only ever writes text into `generated/` and `patches/`; the operator's own
 *   files in `user/` arrive as bytes, may be 40 MB, and may not be text at all. So
 *   the byte-level operations take and return `Buffer`, and reads are capped at the
 *   head of the file rather than slurping it — a listing must never be able to pull
 *   half a gigabyte into memory just because someone dropped a video in there.
 *
 * The default root is `~/.dsh/yon-panel/requirements/`, beside `iteration.json`,
 * for the reason that file gives: this is the directory that survives reinstalling
 * the plugin, which matters a great deal more for a requirement's whole written
 * history than it does for one iteration report.
 */
import { mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { REQUIREMENT_DIRS } from "../shared/types.js";
import { parseEntry, serializeEntry, } from "./requirement-doc.js";
/** The three folders every entry carries. */
export const REQUIREMENT_SUBDIRS = REQUIREMENT_DIRS;
/** `~/.dsh/yon-panel/requirements/`, beside `iteration.json`. */
export function defaultRequirementRoot() {
    return join(homedir(), '.dsh', 'yon-panel', 'requirements');
}
/**
 * Whether an id may be turned into a path.
 *
 * Ids are host-generated (`rq-<date>-<random>`), so this only ever rejects two
 * things: a value the model made up, and a hand-edit gone wrong. Both should come
 * back as "no such entry" rather than as a path, which is what the service does
 * with a false here.
 */
export function isSafeId(id) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}
/** Longest file name an entry accepts, in characters. */
export const MAX_ARTIFACT_NAME = 120;
/**
 * Whether a name may become a file inside an entry.
 *
 * Rejects separators (a name is one file, not a path), the two dot names, the
 * characters Windows forbids, and a leading or trailing dot or space — Windows
 * strips those on write, and a name that changes on the way to disk is a name that
 * cannot be read back or deleted afterwards. This is a guard on the *name*, not on
 * the caller: the tool refuses an unsafe name with a message the model can act on,
 * and this is what stops a crafted one from escaping the entry directory.
 */
export function isSafeArtifactName(name) {
    if (name === '' || name.length > MAX_ARTIFACT_NAME)
        return false;
    if (name === '.' || name === '..')
        return false;
    if (/[\\/:*?"<>|]/.test(name))
        return false;
    if (/^[.\s]|[.\s]$/.test(name))
        return false;
    return !/[\u0000-\u001f]/.test(name);
}
export function createRequirementStore(root = defaultRequirementRoot()) {
    const indexPath = join(root, 'index.json');
    // One chain for the whole store. Reads never queue; every write goes through
    // here, so a burst of annotate calls cannot interleave two read-modify-write
    // cycles. `iteration-store.ts` does the same and for the same reason.
    let inLine = Promise.resolve();
    const queue = (work) => {
        const next = inLine.then(work, work);
        inLine = next.then(() => undefined, () => undefined);
        return next;
    };
    const dirPath = (id) => join(root, id);
    const entryPath = (id) => join(dirPath(id), 'entry.md');
    // The name is one segment by construction (`isSafeArtifactName` rejects every
    // separator), so the folder is exactly `dirname` of this and nothing deeper.
    const filePath = (id, dir, name) => join(root, id, dir, name);
    const writeAtomically = async (path, text) => {
        await mkdir(dirname(path), { recursive: true });
        // A sibling temporary then a rename, so a reader never sees a half-written
        // file and an interrupted write leaves nothing where the document was.
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, text, 'utf8');
        await rename(temporary, path);
    };
    const readIndex = async () => {
        let text;
        try {
            text = await readFile(indexPath, 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return { path: indexPath, records: [], exists: false, skipped: 0 };
            }
            return {
                path: indexPath,
                records: [],
                exists: true,
                skipped: 0,
                error: `无法读取台账 ${indexPath}：${messageOf(error)}`,
            };
        }
        let parsed;
        try {
            parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
        }
        catch {
            return {
                path: indexPath,
                records: [],
                exists: true,
                skipped: 0,
                error: `无法解析 ${indexPath}：它不是合法的 JSON。修好它或删掉它再试——在这一刻写下去会覆盖掉里面还认得出来的条目。`,
            };
        }
        if (!Array.isArray(parsed)) {
            return {
                path: indexPath,
                records: [],
                exists: true,
                skipped: 0,
                error: `无法使用 ${indexPath}：它应该是一个数组。`,
            };
        }
        const records = [];
        const seen = new Set();
        let skipped = 0;
        for (const row of parsed) {
            const record = recordOf(row);
            // A repeated id is a hand-edit mistake; keeping the later one would make the
            // list show one entry twice and both of them point at the same file.
            if (record === undefined || seen.has(record.id)) {
                skipped += 1;
                continue;
            }
            seen.add(record.id);
            records.push(record);
        }
        return { path: indexPath, records, exists: true, skipped };
    };
    /**
     * Where displaced versions wait, under each artifact folder.
     *
     * A dot-directory so a `find` or a file manager sorts it out of the way, and a
     * sub-directory rather than a sibling `foo.md.v2` so the folder the panel lists
     * holds only the files that are actually current.
     */
    const HISTORY_DIR = '.history';
    /** `<kind>/.history/<name>` — where the displaced versions of one artifact wait. */
    const historyDir = (id, kind, name) => join(dirPath(id), kind, HISTORY_DIR, name);
    /**
     * Put the current content of an artifact aside so the incoming write cannot be the
     * only copy left.
     *
     * Version numbers only ever grow and a number already in use is never reused, so
     * the history reads in order however often the file is rewritten. The body goes in
     * byte-for-byte: this is evidence of what was there, and re-encoding it would make
     * it evidence of something else.
     */
    const keepPrevious = async (id, kind, name) => {
        let previous;
        try {
            previous = await readFile(filePath(id, kind, name));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            throw error;
        }
        const dir = historyDir(id, kind, name);
        await mkdir(dir, { recursive: true });
        const taken = await readdir(dir);
        const numbers = taken
            .map(entry => Number.parseInt(entry, 10))
            .filter(value => Number.isFinite(value));
        const next = String((numbers.length === 0 ? 0 : Math.max(...numbers)) + 1);
        await writeFile(join(dir, next), previous);
    };
    return {
        root,
        indexPath,
        readIndex,
        writeIndex: records => queue(() => writeAtomically(indexPath, `${JSON.stringify(records, null, 2)}\n`)),
        dirPath,
        entryPath,
        readEntry: async (id) => {
            const path = entryPath(id);
            let text;
            try {
                text = await readFile(path, 'utf8');
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    return { id, path, exists: false };
                }
                return { id, path, exists: true, error: `无法读取 ${path}：${messageOf(error)}` };
            }
            const doc = parseEntry(text);
            if (doc === undefined) {
                return {
                    id,
                    path,
                    exists: true,
                    error: `${path} 不是一份能认出来的条目：它缺少 frontmatter 围栏，或围栏里没有 name。`,
                };
            }
            return { id, path, exists: true, doc };
        },
        writeEntry: (id, doc) => queue(() => writeAtomically(entryPath(id), serializeEntry(doc))),
        createEntryDir: async (id) => {
            for (const subdir of REQUIREMENT_SUBDIRS) {
                await mkdir(join(root, id, subdir), { recursive: true });
            }
        },
        filePath,
        statFiles: async (id, dir) => {
            let entries;
            try {
                entries = await readdir(join(dirPath(id), dir), { withFileTypes: true });
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return [];
                throw error;
            }
            const rows = [];
            for (const entry of entries) {
                if (!entry.isFile())
                    continue;
                try {
                    const info = await stat(filePath(id, dir, entry.name));
                    rows.push({
                        name: entry.name,
                        bytes: info.size,
                        modifiedAt: info.mtime.toISOString(),
                    });
                }
                catch {
                    // It was removed between the readdir and the stat. A file that is gone
                    // half a millisecond ago is not worth failing the whole listing over.
                }
            }
            return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        },
        readFileHead: async (id, dir, name, maxBytes) => {
            let handle;
            try {
                handle = await open(filePath(id, dir, name), 'r');
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return undefined;
                throw error;
            }
            try {
                // From the open handle rather than a second `stat` on the path: the path
                // could point at a different file by then, and then the size would describe
                // a file other than the one being read.
                const info = await handle.stat();
                const buffer = Buffer.allocUnsafe(Math.max(0, maxBytes));
                const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
                return {
                    name,
                    bytes: info.size,
                    modifiedAt: info.mtime.toISOString(),
                    data: buffer.subarray(0, bytesRead),
                };
            }
            finally {
                await handle.close();
            }
        },
        writeFileBytes: (id, dir, name, bytes) => queue(async () => {
            const path = filePath(id, dir, name);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, bytes);
            return { path, bytes: bytes.length };
        }),
        removeFile: async (id, dir, name) => {
            await unlink(filePath(id, dir, name));
        },
        artifactPath: (id, kind, name) => filePath(id, kind, name),
        writeArtifact: (id, kind, name, content) => queue(async () => {
            const path = filePath(id, kind, name);
            await mkdir(dirname(path), { recursive: true });
            // Before the bytes go in, the ones already there go aside. A first write has
            // nothing to keep, so a missing file is the ordinary case here.
            await keepPrevious(id, kind, name);
            await writeFile(path, content, 'utf8');
            return { path, bytes: Buffer.byteLength(content, 'utf8') };
        }),
        statHistory: async (id, kind, name) => {
            const dir = historyDir(id, kind, name);
            let entries;
            try {
                entries = await readdir(dir, { withFileTypes: true });
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return [];
                throw error;
            }
            const rows = [];
            for (const entry of entries) {
                if (!entry.isFile())
                    continue;
                const version = Number.parseInt(entry.name, 10);
                if (!Number.isFinite(version))
                    continue;
                try {
                    const info = await stat(join(dir, entry.name));
                    rows.push({ version, bytes: info.size, modifiedAt: info.mtime.toISOString() });
                }
                catch {
                    // Removed between the readdir and the stat; not worth failing a listing.
                }
            }
            return rows.sort((a, b) => a.version - b.version);
        },
        readHistoryHead: async (id, kind, name, version, maxBytes) => {
            let handle;
            try {
                handle = await open(join(historyDir(id, kind, name), String(version)), 'r');
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return undefined;
                throw error;
            }
            try {
                const info = await handle.stat();
                const buffer = Buffer.allocUnsafe(Math.max(0, maxBytes));
                const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
                return {
                    name,
                    bytes: info.size,
                    modifiedAt: info.mtime.toISOString(),
                    data: buffer.subarray(0, bytesRead),
                };
            }
            finally {
                await handle.close();
            }
        },
        removeEntry: async (id) => {
            await rm(join(root, id), { recursive: true, force: true });
        },
    };
}
/** Validate one index row, accepting the two fields that must be there. */
function recordOf(row) {
    if (typeof row !== 'object' || row === null)
        return undefined;
    const raw = row;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : '';
    if (!isSafeId(id) || projectId === '')
        return undefined;
    return {
        id,
        projectId,
        file: typeof raw.file === 'string' && raw.file.trim() !== '' ? raw.file : `${id}/entry.md`,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    };
}
/** A short, human-readable reason, since `unknown` will not stringify well. */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
