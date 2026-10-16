/**
 * Getting an Arthas distribution onto the machine, and finding out what is there.
 *
 * ## Why downloading is the default
 *
 * Arthas is not a 用友 product and does not ship with anything the operator
 * already has. The alternative to downloading is telling the operator to go and
 * get it, which turns the first question of every session into a chore — and the
 * model cannot do that chore for them. So the plugin fetches it into its own data
 * directory, exactly as it does with nothing else, and the operator can point at a
 * distribution they already keep instead.
 *
 * ## Why the download is verified rather than trusted
 *
 * The URL is a fixed HTTPS address, but what comes back is not always a jar. A
 * captive portal or a corporate proxy answers with an HTML error page and a 200,
 * and a `.jar` full of HTML fails much later with an error that names the wrong
 * thing. The check is therefore on the bytes: a jar is a zip, so it starts with
 * `PK\x03\x04`, and the real boot jar is ~148 KB, so a few kilobytes of anything
 * is refused too.
 *
 * ## Why the version comes from the filesystem
 *
 * The boot jar's manifest is inside a zip, and reading it means either
 * implementing enough of the zip format to reach `META-INF/MANIFEST.MF` or
 * starting a JVM to ask. Both are worse than the alternative: the first time an
 * agent is attached, Arthas unpacks the full distribution into `~/.arthas/lib/
 * <version>/`, and the version can simply be read off that directory afterwards.
 * Until then the answer is honestly "not yet known" rather than a guess.
 */
import { mkdir, open, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { defaultArthasDistDir } from './arthas-store.ts'
import { ArthasError } from './arthas-errors.ts'

/** Where the boot jar comes from. Measured to answer with 148,033 bytes. */
export const ARTHAS_BOOT_URL = 'https://arthas.aliyun.com/arthas-boot.jar'

/** The file name the rest of the feature looks for. */
export const ARTHAS_BOOT_JAR = 'arthas-boot.jar'

/**
 * The smallest file accepted as a boot jar.
 *
 * Deliberately far below the measured 148 KB: this is not a size check, it is a
 * "nobody served me an error page" check, and pinning it to the measured size
 * would break on the next release that grows or shrinks.
 */
const MIN_BOOT_BYTES = 50_000

/** A zip's local-file-header magic. A jar is a zip. */
const ZIP_MAGIC = [0x50, 0x4B, 0x03, 0x04] as const

/** Downloading a 148 KB jar from a CDN is fast; this covers a bad connection. */
const DOWNLOAD_TIMEOUT_MS = 120_000

/** What arrived, once verified. */
export interface DownloadedArthas {
  /** Absolute path of the jar on disk. */
  readonly path: string
  readonly bytes: number
}

/** What a directory turned out to contain. */
export interface ArthasPathProbe {
  /** The path as given, for the error message. */
  readonly path: string
  readonly exists: boolean
  /** The boot jar inside it, when one was found. */
  readonly bootJar?: string
  /** The version directory under `~/.arthas/lib`, when the filesystem names one. */
  readonly version?: string
}

/** Does this buffer start with a zip's local file header? */
function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.length < ZIP_MAGIC.length) return false
  return ZIP_MAGIC.every((byte, index) => bytes[index] === byte)
}

/**
 * Fetch the boot jar into the plugin's data directory.
 *
 * @param signal - cancellation from the tool call.
 * @param distDir - where to put it; defaults to the plugin's own directory.
 * @returns the path and size of the verified jar.
 * @throws ArthasError when the network, the response, or the bytes are wrong.
 */
export async function downloadBootJar(
  signal?: AbortSignal,
  distDir = defaultArthasDistDir(),
): Promise<DownloadedArthas> {
  const controller = new AbortController()
  const onAbort = (): void => { controller.abort() }
  if (signal !== undefined) {
    if (signal.aborted) throw new ArthasError('cancelled', '下载已取消。')
    signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => { controller.abort() }, DOWNLOAD_TIMEOUT_MS)

  let bytes: Uint8Array
  try {
    const response = await fetch(ARTHAS_BOOT_URL, { signal: controller.signal })
    if (!response.ok) {
      throw new ArthasError('failed', `下载 ${ARTHAS_BOOT_URL} 失败：HTTP ${response.status}。`)
    }
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof ArthasError) throw error
    throw new ArthasError(
      'failed',
      `下载 ${ARTHAS_BOOT_URL} 失败：${error instanceof Error ? error.message : String(error)}。`
      + '如果这台机器不能直连外网，请改用 arthas_env_add 登记一个本机已有的 Arthas。',
    )
  } finally {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', onAbort)
  }

  if (bytes.length < MIN_BOOT_BYTES) {
    throw new ArthasError(
      'failed',
      `下载到的内容只有 ${bytes.length} 字节，不是一个 Arthas boot jar（正常约 148 KB）。`
      + '多半是代理或门户返回了错误页；请检查网络，或改用 arthas_env_add。',
    )
  }
  if (!looksLikeZip(bytes)) {
    throw new ArthasError(
      'failed',
      '下载到的内容不是 zip/jar（开头不是 PK 魔数），多半是一个 HTML 错误页。请检查网络后重试。',
    )
  }

  await mkdir(distDir, { recursive: true })
  const target = join(distDir, ARTHAS_BOOT_JAR)
  // Written beside the target and renamed over it, so an interrupted download
  // cannot leave a truncated jar that looks registered and fails at attach time.
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, bytes)
  await rename(temporary, target)
  return { path: target, bytes: bytes.length }
}

