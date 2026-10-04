/**
 * Live acceptance run for the installation-directory feature, against a **real**
 * NCC/BIP home on this machine.
 *
 * The unit suites use scratch directories built to order, which is what makes them
 * fast and deterministic — and also means none of them has ever read a real Home.
 * The three claims that only a real directory can settle are:
 *
 *   1. the probe classifies a real installation and counts what is there;
 *   2. `ncc_home_read` decodes real `modules/&#42;/classes/&#42;.java` — measured 286/400
 *      of them are GBK, so a reader that stayed on UTF-8 would produce mojibake;
 *   3. the values of the real credentials in `resources/config.properties` do not
 *      come back in the text.
 *
 * **It writes nothing outside a scratch directory**, and that is on purpose: the
 * registration is seeded straight into a throwaway store and the mirror is pointed
 * at a throwaway skills tree, because this is a check and not a registration. Going
 * through `service.save()` would have mirrored into the operator's real
 * `~/.claude/skills` — a check that edits the toolchain it is checking is worse than
 * no check. Registering a Home for real stays a deliberate act in the panel.
 *
 * Usage: node scripts/verify-home-live.mjs <home-path> [version] [product]
 */
import { Context } from '@deepseek-ai/cordis'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHomeStore } from '../lib/host/home-store.js'
import { createYonHomesService } from '../lib/host/home-service.js'
import { registerYonHomeTools } from '../lib/host/home-tools.js'
import { mirrorHomes, mirrorPathOf } from '../lib/host/home-mirror.js'
import { probeHome } from '../lib/host/home-probe.js'
import { homeLabelOf } from '../lib/shared/types.js'

const [, , homePath, version = '2111', product = 'ncc'] = process.argv
if (homePath === undefined) {
  console.error('usage: node scripts/verify-home-live.mjs <home-path> [version] [product]')
  process.exit(2)
}

const failures = []
const notes = []

/** Record a claim's outcome. */
const check = (condition, message) => {
  if (condition) notes.push(`ok   ${message}`)
  else failures.push(message)
}

const scratch = mkdtempSync(join(tmpdir(), 'yon-home-live-'))
const store = createHomeStore(join(scratch, 'home_config.json'))

// The skills tree the mirror writes into: a scratch one holding the product's own
// directory, so the merge path runs without touching the operator's.
const skillsRoot = join(scratch, 'skills')
const skillDir = join(skillsRoot, product === 'bip' ? 'yonyou-bip-dev' : 'ncc-asset-hawk')
mkdirSync(skillDir, { recursive: true })
// A version the panel does not manage, to prove the mirror merges rather than
// replaces. `build_index.py` writes entries shaped like this one.
const foreign = '2099'
writeFileSync(mirrorPathOf(product, skillsRoot), JSON.stringify({
  default_version: foreign,
  versions: { [foreign]: { path: 'E:/elsewhere', description: 'somebody else', indexed: true } },
}, null, 2), 'utf8')

console.log(`home    ${homePath}`)
console.log(`version ${version} · product ${product}`)
console.log(`scratch ${scratch}\n`)

// ── 1. the probe, on a real installation ───────────────────────────────────────
const probeStarted = Date.now()
const profile = await probeHome(homePath)
const probeMs = Date.now() - probeStarted
// The id and the name a real registration would have: the panel derives both from
// the product line and the version, writes no name at all, and this seeds the store
// the way the service would have left it.
const id = `${product}-${version}`

console.log('probeHome')
console.log(`  shape    ${profile.shape}`)
console.log(`  modules  ${profile.modules}${profile.capped ? ' (capped)' : ''}`)
console.log(`  jars     ${profile.jars}${profile.capped ? ' (capped)' : ''}`)
console.log(`  took     ${probeMs} ms`)
console.log(`  present  ${profile.present.join(', ') || '(none)'}`)
for (const key of profile.keys) {
  console.log(`  ${key.exists ? '✓' : '·'} ${key.role.padEnd(10)} ${key.rel}`)
}
for (const warning of profile.warnings) console.log(`  ! ${warning}`)
console.log()

