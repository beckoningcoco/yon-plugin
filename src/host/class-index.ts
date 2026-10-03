/**
 * The class index: which jar holds which class, and the machinery to build one.
 *
 * ## Why this exists
 *
 * A YonBIP or NCC installation is tens of thousands of `.jar` files. Answering
 * "where is `nc.bs.impl.paybill.PaybillLinkImpl`" by hand means opening them one at
 * a time, and the answer is the precondition for reading the platform's own
 * implementation — which is what a model needs when the documentation runs out.
 *
 * ## Why not the bundled script
 *
 * `resources/knowledge/ncc/scripts/build_index.py` does this, and it was the
 * starting point. Two things stopped it being usable as shipped: it writes its
 * output relative to its own location, which meant the old skill layout, and one of
 * its two branches targets a sibling directory that no longer exists. Pointing it
 * somewhere else would mean editing a file whose only other purpose is to be the
 * readable original.
 *
 * ## Why nothing is decompressed
 *
 * A `.jar` is a zip. A zip ends with an End Of Central Directory record pointing at
 * the central directory, which lists every entry's name. A class index needs the
 * names and nothing else, so this reads two small regions per file — the tail and
 * the directory — instead of inflating tens of gigabytes of bytecode to throw all
 * of it away. On a real installation that is the difference between a couple of
 * minutes and an hour.
 *
 * ## Where an index lives
 *
 * Under the operator's DSH data directory (`~/.dsh/yon-panel/knowledge/`), never
 * inside the package: an index is tens of megabytes, it is derived, and the
 * package directory may be read-only after installation.
 */
import { readdir, readFile, stat, mkdir, rm, writeFile } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'

/** The signature that ends a zip: "PK\x05\x06". */
const EOCD_SIGNATURE = 0x06054b50

/** The signature that starts a central directory entry: "PK\x01\x02". */
const CENTRAL_SIGNATURE = 0x02014b50

/** How far back from the end the End Of Central Directory record may sit. */
const MAX_COMMENT = 0xffff

/** One built index. */
export interface ClassIndex {
  readonly version: string
  readonly home: string
  readonly builtAt: string
  readonly totalJars: number
  readonly totalClasses: number
  /** Fully-qualified class name → path relative to `home`. */
  readonly index: Record<string, string>
}

/** Progress one build reports, so a long run can say what it is doing. */
export interface BuildProgress {
  readonly jars: number
  readonly classes: number
  readonly current: string
}

/** Where indexes live, under the operator's DSH data directory. */
export function classIndexDir(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'knowledge')
}

/** The file one version's index is stored in, under a directory of the caller's choosing. */
export function classIndexPathIn(dir: string, version: string): string {
  const safe = version.replace(/[^A-Za-z0-9_-]/g, '_')
  return join(dir, `class_index_${safe}.json`)
}

/** The file one version's index is stored in. */
export function classIndexPath(version: string): string {
  return classIndexPathIn(classIndexDir(), version)
}

/**
 * List the class names one jar declares.
 *
 * @param jar - absolute path to the jar.
 * @returns fully-qualified class names, or an empty list when the file is not a
 * readable zip (a corrupt or truncated jar is skipped rather than failing the run).
 */
export async function classNamesOf(jar: string): Promise<readonly string[]> {
  let handle
  try {
    handle = await open(jar, 'r')
  } catch {
    return []
  }
  try {
    const { size } = await handle.stat()
    if (size < 22) return []

    // The tail, where the End Of Central Directory record sits. It may be followed
    // by a comment of up to 64 KiB, so the search starts that far back.
    const tailLength = Math.min(size, MAX_COMMENT + 22)
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, size - tailLength)

    let eocd = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) { eocd = i; break }
    }
    if (eocd < 0) return []

    const entryCount = tail.readUInt16LE(eocd + 10)
    const directorySize = tail.readUInt32LE(eocd + 12)
    const directoryOffset = tail.readUInt32LE(eocd + 16)
    if (directorySize === 0 || directoryOffset + directorySize > size) return []

    const directory = Buffer.alloc(directorySize)
    await handle.read(directory, 0, directorySize, directoryOffset)

    const names: string[] = []
    let at = 0
    for (let seen = 0; seen < entryCount && at + 46 <= directory.length; seen++) {
      if (directory.readUInt32LE(at) !== CENTRAL_SIGNATURE) break
      const nameLength = directory.readUInt16LE(at + 28)
      const extraLength = directory.readUInt16LE(at + 30)
      const commentLength = directory.readUInt16LE(at + 32)
      const start = at + 46
      const name = directory.subarray(start, start + nameLength).toString('utf8')
      names.push(name)
      at = start + nameLength + extraLength + commentLength
    }
    return names
  } catch {
    return []
  } finally {
    await handle.close()
  }
}

