/**
 * The metadata index, as the panel and the tools use it.
 *
 * This layer owns three things the index file does not:
 *
 * - **One build per version at a time.** A rebuild is 3.6 s on the reference Home and
 *   the panel's button is one click away from being pressed twice; two builds racing
 *   would each read the previous index and the second write would drop the first's work.
 * - **A loaded index, cached.** A query needs the whole 8.33 MB document parsed, and the
 *   panel asks several questions in a row. One version is cached — the one last used —
 *   because a second copy of a 40 MB object graph is memory nobody asked to spend.
 * - **Long builds reported rather than awaited.** `startBuild` returns the moment the
 *   work is queued; the state it reports is what the panel polls, and an HTTP request
 *   that is a minute long is a request some proxy will cut.
 *
 * ## Where the Home comes from
 *
 * The service is handed a `resolve` function rather than the registrations themselves.
 * The alternative — importing `YonHomesService` — is a cycle: the Home list already
 * carries each row's metadata-index summary, so `home-service.ts` reads from here. The
 * seam is one function either way, and this direction is the one that has no cycle.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseBmf } from './meta-bmf.ts'
import {
  checkFreshness, findEntities, findEnums, findFields, listMetaIndexes, readMetaIndex,
  type MetaBuildProgress, type MetaFreshness, type MetaIndex, type StoredMetaIndex,
} from './meta-index.ts'
import { HomeError } from './home-files.ts'
import type { MetaBuildView, MetaIndexStatusView } from '../shared/types.ts'

/** One Home, as the metadata service needs it. */
export interface MetaHome {
  readonly id: string
  readonly path: string
  readonly version: string
  readonly product: string
}

/** One entity a query matched, with the fields that matched it. */
export interface MetaEntityHit {
  readonly name: string
  readonly filename: string
  readonly displayName: string
  readonly tableName: string
  readonly fullClassName: string
  readonly module: string
  readonly file: string
  readonly primary: boolean
  /** How many fields the entity has in total. */
  readonly fieldCount: number
  /** The fields that matched the query; empty for an entity-name query. */
  readonly matched: readonly string[]
}

/** One enumeration a query matched. */
export interface MetaEnumHit {
  readonly name: string
  readonly displayName: string
  readonly fullClassName: string
  readonly module: string
  readonly file: string
  readonly items: readonly (readonly [string, string])[]
}

/** A query's answer, whatever it was asked about. */
export interface MetaQueryAnswer {
  readonly home: string
  readonly version: string
  readonly kind: 'entity' | 'field' | 'enum'
  readonly term: string
  readonly total: number
  readonly truncated: boolean
  readonly entities: readonly MetaEntityHit[]
  readonly enums: readonly MetaEnumHit[]
  /** True when the stored index no longer matches the installation. */
  readonly stale: boolean
  readonly freshness?: MetaFreshness
}

/** One field of an entity, with everything the file says about it. */
export interface MetaFieldDetail {
  readonly name: string
  readonly label: string
  readonly dbtype: string
  readonly fieldType: string
  readonly typeName: string
  readonly length: number
  readonly precise: number
  readonly isKey: boolean
  readonly isNullable: boolean
  readonly isReadOnly: boolean
  readonly isHide: boolean
  readonly defaultValue: string
  /** The value set, when the field's type resolves to an enumeration in the same file. */
  readonly values?: readonly (readonly [string, string])[]
}

/** One entity's full field list, read from the file that defines it. */
export interface MetaDetailAnswer {
  readonly home: string
  readonly version: string
  readonly entity: string
  readonly filename: string
  readonly displayName: string
  readonly tableName: string
  readonly fullClassName: string
  readonly module: string
  readonly file: string
  readonly fields: readonly MetaFieldDetail[]
  /** Other files that also define an entity of this name, when there are any. */
  readonly others: readonly string[]
}

/** What `startBuild` was asked to do, and whether it was already being done. */
export interface MetaBuildHandle {
  readonly started: boolean
  readonly status: MetaIndexStatusView
}