check(profile.shape === (product === 'bip' ? 'bip-home' : 'ncc-home'),
  `the probe called it ${profile.shape}`)
check(profile.modules > 100, `modules/ has ${profile.modules} subdirectories`)
check(profile.jars > 100, `counted ${profile.jars} jars without opening one`)
check(profile.keys.some(key => key.rel === 'modules/*/classes' && key.exists),
  'the key-path table found modules/*/classes')

// The cap is a design decision, not a defect, and this is the check that got it
// backwards the first time. Measured on this machine: the tree holds 462 483
// entries and 7 941 jars, so a full walk costs 24–32 s, while the capped probe
// finishes in ~3.4 s and answers "≥237 modules, ≥681 jars". Asserting `!capped`
// asserted something a real Home contradicts — a fresh installation this large
// *is* capped, and the honest answer is the lower bound. What must be checked is
// that the lower bound is *labelled* as one, which is done below on the rendered
// list text (where the `≥` and the explaining warning live).
notes.push(`ok   the probe answered in ${probeMs} ms with capped=${profile.capped}`
  + ' (a Home this size exceeds the 60 000-entry cap; "at least" is the honest answer)')

await store.write([{
  id, path: homePath.replace(/\\/g, '/'), product, version,
  isDefault: true, profile,
}])

/** Mount the tools the way the host does, so the calls below are the real ones. */
const ctx = new Context()
const registered = []
ctx.provide('tools', {
  register(definition) {
    registered.push(definition)
    return () => {}
  },
})
const handle = createYonHomesService(store)
registerYonHomeTools(ctx, handle.service)

const tool = (name) => {
  const found = registered.find(candidate => candidate.name === name)
  if (found === undefined) throw new Error(`no tool ${name}`)
  return found
}
const call = async (name, args) => await tool(name).execute(args, {
  name, arguments: args, callId: 'live-1', signal: new AbortController().signal, agent: {},
})
const render = async (name, args) => {
  const value = await call(name, args)
  return tool(name).output.render(args, value).map(block => block.text).join('\n')
}

// ── 2. the model's view of the list ────────────────────────────────────────────
const listText = await render('ncc_home_list', {})
console.log('ncc_home_list')
console.log(`  ${listText.split('\n').join('\n  ')}\n`)
check(listText.includes(id), `the list hands out the id ${id}`)
// The name is derived rather than stored, so this is the one place a registration
// reaches the model through it: the panel never sends a name, and the model must
// still be handed something readable.
check(listText.includes(homeLabelOf(product, version)),
  `the list calls it ${homeLabelOf(product, version)}`)
check(listText.includes(String(profile.modules)), 'the list repeats the module count')
check(!listText.includes(scratch.replace(/\\/g, '/')), 'the list names the Home, not the scratch store')

// The other half of the cap story: a number the model will read as exact is a
// number the model will reason from. When the walk stopped early, both counts have
// to be prefixed and the warning that explains the prefix has to be in the same
// answer — otherwise the model reads "681 jars" as a fact.
if (profile.capped) {
  check(listText.includes(`≥${profile.modules}`), 'a capped module count is shown as ≥, not as a fact')
  check(listText.includes(`≥${profile.jars}`), 'a capped jar count is shown as ≥, not as a fact')
  check(listText.includes('超过 60000 上限'), 'the answer carries the warning that explains the ≥')
}

// ── 3. finding and reading real sources ────────────────────────────────────────
const found = await call('ncc_home_find', { home: id, ext: 'java', limit: 12 })
console.log(`ncc_home_find ext=java -> ${found.matches.length} matches (scanned ${found.scanned})`)
check(found.matches.length > 0, 'found .java sources inside the real Home')
check(found.matches.every(match => !match.rel.includes(':')),
  'every match is Home-relative, so it can be handed straight back to read')