/**
 * Whether a path segment is a bundled JDK rather than platform code.
 *
 * Exported so `home-probe.ts` skips the same tree this indexer does. Two copies of
 * this list would drift, and the drift would show up as a Home reporting a jar
 * count that disagrees with the index built from it.
 */
export function isJdk(root: string): boolean {
  return root.split(/[/\\]/).includes('ufjdk')
}

/**
 * The path segment that ends a class root: what follows it is the package.
 */
const CLASS_ROOT = 'classes'

/**
 * The class name a loose `.class` or `.java` file declares, or `undefined` when the
 * path does not say.
 *
 * Compiled output in a Home sits under `<module>/classes/` or
 * `<module>/META-INF/classes/`, so the package begins right after the **last**
 * `classes` segment. Measured across the registered 2312 home: all 1,635 loose class
 * and source files sit under such a segment, so this covers every one of them.
 *
 * `undefined` rather than a guess: a path with no `classes` segment would otherwise
 * be indexed under a name derived from whatever directory it happened to sit in, and
 * a search would then answer confidently with a name that belongs to no class.
 *
 * @param rel - the file's path, relative to the home, with `/` separators.
 * @returns the fully-qualified class name, or undefined.
 */
function looseClassName(rel: string): string | undefined {
  const segments = rel.split('/')
  const at = segments.lastIndexOf(CLASS_ROOT)
  if (at < 0 || at === segments.length - 1) return undefined
  return segments.slice(at + 1).join('/').replace(/\.(class|java)$/, '').replace(/\//g, '.')
}

/**
 * Walk a home directory and index every class it holds.
 *
 * Two kinds of find end up in one table. A jar is read through its central directory
 * (only names, nothing decompressed); a loose `.class` or `.java` contributes its own
 * file. The jar wins wherever both know a class, and the loose file is kept only when
 * no jar claims it — see the merge note below for why that order is the safe one.
 *
 * @param home - the NCC or BIP home directory to scan.
 * @param version - the label this index is stored under.
 * @param onProgress - called every so often, for a run that reports where it is.
 * @returns the index, ready to write.
 */
export async function buildClassIndex(
  home: string,
  version: string,
  onProgress?: (progress: BuildProgress) => void,
): Promise<ClassIndex> {
  const fromJars: Record<string, string> = {}
  const fromSource: Record<string, string> = {}
  const fromClasses: Record<string, string> = {}
  let jars = 0
  let classes = 0

  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (isJdk(full)) continue
        await walk(full)
        continue
      }
      const rel = relative(home, full).split(sep).join('/')

      if (entry.name.endsWith('.jar')) {
        jars++
        for (const name of await classNamesOf(full)) {
          if (!name.endsWith('.class') || name.endsWith('module-info.class')) continue
          fromJars[name.slice(0, -'.class'.length).replace(/\//g, '.')] = rel
          classes++
        }
        if (onProgress !== undefined && jars % 200 === 0) {
          onProgress({ jars, classes, current: rel })
        }
        continue
      }

      const isSource = entry.name.endsWith('.java')
      const isClass = entry.name.endsWith('.class') && !entry.name.endsWith('module-info.class')
      if (!isSource && !isClass) continue
      const name = looseClassName(rel)
      if (name === undefined) continue
      if (isSource) fromSource[name] = rel
      else fromClasses[name] = rel
      classes++
    }
  }

  await walk(home)

  // Later spreads win. A jar beats a loose file: the jar is what the installation
  // actually loads, while a `.class`/`.java` left in `classes/` is a build artifact
  // whose provenance is unknown and which need not be the same version as the
  // compiled code. A `.java` beats a bare `.class` because it can simply be read.
  // Only when no jar claims a class does a loose path get used at all — which is the
  // case this exists for: a module shipped with no jar (measured: `hadc`, 284 sources
  // and 323 classes, and a scan of all 2,779 jars in that home found none of them).
  const index: Record<string, string> = { ...fromClasses, ...fromSource, ...fromJars }

  return {
    version,
    home,
    builtAt: new Date().toISOString(),
    totalJars: jars,
    totalClasses: classes,
    index,
  }
}

