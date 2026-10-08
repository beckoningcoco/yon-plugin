/**
 * Post-build self-check.
 *
 * A malformed artifact is not a local problem. The host half is imported by the
 * DSH process at activation, and the client half is scanned by the web boot:
 * either one failing badly takes the whole GUI down. This script asserts the
 * contract before anything is published, so the failure surfaces here instead of
 * on somebody else's machine.
 *
 * The assertions read the artifacts semantically rather than byte-for-byte: the
 * compiler and the bundler are free to lay their wrappers out differently.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, matchesGlob } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []

/** Assert one condition, recording a message instead of throwing. */
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const read = (relative) => readFileSync(join(root, relative), 'utf8')
const manifest = JSON.parse(read('package.json'))
const id = manifest.name

/** Relative specifiers must have been rewritten to `.js`; a `.ts` one never resolves. */
const UNREWRITTEN_IMPORT = /(?:from|import)\s*\(?\s*["'][^"']*\.ts["']/

// ── the manifests the harness Loader and the module scan read ────────────────
check(manifest.type === 'module', 'package.json: "type" must be "module"')
check(manifest.dsh?.client?.platform === 'web', 'package.json: dsh.client.platform must be "web"')
check(manifest.dsh?.bundle?.patch !== undefined, 'package.json: dsh.bundle.patch is required for `dsh plugin add`')
check(
  manifest.exports?.['./client']?.default === './lib/client.js',
  'package.json: exports["./client"] must resolve to ./lib/client.js',
)
check(
  manifest.exports?.['.']?.default === './lib/index.js',
  'package.json: exports["."] must resolve to ./lib/index.js',
)
const patchPath = join(root, (manifest.dsh?.bundle?.patch ?? '').replace(/^\.\//, ''))
check(existsSync(patchPath), `package.json: dsh.bundle.patch target is missing (${manifest.dsh?.bundle?.patch})`)
if (existsSync(patchPath)) {
  check(read((manifest.dsh?.bundle?.patch ?? '').replace(/^\.\//, '')).includes(`name: ${id}`),
    `cordis.patch.yml: no insert row names ${id}`)
}

// ── the host half: plain ESM the DSH process imports ─────────────────────────
const hostPath = 'lib/index.js'
check(existsSync(join(root, hostPath)), 'lib/index.js is missing (tsc -p tsconfig.lib.json)')
if (existsSync(join(root, hostPath))) {
  const host = read(hostPath)
  check(/export (async )?function apply/.test(host), 'lib/index.js: the host half must export apply')
  check(/export const inject/.test(host), 'lib/index.js: the host half must export inject')
  check(!UNREWRITTEN_IMPORT.test(host), 'lib/index.js: a relative import still points at .ts')
}

// The domain module is where the harness library is imported; it must stay a real
// import (a bundled copy would give the host a second storage-domain instance).
const domainPath = 'lib/host/domain.js'
check(existsSync(join(root, domainPath)), `${domainPath} is missing`)
if (existsSync(join(root, domainPath))) {
  const domain = read(domainPath)
  check(
    /from\s*["']@deepseek-ai\/dsh-storage-domain["']/.test(domain),
    `${domainPath}: the storage-domain import must stay external, not be bundled`,
  )
  check(!UNREWRITTEN_IMPORT.test(domain), `${domainPath}: a relative import still points at .ts`)
}
for (const sibling of [
  'lib/host/service.js', 'lib/host/http.js', 'lib/host/skill-domain.js',
  'lib/host/skill-registry.js', 'lib/shared/types.js',
]) {
  check(existsSync(join(root, sibling)), `${sibling} is missing`)
}

// ── the bundled skills: inlined at build time, so a bad generate ships blind ─
// A plugin whose skill catalog failed to generate would install cleanly and
// offer nothing — the kind of failure nobody notices until they need it.
const catalogPath = 'lib/host/skill-catalog.generated.js'
check(existsSync(join(root, catalogPath)), `${catalogPath} is missing (run scripts/build-skills.mjs)`)
if (existsSync(join(root, catalogPath))) {
  const catalog = read(catalogPath)
  const bundles = existsSync(join(root, 'skills'))
    ? readdirSync(join(root, 'skills'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
    : []
  check(bundles.length > 0, 'skills/: the plugin ships no skill bundle')
  for (const name of bundles) {
    check(catalog.includes(name), `${catalogPath}: the bundled skill "${name}" is absent from the catalog`)
  }
}

// ── the browser half: the loader's closure-factory artifact ──────────────────
/**
 * Characters of the browser half's own sources — the files this bundle is made
 * of, and therefore the only size it can honestly be held against.
 *
 * Counted as a string rather than as bytes, because that is the unit the
 * artifact is measured in below; the sources carry Chinese copy, and counting
 * those in bytes on one side and characters on the other would inflate the
 * bound by whatever share of the bundle is not ASCII.
 */
const clientSourceDir = join(root, 'src', 'client')
const clientSourceLength = existsSync(clientSourceDir)
  ? readdirSync(clientSourceDir, { recursive: true })
    .filter(name => /\.(?:ts|tsx|css)$/.test(name))
    .reduce((total, name) => total + readFileSync(join(clientSourceDir, name), 'utf8').length, 0)
  : 0

const clientPath = 'lib/client.js'
check(existsSync(join(root, clientPath)), 'lib/client.js is missing')
if (existsSync(join(root, clientPath))) {
  const client = read(clientPath)
  const head = client.slice(0, 500)
  check(/window\.__ModuleLoader__\.load\(\{/.test(head),
    'lib/client.js: the loader handoff wrapper is missing from the artifact head')
  check(new RegExp(`id:\\s*${JSON.stringify(id)}`).test(head),
    'lib/client.js: the handoff names a different package id')
  check(/factory:\s*\(require\)\s*=>/.test(head),
    'lib/client.js: the artifact head declares no closure factory')
  check(client.includes('var module = { exports: {} };'),
    'lib/client.js: the CJS shim intro is missing')
  check(client.includes('return module.exports;'),
    'lib/client.js: the factory never returns its exports')
  check(/exports\.apply\s*=/.test(client), 'lib/client.js: the plugin entry does not export apply')
  check(/exports\.inject\s*=/.test(client), 'lib/client.js: the plugin entry does not export inject')
  check(
    client.includes('require("react/jsx-runtime")') || client.includes('require("react")'),
    'lib/client.js: React must stay a module-table require, not be bundled in',
  )
  check(
    client.includes('require("@deepseek-ai/dsh-client-ui-primitives")'),
    'lib/client.js: ui-primitives must stay a module-table require',
  )
  check(!client.includes('jsx-runtime.production'), 'lib/client.js: React appears to be bundled in')
  check(client.includes('data-plugin-css'), 'lib/client.js: plugin-owned style injection is missing')
  check(client.includes('--dsw-'), 'lib/client.js: the injected styles carry no theme token (CSS not compiled?)')
  // Regression net. Eleven stylesheets ship in this bundle and nine of them are
  // named `panel.module.css`; while the tag id was their basename, all nine
  // claimed one id, so the injector's `querySelector` guard treated them as
  // already-present and dropped them: 11 injection points, 3 distinct ids, and
  // a half-styled screen inside a real host (found 2026-10-08 from a user
  // screenshot, not from these checks — hence this one). The ids must be
  // pairwise distinct for every stylesheet's styles to reach the document.
  const tagIds = [...client.matchAll(/tagId\$?\d* = "([^"]+)"/g)].map(match => match[1])
  check(tagIds.length > 0, 'lib/client.js: no style tag ids found — the injector template changed shape')
  const colliding = [...new Set(tagIds.filter((tagId, index) => tagIds.indexOf(tagId) !== index))]
  check(
    colliding.length === 0,
    `lib/client.js: style tag ids collide (${colliding.join(', ')}), so those stylesheets are silently `
    + 'skipped at runtime — name them by path below src/, not by basename',
  )
  // A net for code inlined from outside this tree — not a budget for how big
  // the UI is allowed to get. It is a multiple of the source the bundle is built
  // from rather than a fixed ceiling, so adding a surface raises the source and
  // the bound together: the previous fixed 200000 was reached by the fifth
  // panel, which is to say it went red for the plugin having grown rather than
  // for anything being wrong, and a gate that fires for the wrong reason gets
  // its number raised without being read.
  //
  // Measured 2026-09-29 at five panels: 242208 from 254540 (0.95x) — minification
  // puts the artifact just under the source it came from. React and
  // ui-primitives stay external by name above; this only has to catch a
  // stranger, so the multiple leaves room for the ratio drifting with the mix of
  // markup and styles rather than pinning it to today's figure.
  const SOURCE_MULTIPLE = 2
  check(
    clientSourceLength > 0,
    'src/client: no sources found, so the client bundle has no bound to be checked against',
  )
  if (clientSourceLength > 0) {
    const ratio = client.length / clientSourceLength
    check(
      ratio < SOURCE_MULTIPLE,
      `lib/client.js is ${client.length} chars for ${clientSourceLength} chars of source `
      + `(${ratio.toFixed(2)}x, bound ${SOURCE_MULTIPLE}x) — something outside src/client may be inlined`,
    )
  }
}

// ── the release artifact: what may leave this machine ────────────────────────
/**
 * `files` is a whitelist, so the artifact is exactly what it names — which makes the
 * patterns themselves the only thing standing between this working copy and somebody
 * else's tarball. One tree here must never be named by one:
 *
 *   `.browser-profile/`  the debug browser's user-data directory. The browser panel
 *   creates it at the plugin root (`browser-service.ts` defaults to `hostRoot`), and a
 *   profile directory is a login: cookies, session storage, whatever the operator
 *   signed into while the panel held the browser open.
 *
 * The assertion is "no pattern would cover a path in there" rather than "no such file
 * exists": the first is what a release does, and a machine that has never launched a
 * debug browser has no profile directory for the second to notice.
 *
 * The probe carries a dot-less twin on purpose. Glob's `**` does not descend into a
 * dot-prefixed segment — measured on node v24.16.0: a `**` pattern matches
 * `browser-profile/x` but not `.browser-profile/x` — so a future catch-all pattern,
 * which is the failure this gate exists for, would slip past a check that only ever
 * asked about the dotted path.
 */
const PROFILE_PROBES = [
  '.browser-profile',
  '.browser-profile/chrome/Default/Cookies',
  'browser-profile/chrome/Default/Cookies',
]

/** `path.matchesGlob` needs node >= 22. A gate that cannot run has to say so, not pass. */
check(typeof matchesGlob === 'function',
  `node ${process.versions.node} has no path.matchesGlob, so the "files" whitelist cannot be checked`)
check(Array.isArray(manifest.files) && manifest.files.length > 0,
  'package.json: "files" must be a non-empty whitelist, or every file in the tree is publishable')
if (typeof matchesGlob === 'function' && Array.isArray(manifest.files)) {
  // The matcher is proved to work before its silence is trusted: with a broken matcher
  // every probe below reports "no pattern covers it", which reads exactly like a pass.
  check(matchesGlob('lib/index.js', 'lib/index.js'),
    'path.matchesGlob does not match a path against itself, so no probe below means anything')
  for (const pattern of manifest.files) {
    for (const probe of PROFILE_PROBES) {
      check(!matchesGlob(probe, pattern),
        `package.json: files pattern ${JSON.stringify(pattern)} covers ${probe} — `
        + 'a debug browser profile (cookies, login state) would ship with the artifact')
    }
  }
}

// ── the declared types ───────────────────────────────────────────────────────
check(existsSync(join(root, 'lib/types/index.d.ts')), 'lib/types/index.d.ts is missing')
check(existsSync(join(root, 'lib/types/client/index.d.ts')), 'lib/types/client/index.d.ts is missing')

if (failures.length > 0) {
  console.error(`${id}: artifact check FAILED`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`${id}: artifact ok — host ESM, client factory, externals, style injection, types, patch layer`)