/** How many files decoded each way, over the sample above. */
const encodings = new Map()
let mojibake = 0
let cjk = 0
let sample
for (const match of found.matches) {
  let value
  try {
    value = await call('ncc_home_read', { home: id, path: match.rel })
  } catch (cause) {
    // A jar or an archive that happens to match the extension is a legitimate
    // refusal, not a failure: the reader is supposed to refuse binaries loudly.
    console.log(`  skipped ${match.rel}: ${cause.message.slice(0, 60)}`)
    continue
  }
  encodings.set(value.encoding, (encodings.get(value.encoding) ?? 0) + 1)
  if (value.text.includes('\uFFFD')) mojibake += 1
  if (/[\u4e00-\u9fa5]/.test(value.text)) {
    cjk += 1
    if (sample === undefined && value.encoding === 'gb18030') sample = value
  }
}

console.log(`ncc_home_read  encodings ${[...encodings].map(([name, n]) => `${name}x${n}`).join(' ')}`)
if (sample !== undefined) {
  console.log(`  ${sample.rel} (${sample.encoding}, ${sample.bytes} B, ${sample.totalLines} lines)`)
  for (const line of sample.text.split('\n').filter(row => /[\u4e00-\u9fa5]/.test(row)).slice(0, 3)) {
    console.log(`    ${line.trim().slice(0, 96)}`)
  }
}
console.log()

check(mojibake === 0, 'no file came back with replacement characters (that is what mojibake is)')
check(cjk > 0, `${cjk} of the sampled sources decoded to readable Chinese`)
check(encodings.has('gb18030'),
  `at least one file needed gb18030 (saw ${[...encodings.keys()].join(', ') || 'none'})`)

// ── 4. the credentials in a real config file ───────────────────────────────────
const configRel = ['resources/config.properties', 'ierp/bin/prop.xml', 'config.properties']
  .find(rel => existsSync(join(homePath, rel)))
if (configRel === undefined) {
  notes.push('ok   no config file at the usual paths, the credential check had nothing to read')
} else {
  const raw = readFileSync(join(homePath, configRel), 'utf8')
  const value = await call('ncc_home_read', { home: id, path: configRel })

  // Which keys count as secret, taken from the file's own text rather than from a
  // list kept here — but by the **masker's own rule** (`isSecretName`,
  // `home-files.ts:270`): the last dot/dash/underscore-separated word, or the name
  // with separators joined. A loose "the key contains `secret`" sweep is wrong in
  // both directions and this script shipped with it: it flagged `secret_level`,
  // whose last word is `level` and which the masker correctly leaves alone, so the
  // output told the reader a value was still there when none was ever hidden.
  const SECRET_NAMES = new Set(['key', 'password', 'passwd', 'pwd', 'pass', 'secret', 'token',
    'privatekey', 'accesskey', 'clientsecret', 'appsecret', 'dbpassword', 'userpassword'])
  const isSecretName = name => {
    const parts = name.toLowerCase().split(/[^a-z0-9]+/).filter(part => part !== '')
    if (parts.length === 0) return false
    return SECRET_NAMES.has(parts[parts.length - 1]) || SECRET_NAMES.has(parts.join(''))
  }
  // Every `name = value` the file states, in each of the shapes the masker handles:
  // the plain `key=value` line, the quoted `"key": "value"` pair, and the
  // `name="…" value="…"` attribute pair. Three shapes and not one, because the hole
  // that was here is worth naming: swept for `^\s*key=` only, this check saw 2 of
  // the 3 names the masker hit — `user_password` sits inside a **commented-out**
  // `#requestBody={…}` JSON blob, where no properties-shaped sweep will ever look.
  // A masker that only knew the `key=value` shape would leak a live credential
  // behind a `#`, and a check that only knows that shape would call it clean.
  const candidates = []
  for (const line of raw.split(/\r?\n/)) {
    const plain = /^[ \t]*([\w.-]+)[ \t]*[=:][ \t]*"?([^\s"]+)"?/.exec(line)
    if (plain !== null) candidates.push({ key: plain[1], value: plain[2] })
    const attr = /name[ \t]*=[ \t]*"([\w.-]+)"[^>]*?value[ \t]*=[ \t]*"([^"]*)"/i.exec(line)
    if (attr !== null && attr[2] !== '') candidates.push({ key: attr[1], value: attr[2] })
    const quoted = /"([\w.-]+)"[ \t]*:[ \t]*"([^"]*)"/g
    for (let match = quoted.exec(line); match !== null; match = quoted.exec(line)) {
      if (match[2] !== '') candidates.push({ key: match[1], value: match[2] })
    }
  }
  const secrets = candidates.filter(entry => isSecretName(entry.key))
  // The two ways this check could lie. `unswept` is the script's own blind spot
  // (a masked name it could not derive a value for, so a leak would go unnoticed);
  // `overMasked` is the masker's — `secret_level` is the live example: its last
  // word is `level`, so it must *not* be masked, and a rule that went by substring
  // would hide a value the operator needs.
  const unswept = value.masked.filter(name => !candidates.some(entry => entry.key === name))
  const overMasked = value.masked.filter(name => !isSecretName(name))

  console.log(`ncc_home_read ${configRel} (${value.encoding}, ${value.bytes} B)`)
  console.log(`  masked: ${value.masked.join(', ') || '(none)'}`)
  console.log(`  swept ${candidates.length} name/value pairs, ${secrets.length} of them secret-named`)
  for (const name of value.masked) {
    const entry = candidates.find(candidate => candidate.key === name)
    console.log(`  ${name}: ${entry === undefined
      ? 'NO VALUE DERIVED — this sweep could not check it'
      : `${entry.value.length} chars, present in the answer: ${value.text.includes(entry.value)}`}`)
  }
  check(secrets.length > 0, `${configRel} holds ${secrets.length} secret-valued keys to check`)
  check(unswept.length === 0,
    `every name the masker hit was one this sweep could derive a value for (missed: ${unswept.join(', ') || 'none'})`)
  check(overMasked.length === 0,
    `masking stayed off non-secret names (would have hit: ${overMasked.join(', ') || 'none'})`)
  check(secrets.every(secret => secret.value.length <= 3 || !value.text.includes(secret.value)),
    'every secret-valued key came back masked')
  check(value.masked.length > 0, `the answer names the masked keys (${value.masked.join(', ')})`)
  check(value.text.includes('***'), 'the values are replaced rather than dropped')
  // The other half: a config file is worth reading precisely for the values that
  // are not secret, so those must survive.
  const plain = raw.split(/\r?\n/)
    .map(line => /^\s*([\w.-]+)\s*=\s*(\S{4,})/.exec(line))
    .filter(Boolean)
    .filter(match => !isSecretName(match[1]))
  const kept = plain.filter(match => value.text.includes(match[2])).length
  console.log(`  non-secret values kept: ${kept} / ${plain.length}`)
  check(plain.length === 0 || kept > 0, 'values that are not secret still come back')
  console.log()
}

