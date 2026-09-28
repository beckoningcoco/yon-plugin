/**
 * Post-build self-check.
 *
 * A malformed client bundle is not a local problem: the DSH web boot scans every
 * enabled Loader entry, and a bad `dsh.client` declaration or a missing bundle
 * fails the whole page at activation. This script asserts the contract before
 * anything is published, so the failure surfaces here instead of on somebody
 * else's machine.
 *
 * The assertions read the artifact semantically rather than byte-for-byte: the
 * bundler is free to lay the handoff wrapper out over several lines.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []

/** Assert one condition, recording a message instead of throwing. */
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const id = manifest.name

// The manifests the harness Loader and the module scan read.
check(manifest.type === 'module', 'package.json: "type" must be "module"')
check(manifest.dsh?.client?.platform === 'web', 'package.json: dsh.client.platform must be "web"')
check(manifest.dsh?.bundle?.patch !== undefined, 'package.json: dsh.bundle.patch is required for `dsh plugin add`')
check(
  manifest.exports?.['./client']?.default === './lib/client.js',
  'package.json: exports["./client"] must resolve to ./lib/client.js',
)
const patchPath = join(root, (manifest.dsh?.bundle?.patch ?? '').replace(/^\.\//, ''))
check(existsSync(patchPath), `package.json: dsh.bundle.patch target is missing (${manifest.dsh?.bundle?.patch})`)
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8')
  check(patch.includes(`name: ${id}`), `cordis.patch.yml: no insert row names ${id}`)
}

// The host half: a Loader row needs an importable module exporting `apply`.
const hostPath = join(root, 'lib/index.js')
check(existsSync(hostPath), 'lib/index.js is missing (tsdown must emit index.js, not index.mjs)')
if (existsSync(hostPath)) {
  const host = readFileSync(hostPath, 'utf8')
  check(
    /export\s*\{[^}]*\bapply\b/.test(host) || /export function apply/.test(host),
    'lib/index.js: the host half must export apply',
  )
}

// The browser half: the loader's closure-factory artifact.
const clientPath = join(root, 'lib/client.js')
check(existsSync(clientPath), 'lib/client.js is missing')
if (existsSync(clientPath)) {
  const client = readFileSync(clientPath, 'utf8')
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
  check(/exports\.apply\s*=/.test(client),
    'lib/client.js: the plugin entry does not export apply')
  check(/exports\.inject\s*=/.test(client),
    'lib/client.js: the plugin entry does not export inject')
  check(client.includes('require("react/jsx-runtime")') || client.includes('require("react")'),
    'lib/client.js: React must stay a module-table require, not be bundled in')
  check(client.includes('require("@deepseek-ai/dsh-client-ui-primitives")'),
    'lib/client.js: ui-primitives must stay a module-table require')
  check(!client.includes('jsx-runtime.production'),
    'lib/client.js: React appears to be bundled in')
  check(client.includes('data-plugin-css'),
    'lib/client.js: plugin-owned style injection is missing')
  check(client.includes('--dsw-'),
    'lib/client.js: the injected styles carry no theme token (CSS not compiled?)')
  check(client.length < 200_000,
    `lib/client.js looks too large for this plugin (${client.length} bytes)`)
}

// The declared types, so a consumer's build face can read the client contract.
check(
  existsSync(join(root, 'lib/types/client/index.d.ts')),
  'lib/types/client/index.d.ts is missing (tsc -p tsconfig.lib.json)',
)

if (failures.length > 0) {
  console.error(`${id}: artifact check FAILED`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`${id}: artifact ok — host half, client factory, style injection, externals, types, patch layer`)
