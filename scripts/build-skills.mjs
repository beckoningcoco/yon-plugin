/**
 * Inline `skills/<name>/SKILL.md` into `src/host/skill-catalog.generated.ts`.
 *
 * Why this is a build step rather than a runtime read: see the header of
 * `src/host/skill-catalog.ts`. In short, a registered skill has to be a plain
 * same-process value, so the plugin never writes a file — and therefore never
 * has to clean one up when it is uninstalled. The `skills/` bundles stay the
 * authored source; the generated module is only their transport.
 *
 * The generated file is committed, so `typecheck` and `test` run without a
 * build first. `--check` (wired into `pnpm verify`) fails when the two have
 * drifted, which is what stops a hand-edited SKILL.md from shipping stale.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const skillsDir = join(root, 'skills')
const outPath = join(root, 'src', 'host', 'skill-catalog.generated.ts')
const checkOnly = process.argv.includes('--check')

/** The public skill-name grammar; the registry rejects anything else outright. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Frontmatter keys this build understands. Anything else is an error, never a silent drop. */
const ALLOWED_KEYS = new Set(['name', 'description', 'whenToUse', 'when-to-use'])

/** Print one line of progress under the package's own name. */
const id = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name
const say = (message) => { console.log(`${id}: ${message}`) }

/**
 * Strip one layer of matching quotes from a frontmatter value.
 * @param value - the trimmed text after the colon.
 * @returns the unquoted value.
 */
function unquote(value) {
  const first = value[0]
  if (value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Emit a single-quoted TypeScript string literal.
 *
 * Frontmatter values are validated to be single-line, so only backslashes and
 * quotes need escaping.
 * @param text - the value to emit.
 * @returns the literal, quotes included.
 */
function quote(text) {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * Emit a multi-line body as a template literal, so the generated module stays
 * readable and a diff after editing a SKILL.md shows prose rather than one
 * enormous escaped line.
 * @param text - the body, already newline-normalized.
 * @returns the literal, backticks included.
 */
function template(text) {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
  return `\`${escaped}\``
}

/**
 * Read and validate one `skills/<name>` bundle.
 * @param directory - the bundle's directory name.
 * @returns the parsed skill.
 */
async function readSkill(directory) {
  const where = `skills/${directory}/SKILL.md`
  let text
  try {
    text = await readFile(join(skillsDir, directory, 'SKILL.md'), 'utf8')
  } catch {
    throw new Error(`${where}: a directory under skills/ must contain SKILL.md`)
  }
  // A BOM would make the frontmatter fence invisible to the regex below, and
  // CRLF would leave stray carriage returns inside the inlined body.
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized)
  if (match === null) {
    throw new Error(`${where}: the file must open with a "---" YAML frontmatter block`)
  }

  const fields = new Map()
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const at = line.indexOf(':')
    if (at <= 0) {
      throw new Error(
        `${where}: frontmatter lines must read "key: value", and values must stay on one line; got ${JSON.stringify(rawLine)}`,
      )
    }
    fields.set(line.slice(0, at).trim(), unquote(line.slice(at + 1).trim()))
  }
  for (const key of fields.keys()) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(
        `${where}: frontmatter key "${key}" is not supported by this build (allowed: ${[...ALLOWED_KEYS].join(', ')})`,
      )
    }
  }

  const name = fields.get('name')
  if (name === undefined) throw new Error(`${where}: frontmatter requires "name"`)
  if (name !== directory) {
    throw new Error(`${where}: frontmatter name "${name}" must match its directory name ("${directory}")`)
  }
  if (!SKILL_NAME.test(name)) {
    throw new Error(`${where}: "${name}" is not a kebab-case skill name (${SKILL_NAME.source})`)
  }
  const description = fields.get('description')
  if (description === undefined || description === '') {
    throw new Error(`${where}: frontmatter requires a non-empty "description"`)
  }
  const whenToUse = fields.get('whenToUse') ?? fields.get('when-to-use')

  return {
    name,
    description,
    ...whenToUse === undefined || whenToUse === '' ? {} : { whenToUse },
    content: `${normalized.slice(match[0].length).trim()}\n`,
  }
}

/** Collect every bundle, ordered by name so a rebuild of unchanged input is byte-identical. */
const entries = []
for (const dirent of await readdir(skillsDir, { withFileTypes: true })) {
  if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue
  entries.push(await readSkill(dirent.name))
}
entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))

const rows = entries.map((entry) => {
  const lines = [
    '  {',
    `    name: ${quote(entry.name)},`,
    `    description: ${quote(entry.description)},`,
  ]
  if (entry.whenToUse !== undefined) lines.push(`    whenToUse: ${quote(entry.whenToUse)},`)
  lines.push(`    content: ${template(entry.content)},`, '  },')
  return lines.join('\n')
})

const generated = [
  '/**',
  ' * Generated by `scripts/build-skills.mjs` from `skills/<name>/SKILL.md` — do not edit.',
  ' *',
  ' * Edit the SKILL.md bundles and run `pnpm build` (or `node scripts/build-skills.mjs`).',
  ' * `pnpm verify` fails when this file and those bundles have drifted apart.',
  ' */',
  '',
  "import type { YonBundledSkill } from './skill-catalog.ts'",
  '',
  '/** Every skill this plugin ships, in name order. */',
  'export const YON_BUNDLED_SKILLS: readonly YonBundledSkill[] = [',
  ...rows,
  ']',
  '',
].join('\n')

let current
try {
  current = await readFile(outPath, 'utf8')
} catch {
  current = undefined
}

if (current === generated) {
  say(`${entries.length} bundled skill(s), catalog already up to date`)
} else if (checkOnly) {
  console.error(`${id}: the bundled skill catalog is out of date`)
  console.error('  - run `node scripts/build-skills.mjs` and commit the result')
  process.exit(1)
} else {
  await writeFile(outPath, generated, 'utf8')
  say(`wrote src/host/skill-catalog.generated.ts (${entries.length} bundled skill(s))`)
}
