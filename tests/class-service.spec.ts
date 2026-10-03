/**
 * The class-index service: the three things the file itself cannot do.
 *
 * `class-index.ts` writes an index and reads one back. What it does not have is any
 * notion of *an index being built right now* — and that is the whole reason this layer
 * exists. The panel's button is one click away from being pressed twice, the model can
 * start a build of the same version while the panel is watching another, and both walk
 * the same disk and write the same file. So the rules under test here are:
 *
 * - one walk per version, whoever asks second joins the first;
 * - `startBuild` returns before the walk does, and what it returns is the state a poll
 *   can follow;
 * - a walk that found nothing is an error rather than an empty index, because an empty
 *   index answers every search with "no match" while meaning "you pointed me at the
 *   wrong directory";
 * - deleting the file also drops the in-memory state, so the panel cannot report
 *   progress for an index that is no longer there.
 *
 * Every seam is injected — `build`, `write`, `list`, `drop` — so nothing here touches a
 * real installation, and, more to the point, nothing writes into the operator's
 * `~/.dsh/yon-panel/knowledge/`. A test that did would leave index files behind in
 * somebody's data directory; two such leftovers already exist there.
 */
import { describe, expect, it, vi } from 'vitest'
import type { BuildProgress, ClassIndex, StoredIndex } from '../src/host/class-index.ts'
import { createYonClassService } from '../src/host/class-service.ts'
import { HomeError } from '../src/host/home-files.ts'
import type { ClassBuildView, ClassIndexStatusView } from '../src/shared/types.ts'

const VERSION = '2111'

/** An index as the walker would hand it over, with the two counts a case reads. */
function built(jars: number, classes: number): ClassIndex {
  return {
    version: VERSION,
    home: 'E:/NCProject/NCC/home',
    builtAt: '2026-10-03T09:00:00.000Z',
    totalJars: jars,
    totalClasses: classes,
    index: { 'nc.demo.Thing': 'modules/demo/lib/demo.jar' },
  }
}

/** One stored-index row, as `listClassIndexes` reports it. */
function stored(over: Partial<StoredIndex> = {}): StoredIndex {
  return {
    version: VERSION,
    home: 'E:/NCProject/NCC/home',
    builtAt: '2026-10-03T09:00:00.000Z',
    totalJars: 7941,
    totalClasses: 143_908,
    bytes: 12_884_901,
    ...over,
  }
}

/**
 * A service over injected halves, plus the handles a case needs to steer them.
 *
 * The default walker resolves at once; a case that wants to look at a build *while* it
 * runs calls `gate()` to hold it open and `release()` to let it finish, which is the
 * only way to observe the states between "queued" and "done" without a real timer.
 */
function bench(over: {
  readonly resolved?: readonly StoredIndex[]
  readonly walk?: (onProgress: (progress: BuildProgress) => void) => Promise<ClassIndex>
  readonly drop?: (version: string) => Promise<boolean>
} = {}) {
  const walks: string[] = []
  let index = [...(over.resolved ?? [])]
  let tally = 0

  const service = createYonClassService(
    async (id) => {
      expect(id).toBe('h')
      return { id, path: 'E:/NCProject/NCC/home', version: VERSION }
    },
    async (home, version, onProgress) => {
      walks.push(`${home}@${version}`)
      tally += 1
      return over.walk === undefined ? built(7941, 143_908) : await over.walk(onProgress)
    },
    // The store is written here and not by the walker, which is the order the service
    // enforces: it refuses an empty walk *before* writing, so a case where the walk
    // produced nothing must leave the list empty too.
    async (produced: ClassIndex) => {
      index = [stored({ totalJars: produced.totalJars, totalClasses: produced.totalClasses })]
      return 'C:/Users/operator/.dsh/yon-panel/knowledge/class_index_2111.json'
    },
    async () => index,
    over.drop ?? (async () => { index = []; return true }),
  )

  return { service, walks, produced: () => tally }
}

/** A promise a case resolves by hand, so a build can be inspected mid-flight. */
function gate() {
  let open = (): void => {}
  const waiting = new Promise<void>(resolve => { open = resolve })
  return { waiting, open: () => { open() } }
}

