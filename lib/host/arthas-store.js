/**
 * Where the operator's Arthas installations are registered.
 *
 * The shape is `home-store.ts`'s: one JSON document under `~/.dsh/yon-panel/`,
 * read/write only, one promise chain for the writes, and a tmp-then-rename so a
 * crash mid-write cannot leave half a registration behind.
 *
 * ## Two kinds of entry, one list
 *
 * An entry is either **managed** (this plugin downloaded it into its own data
 * directory) or **registered** (the operator pointed at an Arthas they already
 * had). They differ only in who put the files there, and the tools treat them
 * identically — `managed` is kept so the panel can offer to delete the one it
 * owns without touching the one it does not.
 *
 * ## No seeding, and an unreadable file is reported
 *
 * Both follow `home-store.ts`, for the same reasons: a guessed Arthas is worse
 * than none (the model would attach with a jar of unknown provenance), and an
 * empty list looks exactly like "nothing registered yet", so a corrupted file
 * must say so rather than masquerade as an empty registration.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** Where the registrations live. */
export function defaultArthasStorePath() {
    return join(homedir(), '.dsh', 'yon-panel', 'arthas_config.json');
}
/** Where a managed download unpacks to. */
export function defaultArthasDistDir() {
    return join(homedir(), '.dsh', 'yon-panel', 'arthas', 'dist');
}
/** Where captured objects and observation records are written. */
export function defaultArthasWorkDir() {
    return join(homedir(), '.dsh', 'yon-panel', 'arthas', 'work');
}
/**
 * Read one entry, or reject it.
 *
 * A bad entry is skipped rather than failing the whole document — the operator
 * hand-edits this file, and losing every registration because one line lost its
 * quoting is worse than losing that line.
 */
function asArthas(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const entry = value;
    const id = entry.id;
    const root = entry.path;
    if (typeof id !== 'string' || id === '')
        return undefined;
    if (typeof root !== 'string' || root === '')
        return undefined;
    return {
        id,
        // Both separators accepted on input, forward slashes stored, so the document
        // reads the same on either platform and stays diffable.
        path: root.replace(/\\/g, '/'),
        version: typeof entry.version === 'string' ? entry.version : '',
        jdk: typeof entry.jdk === 'string' ? entry.jdk : '',
        isDefault: entry.isDefault === true,
        managed: entry.managed === true,
    };
}
/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export function createArthasStore(path = defaultArthasStorePath()) {
    // Writes only. Reads mutate nothing, and the service keeps its own line for
    // read-modify-write cycles, which is where a lost update could actually happen.
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        queue = next.catch(() => undefined);
        return next;
    };
    const writeNow = async (entries) => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, `${JSON.stringify({ arthas: entries }, null, 2)}\n`, 'utf8');
        await rename(temporary, path);
    };
    return {
        path,
        async read() {
            // The read and the parse are separate failures: ENOENT means "nothing
            // registered yet", anything else means the document is there but unusable.
            const text = await readFile(path, 'utf8').catch(() => undefined);
            if (text === undefined)
                return { path, arthas: [], exists: false };
            try {
                const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
                const parsed = JSON.parse(body);
                const raw = Array.isArray(parsed.arthas) ? parsed.arthas : [];
                const arthas = raw.map(asArthas).filter((one) => one !== undefined);
                return { path, arthas, exists: true };
            }
            catch {
                return {
                    path,
                    arthas: [],
                    exists: true,
                    error: `无法解析 ${path}：它不是合法的 JSON。请修正该文件，或在面板里删除后重建。`,
                };
            }
        },
        write(entries) {
            // The array is copied before it is queued: `write()` may be called with an
            // array the caller goes on to mutate, and the chain would then serialise a
            // value that changed while it waited.
            const snapshot = [...entries];
            return inLine(() => writeNow(snapshot));
        },
    };
}