/**
 * Write an index where {@link classIndexPath} will look for it.
 *
 * The key order of `JSON.stringify(built)` is load-bearing — see {@link summaryOf}, which
 * reads the front of this file and stops at `"index":`. `built` is built by
 * `buildClassIndex`, whose object literal puts the five summary fields first, and the
 * `index` table last. Reordering them would not break anything visibly; it would make the
 * cheap listing silently parse every file whole.
 *
 * @param built - the index to store.
 * @param dir - the directory to write into; defaults to the operator's own. The same
 *   seam the stores have, so a case can write and list without touching that directory.
 * @returns the absolute path written.
 */
export async function writeClassIndex(built: ClassIndex, dir = classIndexDir()): Promise<string> {
  const target = classIndexPathIn(dir, built.version)
  await mkdir(dir, { recursive: true })
  // Compact rather than pretty: this is a lookup table of hundreds of thousands of
  // entries, and a single line parses faster than one that is mostly whitespace.
  await writeFile(target, JSON.stringify(built), 'utf8')
  return target
}

/**
 * Read one stored index.
 * @param version - the label it was stored under.
 * @returns the index, or undefined when none is stored.
 */
export async function readClassIndex(version: string): Promise<ClassIndex | undefined> {
  try {
    const raw = await readFile(classIndexPath(version), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const candidate = parsed as Partial<ClassIndex>
    if (typeof candidate.version !== 'string' || candidate.index === null || typeof candidate.index !== 'object') {
      return undefined
    }
    return candidate as ClassIndex
  } catch {
    return undefined
  }
}

/** One stored index, as a listing reports it. */
export interface StoredIndex {
  readonly version: string
  readonly home: string
  readonly builtAt: string
  readonly totalJars: number
  readonly totalClasses: number
  readonly bytes: number
}

/** How much of an index file is read to recover its summary. */
const HEAD_BYTES = 4096

/** The summary fields of a stored index, as they sit at the front of its file. */
export type IndexSummary = Pick<ClassIndex, 'version' | 'home' | 'builtAt' | 'totalJars' | 'totalClasses'>

/**
 * The summary a stored index carries at the front of its file, without reading the table.
 *
 * {@link writeClassIndex} serialises `{version, home, builtAt, totalJars, totalClasses,
 * index}`, so everything before the `index` key — the one holding hundreds of thousands
 * of entries — is the entire summary. Cutting the head there and closing the object
 * parses the summary without touching the table. Measured on a synthesised index of the
 * size the reference Home produces (43.2 MB, 642,426 entries): **1 ms, against 372 ms**
 * for reading and parsing the whole document. That is the difference between a status
 * endpoint a panel can poll and one it cannot.
 *
 * `undefined` when the head does not carry a summary — a file this module did not write,
 * or one whose `index` key lies beyond {@link HEAD_BYTES} — and the caller reads the
 * whole document instead. Returning nothing rather than guessing is what keeps the
 * fallback honest: a listing never reports figures it did not read.
 *
 * @param full - absolute path to the index file.
 * @returns the summary, or undefined when the head does not hold one.
 */
export async function summaryOf(full: string): Promise<IndexSummary | undefined> {
  let handle
  try {
    handle = await open(full, 'r')
    const head = Buffer.alloc(HEAD_BYTES)
    const { bytesRead } = await handle.read(head, 0, HEAD_BYTES, 0)
    const text = head.subarray(0, bytesRead).toString('utf8')
    if (!text.startsWith('{')) return undefined
    const at = text.indexOf('"index":')
    if (at < 0) return undefined
    // Re-closed as an object: the head ends mid-document, right before the table.
    const parsed = JSON.parse(`{${text.slice(1, at)}"end":0}`) as Partial<ClassIndex>
    return {
      version: typeof parsed.version === 'string' ? parsed.version : '',
      home: typeof parsed.home === 'string' ? parsed.home : '',
      builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : '',
      totalJars: typeof parsed.totalJars === 'number' ? parsed.totalJars : 0,
      totalClasses: typeof parsed.totalClasses === 'number' ? parsed.totalClasses : 0,
    }
  } catch {
    return undefined
  } finally {
    await handle?.close()
  }
}

/**
 * Every index stored, newest first.
 *
 * Listed from each file's head rather than by parsing it whole: a listing has to stay
 * cheap when several indexes of tens of megabytes each are sitting there, and one of
 * them is the summary a status call reads once per panel selection. A file the head
 * cannot summarise is read in full instead — the listing is then slower for that one
 * file, and never wrong.
 *
 * @param dir - the directory to list; defaults to the operator's own. Injected for the
 *   same reason {@link writeClassIndex} takes one: a case can otherwise only exercise
 *   this against whatever happens to be in the operator's data directory.
 * @returns the stored indexes.
 */
export async function listClassIndexes(dir = classIndexDir()): Promise<readonly StoredIndex[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const found: StoredIndex[] = []
  for (const name of names) {
    if (!name.startsWith('class_index_') || !name.endsWith('.json')) continue
    const full = join(dir, name)
    try {
      const info = await stat(full)
      const head = await summaryOf(full)
      const summary = head ?? await readClassIndexAt(full)
      found.push({
        version: summary?.version !== undefined && summary.version !== '' ? summary.version : name,
        home: summary?.home ?? '',
        builtAt: summary?.builtAt !== undefined && summary.builtAt !== '' ? summary.builtAt : info.mtime.toISOString(),
        totalJars: summary?.totalJars ?? 0,
        totalClasses: summary?.totalClasses ?? 0,
        bytes: info.size,
      })
    } catch {
      // An index this process cannot read is not one it can list.
    }
  }
  return found.sort((a, b) => b.builtAt.localeCompare(a.builtAt))
}

/** The fallback for {@link listClassIndexes}: the summary of a whole parsed file. */
async function readClassIndexAt(full: string): Promise<IndexSummary | undefined> {
  const parsed = JSON.parse(await readFile(full, 'utf8')) as Partial<ClassIndex>
  return {
    version: typeof parsed.version === 'string' ? parsed.version : '',
    home: typeof parsed.home === 'string' ? parsed.home : '',
    builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : '',
    totalJars: typeof parsed.totalJars === 'number' ? parsed.totalJars : 0,
    totalClasses: typeof parsed.totalClasses === 'number' ? parsed.totalClasses : 0,
  }
}

/**
 * Drop one stored index.
 *
 * The file is a derived artefact — the same build reproduces it from the installation —
 * so this is not a destructive operation the way removing a registration is. It exists
 * because an index that nobody wants cannot otherwise be got rid of: an index stored
 * under a version label the operator no longer recognises is still what a search with no
 * `version` falls back to, and nothing in the panel could reach it.
 *
 * Only this plugin's own directory is touched. An index the skills' own
 * `build_index.py` wrote lives under `~/.claude/skills/`, and is left alone.
 *
 * @param version - the label the index is stored under.
 * @returns true when a file was removed.
 */
export async function removeClassIndex(version: string): Promise<boolean> {
  try {
    await rm(classIndexPath(version))
    return true
  } catch {
    return false
  }
}

/** One class a search matched. */
export interface ClassHit {
  readonly className: string
  /**
   * Where the class was found, relative to the indexed home.
   *
   * Usually a `.jar`. A module shipped with no jar at all keeps its classes loose on
   * disk, and there this is the `.java` or `.class` file itself — which is why this
   * is not called `jar` any more: a caller told "jar" would hand a source file to
   * `cfr`.
   */
  readonly path: string
}

/**
 * Search one index by class name.
 *
 * Ranked so a caller asking for `PaybillLinkImpl` sees the class whose simple name
 * is exactly that before every class that merely contains it — the common case is a
 * name copied out of a stack trace, and the fully-qualified name is what is missing.
 *
 * @param index - the index to search.
 * @param term - a simple class name, a fully-qualified one, or a fragment.
 * @param limit - how many hits to return at most.
 * @returns the matches, strongest first.
 */
export function searchClassIndex(
  index: ClassIndex,
  term: string,
  limit: number,
): readonly ClassHit[] {
  const needle = term.toLowerCase()
  const exact: ClassHit[] = []
  const bySimple: ClassHit[] = []
  const contains: ClassHit[] = []

  for (const [className, path] of Object.entries(index.index)) {
    const lower = className.toLowerCase()
    if (lower === needle) {
      exact.push({ className, path })
      continue
    }
    const simple = className.slice(className.lastIndexOf('.') + 1)
    if (simple.toLowerCase() === needle) {
      bySimple.push({ className, path })
      continue
    }
    if (contains.length < limit && lower.includes(needle)) {
      contains.push({ className, path })
    }
  }

  return [...exact, ...bySimple, ...contains].slice(0, limit)
}
