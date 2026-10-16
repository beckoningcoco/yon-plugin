/**
 * The arthas tools' contracts: the definitions the registry receives, and the text
 * each one renders.
 *
 * ## What this file is guarding
 *
 * Every `render` here reads its value through a type assertion — `value as {…}` —
 * because a tool definition's value type is inferred from what `execute` returns
 * and `render` receives it erased. An assertion that has drifted from what
 * `execute` actually builds does not fail to compile: it produces a tool that
 * throws, or that prints `undefined`, at the moment a model calls it. That is the
 * one failure mode this suite can catch without a live JVM, so it is the one it
 * goes after.
 *
 * A shapes-only test would be worthless, so the values below are the real ones —
 * copied from responses measured against a live NCC 1909 (see
 * `docs/yon-arthas-design.md`), including the parts that surprised: a `watch` that
 * failed to register still reports `state: "SUCCEEDED"`, `reset` reports
 * `affect.classCount` rather than `effect.classCount`, and `sc -d` for a missing
 * class answers with a `row_affect` of zero and no error at all.
 *
 * Nothing here calls `execute`: every one of those talks to a socket or starts a
 * process. `tests/arthas-live.spec.ts` covers the other half, against a machine
 * that actually has an agent.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { ARTHAS_TOOL_NAMES, catchExpression, registerYonArthasTools } from '../src/host/arthas-tools.ts'
import type { ArthasStore } from '../src/host/arthas-store.ts'
import type { YonArthasService } from '../src/host/arthas-service.ts'
import type { YonToolDefinition } from '../src/host/tools.ts'

/** A store with nothing registered, and a write that goes nowhere. */
function emptyStore(): ArthasStore {
  return {
    path: 'C:/Users/x/.dsh/yon-panel/arthas_config.json',
    read: async () => ({ path: 'C:/Users/x/.dsh/yon-panel/arthas_config.json', arthas: [], exists: false }),
    write: async () => undefined,
  }
}

/**
 * A service that refuses to be used.
 *
 * The observation sessions — and with them the audit ledger — moved into
 * `arthas-service.ts`, because the panel is a second reader of them. These cases
 * only render, so nothing here should reach that service; a stand-in that throws is
 * a better witness than one that answers quietly and lets a future case pass while
 * testing nothing.
 */
function unusedService(): YonArthasService {
  return new Proxy({} as YonArthasService, {
    get: () => () => { throw new Error('the service should not be called from a render test') },
  })
}

/** A host context that records registrations and has no subprocess service. */
function fakeContext(): { ctx: Context; registered: YonToolDefinition[] } {
  const registered: YonToolDefinition[] = []
  const ctx = {
    tools: {
      register: (definition: YonToolDefinition): (() => void) => {
        registered.push(definition)
        return () => undefined
      },
    },
    get: (): unknown => undefined,
    effect: (): (() => void) => () => undefined,
  } as unknown as Context
  return { ctx, registered }
}

/** Register every tool and hand back the definitions, by name. */
function toolsByName(): Map<string, YonToolDefinition> {
  const { ctx, registered } = fakeContext()
  registerYonArthasTools(ctx, unusedService(), emptyStore())
  expect(registered.map(one => one.name)).toEqual([...ARTHAS_TOOL_NAMES])
  return new Map(registered.map(one => [one.name, one]))
}

/** Render one tool's value and return the text. */
function render(tools: Map<string, YonToolDefinition>, name: string, value: unknown): string {
  const definition = tools.get(name)
  expect(definition, `${name} was not registered`).toBeDefined()
  const blocks = definition?.output.render({}, value) ?? []
  expect(blocks).toHaveLength(1)
  const text = blocks[0]?.text
  expect(typeof text).toBe('string')
  return text ?? ''
}

/** One registered Arthas, as the store holds it. */
const ENTRY = {
  id: 'arthas-downloaded',
  path: 'C:/Users/x/.dsh/yon-panel/arthas/dist/arthas-boot.jar',
  version: '4.3.5',
  jdk: '',
  isDefault: true,
  managed: true,
}