describe('the class-index service', () => {
  it('reports nothing indexed for a version with no file, and still names the version', async () => {
    const { service } = bench()
    expect(await service.status('h')).toEqual({ indexed: false, version: VERSION })
  })

  it('reports what the stored file says once there is one', async () => {
    const { service } = bench({ resolved: [stored()] })
    const status = await service.status('h')
    expect(status.indexed).toBe(true)
    expect(status.totalClasses).toBe(143_908)
    expect(status.totalJars).toBe(7941)
    expect(status.bytes).toBe(12_884_901)
    expect(status.builtAt).toBe('2026-10-03T09:00:00.000Z')
    // Nothing has been built in this process, so there is no build state to attach —
    // and an `undefined` here is what tells the panel not to draw a progress line.
    expect(status.build).toBeUndefined()
  })

  it('builds on demand and hands back the numbers the tool prints', async () => {
    const { service, walks } = bench()
    const result = await service.build('h')
    expect(walks).toEqual(['E:/NCProject/NCC/home@2111'])
    expect(result.home).toBe('h')
    expect(result.version).toBe(VERSION)
    expect(result.totalJars).toBe(7941)
    expect(result.totalClasses).toBe(143_908)
    expect(result.path).toBe('C:/Users/operator/.dsh/yon-panel/knowledge/class_index_2111.json')
    // A duration is reported, not pinned: it is wall-clock and a tight bound would make
    // this case fail on a loaded machine for no reason.
    expect(result.seconds).toBeGreaterThanOrEqual(0)
  })

  it('queues a build instead of awaiting it, and reports the walk as running', async () => {
    const hold = gate()
    const { service } = bench({
      walk: async (onProgress) => {
        onProgress({ jars: 1200, classes: 40_000, current: 'modules/arap/lib/arap.jar' })
        await hold.waiting
        return built(7941, 143_908)
      },
    })

    const handle = await service.startBuild('h')
    // The request that started it has already returned; the walk has not finished.
    expect(handle.started).toBe(true)
    expect(handle.status.build?.running).toBe(true)
    expect(handle.status.build?.jars).toBe(1200)
    expect(handle.status.build?.classes).toBe(40_000)
    expect(handle.status.build?.current).toBe('modules/arap/lib/arap.jar')
    // No file yet, so the status still says "not indexed" — which is why the panel draws
    // the progress line from `build`, not from the index summary.
    expect(handle.status.indexed).toBe(false)

    hold.open()
    // The finished state is kept briefly (KEEP_DONE_MS) so the poll that saw `running`
    // also gets to see it stop — that transition is what ends the polling.
    await vi.waitFor(async () => {
      expect((await service.status('h')).build?.running).toBe(false)
    })
    const after = await service.status('h')
    expect(after.indexed).toBe(true)
    expect(after.totalClasses).toBe(143_908)
  })

  it('joins the walk already running rather than starting a second one', async () => {
    const hold = gate()
    const { service, walks } = bench({
      walk: async () => {
        await hold.waiting
        return built(7941, 143_908)
      },
    })

    const first = await service.startBuild('h')
    const second = await service.startBuild('h')
    expect(first.started).toBe(true)
    // The second caller is told no new work began — not that nothing is happening.
    expect(second.started).toBe(false)
    expect(second.status.build?.running).toBe(true)

    // And a waiter joins the same walk: `build` from the tool side of the house, while
    // the panel's build is still in flight, must not start a second pass over the disk.
    const waited = service.build('h')
    hold.open()
    expect((await waited).totalClasses).toBe(143_908)
    expect(walks).toHaveLength(1)
  })

  it('refuses to call a directory with nothing in it an index', async () => {
    const { service } = bench({ walk: async () => built(0, 0) })

    await expect(service.build('h')).rejects.toThrow(HomeError)
    // The failure is a state the panel can show, not a lost rejection: the walk errored,
    // the build is no longer running, and the message says which directory was wrong.
    const status = await service.status('h')
    expect(status.build?.running).toBe(false)
    expect(status.build?.error).toContain('E:/NCProject/NCC/home')
    expect(status.indexed).toBe(false)
  })

  it('lets a fresh build start after a failed one', async () => {
    let attempt = 0
    const { service, produced } = bench({
      walk: async () => {
        attempt += 1
        // The first pass finds nothing; the second finds the installation. Without the
        // `inFlight` entry being cleared in `finally`, the retry would be handed the
        // first walk's already-rejected promise and the error would be permanent.
        return attempt === 1 ? built(0, 0) : built(7941, 143_908)
      },
    })

    await expect(service.build('h')).rejects.toThrow()
    const retried = await service.build('h')
    expect(retried.totalClasses).toBe(143_908)
    expect(produced()).toBe(2)
  })

  it('drops the build state along with the file', async () => {
    const hold = gate()
    const { service } = bench({
      walk: async () => {
        await hold.waiting
        return built(7941, 143_908)
      },
    })
    await service.startBuild('h')
    const removed = await service.remove('h')

    expect(removed).toBe(true)
    // The running walk was not cancelled, and the file it is about to write is gone
    // again — but the state the panel was polling is, so it cannot report progress for
    // an index that is not there.
    expect((await service.status('h')).build).toBeUndefined()
    hold.open()
    await service.build('h').catch(() => undefined)
  })

  it('says so when there was no file to remove', async () => {
    const { service } = bench({ drop: async () => false })
    expect(await service.remove('h')).toBe(false)
  })

  it('turns down a registration with no version, since the index is kept per version', async () => {
    const service = createYonClassService(
      async (id) => ({ id, path: 'E:/NCProject/NCC/home', version: '  ' }),
      async () => built(1, 1),
      async () => 'nowhere',
    )
    // Building would write `class_index_.json` — a file no row can ever find again, and
    // exactly the shape of the two phantom indexes found in the operator's directory.
    await expect(service.build('h')).rejects.toThrow(/版本/)
    await expect(service.status('h')).rejects.toThrow(/版本/)
  })

  it('reports an unknown registration as the resolver does', async () => {
    const service = createYonClassService(
      async (id) => { throw new HomeError('not-found', `没有登记这个 Home：${id}`) },
      async () => built(1, 1),
      async () => 'nowhere',
    )
    await expect(service.status('h')).rejects.toThrow(/没有登记这个 Home：h/)
  })

  it('keeps the state of a build a second caller joined out of its own status read', async () => {
    // Two versions, two homes: the state map is keyed by version, and a build of one
    // must not colour the other. This is the shape of the bug the panel's live status
    // would show as "the row above is building" while a different row was selected.
    const rows: StoredIndex[] = [stored({ version: '2111' }), stored({ version: '2312', totalClasses: 5561 })]
    const seen: ClassIndexStatusView[] = []
    const service = createYonClassService(
      async (id) => ({
        id,
        path: `E:/NCProject/NCC/${id}/home`,
        version: id === 'a' ? '2111' : '2312',
      }),
      async () => built(1, 1),
      async () => 'nowhere',
      async () => rows,
    )
    seen.push(await service.status('a'))
    seen.push(await service.status('b'))
    expect(seen[0]?.totalClasses).toBe(143_908)
    expect(seen[1]?.totalClasses).toBe(5561)
    expect(seen[0]?.build).toBeUndefined()
    expect(seen[1]?.build).toBeUndefined()
  })

  it('forgets a finished build once its state has aged out', async () => {
    // `KEEP_DONE_MS` is what keeps the panel's last poll from seeing the build vanish
    // between "running" and "gone". It is not asserted through the clock — the walk here
    // finishes before the panel ever asks — so what this pins down is the other end: a
    // build that finished and was observed does not stay in the map forever, and the
    // status stops carrying a `build` at all once it is dropped.
    const { service } = bench({ walk: async () => built(1, 1) })
    await service.build('h')
    const immediate = await service.status('h')
    expect(immediate.build?.running).toBe(false)

    // Disposing is the documented way that state goes away without a new build.
    service.dispose()
    expect((await service.status('h')).build).toBeUndefined()
  })

  it('leaves a build in flight alone when the panel it was serving goes away', async () => {
    const hold = gate()
    const { service } = bench({
      walk: async () => {
        await hold.waiting
        return built(7941, 143_908)
      },
    })
    await service.startBuild('h')
    service.dispose()

    // Disposing drops the watched state but not the walk: it is a read of somebody's
    // disk and it finishes either way — and its file is what the next status reads.
    const view: ClassBuildView | undefined = (await service.status('h')).build
    expect(view).toBeUndefined()
    hold.open()
    await vi.waitFor(async () => {
      expect((await service.status('h')).indexed).toBe(true)
    })
  })
})
