/**
 * The data contract both halves share: the host serves these shapes over
 * `/yon/api`, and the browser half renders them. Keeping it in one module is
 * what stops the two sides from drifting.
 */
/** Every status, in display order (the client renders these as options). */
export const PROJECT_STATUSES = ['active', 'paused', 'done'];
/** Every product, in display order (the client renders these as options). */
export const HOME_PRODUCTS = ['ncc', 'bip'];
/**
 * The versions the operator can pick, per product line.
 *
 * **The value is the bare version** (`2111`), while the label carries the product
 * family (`NCC2111`). That split is not cosmetic: the value is what the skills side
 * keys on, and the files on disk settle it — `ncc_home_path.json`'s human-authored
 * sibling `path_config.json` writes its keys as `NCC_Home_2111` / `BIP_Home_V5`, and
 * the skill directory holds `class_index_2111.json`, `class_index_2312.json`,
 * `class_index_BIP_V5.json`. A registration stored as `NCC2111` would make the
 * mirror write `index_file: class_index_NCC2111.json` — a name that matches nothing,
 * so the index it points at would read as never built.
 *
 * NCC's six are the versions the operator named; `NC65` is the older product line,
 * which is why its label is not `NCC65`. BIP gets its own list because the products
 * version differently — the BIP home on this machine is keyed `V5` (a
 * `class_index_BIP_V5.json` exists beside it), and the NCC list has no way to say
 * that. Neither list is closed: the form offers an "其他" escape so a version that
 * ships later (or one this file has not heard of) is still registrable, and the
 * service deliberately does not validate against this table — the mirror merges
 * versions the panel never registered, so a whitelist there would be a lie about
 * what the rest of the system tolerates.
 */
export const HOME_VERSIONS = {
    ncc: [
        { value: '65', label: 'NC65' },
        { value: '1909', label: 'NCC1909' },
        { value: '2105', label: 'NCC2105' },
        { value: '2111', label: 'NCC2111' },
        { value: '2207', label: 'NCC2207' },
        { value: '2312', label: 'NCC2312' },
    ],
    bip: [
        { value: 'V5', label: 'BIP V5' },
    ],
};
/**
 * What a Home is called: its product line and its version, and nothing else.
 *
 * A name is not something to ask the operator for. Two NCC 2111 installations from
 * two different projects are interchangeable for everything this registration is
 * used for — the class index is keyed by version, and `ncc_home_find`/`ncc_home_read`
 * go where the registration points. A hand-typed name therefore only ever adds a
 * field to fill in and a way for two rows to look different while describing the
 * same thing. The service refuses a second registration of a version under the same
 * product line (see `home-service.ts`), so `(product, version)` is already the
 * identity of a row; the name is just that identity, spelled for a person.
 *
 * The spelling comes from the same table the version dropdown is drawn from, so the
 * name and the entry the operator picked there can never disagree. A version outside the
 * table — registered through the form's 「其他」 escape — is named the obvious way
 * (`NCC2405`), because a version that ships after this file was written must still
 * get a name.
 *
 * @param product - which product line.
 * @param version - the bare version, as stored (`2111`, `V5`).
 * @returns the display name.
 */
export function homeLabelOf(product, version) {
    const option = HOME_VERSIONS[product].find(candidate => candidate.value === version);
    if (option !== undefined)
        return option.label;
    return `${product === 'bip' ? 'BIP' : 'NCC'}${version}`;
}
/**
 * The directories a vault's entity pages may live in, in the order they are tried.
 *
 * Shared rather than owned by the reader, because the panel has to name them too:
 * a registration whose directory holds none of these is the one state where the
 * operator needs to be told what to create, and a list typed out again in a
 * translation string is a list that drifts from the one being searched.
 *
 * The Chinese names are not hypothetical — `yon-ncc-obsidian` was initialised with
 * `wiki/实体`, `wiki/来源`, `wiki/模块`, so a reader that only knows the English
 * convention silently finds nothing there.
 */
export const WIKI_ENTITY_DIRS = ['wiki/entities', 'wiki/实体', 'entities', '实体'];
/** 两种类型，按显示顺序。 */
export const ITERATION_KINDS = ['gap', 'improvement'];
/** 三档，按显示顺序（由重到轻）。 */
export const ITERATION_SEVERITIES = ['high', 'medium', 'low'];
/** 四种状态，按显示顺序。 */
export const ITERATION_STATUSES = ['open', 'accepted', 'fixed', 'dropped'];
/** 两个家族。 */
export const BROWSER_FAMILIES = ['chromium', 'firefox'];
/**
 * 调试端口的默认值与合法区间。
 *
 * 9222 是 Chromium 系那个约定俗成的端口，也是本仓 `preview/shots.mjs` 之外唯一一个
 * 使用者一眼认得的数字。下限取 1024 而不是 1：低于它的端口需要特权，而这件事没有
 * 任何需要特权的理由。三处共用一份——宿主校验、客户端当场拦、以及界面上的提示，
 * 各写一遍迟早就对不上。
 */
export const DEFAULT_BROWSER_PORT = 9222;
/** @see DEFAULT_BROWSER_PORT */
export const MIN_BROWSER_PORT = 1024;
/** @see DEFAULT_BROWSER_PORT */
export const MAX_BROWSER_PORT = 65535;
/**
 * Build the identity both halves address one connection by.
 * @param configKey - the key the connection sits under in the configuration.
 * @param env - the environment branch under it.
 * @returns the composite key.
 */
export function dataSourceKey(configKey, env) {
    return `${configKey}::${env}`;
}
/**
 * Split a composite key back into its parts.
 *
 * The split takes the LAST separator, so a project name that itself contains
 * `::` still round-trips.
 * @param key - the composite key.
 * @returns the parts, or undefined when the key carries no usable separator.
 */
export function splitDataSourceKey(key) {
    const at = key.lastIndexOf('::');
    if (at <= 0)
        return undefined;
    const env = key.slice(at + 2);
    if (env === '')
        return undefined;
    return { configKey: key.slice(0, at), env };
}
/** Where the API lives, shared by the host's route table and the client's calls. */
export const API_PREFIX = '/yon/api';
/** 全部状态，按面板上该显示的顺序。 */
export const REQUIREMENT_STATUSES = ['proposed', 'working', 'review', 'done', 'onHold', 'dropped'];
/** 三个目录，按面板上该显示的顺序：先是他给的，再是你产的。 */
export const REQUIREMENT_DIRS = ['user', 'generated', 'patches'];
