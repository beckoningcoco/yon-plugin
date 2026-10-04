/** The one platform this scanner knows how to look at. */
const SUPPORTED_PLATFORM = 'win32';
/** What `reg query` prints between a value's name and its data, in every locale. */
const REG_SZ = 'REG_SZ';
/**
 * Every browser this plugin knows how to launch.
 *
 * Order matters within a recipe: the first candidate that exists wins. The table is
 * exported so a spec can assert the id set and so the panel's vocabulary has one
 * source — renaming an id here without updating the store's rows would orphan every
 * profile directory on disk.
 */
export const BROWSER_RECIPES = [
    {
        id: 'chrome',
        family: 'chromium',
        product: 'Google Chrome',
        executable: 'chrome.exe',
        candidates: [
            { root: 'PROGRAMFILES', tail: 'Google/Chrome/Application/chrome.exe' },
            { root: 'ProgramFiles(x86)', tail: 'Google/Chrome/Application/chrome.exe' },
            { root: 'LOCALAPPDATA', tail: 'Google/Chrome/Application/chrome.exe' },
        ],
    },
    {
        id: 'edge',
        family: 'chromium',
        product: 'Microsoft Edge',
        executable: 'msedge.exe',
        candidates: [
            // Edge's 64-bit build installs under `Program Files (x86)`, which is not a
            // typo: Microsoft kept the 32-bit-era directory for compatibility.
            { root: 'ProgramFiles(x86)', tail: 'Microsoft/Edge/Application/msedge.exe' },
            { root: 'PROGRAMFILES', tail: 'Microsoft/Edge/Application/msedge.exe' },
            { root: 'LOCALAPPDATA', tail: 'Microsoft/Edge/Application/msedge.exe' },
        ],
    },
    {
        id: 'chromium',
        family: 'chromium',
        product: 'Chromium',
        executable: 'chromium.exe',
        candidates: [
            { root: 'LOCALAPPDATA', tail: 'Chromium/Application/chrome.exe' },
            { root: 'PROGRAMFILES', tail: 'Chromium/Application/chrome.exe' },
            { root: 'ProgramFiles(x86)', tail: 'Chromium/Application/chrome.exe' },
        ],
    },
    {
        id: 'firefox',
        family: 'firefox',
        product: 'Mozilla Firefox',
        executable: 'firefox.exe',
        candidates: [
            { root: 'PROGRAMFILES', tail: 'Mozilla Firefox/firefox.exe' },
            { root: 'ProgramFiles(x86)', tail: 'Mozilla Firefox/firefox.exe' },
            { root: 'LOCALAPPDATA', tail: 'Mozilla Firefox/firefox.exe' },
        ],
    },
];
/** Read an environment variable by name, ignoring the case of the name. */
function envValue(env, name) {
    const direct = env[name];
    if (direct !== undefined)
        return direct;
    // Windows variable names are case-insensitive, and Node hands back whatever casing
    // the process was given. `ProgramFiles(x86)` is spelled two ways in the wild.
    const wanted = name.toUpperCase();
    for (const [key, value] of Object.entries(env)) {
        if (key.toUpperCase() === wanted)
            return value;
    }
    return undefined;
}
/**
 * Turn a path into the spelling the rest of the feature uses.
 *
 * Everything the panel stores and prints is forward-slashed — the same normalisation
 * `home-service.ts` applies to a registered Home — so a path typed by hand and a path
 * from the registry can be compared as strings, and a scan can tell "the browser moved"
 * from "the browser is where it was".
 *
 * A root keeps its slash. Stripping it would turn `C:/` into `C:`, which on Windows
 * means "the current directory on C:" — a different path, and one that no longer names
 * a location at all.
 *
 * An **empty** value comes back empty, and that matters as much as the drive root does:
 * everything downstream spells "the operator has not chosen a directory" as
 * `toForwardSlashes(x) === ''`, and answering `'/'` there would turn a blank field into a
 * real location — a browser started with `--user-data-dir=/`, or a blank path that reads
 * as present-but-missing instead of as missing.
 * @param value - a path in whatever form it was read.
 * @returns the same path with single forward slashes and no trailing slash.
 */
export function toForwardSlashes(value) {
    const slashed = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const trimmed = slashed.replace(/\/+$/, '');
    if (trimmed === '')
        return '';
    return /^[a-z]:$/i.test(trimmed) ? `${trimmed}/` : trimmed;
}
/**
 * Build one candidate's absolute path.
 * @param env - the environment to read the root from.
 * @param candidate - the root variable and the tail below it.
 * @returns the path, or undefined when that variable is not set on this machine.
 */
