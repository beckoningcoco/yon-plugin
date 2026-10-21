/**
 * Content search inside one registered front-end project.
 *
 * This is the half of "排查前端问题" that a file-name search cannot do: the
 * question is usually "where does this URL / field / button code / message come
 * from", and the answer is a line inside a file whose name says nothing about it.
 *
 * ## What it refuses to do
 *
 * It reads files, so it is bounded on four axes — text extensions only, one
 * megabyte per file, a per-file hit cap, and a total hit cap — and it skips the
 * same directories `ncc_fe_find` skips. `src/platform/` is the one that matters:
 * 65–207 MB of bundled react/axios per project, none of it this project's code,
 * and searching it would bury the four real hits under a hundred library matches.
 *
 * ## The timeout is a result, not an error
 *
 * A project of 7 000 files answers in a couple of seconds, but a machine under
 * load or a project on a network drive can take longer than the caller is willing
 * to wait. The walk checks a deadline between files and returns what it has with
 * `timedOut: true`, because "these are the first N hits, there may be more" is
 * more useful than a rejection that throws the hits away.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { decodeText, isBinary, resolveInside } from './home-files.ts'
import { FrontendError } from './frontend-service.ts'
import type { FrontendGrepHit } from '../shared/types.ts'

/** The directories a search never descends into. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.npm-cache', 'arthas-output'])

/** The runtime library directory, relative to the project root. */
const PLATFORM_DIR = 'src/platform'

/**
 * The file extensions worth reading as text.
 *
 * No `.map`: a source map is one enormous JSON line, and a hit inside it is a
 * pointer to another file rather than a line of source. No images, no fonts.
 */
const TEXT_EXTS = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'less', 'css', 'scss',
  'json', 'html', 'htm', 'md', 'txt', 'xml', 'properties',
])

/** Most one file may contribute to the answer. */
const PER_FILE_HITS = 3

/** Most a single file is read as, in bytes. */
const MAX_FILE_BYTES = 1_000_000

/** How deep the walk goes. */
const WALK_DEPTH = 16

/** Directory entries one search visits before it stops. */
const WALK_CAP = 100_000

/** What a caller may ask `grep` for. */
export interface GrepQuery {
  /** Literal text, or a regular expression when `regex` is set. */
  readonly pattern: string
  /** One extension, with or without the dot. Every text extension when omitted. */
  readonly ext?: string
  /** A directory to search inside; `src` when omitted. */
  readonly under?: string
  readonly regex?: boolean
  /** Total hits to return; defaults to 40, capped at 200. */
  readonly limit?: number
  /** Wall-clock budget; defaults to 8 s. */
  readonly timeoutMs?: number
}

/** What one search found, before the caller names the registration. */
export interface GrepResult {
  readonly matches: readonly FrontendGrepHit[]
  /** Files actually read. */
  readonly filesScanned: number
  /** Files that contributed at least one hit. */
  readonly filesMatched: number
  /** True when a hit cap or the walk cap stopped the search. */
  readonly capped: boolean
  readonly timedOut: boolean
  readonly skipped: readonly string[]
}

/** One line, trimmed to something a conversation can hold. */
function snippet(raw: string): string {
  const text = raw.trim()
  if (text.length <= 200) return text
  return `${text.slice(0, 200)}…`
}

/**
 * Search one project's text files.
 *
 * @param root - the registered project root.
 * @param query - what to look for and how far to go.
 * @returns the hits, and what bounded them.
 * @throws FrontendError when the pattern or the directory is unusable.
 */
export async function grepProject(root: string, query: GrepQuery): Promise<GrepResult> {
  const pattern = query.pattern.trim()
  if (pattern === '') throw new FrontendError('invalid-input', 'pattern 不能为空')

  let test: (line: string) => boolean
  if (query.regex === true) {
    let expression: RegExp
    try {
      expression = new RegExp(pattern, 'i')
    } catch (cause: unknown) {
      throw new FrontendError('invalid-input',
        `正则写错了：${cause instanceof Error ? cause.message : String(cause)}。`
        + '要按普通文字找就把 regex 去掉。')
    }
    test = line => expression.test(line)
  } else {
    // Case-insensitive literal search: nobody remembers whether the code writes
    // `bankContrast` or `bankcontrast`, and a case-sensitive miss reads as "not there".
    const needle = pattern.toLowerCase()
    test = line => line.toLowerCase().includes(needle)
  }

  const start = await resolveInside(root, query.under === undefined || query.under.trim() === ''
    ? 'src'
    : query.under)
  const startInfo = await stat(start).catch(() => undefined)
  if (startInfo === undefined || !startInfo.isDirectory()) {
    throw new FrontendError('invalid-input', `under 得是工程里的一个目录：${query.under ?? 'src'}`)
  }

  const rawExt = query.ext === undefined ? '' : query.ext.trim().toLowerCase()
  const only = rawExt === '' ? undefined : rawExt.startsWith('.') ? rawExt.slice(1) : rawExt
  const limit = query.limit === undefined || !Number.isFinite(query.limit)
    ? 40
    : Math.max(1, Math.min(200, Math.floor(query.limit)))
  const deadline = Date.now() + (query.timeoutMs === undefined ? 8_000 : Math.max(500, query.timeoutMs))

  const matches: FrontendGrepHit[] = []
  let filesScanned = 0
  let filesMatched = 0
  let capped = false
  let timedOut = false
  let visited = 0
  const skipped = ['src/platform', 'node_modules', 'dist', '.git']

  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (capped || timedOut || depth > WALK_DEPTH) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (capped || timedOut) return
      visited += 1
      if (visited > WALK_CAP) {
        capped = true
        return
      }
      if (Date.now() > deadline) {
        timedOut = true
        return
      }
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        if (childRel === PLATFORM_DIR) continue
        await walk(path.join(dir, entry.name), childRel, depth + 1)
        continue
      }
      if (!entry.isFile()) continue

      const extension = path.extname(entry.name).slice(1).toLowerCase()
      if (only === undefined ? !TEXT_EXTS.has(extension) : extension !== only) continue
      const info = await stat(path.join(dir, entry.name)).catch(() => undefined)
      if (info === undefined || info.size > MAX_FILE_BYTES) continue

      const bytes = await readFile(path.join(dir, entry.name)).catch(() => undefined)
      if (bytes === undefined || isBinary(bytes)) continue
      filesScanned += 1
      const lines = decodeText(bytes).text.split('\n')
      let inFile = 0
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? ''
        if (!test(line)) continue
        if (inFile >= PER_FILE_HITS) break
        matches.push({ rel: childRel, line: index + 1, text: snippet(line) })
        inFile += 1
        if (matches.length >= limit) {
          capped = true
          break
        }
      }
      if (inFile > 0) filesMatched += 1
    }
  }

  await walk(start, path.relative(root, start).split(path.sep).join('/'), 0)

  return { matches, filesScanned, filesMatched, capped, timedOut, skipped }
}
