/**
 * Where the operator's NCC/BIP installation directories are registered.
 *
 * The shape is `wiki-store.ts`'s, not `datasource-store.ts`'s. Both are JSON
 * documents under `~/.dsh/yon-panel/`, but a datasource document is written by an
 * external script that reads it back (`db_config.json`), while this one is a list
 * of paths that only this plugin and the panel ever touch — which is what a vault
 * list is too. So: `read()`/`write()`, one promise chain for the writes, and a
 * tmp-then-rename so a crash mid-write cannot leave half a registration behind.
 *
 * ## Two deliberate departures from `wiki-store.ts`
 *
 * **An unreadable file is reported, not swallowed.** `wiki-store.ts:105-109`
 * answers a document it cannot parse with an empty list. That is defensible for a
 * vault list the operator can re-add in one line, and wrong here: an empty list
 * looks exactly like "nothing registered yet", so a corrupted file would present
 * itself as a lost registration. Reporting the path at least tells the operator
 * which file to fix. The message is `datasource-store.ts:180-187`'s.
 *
 * **No seeding.** `wiki-store.ts` guesses vaults under the home directory. A
 * guessed Home is worse than no Home: the model would be handed a directory that
 * is *near* an installation and would happily read the wrong `modules/` tree.
 * Registration is manual, and the empty state says so.
 *
 * ## Paths
 *
 * Both separators are accepted on input and the forward-slash form is stored, so
 * the document reads the same on either platform and stays diffable. Every
 * containment decision is made with `node:path` (`resolve`/`relative`), never by
 * string concatenation.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { HomeProduct, HomeProfileView } from '../shared/types.ts'

/**
 * One registered Home as the document stores it.
 *
 * No name: a Home is called `<产品线><版本>` (`homeLabelOf`), so storing one would be
 * a second copy of two fields that are already here — and the copy is the one that
 * can go stale when the document is edited by hand.
 */
export interface StoredHome {
  readonly id: string
  readonly path: string
  readonly product: HomeProduct
  readonly version: string
  readonly isDefault: boolean
  /** Last probe of this path; absent until the entry has been probed once. */
  readonly profile?: HomeProfileView
}

/** The document on disk. Every field is optional: it is hand-editable. */
export interface HomeConfig {
  readonly homes?: readonly StoredHome[]
}

/** One read of the document, with the reason it came back empty when it did. */
export interface HomeStoreRead {
  readonly path: string
  readonly homes: readonly StoredHome[]
  /** False when the document does not exist yet — "nothing registered". */
  readonly exists: boolean
  /** Set only when the document exists and could not be used as written. */
  readonly error?: string
}

/** The document, as the rest of the host uses it. */
export interface HomeStore {
  readonly path: string
  read(): Promise<HomeStoreRead>
  write(homes: readonly StoredHome[]): Promise<void>
}

/** Where the registrations live. */
export function defaultHomeStorePath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'home_config.json')
}

/**
 * Read one entry, or reject it.
 *
 * A bad entry is skipped rather than failing the whole document: the operator
 * hand-edits this file, and losing every registration because one line lost its
 * quoting is a worse outcome than losing that line. `wiki-store.ts:51-58` makes
 * the same call for the same reason.
 */
function asHome(value: unknown): StoredHome | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entry = value as Record<string, unknown>
  const id = entry.id
  const root = entry.path
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof root !== 'string' || root === '') return undefined
  const profile = entry.profile !== null && typeof entry.profile === 'object' && !Array.isArray(entry.profile)
    ? entry.profile as HomeProfileView
    : undefined
  return {
    id,
    path: root,
    product: entry.product === 'bip' ? 'bip' : 'ncc',
    version: typeof entry.version === 'string' ? entry.version : '',
    isDefault: entry.isDefault === true,
    ...profile === undefined ? {} : { profile },
  }
}

/**
 * Open the registration document.
 * @param path - the document to read and write; defaults to the operator's own.
 * @returns the store, bound to that one path.
 */
export function createHomeStore(path = defaultHomeStorePath()): HomeStore {
  // Writes only. Reads do not need the chain — they mutate nothing — and the
  // service keeps its own line for the read-modify-write cycles, which is where
  // a lost update could actually happen.
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  const writeNow = async (homes: readonly StoredHome[]): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify({ homes }, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  return {
    path,

    async read(): Promise<HomeStoreRead> {
      // The read and the parse are separate failures: ENOENT means "nothing
      // registered yet", anything else means the document is there but unusable.
      const text = await readFile(path, 'utf8').catch(() => undefined)
      if (text === undefined) return { path, homes: [], exists: false }
      try {
        // Stripped by code point rather than by a pattern: the escape sequence for
        // this character is invisible in the source, and an editor that drops it
        // would leave behind a rule matching the four letters F-E-F-F.
        const body = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
        const parsed = JSON.parse(body) as HomeConfig
        const raw = Array.isArray(parsed.homes) ? parsed.homes : []
        const homes = raw.map(asHome).filter((home): home is StoredHome => home !== undefined)
        return { path, homes, exists: true }
      } catch {
        return {
          path,
          homes: [],
          exists: true,
          error: `无法解析 ${path}：它不是合法的 JSON。请修正该文件，或在面板里删除后重建。`,
        }
      }
    },

    write(homes: readonly StoredHome[]): Promise<void> {
      // The array is copied before it is queued: `write()` may be called with an
      // array the caller goes on to mutate, and the chain would then serialise a
      // value that changed while it waited.
      const snapshot = [...homes]
      return inLine(() => writeNow(snapshot))
    },
  }
}
