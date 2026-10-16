/**
 * The performance baseline: what a method measured last time, so this run has something
 * to be compared against.
 *
 * ## One line per run, in one file per method
 *
 * Appending is what makes the comparison honest. A single JSON document that every run
 * overwrites would leave "the baseline" meaning "whatever was measured last", with no way
 * to tell that a number moved in between — and the movement is the entire point of keeping
 * a baseline. A `.jsonl` per method keeps every run, costs nothing to append, and lets one
 * unreadable line be skipped instead of costing the whole history.
 *
 * ## Microseconds are stored exactly as measured
 *
 * Arthas reports costs in microseconds. Nothing is converted on the way in: a baseline
 * already rounded to milliseconds cannot show that a change was small, and "it got 0.4 ms
 * slower" is exactly the kind of answer this exists to give. Converting is a rendering
 * choice, so it happens at the rendering.
 *
 * ## A missing or corrupt file is not an error
 *
 * The first run of a method has no history, which is the normal case rather than a
 * failure, and a half-written line at the end of a file (the JVM was killed mid-append)
 * must not make the readable history before it unusable. Both read as "nothing to compare
 * with".
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { defaultArthasWorkDir } from "./arthas-store.js";
/** Where one method's history is kept. */
export function baselinePath(className, methodName) {
    // Class names carry dots and dollars; a method name may carry angle brackets (`<init>`).
    // Only characters that a file name cannot hold are replaced, so the file stays readable.
    const safe = `${className}#${methodName}`.replace(/[^A-Za-z0-9#._$-]/g, '_');
    return join(defaultArthasWorkDir(), 'baseline', `${safe}.jsonl`);
}
/**
 * Summarise one run's costs.
 *
 * @returns undefined when nothing was observed — an empty summary would be a baseline
 * that claims a method takes no time.
 */
export function summarise(costsUs, thread, at = Date.now()) {
    const first = costsUs[0];
    if (first === undefined)
        return undefined;
    let min = first;
    let max = first;
    let total = 0;
    for (const cost of costsUs) {
        if (cost < min)
            min = cost;
        if (cost > max)
            max = cost;
        total += cost;
    }
    return {
        at,
        hits: costsUs.length,
        costsUs: [...costsUs],
        avgUs: Math.round(total / costsUs.length),
        minUs: min,
        maxUs: max,
        thread,
    };
}
/**
 * Append one run to a history file, and report what the previous run measured.
 *
 * The path is an argument rather than derived here, so the function has no opinion about
 * where the operator's files live and can be tested against a temporary file.
 *
 * @returns undefined when this is the first run, so a caller can say "first measurement"
 * rather than inventing a comparison against nothing.
 */
export async function appendBaseline(path, sample) {
    // Read before appending: afterwards the last line IS this run.
    const previous = await readLastBaseline(path);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(sample)}\n`, 'utf8');
    if (previous === undefined || previous.avgUs === 0)
        return undefined;
    return {
        previous,
        delta: sample.avgUs / previous.avgUs - 1,
        // Guarded rather than assumed: a stored sample with a minimum of 0 would divide by zero,
        // and "no comparable minimum" has to read as 0% rather than as Infinity.
        minDelta: previous.minUs === 0 ? 0 : sample.minUs / previous.minUs - 1,
    };
}
/** The newest readable sample in one file, or undefined when there is none. */
export async function readLastBaseline(path) {
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (text === undefined)
        return undefined;
    const lines = text.split('\n');
    // Backwards, so a truncated final line costs only that line.
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (line === undefined || line.trim() === '')
            continue;
        const sample = asSample(line);
        if (sample !== undefined)
            return sample;
    }
    return undefined;
}
/** Read one stored line, or reject it as not a sample. */
function asSample(line) {
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch {
        return undefined;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return undefined;
    const entry = parsed;
    const avgUs = entry.avgUs;
    const hits = entry.hits;
    if (typeof avgUs !== 'number' || typeof hits !== 'number')
        return undefined;
    const costsUs = Array.isArray(entry.costsUs)
        ? entry.costsUs.filter((one) => typeof one === 'number')
        : [];
    return {
        at: typeof entry.at === 'number' ? entry.at : 0,
        hits,
        costsUs,
        avgUs,
        minUs: typeof entry.minUs === 'number' ? entry.minUs : avgUs,
        maxUs: typeof entry.maxUs === 'number' ? entry.maxUs : avgUs,
        thread: typeof entry.thread === 'string' ? entry.thread : '',
    };
}