// ── 5. the skills-side mirror ──────────────────────────────────────────────────
const mirrorPath = mirrorPathOf(product, skillsRoot)
const stored = await store.read()
await mirrorHomes(product, stored.homes, skillsRoot)
const written = JSON.parse(readFileSync(mirrorPath, 'utf8'))
console.log(`mirrorHomes ${mirrorPath}`)
console.log(`  ${JSON.stringify(written)}\n`)
check(written.versions[version] !== undefined, `the mirror gained ${version}`)
check(written.versions[version].indexed === false,
  'the mirror does not claim an index this batch never built')
check(written.versions[version].path === homePath.replace(/\\/g, '/'), 'the path it wrote is the one registered')
check(written.default_version === version, `default_version follows the registration (${version})`)
check(written.versions[foreign] !== undefined,
  `the version the panel does not manage (${foreign}) survived the merge`)

// ── 6. withdrawal, on the way back out ─────────────────────────────────────────
await mirrorHomes(product, [], skillsRoot)
const afterRemove = JSON.parse(readFileSync(mirrorPath, 'utf8'))
check(afterRemove.versions[version] === undefined,
  'dropping the registration withdrew the entry it had written')
check(afterRemove.versions[foreign] !== undefined, 'and left the foreign version alone')

handle.dispose()

console.log('summary')
for (const note of notes) console.log(`  ${note}`)
if (failures.length > 0) {
  console.error(`\nFAILED (${failures.length})`)
  for (const failure of failures) console.error(`  x ${failure}`)
  process.exit(1)
}
console.log(`\npassed (${notes.length} checks)`)
