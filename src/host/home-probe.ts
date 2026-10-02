/**
 * What is actually in a directory the operator registered as a Home.
 *
 * The probe answers two questions and nothing else: *is this an installation, and
 * which of the standard paths does it have?* Everything downstream — the panel's
 * summary, `ncc_home_list`, and the model's decision about where to look — reads
 * this one result, so a wrong classification would be repeatable rather than a
 * one-off. The rules are therefore written against real directories, and the cases
 * that are neither yes nor no (`jar-collection`) get their own name instead of
 * being folded into a neighbour.
 *
 * ## It counts names and opens nothing
 *
 * `buildClassIndex` takes minutes because it unzips every jar's central directory.
 * A probe runs on save, on demand from the panel, and once per `ncc_home_list`,
 * so it may not do that: it walks directory entries, counts what it sees, and
 * stops at a cap. When the cap is reached the counts are reported as lower bounds
 * (`capped: true`) rather than as a number that looks precise and is not.
 *
 * A Home has hundreds of thousands of entries, so the walk is bounded by entries
 * and depth, not by hope.
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { HomeKeyView, HomeProfileView, HomeShape } from '../shared/types.ts'
import { isJdk } from './class-index.ts'

/**
 * Directory entries one probe visits before it stops counting.
 *
 * Set from the shape of a real Home: 237 modules of a few thousand entries each
 * is comfortably inside this, and a directory that is not a Home at all is cut off
 * long before it costs a visible pause.
 */
const WALK_CAP = 60_000

/** How deep the walk goes. A Home is shallow; a deep tree here is not one. */
const WALK_DEPTH = 12

/**
 * The paths a Home is expected to have, in the order the surface lists them.
 *
 * `rel` is what the model is shown, so it is written the way the model would type
 * it into `ncc_home_find`'s `under` — forward slashes, no drive letter. Where the
 * path varies by module (`sub` is set) the `*` stands for the module's own
 * directory name, and the answer for the tree as a whole is "some module has it":
 * there are 237 of them and they do not all carry all three.
 */
const KEYS: readonly { readonly role: string; readonly rel: string; readonly sub?: string }[] = [
  { role: '模块根', rel: 'modules' },
  { role: '模块注册', rel: 'modules/*/META-INF', sub: 'META-INF' },
  { role: '模块元数据', rel: 'modules/*/METADATA', sub: 'METADATA' },
  { role: '模块类与源码', rel: 'modules/*/classes', sub: 'classes' },
  { role: '运行时配置', rel: 'ierp/bin' },
  { role: '系统配置（含凭据）', rel: 'resources' },
  { role: '前端', rel: 'hotwebs/nccloud' },
  { role: '日志', rel: 'nclogs' },
  { role: '启动脚本', rel: 'bin' },
  { role: '补丁', rel: 'patchrule' },
  { role: '自带 JDK', rel: 'ufjdk' },
]

/** The roots the probe stats directly; the rest are answered by the module walk. */
const FIXED_KEYS = KEYS.filter(key => key.sub === undefined)

/** The subdirectories whose presence any one module settles. */
const MODULE_SUBS = KEYS.flatMap(key => key.sub === undefined ? [] : [key.sub])

/**
 * Whether a path is a readable directory.
 *
 * Exported because the service asks the same question of every registered path on
 * every listing — "is this row still live?" is the same test as "does this Home
 * have a `modules/`?".
 */
export async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** The key table with nothing found, for a path that could not be read at all. */
function noKeys(): HomeKeyView[] {
  return KEYS.map(key => ({ role: key.role, rel: key.rel, exists: false }))
}

/** The key table in display order, from what the walk found. */
function keysOf(fixed: ReadonlyMap<string, boolean>, moduleChildren: ReadonlySet<string>): HomeKeyView[] {
  return KEYS.map(key => ({
    role: key.role,
    rel: key.rel,
    exists: key.sub === undefined ? fixed.get(key.rel) === true : moduleChildren.has(key.sub),
  }))
}

