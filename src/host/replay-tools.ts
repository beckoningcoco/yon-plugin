/**
 * The replay tools: prepare an offline classpath, run a captured call, compare runs.
 *
 * ## What this group is for
 *
 * `arthas_capture` put a live object on disk. These four tools are what make that
 * worth doing: change a business method, run it again against the same argument, and
 * read the diff — measured at about four seconds end to end, against restarting NCC
 * and re-driving the screen.
 *
 * ## Why they are four tools and not one
 *
 * Because the expensive part is separable from the repeated part. Preparing an
 * environment reads 5,481 classpath entries out of the JVM and builds a 59 KB jar;
 * that is worth doing once and reusing for every later run. A single
 * "replay this dump" tool would pay that cost per call, and the whole point of this
 * module is a short loop.
 *
 * ## Why the diff ignores the cost header
 *
 * Measured: two runs of the same dump differ in their `# cost=Nms` line and nowhere
 * else. Without that exclusion every diff would look like a change, and a tool that
 * always reports a difference is one nobody reads — which is the failure mode this
 * module exists to avoid.
 */
import type { Context } from '@deepseek-ai/cordis'
import { ArthasError } from './arthas-errors.ts'
import type { YonReplayService } from './replay-service.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** Every tool this module owns. */
export const REPLAY_TOOL_NAMES = [
  'replay_prepare',
  'replay_run',
  'replay_diff',
  'replay_list',
] as const

/** How much of a result is shown inline before it is summarised. */
const INLINE_LIMIT = 4_000

/** The pending-state card a UI renders for one call. */
function card(title: string, kind: 'read' | 'other' = 'other'): YonToolCallView {
  return { card: 'generic', title, kind }
}