function candidatePath(env, candidate) {
    const root = envValue(env, candidate.root);
    if (root === undefined || root.trim() === '')
        return undefined;
    return toForwardSlashes(`${root}/${candidate.tail}`);
}
/**
 * The three `App Paths` keys a browser may register itself under, in the order they
 * are tried.
 *
 * The machine-level keys come first because an install for everybody is the common
 * case; `WOW6432Node` is the 32-bit view of the same hive. Both are queried even
 * though measurement showed them answering the same path — a 32-bit-only install is
 * exactly the case where only one of them has the value, and a duplicate answer costs
 * nothing because the caller deduplicates by path.
 * @param executable - the executable name, e.g. `chrome.exe`.
 * @returns the key paths, most authoritative first.
 */
export function registryKeysFor(executable) {
    const tail = `Microsoft\\Windows\\CurrentVersion\\App Paths\\${executable}`;
    return [
        `HKLM\\SOFTWARE\\${tail}`,
        `HKLM\\SOFTWARE\\WOW6432Node\\${tail}`,
        `HKCU\\SOFTWARE\\${tail}`,
    ];
}
/**
 * Pull the executable path out of `reg query <key> /ve` output.
 *
 * Three deliberate refusals, each one a measured property of the command:
 *
 * - The value's **name** is not matched. On a localized Windows it comes back
 *   translated, so `(Default)` would be a rule that works on the developer's machine
 *   and nowhere else. `/ve` asks for that value by switch instead, and the name in the
 *   output is then ignored entirely.
 * - The value must look like an executable. The `/ve` switch makes a sibling `Path`
 *   value impossible, but a key whose default value is not an `.exe` is still not
 *   something to launch, and this is the check that says so.
 * - Quoted values are unwrapped rather than rejected: a path with spaces sometimes
 *   comes back quoted, and the quotes are not part of it.
 * @param stdout - the command's standard output, already decoded from the console's
 *   code page.
 * @returns the path, or undefined when the output does not contain one.
 */
export function parseRegistryDefault(stdout) {
    for (const line of stdout.split(/\r?\n/)) {
        const at = line.indexOf(REG_SZ);
        if (at < 0)
            continue;
        const raw = line.slice(at + REG_SZ.length).trim();
        const value = raw.startsWith('"') && raw.endsWith('"') && raw.length > 1
            ? raw.slice(1, -1).trim()
            : raw;
        if (!/\.exe$/i.test(value))
            continue;
        return value;
    }
    return undefined;
}
/**
 * Read a recipe's path from the registry.
 * @param executable - the key to ask for.
 * @param deps - the injected registry reader.
 * @returns the path, or undefined when no key has a usable default value. The caller
 *   still checks that the path exists: an uninstaller routinely leaves the key behind,
 *   and a registration pointing at a browser that is gone is worse than no
 *   registration — the panel would offer a launch button that always fails.
 */
async function fromRegistry(executable, deps) {
    try {
        const value = await deps.registryDefault(executable);
        if (value === undefined || value.trim() === '')
            return undefined;
        return toForwardSlashes(value);
    }
    catch {
        // A registry that cannot be read is a machine where the table is the only source.
        // That is a supported state, not a failure: the scan still answers.
        return undefined;
    }
}
/**
 * Find every browser this plugin can launch.
 *
 * The two sources are consulted in priority order — the default install locations
 * first, the registry only when none of them exists — and the result is deduplicated
 * by path. That deduplication is load-bearing rather than defensive: the registry
 * answers the same path the table already found, so without it Chrome and Edge would
 * each arrive twice and the dropdown would offer two rows for one browser.
 * @param environment - the platform and environment to scan.
 * @param deps - the injected filesystem and registry readers; there are no defaults,
 *   so a spec can never accidentally reach the real machine.
 * @returns the browsers found, in table order, and whether scanning is supported here.
 */
export async function scanBrowsers(environment, deps) {
    if (environment.platform !== SUPPORTED_PLATFORM) {
        // Said plainly instead of returning an empty list. An empty list on macOS would
        // read as "you have no browsers", which is a different and false statement, and
        // the panel hides its scan button on the strength of this flag.
        return {
            supported: false,
            browsers: [],
            note: `自动扫描目前只支持 Windows；当前系统是 ${environment.platform}。请在配置文件里手写浏览器路径。`,
        };
    }
    /** Paths already accounted for, lowercased: Windows paths are case-insensitive. */
    const claimed = new Set();
    const browsers = [];
    for (const recipe of BROWSER_RECIPES) {
        const candidates = recipe.candidates
            .map(candidate => candidatePath(environment.env, candidate))
            .filter((path) => path !== undefined);
        let found = candidates.find(path => deps.exists(path));
        if (found === undefined) {
            const registered = await fromRegistry(recipe.executable, deps);
            if (registered !== undefined && deps.exists(registered))
                found = registered;
        }
        if (found === undefined)
            continue;
        const key = found.toLowerCase();
        if (claimed.has(key))
            continue;
        claimed.add(key);
        browsers.push({ id: recipe.id, family: recipe.family, product: recipe.product, path: found });
    }
    return { supported: true, browsers };
}
