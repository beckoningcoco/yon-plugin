/**
 * What is actually in a directory the operator registered as front-end source.
 *
 * The probe answers three questions and nothing else: *is this a source project
 * or a deployed bundle, how many pages does it have, and how much of it is
 * business code?* Everything downstream — the panel's summary, `ncc_fe_list`,
 * and the model's decision about where to look — reads this one result, so a
 * wrong classification would be repeatable rather than a one-off.
 *
 * ## Why `deployed` is a first-class answer
 *
 * An NCC installation ships `hotwebs/nccloud/resources/` with the compiled page
 * bundles in it, and to a directory listing that looks like a front-end tree. It
 * is not source: there is no `src/`, and what is there was produced by webpack
 * from a project like the one this feature registers. Reading it as source would
 * hand the model minified files and let it believe it is looking at the code.
 * Measured on this machine, `E:/NCProject/NCC2105/NCC2015/hotwebs` is exactly
 * that shape, while `E:/NCProject/NCC2005/touziwuye/hotwebs` is a real project.
 *
 * ## One walk, three answers
 *
 * Counting files, summing bytes and finding page entries are one traversal, not
 * three: the same directory entries decide all of them. `src/platform/` is where
 * the numbers get interesting — measured 317 files against 64.9 MB on the
 * reference project, because that directory is the runtime library itself
 * (react, axios, echarts), not business code — so bytes are accumulated per
 * domain and the answer says so instead of leaving the model to search it.
 *
 * ## It opens nothing
 *
 * Unlike the class index, this walk never unzips or parses a file: it reads
 * directory entries, `stat`s sizes, and parses two small JSON files at the root.
 * A project of 8 805 files is therefore a second-scale answer, not a minute.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { FrontendProfileView, FrontendShape } from '../shared/types.ts'
import { scanProject } from './frontend-pages.ts'

/** Whether a path is a readable directory. */
async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** Whether a path is a readable file. */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** One directory entry's size, or 0 when it cannot be read. */
async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

/** The `config.json` fields this feature reads, all of them optional. */
interface BuildConfig {
  readonly buildEntry?: readonly string[]
  readonly proxy?: string
  readonly devPort?: number
}

/**
 * Read the two build switches a front-end developer actually asks about.
 *
 * `buildEntryPath` is the one that costs people hours: once it names a page, the
 * other pages do not get compiled at all, and "改了没生效" is usually this line.
 * A broken or absent file is not an error — a project may legitimately have no
 * `config.json` yet — so every field is optional and a parse failure reads as
 * nothing known.
 * @param root - the project root.
 * @returns what the file said, as far as it could be read.
 */
async function readBuildConfig(root: string): Promise<BuildConfig> {
  const text = await readFile(join(root, 'config.json'), 'utf8').catch(() => undefined)
  if (text === undefined) return {}
  try {
    const parsed = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text) as Record<string, unknown>
    const raw = parsed.buildEntryPath
    const buildEntry = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string')
      : typeof raw === 'string' && raw !== '' ? [raw] : []
    return {
      ...buildEntry.length === 0 ? {} : { buildEntry },
      ...typeof parsed.proxy === 'string' && parsed.proxy !== '' ? { proxy: parsed.proxy } : {},
      ...typeof parsed.devPort === 'number' && Number.isFinite(parsed.devPort) ? { devPort: parsed.devPort } : {},
    }
  } catch {
    return {}
  }
}

