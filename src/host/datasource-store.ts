/**
 * Where the data sources live on disk.
 *
 * ## Why a file in the operator's own data directory
 *
 * The connections belong to the operator, not to the package: a file inside the
 * plugin directory would be replaced by the next plugin upgrade, taking every
 * host, login and password with it. `~/.dsh/yon-panel/db_config.json` is a
 * location the plugin can write, the operator can read, edit, back up and copy
 * between machines, and — because it is the plugin's own path rather than
 * another tool's — nothing else has to be installed for it to exist.
 *
 * ## Why this shape and not a storage domain
 *
 * The file is read by `resources/db-query/db_query.py`, which is an ordinary
 * script that knows nothing about Cordis. Keeping the on-disk shape exactly what
 * that script already understands (`projects.<name>.<env>.{host,port,…}`) means
 * a connection edited in the panel is immediately usable by the script, with no
 * export step, no second copy, and no translation layer to drift.
 *
 * `projectId` is the one member this plugin adds: the script ignores unknown
 * keys, so the binding costs the script nothing while giving the panel the one
 * fact the operator cares about — which project a connection belongs to.
 *
 * ## Concurrency
 *
 * Every write replaces the whole file through a temporary sibling and a rename,
 * so a reader never observes a half-written document and an interrupted write
 * leaves the previous contents intact. Read-modify-write is serialised in-process
 * by the promise chain below; two plugin instances sharing one file are not a
 * case this store claims to handle.
 */
import { constants } from 'node:fs'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** One environment branch of a stored connection, as the file holds it. */
export interface StoredEnvironment {
  readonly host?: unknown
  readonly port?: unknown
  readonly service_name?: unknown
  readonly users?: unknown
  readonly [key: string]: unknown
}

/** One stored connection group: a database type plus one branch per environment. */
export interface StoredConnection {
  readonly type?: unknown
  /** The project this connection belongs to; a member only this plugin reads. */
  readonly projectId?: unknown
  readonly [key: string]: unknown
}

/** The whole stored document. */
export interface StoredConfig {
  readonly projects?: Record<string, StoredConnection>
}

/** One read of the store, successful or not. */
export interface StoreRead {
  /** Absolute path the answer came from. */
  readonly path: string
  /** The parsed document; empty when nothing could be read. */
  readonly config: StoredConfig
  /** False when the file is absent AND could not be seeded from anywhere. */
  readonly exists: boolean
  /**
   * Where a first run copied its starting contents from, when it did. Reported
   * so the surface can say so once, instead of the operator wondering why an
   * empty install already lists connections.
   */
  readonly seededFrom?: string
  /** Why a file that exists could not be read, when it could not. */
  readonly error?: string
}

/** The store plus the path it settled on. */
export interface DataSourceStore {
  /** Absolute path of the document this store reads and writes. */
  readonly path: string
  /**
   * Read the document, seeding it from the legacy location on a first run.
   * @returns the parsed document and how the read went.
   */
  read(): Promise<StoreRead>
  /**
   * Replace the document, atomically.
   * @param config - the whole document to store.
   */
  write(config: StoredConfig): Promise<void>
}

/**
 * Where a pre-plugin installation kept its connections.
 *
 * Read once, on a first run, to seed the new file — never written to, and never
 * required: a machine that has never had it simply starts empty.
 */
const LEGACY_PATH = join(homedir(), '.claude', 'skills', 'yonyou-bip-dev', 'db_config.json')

/** The default document location, under the operator's DSH data directory. */
export function defaultStorePath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'db_config.json')
}

/**
 * Whether a path exists as a file.
 * @param path - absolute path to test.
 * @returns true when it is there and readable.
 */
async function isFile(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Read and parse one JSON document.
 * @param path - absolute path to read.
 * @returns the parsed value, or undefined when it is absent or unparseable.
 */
async function readJson(path: string): Promise<StoredConfig | undefined> {
  try {
    const text = await readFile(path, 'utf8')
    // A BOM would make JSON.parse throw on an otherwise valid document.
    return JSON.parse(text.replace(/^\uFEFF/, '')) as StoredConfig
  } catch {
    return undefined
  }
}

/**
 * Build the store over one path.
 * @param path - where the document lives; defaults to {@link defaultStorePath}.
 * @returns the store.
 */
export function createDataSourceStore(path: string = defaultStorePath()): DataSourceStore {
  /** Serialises read-modify-write rounds so two writers cannot interleave. */
  let queue: Promise<unknown> = Promise.resolve()

  const inLine = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    // The chain must survive a rejection, or one failed write would poison
    // every later one.
    queue = next.catch(() => undefined)
    return next
  }

  /**
   * Write the document, unqueued.
   *
   * Deliberately not `store.write`: a seeding read runs INSIDE the queue, so
   * re-entering it would wait on the read that is waiting on the write, and the
   * first call on a fresh machine would hang forever instead of failing.
   * @param config - the whole document to store.
   */
  const writeNow = async (config: StoredConfig): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    // Same directory, so the rename is atomic on every platform this runs on.
    await rename(temporary, path)
  }

  const store: DataSourceStore = {
    path,

    read() {
      return inLine(async () => {
        const existing = await readJson(path)
        if (existing !== undefined) return { path, config: existing, exists: true }

        // Absent, or present but unreadable. An unreadable file is reported rather
        // than silently replaced: it holds the operator's own edits, and a bad
        // hand-edit is something they can fix once they are told.
        if (await isFile(path)) {
          return {
            path,
            config: {},
            exists: true,
            error: `无法解析 ${path}：它不是合法的 JSON。请修正该文件，或在面板里删除后重建。`,
          }
        }

        const legacy = await readJson(LEGACY_PATH)
        if (legacy === undefined) return { path, config: {}, exists: false }

        // A first run on a machine that already had connections: adopt them, so
        // installing the plugin does not look like losing the configuration.
        await writeNow(legacy)
        return { path, config: legacy, exists: true, seededFrom: LEGACY_PATH }
      })
    },

    write(config) {
      return inLine(() => writeNow(config))
    },
  }

  return store
}
