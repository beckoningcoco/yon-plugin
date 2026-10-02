/**
 * The class index: which jar holds which class, and the machinery to build one.
 *
 * ## Why this exists
 *
 * A YonBIP or NCC installation is tens of thousands of `.jar` files. Answering
 * "where is `nc.bs.impl.paybill.PaybillLinkImpl`" by hand means opening them one at
 * a time, and the answer is the precondition for reading the platform's own
 * implementation — which is what a model needs when the documentation runs out.
 *
 * ## Why not the bundled script
 *
 * `resources/knowledge/ncc/scripts/build_index.py` does this, and it was the
 * starting point. Two things stopped it being usable as shipped: it writes its
 * output relative to its own location, which meant the old skill layout, and one of
 * its two branches targets a sibling directory that no longer exists. Pointing it
 * somewhere else would mean editing a file whose only other purpose is to be the
 * readable original.
 *
 * ## Why nothing is decompressed
 *
 * A `.jar` is a zip. A zip ends with an End Of Central Directory record pointing at
 * the central directory, which lists every entry's name. A class index needs the
 * names and nothing else, so this reads two small regions per file — the tail and
 * the directory — instead of inflating tens of gigabytes of bytecode to throw all
 * of it away. On a real installation that is the difference between a couple of
 * minutes and an hour.
 *
 * ## Where an index lives
 *
 * Under the operator's DSH data directory (`~/.dsh/yon-panel/knowledge/`), never
 * inside the package: an index is tens of megabytes, it is derived, and the
 * package directory may be read-only after installation.
 */
import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
/** The signature that ends a zip: "PK\x05\x06". */
const EOCD_SIGNATURE = 0x06054b50;
/** The signature that starts a central directory entry: "PK\x01\x02". */
const CENTRAL_SIGNATURE = 0x02014b50;
/** How far back from the end the End Of Central Directory record may sit. */
const MAX_COMMENT = 0xffff;
/** Where indexes live, under the operator's DSH data directory. */
export function classIndexDir() {
    return join(homedir(), '.dsh', 'yon-panel', 'knowledge');
}
/** The file one version's index is stored in. */
export function classIndexPath(version) {
    const safe = version.replace(/[^A-Za-z0-9_-]/g, '_');
    return join(classIndexDir(), `class_index_${safe}.json`);
}
/**
 * List the class names one jar declares.
 *
 * @param jar - absolute path to the jar.
 * @returns fully-qualified class names, or an empty list when the file is not a
 * readable zip (a corrupt or truncated jar is skipped rather than failing the run).
 */
export async function classNamesOf(jar) {
    let handle;
    try {
        handle = await open(jar, 'r');
    }
    catch {
        return [];
    }
    try {
        const { size } = await handle.stat();
        if (size < 22)
            return [];
        // The tail, where the End Of Central Directory record sits. It may be followed
        // by a comment of up to 64 KiB, so the search starts that far back.
        const tailLength = Math.min(size, MAX_COMMENT + 22);
        const tail = Buffer.alloc(tailLength);
        await handle.read(tail, 0, tailLength, size - tailLength);
        let eocd = -1;
        for (let i = tail.length - 22; i >= 0; i--) {
            if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0)
            return [];
        const entryCount = tail.readUInt16LE(eocd + 10);
        const directorySize = tail.readUInt32LE(eocd + 12);
        const directoryOffset = tail.readUInt32LE(eocd + 16);
        if (directorySize === 0 || directoryOffset + directorySize > size)
            return [];
        const directory = Buffer.alloc(directorySize);
        await handle.read(directory, 0, directorySize, directoryOffset);
        const names = [];
        let at = 0;
        for (let seen = 0; seen < entryCount && at + 46 <= directory.length; seen++) {
            if (directory.readUInt32LE(at) !== CENTRAL_SIGNATURE)
                break;
            const nameLength = directory.readUInt16LE(at + 28);
            const extraLength = directory.readUInt16LE(at + 30);
            const commentLength = directory.readUInt16LE(at + 32);
            const start = at + 46;
            const name = directory.subarray(start, start + nameLength).toString('utf8');
            names.push(name);
            at = start + nameLength + extraLength + commentLength;
        }
        return names;
    }
    catch {
        return [];
    }
    finally {
        await handle.close();
    }
}
/**
 * Whether a path segment is a bundled JDK rather than platform code.
 *
 * Exported so `home-probe.ts` skips the same tree this indexer does. Two copies of
 * this list would drift, and the drift would show up as a Home reporting a jar
 * count that disagrees with the index built from it.
 */