/**
 * What is at this path?
 *
 * Accepts either the jar itself or a directory that holds one, and looks one
 * level down as well, because the distribution unpacks to `arthas-bin/` inside
 * whatever directory a person downloaded it into. One level is the whole of the
 * search: a recursive walk would make "register this directory" take an
 * unpredictable amount of time on a directory somebody pointed at by mistake.
 *
 * @param path - a file or directory the operator named.
 * @returns what was found; `exists: false` when the path is not there at all.
 */
export async function probeArthasPath(path: string): Promise<ArthasPathProbe> {
  const info = await stat(path).catch(() => undefined)
  if (info === undefined) return { path, exists: false }

  if (info.isFile()) {
    const name = basename(path).toLowerCase()
    if (name === ARTHAS_BOOT_JAR || name.endsWith('.jar')) return { path, exists: true, bootJar: path }
    return { path, exists: true }
  }

  if (!info.isDirectory()) return { path, exists: true }

  const direct = join(path, ARTHAS_BOOT_JAR)
  if (await stat(direct).then(one => one.isFile(), () => false)) {
    return { path, exists: true, bootJar: direct }
  }
  const nested = join(path, 'arthas-bin', ARTHAS_BOOT_JAR)
  if (await stat(nested).then(one => one.isFile(), () => false)) {
    return { path, exists: true, bootJar: nested }
  }
  const version = await versionOfLibDir(join(path, 'lib'))
  return { path, exists: true, ...version === undefined ? {} : { version } }
}

/**
 * The version Arthas unpacked itself into, if it has run here before.
 *
 * Reads `~/.arthas/lib/<version>/`. The directory is created by Arthas on first
 * attach, so before that there is nothing to read and the answer is undefined —
 * which is the truth, and is rendered as "未探测" rather than as a version.
 *
 * @param libDir - the lib directory to read; defaults to the operator's own.
 * @returns the newest-looking version directory name, or undefined.
 */
export async function versionOfLibDir(libDir = join(homedir(), '.arthas', 'lib')): Promise<string | undefined> {
  const entries = await readdir(libDir, { withFileTypes: true }).catch(() => [])
  const versions: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Only things that look like a version: Arthas keeps nothing else here today,
    // and matching the shape keeps a stray directory from being reported as the
    // version of the tool.
    if (/^\d+(\.\d+)*/.test(entry.name)) versions.push(entry.name)
  }
  if (versions.length === 0) return undefined
  // Newest last when sorted by component, so the last is the one to report.
  versions.sort((left, right) => {
    const a = left.split('.').map(Number)
    const b = right.split('.').map(Number)
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
  return versions[versions.length - 1]
}

/**
 * The first bytes of a file, for a caller that wants to verify what it has.
 *
 * Exists so a registered distribution can be checked for the same reason a
 * downloaded one is: a path that holds an HTML page named `.jar` is a mistake
 * someone will make, and it is cheaper to catch here than at attach time.
 *
 * Reads only the header rather than the file. The jars this may be pointed at
 * include generated classpath jars, and slurping a large one to look at four
 * bytes would be a strange way to spend a second.
 *
 * @param path - the file to read.
 * @param length - how many bytes to read; 4 is enough for a zip header.
 * @returns the bytes, or undefined when the file cannot be read.
 */
export async function readHeader(path: string, length = 4): Promise<Uint8Array | undefined> {
  const handle = await open(path, 'r').catch(() => undefined)
  if (handle === undefined) return undefined
  try {
    const buffer = new Uint8Array(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } catch {
    return undefined
  } finally {
    await handle.close()
  }
}

/**
 * Is this path a plausible boot jar?
 *
 * @param path - the file to check.
 * @returns true when the file reads as a zip.
 */
export async function isBootJarShaped(path: string): Promise<boolean> {
  const header = await readHeader(path)
  return header !== undefined && looksLikeZip(header)
}