/** The `package.json` name, when the file exists and parses. */
async function readPackageName(root: string): Promise<string | undefined> {
  const text = await readFile(join(root, 'package.json'), 'utf8').catch(() => undefined)
  if (text === undefined) return undefined
  try {
    const parsed = JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text) as { name?: unknown }
    return typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

/**
 * Walk the project once and answer all three counting questions.
 *
 * The walk itself lives in `frontend-pages.ts`, which the page index calls too:
 * the probe's numbers and the tree the panel draws must be the same numbers.
 * @param root - the registered project root.
 * @param shape - the classification already settled from names alone.
 * @returns file count and size, page-entry count, and the per-domain breakdown.
 */
async function scan(root: string, shape: FrontendShape): Promise<{
  files: number
  bytes: number
  nodes: number
  pages: number
  pageTypes: readonly string[]
  domains: readonly { name: string, pages: number, bytes: number }[]
  capped: boolean
}> {
  // Only a source project is worth walking. An installation's `hotwebs/` is
  // 36 733 files and 2.4 GB on this machine (measured: 10.4 s), and the answer
  // would be a set of counts for a directory the operator is about to be told is
  // the wrong one.
  if (shape !== 'scaffold') {
    return { files: 0, bytes: 0, nodes: 0, pages: 0, pageTypes: [], domains: [], capped: false }
  }
  return await scanProject(root)
}

/** How much of the project the runtime library takes before it is worth saying. */
const PLATFORM_SHARE = 0.3

/** The domain directory that is the runtime library rather than business code. */
const PLATFORM_DOMAIN = 'platform'

/**
 * A byte count in the unit a person reads it in.
 * @param value - the size in bytes.
 * @returns the formatted size.
 */
function sizeText(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}

/**
 * Classify and count one directory.
 *
 * @param root - the directory the operator registered. It may be anything: a
 *   source project, an installation's `hotwebs/`, an empty folder, or a path that
 *   no longer exists.
 * @returns one profile, never a rejection — an unreadable path is a result
 *   (`shape: 'not-found'`) with the reason in `warnings`, because "the row is
 *   dimmed and says why" is more useful to the panel than a failed promise.
 */
export async function probeFrontend(root: string): Promise<FrontendProfileView> {
  const probedAt = new Date().toISOString()
  const warnings: string[] = []

  try {
    await readdir(root, { withFileTypes: true })
  } catch {
    return {
      probedAt,
      shape: 'not-found',
      nodes: 0,
      pages: 0,
      pageTypes: [],
      domains: [],
      files: 0,
      bytes: 0,
      capped: false,
      hasNodeModules: false,
      hasDist: false,
      buildEntry: [],
      warnings: [`路径读不出来：确认它存在、且运行 NEURON 的账号有权访问。${root}`],
    }
  }

  const hasSrc = await isDir(join(root, 'src'))
  const hasConfigJson = await isFile(join(root, 'config.json'))
  const hasPackage = await isFile(join(root, 'package.json'))
  const hasConfigDir = await isDir(join(root, 'config'))
  const hasNccloud = await isDir(join(root, 'nccloud'))
  const hasNodeModules = await isDir(join(root, 'node_modules'))
  const hasDist = await isDir(join(root, 'dist'))

  const shape: FrontendShape = hasSrc && (hasConfigJson || hasPackage || hasConfigDir)
    ? 'scaffold'
    : !hasSrc && hasNccloud
      ? 'deployed'
      : 'not-a-project'

  const config = await readBuildConfig(root)
  const packageName = await readPackageName(root)
  const scanned = await scan(root, shape)

  if (shape === 'deployed') {
    warnings.push('这个目录只有 nccloud/，是安装目录里的部署产物（编译后的页面），不是前端源码工程。'
      + '源码工程应当有 src/ 与 config.json；用「选择目录…」指到 hotwebs 工程本身。')
    warnings.push('没有统计文件数与体积：这不是源码工程，逐个文件走一遍只为一个用不上的数字。')
  }
  if (shape === 'not-a-project') {
    warnings.push('这个路径不像 NCC 前端源码工程：没有 src/，也没有 config.json/package.json。')
    warnings.push('没有统计文件数与体积：这不是源码工程。')
    // The most common mistake by far: picking the project folder above `hotwebs/`.
    if (await isDir(join(root, 'hotwebs', 'src'))) {
      warnings.push('源码在子目录 hotwebs/，请把路径指到它（例如 .../hotwebs），不要停在它的上一级。')
    }
  }
  if (shape === 'scaffold' && scanned.pages === 0) {
    warnings.push('src/ 下没有找到页面入口。入口约定是 src/{领域}/{模块}/{节点}/{页面类型}/index.js，'
      + '如果这份工程确实有页面，确认 src/ 的层级是否符合这个约定。')
  }
  if (scanned.capped) {
    warnings.push('目录项超过 200000 上限，文件数、体积与页面数都只保证是「至少这么多」，不是精确值。')
  }
  if (hasNodeModules) {
    warnings.push('工程里有 node_modules/，统计与文件检索都已排除它。')
  }
  if (hasDist) {
    warnings.push('工程里有 dist/，那是构建产物，统计与文件检索都已排除它。')
  }
  if (config.buildEntry !== undefined && config.buildEntry.length === 1) {
    warnings.push(`config.json 的 buildEntryPath 只列了 1 个入口（${config.buildEntry[0] ?? ''}），`
      + '其余页面不会参与构建；排查「改了没生效」时先看这一行。')
  }
  const platform = scanned.domains.find(domain => domain.name === PLATFORM_DOMAIN)
  if (platform !== undefined && scanned.bytes > 0 && platform.bytes / scanned.bytes > PLATFORM_SHARE) {
    warnings.push(`src/${PLATFORM_DOMAIN} 占 ${sizeText(platform.bytes)}（${Math.round(platform.bytes / scanned.bytes * 100)}%），`
      + '那是运行时库本体（react/axios/echarts），不是业务代码；检索时会跳过它。')
  }

  return {
    probedAt,
    shape,
    nodes: scanned.nodes,
    pages: scanned.pages,
    pageTypes: scanned.pageTypes,
    domains: scanned.domains,
    files: scanned.files,
    bytes: scanned.bytes,
    capped: scanned.capped,
    hasNodeModules,
    hasDist,
    buildEntry: config.buildEntry ?? [],
    ...config.proxy === undefined ? {} : { proxy: config.proxy },
    ...config.devPort === undefined ? {} : { devPort: config.devPort },
    ...packageName === undefined ? {} : { packageName },
    warnings,
  }
}

export { isDir }