/** The metadata index, as the tools and the panel use it. */
export interface YonMetaService {
  status(homeId: string, withFreshness?: boolean): Promise<MetaIndexStatusView>
  startBuild(homeId: string): Promise<MetaBuildHandle>
  query(homeId: string, kind: 'entity' | 'field' | 'enum', term: string, limit: number): Promise<MetaQueryAnswer>
  detail(homeId: string, entity: string, file?: string): Promise<MetaDetailAnswer>
  /** Every index stored, for the panel's summary. */
  list(): Promise<readonly StoredMetaIndex[]>
  dispose(): void
}

/** The state one running build reports. */
interface Running {
  readonly version: string
  readonly startedAt: string
  progress: MetaBuildProgress
  running: boolean
  error?: string
}

/** How long a running build's state is kept after it finishes, for the panel to see. */
const KEEP_DONE_MS = 30_000

/**
 * Open the service.
 *
 * @param resolve - look one registered Home up by id.
 * @param build - the builder, injected so a test can run it without a real tree.
 * @param write - where a built index goes, injected for the same reason.
 * @param read - where a stored index comes from. Defaults to the real store; a test
 *   hands it its own map so that neither half of the pair touches the operator's disk.
 * @returns the service.
 */
export function createYonMetaService(
  resolve: (id: string) => Promise<MetaHome>,
  build: (
    home: string,
    version: string,
    previous: MetaIndex | undefined,
    onProgress: (progress: MetaBuildProgress) => void,
  ) => Promise<MetaIndex>,
  write: (built: MetaIndex) => Promise<string>,
  read: (version: string) => Promise<MetaIndex | undefined> = readMetaIndex,
): YonMetaService {
  /** Builds in flight or just finished, by version. */
  const running = new Map<string, Running>()
  /** The one loaded index, and which version it is. */
  let cached: { version: string; index: MetaIndex } | undefined

  const requireHome = async (id: string): Promise<MetaHome> => {
    const home = await resolve(id)
    if (home.version.trim() === '') {
      throw new HomeError('invalid-input',
        `这个 Home（${id}）没有版本号，而元数据索引是按版本存的，没有版本就没有索引可对应。请先补上版本。`)
    }
    return home
  }

  /** The stored index for a version, parsed once and kept. */
  const loaded = async (version: string): Promise<MetaIndex | undefined> => {
    if (cached !== undefined && cached.version === version) return cached.index
    const index = await read(version)
    if (index !== undefined) cached = { version, index }
    return index
  }

  /** The build state to show: one running now, or one that just finished. */
  const buildView = (version: string): MetaBuildView | undefined => {
    const state = running.get(version)
    if (state === undefined) return undefined
    if (!state.running && Date.now() - Date.parse(state.startedAt) > KEEP_DONE_MS) {
      running.delete(version)
      return undefined
    }
    return {
      running: state.running,
      parsed: state.progress.parsed,
      total: state.progress.total,
      files: state.progress.files,
      current: state.progress.current,
      startedAt: state.startedAt,
      ...state.error === undefined ? {} : { error: state.error },
    }
  }

  const service: YonMetaService = {
    async status(homeId: string, withFreshness = true): Promise<MetaIndexStatusView> {
      const home = await requireHome(homeId)
      const stored = (await listMetaIndexes()).find(entry => entry.version === home.version)
      const view = buildView(home.version)
      if (stored === undefined) {
        return {
          indexed: false,
          version: home.version,
          ...view === undefined ? {} : { build: view },
        }
      }
      // Only checked when asked: it costs a walk plus 3,600 stats (measured 0.61 s), which
      // is fine for opening a panel and wrong to repeat on every second of a poll.
      let freshness: MetaFreshness | undefined
      if (withFreshness) {
        const index = await loaded(home.version)
        if (index !== undefined) freshness = await checkFreshness(home.path, index.fingerprint)
      }
      return {
        indexed: true,
        version: home.version,
        builtAt: stored.builtAt,
        counts: stored.counts,
        bytes: stored.bytes,
        sourceHomes: (await loaded(home.version))?.sourceHomes ?? [],
        ...freshness === undefined ? {} : { freshness },
        ...view === undefined ? {} : { build: view },
      }
    },

    async startBuild(homeId: string): Promise<MetaBuildHandle> {
      const home = await requireHome(homeId)
      const already = running.get(home.version)
      if (already !== undefined && already.running) {
        return { started: false, status: await service.status(homeId, false) }
      }
      const state: Running = {
        version: home.version,
        startedAt: new Date().toISOString(),
        progress: { files: 0, parsed: 0, total: 0, current: '' },
        running: true,
      }
      running.set(home.version, state)
      // Not awaited: the caller is an HTTP request that has to return, and the panel
      // polls `status` for where this got to. The rejection is caught here rather than
      // left to float, so a failed build is a state the panel can show, not a crash.
      void (async () => {
        try {
          const previous = await read(home.version)
          const built = await build(home.path, home.version, previous, progress => {
            state.progress = progress
          })
          await write(built)
          // The cached copy is now the one before the rebuild, which would answer the
          // next query with the tree as it used to be.
          if (cached?.version === home.version) cached = undefined
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error)
        } finally {
          state.running = false
        }
      })()
      return { started: true, status: await service.status(homeId, false) }
    },

    async query(homeId, kind, term, limit): Promise<MetaQueryAnswer> {
      const home = await requireHome(homeId)
      const index = await loaded(home.version)
      if (index === undefined) {
        throw new HomeError('not-found',
          `还没有为版本 ${home.version} 建元数据索引。请在 Yon 面板的「Home 管理」里，对 ${homeId} 点一次「建立元数据索引」。`)
      }
      const entities: MetaEntityHit[] = []
      const enums: MetaEnumHit[] = []
      let total = 0
      if (kind === 'entity') {
        const hits = findEntities(index, term, limit)
        total = hits.length
        for (const hit of hits) {
          entities.push({
            name: hit.name,
            filename: hit.filename,
            displayName: hit.displayName,
            tableName: hit.tableName,
            fullClassName: hit.fullClassName,
            module: hit.module,
            file: hit.file,
            primary: hit.primary,
            fieldCount: hit.fields.length,
            matched: [],
          })
        }
      } else if (kind === 'field') {
        const hits = findFields(index, term, limit)
        total = hits.length
        for (const hit of hits) {
          entities.push({
            name: hit.entity.name,
            filename: hit.entity.filename,
            displayName: hit.entity.displayName,
            tableName: hit.entity.tableName,
            fullClassName: hit.entity.fullClassName,
            module: hit.entity.module,
            file: hit.entity.file,
            primary: hit.entity.primary,
            fieldCount: hit.entity.fields.length,
            matched: hit.fields,
          })
        }
      } else {
        const hits = findEnums(index, term, limit)
        total = hits.length
        for (const hit of hits) {
          enums.push({
            name: hit.name,
            displayName: hit.displayName,
            fullClassName: hit.fullClassName,
            module: hit.module,
            file: hit.file,
            items: hit.items,
          })
        }
      }
      const freshness = await checkFreshness(home.path, index.fingerprint)
      return {
        home: home.id,
        version: home.version,
        kind,
        term,
        total,
        truncated: total >= limit,
        entities,
        enums,
        stale: freshness.state !== 'fresh',
        freshness,
      }
    },

    async detail(homeId: string, entity: string, file?: string): Promise<MetaDetailAnswer> {
      const home = await requireHome(homeId)
      const index = await loaded(home.version)
      if (index === undefined) {
        throw new HomeError('not-found',
          `还没有为版本 ${home.version} 建元数据索引，而 detail 需要先知道这个实体定义在哪个文件里。`
          + '请在面板里对它有 Home 点一次「建立元数据索引」。')
      }
      const wanted = entity.trim().toLowerCase()
      const defining = index.entities.filter(candidate =>
        candidate.name.toLowerCase() === wanted || candidate.filename.toLowerCase() === wanted)
      if (defining.length === 0) {
        throw new HomeError('not-found', `索引里没有叫「${entity}」的实体。先用 ncc_meta_find 的 kind=entity 找到它的准确名字。`)
      }
      // The question is *which file*, so the count and the list are per file, not per
      // record. One file holding several entities that match — every entity in
      // `psndoc.bmf` matches the name `psndoc` through its filename — is one place to
      // look, not thirty; measured on 机械院 2111 that file alone carried 31 of them.
      const files = new Map<string, string[]>()
      for (const candidate of defining) {
        const tables = files.get(candidate.file) ?? []
        if (!tables.includes(candidate.tableName)) tables.push(candidate.tableName)
        files.set(candidate.file, tables)
      }
      // A name several files define is not a name to pick a winner for: the caller gets
      // the list and says which one, and until it does, nothing is returned that could be
      // mistaken for the entity they did not ask about.
      const chosen = file === undefined
        ? (files.size === 1 ? defining[0] : undefined)
        : defining.find(candidate => candidate.file === file || candidate.file.endsWith(`/${file}`))
      if (chosen === undefined) {
        const lines = [...files].map(([path, tables]) => `  · ${tables.join(' / ')} — ${path}`)
        throw new HomeError('invalid-input',
          `「${entity}」在 ${files.size} 个文件里都有定义，请用 file 说明要哪一个：\n${lines.join('\n')}`)
      }

      const absolute = join(home.path, ...chosen.file.split('/'))
      let text: string
      try {
        text = await readFile(absolute, 'utf8')
      } catch (error) {
        throw new HomeError('not-found',
          `读不出这个实体定义的文件：${chosen.file}（${error instanceof Error ? error.message : String(error)}）。`
          + '索引可能是旧的，重建一次再试。')
      }
      const component = parseBmf(text, chosen.module, chosen.filename)
      const parsed = component.entities.find(candidate =>
        candidate.name.toLowerCase() === wanted || candidate.filename.toLowerCase() === wanted) ?? component.entities[0]
      // A field's `dataType` is the enumeration's `id` for an enum-typed column, so the
      // same file's enumerations are the whole lookup — no global id space needed.
      const byId = new Map(component.enums.map(enumeration => [enumeration.id, enumeration]))
      const fields: MetaFieldDetail[] = (parsed?.fields ?? []).map(field => {
        const values = byId.get(field.dataType)?.items
        return {
          name: field.name,
          label: field.label,
          dbtype: field.dbtype,
          fieldType: field.fieldType,
          typeName: field.typeName,
          length: field.length,
          precise: field.precise,
          isKey: field.isKey,
          isNullable: field.isNullable,
          isReadOnly: field.isReadOnly,
          isHide: field.isHide,
          defaultValue: field.defaultValue,
          ...values === undefined ? {} : { values: values.map(item => [item.value, item.label] as const) },
        }
      })
      return {
        home: home.id,
        version: home.version,
        entity: parsed?.name ?? entity,
        filename: chosen.filename,
        displayName: parsed?.displayName ?? chosen.displayName,
        tableName: parsed?.tableName ?? chosen.tableName,
        fullClassName: parsed?.fullClassName ?? chosen.fullClassName,
        module: chosen.module,
        file: chosen.file,
        fields,
        // Deduplicated by path, from the same per-file view: the sentence this feeds is
        // about *files* ("同名实体在另外 N 个文件里也有定义"), and `defining` is per record.
        // Measured on 机械院 2111: `psndoc` matched 34 records behind 2 other files.
        others: [...files.keys()].filter(path => path !== chosen.file),
      }
    },

    async list(): Promise<readonly StoredMetaIndex[]> {
      return await listMetaIndexes()
    },

    dispose(): void {
      // A build already in flight cannot be cancelled — it is a read of somebody's disk
      // and it will finish either way. What disposing drops is the memory: the parsed
      // index, and the state of a build nobody is watching any more.
      cached = undefined
      running.clear()
    },
  }

  return service
}