/**
 * Classify and count one directory.
 *
 * @param root - the directory the operator registered. It may be anything: a Home,
 *   a jar collection, an empty folder, or a path that no longer exists.
 * @returns one profile, never a rejection — an unreadable path is a result
 *   (`shape: 'not-found'`) with the reason in `warnings`, because "the row is
 *   dimmed and says why" is more useful to the panel than a failed promise.
 */
export async function probeHome(root: string): Promise<HomeProfileView> {
  const probedAt = new Date().toISOString()
  const warnings: string[] = []

  try {
    await readdir(root, { withFileTypes: true })
  } catch {
    return {
      probedAt,
      shape: 'not-found',
      present: [],
      modules: 0,
      jars: 0,
      capped: false,
      keys: noKeys(),
      warnings: [`路径读不出来：确认它存在、且运行 NEURON 的账号有权访问。${root}`],
    }
  }

  const fixed = new Map<string, boolean>()
  for (const key of FIXED_KEYS) fixed.set(key.rel, await isDir(join(root, ...key.rel.split('/'))))
  const hasModules = fixed.get('modules') === true
  const hasIerp = fixed.get('ierp/bin') === true

  // `bin/startup.*` is the other half of "this is an installation": BIP ships
  // without `ierp/`, and both products put their launcher there.
  const binEntries = hasModules ? await readdir(join(root, 'bin'), { withFileTypes: true }).catch(() => []) : []
  const hasStartup = binEntries.some(entry => entry.isFile() && entry.name.startsWith('startup.'))

  const moduleChildren = new Set<string>()
  let modules = 0
  if (hasModules) {
    const entries = await readdir(join(root, 'modules'), { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      modules += 1
      // Once all three subdirectories have been seen, the remaining modules have
      // nothing left to tell us; the other 200-odd readdirs are skipped.
      if (MODULE_SUBS.every(sub => moduleChildren.has(sub))) continue
      const children = await readdir(join(root, 'modules', entry.name), { withFileTypes: true }).catch(() => [])
      for (const child of children) if (child.isDirectory()) moduleChildren.add(child.name)
    }
  }

  let jars = 0
  let visited = 0
  let capped = false
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (capped || depth > WALK_DEPTH) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (capped) return
      visited += 1
      if (visited > WALK_CAP) {
        capped = true
        return
      }
      if (entry.isDirectory()) {
        const full = join(dir, entry.name)
        if (isJdk(full)) continue
        await walk(full, depth + 1)
        continue
      }
      if (entry.name.endsWith('.jar')) jars += 1
    }
  }
  await walk(root, 0)

  const shape: HomeShape = hasModules && (hasIerp || hasStartup)
    ? 'ncc-home'
    : hasModules
      ? 'bip-home'
      : jars > 0
        ? 'jar-collection'
        : 'not-found'

  if (capped) {
    warnings.push(`目录项超过 ${WALK_CAP} 上限，模块数与 jar 数只保证是「至少这么多」，不是精确值。`)
  }
  if (shape === 'jar-collection') {
    warnings.push('这个目录里有 jar 但没有 modules/：能用来按版本建类索引，读不到 .bmf 和模块配置。')
  }
  if (shape === 'not-found') {
    warnings.push('这个路径不像 NCC/BIP 的 Home：没有 modules/，也没有找到 jar。确认它指的是安装根目录。')
  }
  if (shape === 'bip-home') {
    warnings.push('有 modules/，但既没有 ierp/ 也没有 bin/startup.*，按 BIP 旗舰版的 Home 归类。')
  }

  const present = FIXED_KEYS.filter(key => fixed.get(key.rel) === true).map(key => key.rel)
  return { probedAt, shape, present, modules, jars, capped, keys: keysOf(fixed, moduleChildren), warnings }
}
