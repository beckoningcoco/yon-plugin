/**
 * Reading a `trace` and keeping its numbers as a baseline.
 *
 * ## Why the fixture is a real response
 *
 * The parse is not guesswork about a documented format — it is a reading of one measured
 * answer, so the fixture below is copied verbatim from a live NCC 1909 (`trace -n 2
 * nc.impl.epmp.bgr.BgrReportSyncServiceImpl now`, 2026-10-15). Two things in it are worth
 * knowing before writing code against it, and both are asserted here:
 *
 *  - the result is **structured**, not a rendered tree of text, so nothing parses prose;
 *  - `root` is the *thread*, and the traced method is in `root.children` — with its cost in
 *    **microseconds** (`222900` for a call that takes about 223 ms).
 *
 * A shapes-only fixture would pass while the code multiplied every duration by 1000.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { traceHits, type ArthasResult } from '../src/host/arthas-http.ts'
import { appendBaseline, baselinePath, readLastBaseline, summarise } from '../src/host/arthas-baseline.ts'

/** One `results` array exactly as a live NCC 1909 answered a `trace`. */
const LIVE_RESULTS: readonly ArthasResult[] = [
  { effect: { classCount: 1, cost: 89, listenerId: 36, methodCount: 1 }, jobId: 287, success: true, type: 'enhancer' },
  {
    jobId: 287,
    nodeCount: 1,
    root: {
      children: [{
        className: 'nc.impl.epmp.bgr.BgrReportSyncServiceImpl',
        cost: 222900,
        invoking: false,
        lineNumber: -1,
        maxCost: 222900,
        methodName: 'now',
        minCost: 222900,
        times: 1,
        totalCost: 222900,
        type: 'method',
      }],
      classloader: 'sun.misc.Launcher$AppClassLoader@18b4aac2',
      daemon: true,
      priority: 5,
      threadId: 491,
      threadName: 'arthas-command-execute',
      timestamp: '2026-10-15 23:48:55.994',
      type: 'thread',
    },
    type: 'trace',
  },
  { jobId: 287, statusCode: 0, type: 'status' },
]

/** Where the baseline cases write; removed afterwards. */
const scratch = await mkdtemp(join(tmpdir(), 'yon-baseline-'))
afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

describe('reading a trace', () => {
  it('takes the calls out of the measured response, in microseconds', () => {
    const hits = traceHits(LIVE_RESULTS)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.at).toBe('2026-10-15 23:48:55.994')
    expect(hits[0]?.thread).toBe('arthas-command-execute')
    const call = hits[0]?.calls[0]
    expect(call?.methodName).toBe('now')
    expect(call?.className).toBe('nc.impl.epmp.bgr.BgrReportSyncServiceImpl')
    // The unit assertion: 222900 is microseconds, and 222.9 ms is what that call took.
    // Reading it as milliseconds would claim three and a half minutes.
    expect(call?.costUs).toBe(222_900)
    expect(ms(call?.costUs ?? 0)).toBe('222.900')
  })

  it('keeps nested calls, and ignores the results that are not traces', () => {
    const hits = traceHits([
      { type: 'enhancer', success: true },
      {
        type: 'trace',
        root: {
          timestamp: 't',
          threadName: 'th',
          type: 'thread',
          children: [{
            className: 'a.B',
            methodName: 'outer',
            cost: 5000,
            times: 1,
            children: [{
              className: 'a.B',
              methodName: 'inner',
              cost: 1200,
              times: 3,
              children: [],
            }],
          }],
        },
      },
      { type: 'status', statusCode: 0 },
    ])
    expect(hits).toHaveLength(1)
    const outer = hits[0]?.calls[0]
    expect(outer?.methodName).toBe('outer')
    const inner = outer?.children[0]
    expect(inner?.methodName).toBe('inner')
    // `times` is how often the node ran inside the traced call, and it is not the cost.
    expect(inner?.times).toBe(3)
    expect(inner?.costUs).toBe(1200)
  })

  it('answers with nothing rather than throwing on a shape it does not know', () => {
    // A trace result whose root is missing or is not what this expects must read as "no
    // data": the alternative is a tool that dies on a response Arthas is free to change.
    expect(traceHits([{ type: 'trace' }])).toEqual([])
    expect(traceHits([{ type: 'trace', root: 'nonsense' }])).toEqual([])
    expect(traceHits([{ type: 'trace', root: { children: 'nonsense' } }])).toEqual([])
    expect(traceHits([])).toEqual([])
  })
})

