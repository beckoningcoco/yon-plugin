/**
 * Where the knowledge base vaults are registered.
 *
 * Same reasoning as `datasource-store.ts`: the vault list belongs to the
 * operator, not to the package, so it lives under the DSH data directory where
 * the plugin can write it and the operator can read, edit or copy it. A file
 * inside the plugin directory would be replaced by the next upgrade.
 *
 * A first run seeds itself from {@link guessVaults} rather than starting empty,
 * because the vaults sit in well-known places on a machine that has them and a
 * knowledge base the operator has to locate by hand before it answers anything
 * is one they never configure. The seed is written once and is theirs to correct
 * afterwards — this store never re-guesses over an existing file.
 *
 * Writes replace the whole document through a temporary sibling and a rename, so
 * a reader never sees a half-written file, and read-modify-write rounds are
 * serialised in-process.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { guessVaults } from "./wiki-index.js";
/** The default document location, under the operator's DSH data directory. */
export function defaultWikiStorePath() {
    return join(homedir(), '.dsh', 'yon-panel', 'wiki_config.json');
}
/** One vault entry from an untrusted document, or undefined when it is not one. */
function asVault(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const entry = value;
    const { id, label, path: root } = entry;
    if (typeof id !== 'string' || id === '')
        return undefined;
    if (typeof root !== 'string' || root === '')
        return undefined;
    return { id, label: typeof label === 'string' && label !== '' ? label : root, path: root };
}
/**
 * Build the store over one path.
 * @param path - where the document lives; defaults to {@link defaultWikiStorePath}.
 * @returns the store.
 */
export function createWikiStore(path = defaultWikiStorePath()) {
    /** Serialises read-modify-write rounds so two writers cannot interleave. */
    let queue = Promise.resolve();
    const inLine = (work) => {
        const next = queue.then(work, work);
        // The chain must survive a rejection, or one failed write would poison
        // every later one.
        queue = next.catch(() => undefined);
        return next;
    };
    /**
     * Write the list, unqueued.
     *
     * Deliberately not `store.write`: a seeding read runs INSIDE the queue, so
     * re-entering it would wait on the read that is waiting on the write.
     * @param vaults - the whole list to store.
     */
    const writeNow = async (vaults) => {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        const document = { vaults };
        await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
        // Same directory, so the rename is atomic on every platform this runs on.
        await rename(temporary, path);
    };
    return {
        path,
        async read() {
            const existing = await readFile(path, 'utf8').catch(() => undefined);
            if (existing !== undefined) {
                try {
                    // A BOM would make JSON.parse throw on an otherwise valid document.
                    const parsed = JSON.parse(existing.replace(/^\uFEFF/, ''));
                    const raw = Array.isArray(parsed.vaults) ? parsed.vaults : [];
                    const vaults = raw.map(asVault).filter((v) => v !== undefined);
                    return { vaults, seeded: false };
                }
                catch (cause) {
                    // An unreadable document is left alone rather than overwritten: it is
                    // the operator's file, and a typo in it should not cost them the list.
                    // The reason travels with the empty list so the one caller that *would*
                    // overwrite it — a save, which reads the list and writes it back — can
                    // refuse instead. Reading is unchanged by this: a list that cannot be
                    // read still reports nothing registered.
                    return {
                        vaults: [],
                        seeded: false,
                        error: `登记文件读不出来（${path}）：${cause instanceof Error ? cause.message : String(cause)}`
                            + ' 这个文件没有被改动，修好后重试。',
                    };
                }
            }
            const guessed = guessVaults();
            await inLine(() => writeNow(guessed));
            return { vaults: guessed, seeded: guessed.length > 0 };
        },
        write(vaults) {
            return inLine(() => writeNow(vaults));
        },
    };
}