/** One tool definition over the registry's contract. */
function defineTool<V>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  render(value: V): string
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<V>
  presentCall(args: Record<string, unknown>): YonToolCallView
}): YonToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => [{ type: 'text', text: spec.render(value as V) }] as YonTextBlock[],
    },
    async execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown> {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new ArthasError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new ArthasError('cancelled', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** Read one required argument as a non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ArthasError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/** Read a positive integer argument. */
function asPositiveInt(value: unknown, argument: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ArthasError('invalid-input', `${argument} 必须是正整数，收到的是 ${JSON.stringify(value)}`)
  }
  return value
}

/** Bytes, for a line that a person reads. */
function bytesOf(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
  return `${Math.round(value / 104857.6) / 10} MB`
}

/** Cut a long result down to something a conversation can hold. */
function clip(text: string): string {
  return text.length <= INLINE_LIMIT
    ? text
    : `${text.slice(0, INLINE_LIMIT)}\n…（还有 ${text.length - INLINE_LIMIT} 个字符，用 replay_diff 或直接读文件看全文）`
}

/**
 * Register the replay tools.
 *
 * The service arrives already built rather than being created here, because the
 * panel's HTTP routes read the same one: one list of environments and runs that both
 * halves see, the way the observation sessions are shared in `arthas-service.ts`.
 *
 * @param ctx - host context carrying the tool registry.
 * @param replay - the offline replay service.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonReplayTools(ctx: Context, replay: YonReplayService): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'replay_prepare',
    description: 'Prepare an offline replay environment for a class: read the classpath out of the running '
      + 'JVM and pack it into a small manifest-only jar, then copy the offline runner beside it. The '
      + 'classpath has to be asked of the JVM rather than guessed from the installation — measured at 5,481 '
      + 'entries (519 KB joined, 59 KB zipped), because NCC assembles most of it by reflection at startup. '
      + 'Do this once per classloader and reuse it for every later replay_run; only re-run it after '
      + 'restarting the target. Returns an environment id.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['pid', 'className'],
      properties: {
        pid: { type: 'number', description: 'The target PID, as arthas_targets returned it.' },
        className: {
          type: 'string',
          description: 'A class whose classloader holds the classpath to copy — normally the class being '
            + 'replayed, e.g. nc.impl.epmp.bgr.BgrReportSyncServiceImpl.',
        },
        port: { type: 'number', description: 'The agent HTTP port; defaults to 8563.' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['id', 'hash', 'entries', 'jarBytes', 'dir'],
      properties: {
        id: { type: 'string' },
        className: { type: 'string' },
        hash: { type: 'string' },
        entries: { type: 'number' },
        jarBytes: { type: 'number' },
        dir: { type: 'string' },
        seconds: { type: 'number' },
      },
    },
    async execute(args, signal) {
      const pid = asPositiveInt(args.pid, 'pid')
      const className = asString(args.className, 'className')
      const started = Date.now()
      const environment = await replay.prepare({
        pid,
        className,
        ...typeof args.port === 'number' ? { port: args.port } : {},
        signal,
      })
      return { ...environment, seconds: Math.round((Date.now() - started) / 100) / 10 }
    },
    render(value) {
      const result = value as {
        id: string
        className: string
        hash: string
        entries: number
        jarBytes: number
        dir: string
        seconds: number
      }
      return [
        `离线环境已就绪：${result.id}（${result.seconds} 秒）`,
        `  classpath 条目：${result.entries}`,
        `  jar：${bytesOf(result.jarBytes)}  ——  519 KB 的类路径被压进这一个文件，`,
        '         因为拼成命令行会被 Windows 的 ~32K 上限拒绝，而 JDK 8 没有 @argfile。',
        `  目录：${result.dir}`,
        '',
        '下一步：replay_run，用 dump 的名字 + 类名 + 方法名跑一次。',
      ].join('\n')
    },
    presentCall: args => card(`准备离线回放环境：${String(args.className ?? '')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'replay_run',
    description: 'Run one captured call offline, against the real code. Reads the .ser that arthas_capture '
      + 'wrote, hands it to the named method on a fresh instance of the named class, and writes the result '
      + 'to a file. The dump is either an Object[] (passed as the parameter list) or a single value '
      + '(passed as one argument), which is what makes "capture params" and "capture params[0]" mean '
      + 'different things. Returns the run id plus its output and cost — use replay_diff to compare two runs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['env', 'dump', 'className', 'methodName'],
      properties: {
        env: { type: 'string', description: 'The environment id from replay_prepare.' },
        dump: {
          type: 'string',
          description: 'The capture to replay: a file name from replay_list, or an absolute path.',
        },
        className: { type: 'string', description: 'Fully-qualified class name to instantiate.' },
        methodName: {
          type: 'string',
          description: 'Method to invoke. Matched by name and parameter count — a dump holds values, not a '
            + 'signature, so the declared parameter types are what this avoids needing to know.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['id', 'ok', 'output'],
      properties: {
        id: { type: 'string' },
        dump: { type: 'string' },
        className: { type: 'string' },
        methodName: { type: 'string' },
        outPath: { type: 'string' },
        ok: { type: 'boolean' },
        costMs: { type: 'number' },
        output: { type: 'string' },
      },
    },
    async execute(args, signal) {
      const run = await replay.run({
        env: asString(args.env, 'env'),
        dump: asString(args.dump, 'dump'),
        className: asString(args.className, 'className'),
        methodName: asString(args.methodName, 'methodName'),
        signal,
      })
      return run as unknown as { id: string; ok: boolean; output: string }
    },
    render(value) {
      const result = value as {
        id: string
        dump: string
        className: string
        methodName: string
        outPath: string
        ok: boolean
        costMs?: number
        output: string
      }
      const head = result.ok
        ? `回放成功：${result.className}#${result.methodName}`
          + `${result.costMs === undefined ? '' : `  ·  离线耗时 ${result.costMs} ms`}`
        : `回放失败：${result.className}#${result.methodName}`
      return [
        head,
        `  现场：${result.dump}`,
        `  结果：${result.outPath}`,
        `  记录 id：${result.id}`,
        '',
        clip(result.output),
        '',
        result.ok
          ? '改动前后各跑一次，再用 replay_diff 对比这两条记录 —— 那就是最便宜的回归测试。'
          : '看上面的 REPLAY_FAIL：里面的异常是**真实代码**抛出来的，通常就是答案本身。',
      ].join('\n')
    },
    presentCall: args => card(`离线回放：${String(args.className ?? '')}#${String(args.methodName ?? '')}`),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'replay_diff',
    description: 'Compare two replays of the same capture. This is the point of the whole module: change the '
      + 'business method, run replay_run again, and read what actually changed. The per-run `# cost=Nms` '
      + 'header is excluded, because two runs of identical code differ in it and nowhere else — a diff that '
      + 'always reports a change is one nobody reads.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['left', 'right'],
      properties: {
        left: { type: 'string', description: 'The earlier run id (the baseline).' },
        right: { type: 'string', description: 'The later run id (with the change).' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['changed', 'lines'],
      properties: {
        changed: { type: 'number' },
        ignored: { type: 'array', items: { type: 'string' } },
        left: { type: 'object' },
        right: { type: 'object' },
        lines: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute(args) {
      const diff = await replay.diff(asString(args.left, 'left'), asString(args.right, 'right'))
      return diff as unknown as { changed: number; lines: readonly unknown[] }
    },
    render(value) {
      const result = value as {
        changed: number
        ignored: readonly string[]
        left: { id: string; className: string; methodName: string; ok: boolean }
        right: { id: string; className: string; methodName: string; ok: boolean }
        lines: readonly { kind: 'same' | 'left' | 'right'; text: string }[]
      }
      const lines: string[] = [
        `对比 ${result.left.id}`,
        `  vs ${result.right.id}`,
        '',
      ]
      if (!result.left.ok || !result.right.ok) {
        lines.push('⚠ 至少有一次回放是失败的 —— 失败信息也参与对比，所以这里的差异可能是异常文本，不是结果。', '')
      }
      if (result.changed === 0) {
        lines.push('✅ 两次输出完全一致（已排除每次都会变的 cost 头）。')
        lines.push('   改动的代码在这条路径上没有产生可观察差异 —— 要么改动没生效，要么这条路径没被走到。')
        return lines.join('\n')
      }
      lines.push(`差异 ${result.changed} 行（- 左 / + 右）：`, '')
      for (const line of result.lines) {
        if (line.kind === 'same') continue
        lines.push(`${line.kind === 'left' ? '-' : '+'} ${line.text}`)
      }
      if (result.ignored.length > 0) {
        lines.push('', `已忽略：${result.ignored.join('、')}`)
      }
      return lines.join('\n')
    },
    presentCall: args => card(`对比回放：${String(args.left ?? '')} vs ${String(args.right ?? '')}`, 'read'),
  })))

  disposers.push(ctx.tools.register(defineTool({
    name: 'replay_list',
    description: 'List what can be replayed and what has been: the captures on disk (from arthas_capture), '
      + 'the prepared environments, and the runs already recorded. Start here when you do not know a dump '
      + 'name, or to find the two run ids that replay_diff wants.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: {
      type: 'object',
      required: ['dumps', 'environments', 'runs'],
      properties: {
        workDir: { type: 'string' },
        dumps: { type: 'array', items: { type: 'object' } },
        environments: { type: 'array', items: { type: 'object' } },
        runs: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute() {
      const [dumps, environments, runs] = await Promise.all([
        replay.dumps(),
        replay.environments(),
        replay.runs(),
      ])
      return { workDir: replay.workDir, dumps, environments, runs }
    },
    render(value) {
      const result = value as {
        workDir: string
        dumps: readonly { name: string; bytes: number }[]
        environments: readonly { id: string; className: string; entries: number; jarBytes: number }[]
        runs: readonly { id: string; ok: boolean; costMs?: number; className: string; methodName: string }[]
      }
      const lines: string[] = [`回放工作目录：${result.workDir}`, '']
      lines.push(result.dumps.length === 0
        ? '现场（dump）：还没有。用 arthas_capture 抓一个。'
        : `现场（dump）${result.dumps.length} 个：`)
      for (const dump of result.dumps.slice(0, 20)) {
        lines.push(`  ${dump.name}  (${bytesOf(dump.bytes)})`)
      }
      lines.push('')
      lines.push(result.environments.length === 0
        ? '离线环境：还没有。用 replay_prepare 建一个。'
        : `离线环境 ${result.environments.length} 个：`)
      for (const environment of result.environments) {
        lines.push(`  ${environment.id}  ${environment.entries} 条 classpath，jar ${bytesOf(environment.jarBytes)}`)
        lines.push(`      ${environment.className}`)
      }
      lines.push('')
      lines.push(result.runs.length === 0
        ? '回放记录：还没有。'
        : `回放记录 ${result.runs.length} 条（最新在前）：`)
      for (const run of result.runs.slice(0, 20)) {
        lines.push(`  ${run.ok ? '✅' : '❌'} ${run.id}`)
        lines.push(`      ${run.className}#${run.methodName}${run.costMs === undefined ? '' : `  ·  ${run.costMs} ms`}`)
      }
      return lines.join('\n')
    },
    presentCall: () => card('列出可回放的现场与记录', 'read'),
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