export function isJdk(root) {
    return root.split(/[/\\]/).includes('ufjdk');
}
/**
 * Walk a home directory and index every class it holds.
 *
 * @param home - the NCC or BIP home directory to scan.
 * @param version - the label this index is stored under.
 * @param onProgress - called every so often, for a run that reports where it is.
 * @returns the index, ready to write.
 */
export async function buildClassIndex(home, version, onProgress) {
    const index = {};
    let jars = 0;
    let classes = 0;
    const walk = async (dir) => {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (isJdk(full))
                    continue;
                await walk(full);
                continue;
            }
            if (!entry.name.endsWith('.jar'))
                continue;
            jars++;
            const rel = relative(home, full).split(sep).join('/');
            for (const name of await classNamesOf(full)) {
                if (!name.endsWith('.class') || name.endsWith('module-info.class'))
                    continue;
                index[name.slice(0, -'.class'.length).replace(/\//g, '.')] = rel;
                classes++;
            }
            if (onProgress !== undefined && jars % 200 === 0) {
                onProgress({ jars, classes, current: rel });
            }
        }
    };
    await walk(home);
    return {
        version,
        home,
        builtAt: new Date().toISOString(),
        totalJars: jars,
        totalClasses: classes,
        index,
    };
}
/**
 * Write an index where {@link classIndexPath} will look for it.
 * @param built - the index to store.
 * @returns the absolute path written.
 */
export async function writeClassIndex(built) {
    const target = classIndexPath(built.version);
    await mkdir(classIndexDir(), { recursive: true });
    // Compact rather than pretty: this is a lookup table of hundreds of thousands of
    // entries, and a single line parses faster than one that is mostly whitespace.
    await writeFile(target, JSON.stringify(built), 'utf8');
    return target;
}
/**
 * Read one stored index.
 * @param version - the label it was stored under.
 * @returns the index, or undefined when none is stored.
 */
export async function readClassIndex(version) {
    try {
        const raw = await readFile(classIndexPath(version), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object')
            return undefined;
        const candidate = parsed;
        if (typeof candidate.version !== 'string' || candidate.index === null || typeof candidate.index !== 'object') {
            return undefined;
        }
        return candidate;
    }
    catch {
        return undefined;
    }
}
/**
 * Every index stored, newest first.
 *
 * Listed by reading each file's header fields rather than parsing it whole: a
 * listing should stay cheap even when several indexes of tens of megabytes each
 * are sitting there.
 *
 * @returns the stored indexes.
 */
export async function listClassIndexes() {
    const dir = classIndexDir();
    let names;
    try {
        names = await readdir(dir);
    }
    catch {
        return [];
    }
    const found = [];
    for (const name of names) {
        if (!name.startsWith('class_index_') || !name.endsWith('.json'))
            continue;
        const full = join(dir, name);
        try {
            const info = await stat(full);
            const raw = await readFile(full, 'utf8');
            const parsed = JSON.parse(raw);
            found.push({
                version: typeof parsed.version === 'string' ? parsed.version : name,
                home: typeof parsed.home === 'string' ? parsed.home : '',
                builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : info.mtime.toISOString(),
                totalJars: typeof parsed.totalJars === 'number' ? parsed.totalJars : 0,
                totalClasses: typeof parsed.totalClasses === 'number' ? parsed.totalClasses : 0,
                bytes: info.size,
            });
        }
        catch {
            // An index this process cannot read is not one it can list.
        }
    }
    return found.sort((a, b) => b.builtAt.localeCompare(a.builtAt));
}
/**
 * Search one index by class name.
 *
 * Ranked so a caller asking for `PaybillLinkImpl` sees the class whose simple name
 * is exactly that before every class that merely contains it — the common case is a
 * name copied out of a stack trace, and the fully-qualified name is what is missing.
 *
 * @param index - the index to search.
 * @param term - a simple class name, a fully-qualified one, or a fragment.
 * @param limit - how many hits to return at most.
 * @returns the matches, strongest first.
 */
export function searchClassIndex(index, term, limit) {
    const needle = term.toLowerCase();
    const exact = [];
    const bySimple = [];
    const contains = [];
    for (const [className, jar] of Object.entries(index.index)) {
        const lower = className.toLowerCase();
        if (lower === needle) {
            exact.push({ className, jar });
            continue;
        }
        const simple = className.slice(className.lastIndexOf('.') + 1);
        if (simple.toLowerCase() === needle) {
            bySimple.push({ className, jar });
            continue;
        }
        if (contains.length < limit && lower.includes(needle)) {
            contains.push({ className, jar });
        }
    }
    return [...exact, ...bySimple, ...contains].slice(0, limit);
}
