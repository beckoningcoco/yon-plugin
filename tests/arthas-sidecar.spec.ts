/**
 * 侧车的生命周期：什么时候写、什么时候不留、什么时候清。
 *
 * 这些是文件系统行为，所以它有自己的 spec —— `arthas-tools.spec.ts` 守的是每个工具的
 * render 契约，那里一个 `execute` 都不调（每个 execute 都要连 socket 或起进程）。
 *
 * 守的是那件真实发生过的事：侧车原来在观测**启动时**就写下去，而 `.ser` 是 JVM 里的
 * Arthas 在命中那一刻才出现的。于是挂载失败（例如 `java.*` 挂不上）或始终没命中的观测，
 * 会在落盘目录里留下一个永远配不上对的 json —— 面板扫的是 `.ser`，所以它不被列出来，
 * 也没人清理，抓一次失败就多一个。
 */
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { sweepOrphanSidecars, writeSidecarAfterDump } from '../src/host/arthas-tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A scratch directory, standing in for an observation's output directory. */
async function bench(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-arthas-sidecar-'))
  temporary.push(dir)
  return dir
}

/** The directory's file names, sorted, so a case can assert the whole listing. */
async function namesOf(dir: string): Promise<string[]> {
  return (await readdir(dir)).sort()
}

/** A timestamp far past the sweep's minimum age. */
const LONG_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000)

describe('the sidecar beside a dump', () => {
  it('writes nothing when the observation ended without a dump', async () => {
    // 挂载失败、或者一直没命中：观测结束了，dump 从来没有出现。以前这里会留下一个 json。
    const dir = await bench()

    await writeSidecarAfterDump(join(dir, 'tag_1.ser'), { className: 'nc.X' }, Promise.resolve())

    expect(await namesOf(dir)).toEqual([])
  })

  it('writes the sidecar once the dump is really there', async () => {
    const dir = await bench()
    const dump = join(dir, 'tag_1.ser')
    await writeFile(dump, 'bytes')

    await writeSidecarAfterDump(dump, { className: 'nc.X', methodName: 'm' }, Promise.resolve())

    expect(await namesOf(dir)).toEqual(['tag_1.ser', 'tag_1.ser.json'])
    expect(JSON.parse(await readFile(`${dump}.json`, 'utf8')).className).toBe('nc.X')
  })

  it('decides only after the observation has ended', async () => {
    // 观测还在等的时候就写，正是那些「没命中」的侧车的来源；所以这一刻目录里必须还是空的。
    const dir = await bench()
    const dump = join(dir, 'tag_1.ser')
    await writeFile(dump, 'bytes')
    let finish = (): void => {}
    const pending = new Promise<void>(resolve => { finish = resolve })

    const writing = writeSidecarAfterDump(dump, {}, pending)
    await Promise.resolve()
    expect(await namesOf(dir)).toEqual(['tag_1.ser'])

    finish()
    await writing
    expect(await namesOf(dir)).toEqual(['tag_1.ser', 'tag_1.ser.json'])
  })
})

describe('sweeping the litter an older version left behind', () => {
  it('removes an orphan that is old enough, and touches nothing else', async () => {
    const dir = await bench()
    await writeFile(join(dir, 'paired.ser'), 'bytes')
    await writeFile(join(dir, 'paired.ser.json'), '{}')
    // 刚出现、还没配上对：可能正有一个观测在等命中，不能动它。
    await writeFile(join(dir, 'fresh.ser.json'), '{}')
    const stale = join(dir, 'stale.ser.json')
    await writeFile(stale, '{}')
    await utimes(stale, LONG_AGO, LONG_AGO)

    await sweepOrphanSidecars(dir)

    expect(await namesOf(dir)).toEqual(['fresh.ser.json', 'paired.ser', 'paired.ser.json'])
  })

  it('leaves a json that is not shaped like a sidecar alone', async () => {
    // 只认「某个 .ser 加 .json」。目录里别的 json 不是它的东西。
    const dir = await bench()
    const other = join(dir, 'config.json')
    await writeFile(other, '{}')
    await utimes(other, LONG_AGO, LONG_AGO)

    await sweepOrphanSidecars(dir)

    expect(await namesOf(dir)).toEqual(['config.json'])
  })

  it('says nothing when the directory does not exist', async () => {
    // 它跑在每次观测开始的地方，不该有任何让工具失败的机会。
    await expect(sweepOrphanSidecars(join(tmpdir(), 'yon-arthas-sidecar-absent'))).resolves.toBeUndefined()
  })
})
