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
import { join } from 'node:path'

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
  check(client.length < 200_000, `lib/client.js looks too large for this plugin (${client.length} bytes)`)
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