/** One target, as `toTargets` builds it. */
const TARGET = {
  pid: 45076,
  mainClass: 'com.yonyou.studio.udt.launching.Launcher',
  kind: 'ncc' as const,
  home: 'E:\\NCProject\\NCC1909\\shouchuang\\home\\ncc1909new',
  args: '-Dnc.server.location=…',
  attached: true,
}

/** A `sc -d` result, with the field names measured on a live agent. */
const SC_RESULT = {
  type: 'sc',
  jobId: 21,
  detailed: true,
  classInfo: {
    classInfo: 'nc.impl.epmp.bgr.BgrReportSyncServiceImpl',
    classLoaderHash: '7c29daf3',
    codeSource: '/E:/NCProject/NCC1909/shouchuang/ncc_scgf_v1909/bin/',
    classloader: ['java.net.URLClassLoader@7c29daf3', 'sun.misc.Launcher$AppClassLoader@18b4aac2'],
  },
}

/** A `watch` hit, as measured. */
const WATCH_HIT = {
  type: 'watch',
  className: 'nc.impl.epmp.bgr.BgrReportSyncServiceImpl',
  methodName: 'buildReportJson',
  accessPoint: 'AtExit',
  cost: 0.5684,
  ts: '2026-10-15 18:37:28.421',
  value: '@ArrayList[\n @String[DUMP_OK E:/dump/x.ser size=385480],\n]',
}

