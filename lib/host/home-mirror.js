/**
 * Keeping the NCC/BIP skills' own Home registry in step with the panel's.
 *
 * Claude Code reaches the same installations through
 * `~/.claude/skills/yon-ncc-dev/ncc_home_path.json` — `build_index.py` writes it
 * (`:72-89`) and the skill's source-analysis workflow reads it. Registering a Home
 * in the panel and then having the other half of the toolchain not know about it
 * would be a fifth source of truth of exactly the kind this feature exists to
 * remove, so the save also writes that file.
 *
 * ## The three constraints, and why each one is a constraint
 *
 * **Merge, never replace.** A version the panel does not manage — one a person
 * added by running `build_index.py` themselves — is left exactly as it was. The
 * panel is authoritative for the versions it registers and for nothing else.
 *
 * **Never claim an index we did not build.** A new entry is written with
 * `indexed: false`. The panel does now build indexes — but into its own directory
 * (`~/.dsh/yon-panel/knowledge/`, see `class-index.ts:classIndexDir`), while this
 * `index_file` names a file beside the skill's own registry. They are two different
 * artifacts of two different writers, so an entry that claimed `indexed: true` here
 * would send the skills' workflow looking for a file that does not exist. The flag
 * is `build_index.py`'s to set and stays false until that script sets it.
 *
 * **No byte-order mark, and tolerate one on read.** `build_index.py:75` opens this
 * file with `encoding='utf-8'` and calls `json.load`, which raises on a BOM — so
 * writing one would break the other half on its next run. Reading strips one,
 * because an editor may have added it since.
 *
 * ## Withdrawal
 *
 * An entry is withdrawn when the panel stops registering a version **and** the
 * entry is marked `indexed: false`. That marker is only ever written by this
 * module: `build_index.py:86` writes `indexed: True` unconditionally, so a false
 * there means "registered from the panel and never indexed". An entry belonging to
 * an actual index is left alone even after its Home is removed from the panel —
 * the index file still exists, and dropping the entry would only make it
 * unreachable.
 *
 * `path_config.json` is deliberately not touched; see `docs/yon-home-design.md`.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** Where each product line's skills live, relative to `~/.claude/skills`. */
const SKILL_DIRS = {
    ncc: 'yon-ncc-dev',
    bip: 'yonyou-bip-dev',
};
/** The file each skills directory keeps its registry in. */
const SKILL_FILES = {
    ncc: 'ncc_home_path.json',
    bip: 'bip_home_path.json',
};
/** Where the skills tree lives, unless a caller says otherwise. */
function defaultSkillsRoot() {
    return join(homedir(), '.claude', 'skills');
}
/**
 * The skills-side file a product's registrations mirror into.
 *
 * @param product - which product line.
 * @param skillsRoot - the skills tree to write into; defaults to the operator's.
 * @returns the absolute path, whether or not it exists yet.
 */
export function mirrorPathOf(product, skillsRoot = defaultSkillsRoot()) {
    return join(skillsRoot, SKILL_DIRS[product], SKILL_FILES[product]);
}
/** A value that is a plain JSON object, or nothing. */
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
/**
 * Write the panel's registrations for one product into the skills' file.
 *
 * @param product - which product line, and therefore which file.
 * @param homes - every Home the panel registers for that product.
 * @param skillsRoot - the skills tree to write into; defaults to the operator's.
 *   Taking it as a parameter is the same seam the stores have: the operator's home
 *   directory is not a fixture a case can assert against, and the merge rules below
 *   are exactly what a case needs to assert.
 * @returns the path written, or the path it declined to write plus the reason.
 */
export async function mirrorHomes(product, homes, skillsRoot) {
    const path = skillsRoot === undefined ? mirrorPathOf(product) : mirrorPathOf(product, skillsRoot);
    const dir = dirname(path);
    try {
        if (!(await stat(dir)).isDirectory())
            throw new Error('not a directory');
    }
    catch {
        // No skills tree here. Writing one would create an empty directory tree that
        // looks like an installed skill set, so the mirror steps aside instead.
        return { path, warning: `技能目录不在，这次没有写回：${dir}` };
    }
    const text = await readFile(path, 'utf8').catch(() => undefined);
    if (text === undefined && homes.length === 0)
        return { path };
    let existing = {};
    if (text !== undefined) {
        try {
            const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
            existing = asRecord(JSON.parse(body));
        }
        catch {
            // The same stance the panel takes towards its own document: a file whose
            // contents cannot be read is not one to overwrite. It may hold entries
            // nobody can reconstruct.
            return { path, warning: `技能侧的文件不是合法 JSON，没有覆盖它：${path}` };
        }
    }
    const previous = asRecord(existing.versions);
    const versions = {};
    for (const [version, entry] of Object.entries(previous)) {
        if (asRecord(entry).indexed === false)
            continue;
        versions[version] = entry;
    }
    for (const home of homes) {
        const base = asRecord(previous[home.version]);
        versions[home.version] = {
            ...base,
            path: home.path,
            description: home.product === 'bip' ? 'BIP 旗舰版' : `NCC ${home.version}`,
            // The three fields this batch does not own. Present only when the entry did
            // not already carry them, so a run of `build_index.py` keeps its answer.
            ...base.index_file === undefined ? { index_file: `class_index_${home.version}.json` } : {},
            ...base.jdk_version === undefined ? { jdk_version: '?' } : {},
            ...base.indexed === undefined ? { indexed: false } : {},
        };
    }
    const previousDefault = typeof existing.default_version === 'string' ? existing.default_version : '';
    const chosen = homes.find(home => home.isDefault);
    const defaultVersion = chosen !== undefined
        ? chosen.version
        : previousDefault !== '' && versions[previousDefault] !== undefined
            ? previousDefault
            : homes[0]?.version ?? '';
    // Field order and indent match what `build_index.py` writes, so a diff of this
    // file only ever shows the registration that actually changed.
    const document = JSON.stringify({ default_version: defaultVersion, versions }, null, 2);
    await mkdir(dir, { recursive: true });
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, document, 'utf8');
    await rename(temporary, path);
    return { path };
}