describe('the performance baseline', () => {
  it('summarises one run, and refuses to summarise nothing', () => {
    expect(summarise([], 'th')).toBeUndefined()
    const sample = summarise([100, 300, 200], 'th', 1234)
    expect(sample?.hits).toBe(3)
    expect(sample?.avgUs).toBe(200)
    expect(sample?.minUs).toBe(100)
    expect(sample?.maxUs).toBe(300)
    expect(sample?.at).toBe(1234)
    expect(sample?.costsUs).toEqual([100, 300, 200])
  })

  it('compares each run with the one before it, and appends rather than overwrites', async () => {
    const path = join(scratch, 'cmp.jsonl')
    const first = summarise([1000, 1000], 'th')
    expect(first).toBeDefined()
    // The first run has nothing to compare with — not a zero, an absence.
    expect(await appendBaseline(path, first!)).toBeUndefined()

    const slower = summarise([2000, 2000], 'th')
    const shift = await appendBaseline(path, slower!)
    expect(shift?.previous.avgUs).toBe(1000)
    expect(shift?.delta).toBeCloseTo(1, 5)

    const faster = summarise([500, 500], 'th')
    const down = await appendBaseline(path, faster!)
    // Against the run immediately before it (2000), not against the first one (1000).
    expect(down?.previous.avgUs).toBe(2000)
    expect(down?.delta).toBeCloseTo(-0.75, 5)
    expect(down?.minDelta).toBeCloseTo(-0.75, 5)

    // Three runs, three lines: appending is what lets a number be seen to move.
    const lines = (await readFile(path, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(await readLastBaseline(path)).toMatchObject({ avgUs: 500 })
  })

  it('keeps a spiky method honest: the average moves, the minimum does not', async () => {
    // The measured case this exists for. Two runs of `BgrReportSyncServiceImpl#now`, five
    // calls each: minima 47.6 → 46.6 ms (nothing changed) while the averages read 80.3 → 99.9
    // ms. A reader shown only "+24.5% slower" would have concluded the method regressed when
    // one outlier in the second batch was the whole story. Both figures are kept, and both
    // are reported.
    const path = join(scratch, 'spiky.jsonl')
    await appendBaseline(path, summarise([207800, 47800, 47600, 49000, 49200], 'th')!)
    const shift = await appendBaseline(path, summarise([198000, 48600, 156900, 49500, 46600], 'th')!)

    // The average looks like a regression...
    expect(shift?.delta).toBeGreaterThan(0.2)
    // ...while the minimum — the one figure an outlier cannot move — says nothing happened.
    expect(shift?.minDelta).toBeLessThan(0)
    expect(Math.abs(shift?.minDelta ?? 1)).toBeLessThan(0.05)
  })

  it('reads past a corrupt line instead of losing the history behind it', async () => {
    const path = join(scratch, 'corrupt.jsonl')
    await writeFile(path, [
      JSON.stringify({ at: 1, hits: 2, costsUs: [10, 20], avgUs: 15, minUs: 10, maxUs: 20, thread: 'th' }),
      '{ half a line, process killed',
      '',
    ].join('\n'), 'utf8')
    // The truncated tail is skipped and the readable sample before it is what comes back.
    const last = await readLastBaseline(path)
    expect(last?.avgUs).toBe(15)
    // A file that does not exist is the first-run case, not an error.
    expect(await readLastBaseline(join(scratch, 'never-written.jsonl'))).toBeUndefined()
  })

  it('names one file per method, keeping the name usable on disk', () => {
    const path = baselinePath('nc.vo.pub.lang.UFDouble', '<init>')
    expect(path).toContain('nc.vo.pub.lang.UFDouble#_init_')
    expect(path.endsWith('.jsonl')).toBe(true)
    // Angle brackets cannot go into a Windows file name.
    expect(path).not.toContain('<')
    expect(path).not.toContain('>')
  })
})

/** Microseconds to a millisecond string, without the unit — as the renderer does it. */
function ms(microseconds: number): string {
  return (microseconds / 1000).toFixed(3)
}