describe('arthas tool contracts', () => {
  it('registers exactly the names it advertises, in order', () => {
    const tools = toolsByName()
    expect([...tools.keys()]).toEqual([...ARTHAS_TOOL_NAMES])
    expect(ARTHAS_TOOL_NAMES).toHaveLength(13)
  })

  it('gives every tool a description, a parameter schema and a call card', () => {
    for (const definition of toolsByName().values()) {
      expect(definition.description.length, definition.name).toBeGreaterThan(80)
      expect(definition.parameters, definition.name).toMatchObject({ type: 'object' })
      // Every tool here is called with an object; a missing `required` would let
      // the model call one with no arguments at all.
      expect(definition.output.schema, definition.name).toMatchObject({ type: 'object' })
      expect(definition.output.schema.required, definition.name).toBeDefined()
    }
  })

  it('renders an empty environment as instructions, not as nothing', () => {
    const tools = toolsByName()
    const text = render(tools, 'arthas_env_list', {
      configPath: 'C:/x/arthas_config.json',
      count: 0,
      entries: [],
    })
    expect(text).toContain('arthas_env_download')
    expect(text).toContain('arthas_env_add')
  })

  it('renders a registered environment with its flags and disk version', () => {
    const tools = toolsByName()
    const text = render(tools, 'arthas_env_list', {
      configPath: 'C:/x/arthas_config.json',
      count: 1,
      entries: [ENTRY],
      diskVersion: '4.3.5',
    })
    expect(text).toContain('arthas-downloaded')
    expect(text).toContain('插件下载')
    expect(text).toContain('4.3.5')
  })

  it('renders a corrupt store by leading with the problem', () => {
    const tools = toolsByName()
    const text = render(tools, 'arthas_env_list', {
      configPath: 'C:/x/arthas_config.json',
      count: 0,
      entries: [],
      error: '无法解析 C:/x/arthas_config.json：它不是合法的 JSON。',
    })
    expect(text.startsWith('⚠')).toBe(true)
    expect(text).toContain('无法解析')
  })

  it('renders the add, download and attach results', () => {
    const tools = toolsByName()
    const added = render(tools, 'arthas_env_add', {
      id: 'arthas-1', path: 'C:/tools/arthas-boot.jar', count: 1, version: '',
    })
    expect(added).toContain('arthas-1')
    expect(added).toContain('版本还没探到')

    const downloaded = render(tools, 'arthas_env_download', {
      id: 'arthas-downloaded', path: 'C:/x/dist/arthas-boot.jar', bytes: 148_033, count: 1,
    })
    expect(downloaded).toContain('148033')

    const attached = render(tools, 'arthas_attach', {
      pid: 45076, port: 8563, attached: true,
    })
    expect(attached).toContain('已挂上 agent')
    expect(attached).not.toContain('常见原因')

    // The interesting failure is the one where the port *did* come up but the agent
    // inside it is somebody else — the global-port trap. Naming that PID is the
    // whole diagnostic value of the render, so it is asserted rather than assumed.
    const failed = render(tools, 'arthas_attach', {
      pid: 45076, port: 8563, attached: false, agentPid: 36496,
    })
    expect(failed).toContain('36496')
    expect(failed).toContain('常见原因')
  })

  it('renders targets with the NCC marker and says which PID holds the agent', () => {
    const tools = toolsByName()
    const text = render(tools, 'arthas_targets', {
      count: 1, jps: 'C:/ufjdk/bin/jps.exe', port: 8563, agentPid: 45076, targets: [TARGET],
    })
    expect(text).toContain('45076')
    expect(text).toContain('[NCC]')
    expect(text).toContain('agent 在这里')
    expect(text).toContain('ncc1909new')
    // The one thing a caller must not misread: the port belongs to one process.
    expect(text).toContain('端口是全局的')

    const idle = render(tools, 'arthas_targets', {
      count: 1, jps: 'jps', port: 8563, targets: [{ ...TARGET, attached: false }],
    })
    expect(idle).toContain('端口 8563 上没有任何 agent')
    expect(idle).not.toContain('agent 在这里')

    const none = render(tools, 'arthas_targets', { count: 0, jps: 'jps', port: 8563, targets: [] })
    expect(none).toContain('没有列出任何 JVM')
  })

  it('renders an sc hit with the -c hint, and a miss as an explanation', () => {
    const tools = toolsByName()
    const found = render(tools, 'arthas_sc', {
      className: 'nc.impl.epmp.bgr.BgrReportSyncServiceImpl',
      found: true,
      hash: '7c29daf3',
      codeSource: 'E:/NCProject/NCC1909/shouchuang/ncc_scgf_v1909/bin',
      loaders: ['java.net.URLClassLoader@7c29daf3'],
      cached: false,
    })
    expect(found).toContain('7c29daf3')
    expect(found).toContain('-c 7c29daf3')

    const missed = render(tools, 'arthas_sc', {
      className: 'com.example.Nope', found: false, loaders: [], cached: false,
    })
    expect(missed).toContain('没有找到')
  })

  it('renders every kind of exec result without losing the failure', () => {
    const tools = toolsByName()
    const ok = render(tools, 'arthas_exec', {
      command: 'sc -d X',
      state: 'SUCCEEDED',
      ok: true,
      results: [SC_RESULT, { type: 'status', statusCode: 0 }],
    })
    expect(ok).toContain('命令成功')

    // The measured awkwardness: a failed command whose state still says SUCCEEDED.
    const bad = render(tools, 'arthas_exec', {
      command: 'watch X nope',
      state: 'SUCCEEDED',
      ok: false,
      failure: 'No class or method is affected',
      results: [
        { type: 'enhancer', success: false, effect: { classCount: 1, methodCount: 0 } },
        { type: 'status', statusCode: -1 },
      ],
    })
    expect(bad).toContain('命令失败')
    expect(bad).toContain('No class or method is affected')
    expect(bad).toContain('success=false')
  })

  it('renders a watch session that is waiting, one that hit, and one that never will', () => {
    const tools = toolsByName()

    const waiting = render(tools, 'arthas_events', {
      session: '1', state: 'watching', finished: false, command: 'watch …',
      waitedMs: 30_000, results: [],
    })
    expect(waiting).toContain('还没有命中')

    const hit = render(tools, 'arthas_events', {
      session: '1', state: 'settled', finished: true, command: 'watch …',
      waitedMs: 12_000,
      results: [
        { type: 'enhancer', success: true, effect: { classCount: 1, methodCount: 1 } },
        WATCH_HIT,
        { type: 'status', statusCode: 0 },
      ],
    })
    expect(hit).toContain('观测已注册')
    expect(hit).toContain('命中 1 次')
    expect(hit).toContain('buildReportJson')
    expect(hit).toContain('DUMP_OK')

    const never = render(tools, 'arthas_events', {
      session: '1', state: 'settled', finished: true, command: 'watch …',
      waitedMs: 30_000, results: [{ type: 'status', statusCode: 0 }],
    })
    expect(never).toContain('没有命中任何一次调用')
  })

  it('renders the stop outcome exactly as the service reported it', () => {
    const tools = toolsByName()
    // The reset loop moved into `arthas-service.ts` (the panel's stop button runs
    // the same cleanup), so the tool no longer renders rounds it performed itself —
    // it renders the service's verdict. That is also what keeps a failed cleanup
    // from being reported as a success: the sentence comes from the code that
    // counted, not from a render guessing at a boolean.
    const cleaned = render(tools, 'arthas_watch_stop', {
      session: '1',
      className: 'a.B',
      message: '已停止并清理（reset 到 classCount=0，共 2 轮）。',
    })
    expect(cleaned).toContain('已停止')
    expect(cleaned).toContain('classCount=0')
    expect(cleaned).toContain('2 轮')

    const stuck = render(tools, 'arthas_watch_stop', {
      session: '1',
      className: 'a.B',
      message: '已停止，但 reset a.B 未能在 10 轮内归零 —— 增强可能还在。',
    })
    expect(stuck).toContain('未能')
    expect(stuck).toContain('增强可能还在')

    const silent = render(tools, 'arthas_watch_stop', {
      session: '1',
      className: 'a.B',
      message: '',
    })
    expect(silent).toContain('没有报告清理结果')
  })

  it('renders the start and capture handles as the next step, not as a result', () => {
    const tools = toolsByName()
    const started = render(tools, 'arthas_watch_start', {
      session: '1', pid: 45076, command: "watch a.B c '{params}' -n 1", state: 'watching',
    })
    expect(started).toContain('#1')
    expect(started).toContain('arthas_events')
    expect(started).toContain('arthas_watch_stop')

    const captured = render(tools, 'arthas_capture', {
      session: '2',
      pid: 45076,
      command: "watch a.B c '{(#d=new java.io.File(\"E:/d\"),#d.mkdirs(),"
        + "#f=new java.io.FileOutputStream(\"E:/d/t_1.ser\"),#o=new java.io.ObjectOutputStream(#f),"
        + "#o.writeObject(params[0]),#o.flush(),#o.close(),\"DUMP_OK E:/d/t_1.ser\")}' -n 1",
      file: 'E:/d/t_1.ser',
      dumpDir: 'E:/d',
      state: 'watching',
    })
    // The file is named before the watch runs (this side owns the clock), and the
    // render has to say which one, or the DUMP_OK line in the result has nothing
    // to be matched against.
    expect(captured).toContain('E:/d/t_1.ser')
    expect(captured).toContain('DUMP_OK')
    // And the one limit worth stating up front: a non-Serializable value fails
    // inside writeObject rather than being reported by a helper.
    expect(captured).toContain('可序列化')
  })

  it('composes the catch expression so a failure keeps both its throwable and its arguments', () => {
    // The expression *is* this tool — everything else about a catch is bookkeeping.
    // Each assertion below stands for something that was measured against a live
    // JVM, because the failure it guards against is silent: a watch that stores
    // nothing still answers `state: "SUCCEEDED"`.
    const withArgs = catchExpression({
      dir: 'E:/c', prefix: 'catch_1', withArgs: true, uniqueNames: false,
    })

    // The exception variable. Measured: Arthas's Advice has `throwExp`, and `throw`
    // dies with `ognl.NoSuchPropertyException: ...Advice.throw` — so the natural
    // spelling is the wrong one, and this is the assertion that keeps it out.
    expect(withArgs).toContain('writeObject(throwExp)')
    expect(withArgs).not.toContain('writeObject(throw)')
    // The arguments go out as the raw `params` array, which is exactly the shape
    // `Replay` passes as a parameter list — that is what makes a caught failure
    // replayable rather than merely readable.
    expect(withArgs).toContain('writeObject(params)')
    expect(withArgs).toContain('.thrown.ser')
    expect(withArgs).toContain('.args.ser')
    // Ordered: OGNL has no try/catch, so a non-Serializable argument ends the whole
    // expression. Writing the throwable first is what still leaves the exception on
    // disk when that happens.
    expect(withArgs.indexOf('.thrown.ser')).toBeLessThan(withArgs.indexOf('.args.ser'))
    // One hit is named outright on this side, which is what lets the tool state both
    // paths before the watch fires.
    expect(withArgs).toContain('E:/c/catch_1')
    expect(withArgs).not.toContain('currentTimeMillis')
    // A longer run cannot be, so the JVM's clock finishes the name instead — a name
    // fixed up front would have every hit overwrite the one before it.
    const many = catchExpression({
      dir: 'E:/c', prefix: 'catch_1', withArgs: true, uniqueNames: true,
    })
    expect(many).toContain('E:/c/catch_1_"+@System@currentTimeMillis()')
    expect(many).toContain('.thrown.ser')
    // No helper class anywhere: only java.io, which every classloader can see.
    expect(withArgs).toContain('java.io.ObjectOutputStream')
    // And the throwable is what comes back — measured, `{(a, b)}` is an array whose
    // single element is the sequence's LAST term, so a `DUMP_OK` term in front would
    // be evaluated and then dropped before it reached the event stream.
    expect(withArgs).toContain('throwExp)}')
    expect(withArgs).not.toContain('DUMP_OK')

    const thrownOnly = catchExpression({
      dir: 'E:/c', prefix: 'catch_1', withArgs: false, uniqueNames: false,
    })
    expect(thrownOnly).toContain('.thrown.ser')
    expect(thrownOnly).not.toContain('.args.ser')
    expect(thrownOnly).not.toContain('writeObject(params)')
  })

  it('renders a catch as the paths it really knows, and only promises what it writes', () => {
    const tools = toolsByName()
    const caught = render(tools, 'arthas_catch', {
      session: '3',
      pid: 45076,
      command: "watch a.B c '{…}' -e -n 1",
      catchDir: 'E:/c',
      fileBase: 'E:/c/catch_1',
      single: true,
      captureArgs: true,
      state: 'watching',
    })
    // One hit is named before the watch runs (this side owns the whole name), so the
    // render can state both paths outright — and it has to, because the evidence
    // showed the path cannot be read back out of the event stream.
    expect(caught).toContain('E:/c/catch_1.thrown.ser')
    expect(caught).toContain('E:/c/catch_1.args.ser')
    expect(caught).not.toContain('<jvm-clock>')
    // The whole reason this tool exists is the step from a failure to an offline
    // reproduction, so the render has to name the way across.
    expect(caught).toContain('replay_run')
    expect(caught).toContain('一键重放')

    const many = render(tools, 'arthas_catch', {
      session: '5',
      pid: 45076,
      command: "watch a.B c '{…}' -e -n 5",
      catchDir: 'E:/c',
      fileBase: 'E:/c/catch_1',
      single: false,
      captureArgs: true,
      state: 'watching',
    })
    // Several hits cannot be named here, so the render gives the prefix and says how
    // to find the rest — and must not claim the one-click replay it cannot offer.
    expect(many).toContain('E:/c/catch_1_<jvm-clock>.thrown.ser')
    expect(many).toContain('列 E:/c/catch_1_*')
    expect(many).not.toContain('一键重放')
    expect(many).toContain('手填')

    const thrownOnly = render(tools, 'arthas_catch', {
      session: '4',
      pid: 45076,
      command: "watch a.B c '{…}' -e -n 1",
      catchDir: 'E:/c',
      fileBase: 'E:/c/catch_1',
      single: true,
      captureArgs: false,
      state: 'watching',
    })
    // With arguments off, no .args.ser is written — so the render must not offer
    // one, nor the replay step that only makes sense with it.
    expect(thrownOnly).toContain('.thrown.ser')
    expect(thrownOnly).not.toContain('.args.ser')
    expect(thrownOnly).not.toContain('replay_run')
  })

  it('renders a trace as milliseconds with the baseline it was compared against', () => {
    const tools = toolsByName()
    const measured = render(tools, 'arthas_trace', {
      session: '6',
      pid: 45076,
      command: 'trace -n 3 a.B c',
      waited: true,
      hits: 3,
      costsUs: [222900, 47800, 45100],
      avgUs: 105267,
      minUs: 45100,
      maxUs: 222900,
      baselinePath: 'E:/b/a.B#c.jsonl',
      previousAvgUs: 93700,
      previousMinUs: 46000,
      delta: 0.1234,
      minDelta: -0.0196,
      state: 'settled',
    })
    // Microseconds to milliseconds is a rendering choice, and this is the rendering: the
    // values arrive as 222900 and have to read as 222.900 ms.
    expect(measured).toContain('222.900 ms')
    expect(measured).toContain('105.267 ms')
    // Two comparisons, because a spiky method can only be judged on one of them: the average
    // says +12.3% while the minimum says -2.0%, and it is the minimum that answers "did the
    // code change" when a single slow call can move the average by tens of percent.
    expect(measured).toContain('平均 +12.3%')
    expect(measured).toContain('93.700 ms')
    expect(measured).toContain('最小 -2.0%')
    expect(measured).toContain('46.000 ms')
    // And a batch this uneven (222.9 ms against 45.1 ms) has to say so, or the average above
    // it will be read as a conclusion.
    expect(measured).toContain('样本波动大')
    // And the enhancement outlives the command, so the render has to say how to clear it.
    expect(measured).toContain('classCount=1')
    expect(measured).toContain('arthas_watch_stop')

    const first = render(tools, 'arthas_trace', {
      session: '7',
      pid: 45076,
      command: 'trace -n 1 a.B c',
      waited: true,
      hits: 1,
      costsUs: [1000],
      avgUs: 1000,
      minUs: 1000,
      maxUs: 1000,
      baselinePath: 'E:/b/a.B#c.jsonl',
      state: 'settled',
    })
    // No previous run must read as "first measurement", never as a zero-percent change.
    expect(first).toContain('第一次记录')
    expect(first).not.toContain('%')

    const none = render(tools, 'arthas_trace', {
      session: '8',
      pid: 45076,
      command: 'trace -n 5 a.B c',
      waited: false,
      hits: 0,
      costsUs: [],
      baselinePath: 'E:/b/a.B#c.jsonl',
      state: 'watching',
    })
    // Nothing observed: no average may be claimed, and the trace is still running.
    expect(none).toContain('arthas_events')
    expect(none).not.toContain('平均')
    expect(none).not.toContain('第一次记录')
  })

  it('derives a call card from arguments alone, for every tool', () => {
    const tools = toolsByName()
    const args: Record<string, Record<string, unknown>> = {
      arthas_env_list: {},
      arthas_env_add: { path: 'C:/tools/arthas-boot.jar' },
      arthas_env_download: {},
      arthas_targets: {},
      arthas_attach: { pid: 45076 },
      arthas_exec: { pid: 45076, command: 'sc -d a.B' },
      arthas_sc: { pid: 45076, className: 'a.B' },
      arthas_watch_start: { pid: 45076, className: 'a.B', methodName: 'c' },
      arthas_events: { session: '1' },
      arthas_watch_stop: { session: '1' },
      arthas_capture: { pid: 45076, className: 'a.B', methodName: 'c' },
      arthas_catch: { pid: 45076, className: 'a.B', methodName: 'c' },
      arthas_trace: { pid: 45076, className: 'a.B', methodName: 'c' },
    }
    for (const [name, provided] of Object.entries(args)) {
      const definition = tools.get(name)
      expect(definition, `${name} missing`).toBeDefined()
      const card = definition?.presentCall?.(provided)
      expect(card, `${name} produced no card`).toBeDefined()
      expect(card?.title.length, name).toBeGreaterThan(0)
    }
  })
})
