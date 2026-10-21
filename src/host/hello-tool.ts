/**
 * 一个最小可用的工具，用来演示「给 Yon 面板加一个工具」的完整形状。
 *
 * ## 加一个工具要决定的四件事
 *
 * 1. **名字**。前缀即分组，模型靠它认出这是哪一族（`wiki_`、`ncc_`、`memory_`…）。
 *    这里是示范用的 `yon_ping`。
 * 2. **参数**。`parameters` 是一份给模型看的 JSON Schema：它照着这份 schema
 *    决定该传什么，而不是靠猜。`additionalProperties: false` 让多余的键显式失败。
 * 3. **返回值**。`output.schema` 同样是一份 JSON Schema，**宿主会校验它**。声明得比
 *    实际返回的窄，宿主就把整个结果丢掉并报「不是声明的属性」——见 `tools.ts`
 *    里 `memoryHintOf` 那段踩过的坑。所以这里的 `PingValue` 和 `PING_VALUE`
 *    必须一个字段一个字段地对齐。
 * 4. **给模型看的话**。`render` 把结构化的值翻成一段文字。这是模型真正读到的
 *    东西；返回值只用于校验和（将来可能的）UI 渲染。
 *
 * ## 为什么 `defineTool` 是这个文件私有的
 *
 * 这是本仓库的惯例，不是疏忽：每个 `*-tools.ts` 都各自带一份十几行的适配器，
 * 把「必填的对象参数」「已取消的调用」这两件每个工具都要做的事做掉一次。
 * 共享的那一份在命名上就绑定了项目领域（`defineYonTool` 抛 `ProjectError`），
 * 而工具族之间不想为了一个纯适配器互相依赖。复制一份的代价是十几行，
 * 依赖一个不属于自己的错误类型的代价是错误口径漂移。
 *
 * ## 什么时候它会真的生效
 *
 * 注册只发生在宿主进程里：`npm run build` 之后重启 DSH 才会出现。
 * 见文件末尾的注释。
 */
import type { Context } from '@deepseek-ai/cordis'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'

/** 这个模块拥有的全部工具名，供 `index.ts` 汇总导出。 */
export const HELLO_TOOL_NAMES = ['yon_ping'] as const

/** 一次调用失败。工具抛出它，宿主把 `message` 交给模型。 */
export class HelloError extends Error {
  constructor(readonly code: 'invalid-input', message: string) {
    super(message)
    this.name = 'HelloError'
  }
}

/** 调用成功时的值。字段与下面的 {@link PING_VALUE} 一一对应。 */
interface PingValue {
  /** 原样回显的 message，空则 `pong`。 */
  readonly message: string
  /** 服务端此刻的 ISO 时间。 */
  readonly received_at: string
  /** 哪个工具产生的这个值，便于调用方确认链路。 */
  readonly tool: string
}

/**
 * `output.schema`：宿主拿它校验 `execute` 的返回值。
 *
 * 和 {@link PingValue} 是同一条契约的两半。改一边就要改另一边，否则编译期
 * 安静、运行期整个结果被丢掉。
 */
const PING_VALUE = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'received_at', 'tool'],
  properties: {
    message: { type: 'string' },
    received_at: { type: 'string' },
    tool: { type: 'string' },
  },
} as const

/** 一段文字，就是这些工具返回给模型的全部内容。 */
function textOf(text: string): YonTextBlock[] {
  return [{ type: 'text', text }]
}

/** 待执行时 UI 上那张卡片。 */
function card(title: string): YonToolCallView {
  return { card: 'generic', title, kind: 'read' }
}

/**
 * 把一个工具的声明包成注册表要的形状，顺手做掉两件重复的事。
 *
 * @param spec - 一个工具的全部声明。
 * @returns 可以直接交给 `ctx.tools.register` 的定义。
 */
function defineTool<V>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  /** 把值翻成模型读到的那段文字。 */
  render(value: V): string
  /** 真正干活；参数已保证是对象。 */
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<V>
  presentCall(args: Record<string, unknown>): YonToolCallView
}): YonToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => textOf(spec.render(value as V)),
    },
    async execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown> {
      // 注册表把模型的参数原样递进来，什么都没校验过。
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new HelloError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new HelloError('invalid-input', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/**
 * 注册本模块的工具。
 * @param ctx - 带工具注册表的宿主上下文。
 * @returns 撤销这次注册的 disposer，交给 `ctx.effect` 管生命周期。
 */
export function registerYonHelloTools(ctx: Context): () => void {
  return ctx.tools.register(defineTool<PingValue>({
    name: 'yon_ping',
    description: '把一段文字原样回显，并附上服务端的时间。一个用来确认「工具链路通不通」的'
      + '探针：参数、执行、结果校验、文本渲染四段都走一遍。它不读写任何文件、不碰网络、'
      + '没有副作用，因此也从不打扰使用者。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        message: {
          type: 'string',
          description: '要回显的文字，最长 200 字符。省略时回 pong。',
        },
      },
    },
    outputSchema: PING_VALUE,

    render(value) {
      return `${value.message}\n收到时间：${value.received_at}（${value.tool}）`
    },

    async execute(args) {
      const raw = args.message
      if (raw !== undefined && typeof raw !== 'string') {
        throw new HelloError('invalid-input', 'message 必须是字符串')
      }
      const message = typeof raw === 'string' ? raw.trim() : ''
      // 上限存在的意义不是省内存，而是让「模型把整个文件塞进来」这件事变成一个
      // 它会读到的错误，而不是一次安静的大返回。
      if (message.length > 200) {
        throw new HelloError('invalid-input', `message 最多 200 个字符，收到 ${message.length} 个`)
      }
      return {
        message: message === '' ? 'pong' : message,
        received_at: new Date().toISOString(),
        tool: 'yon_ping',
      }
    },

    presentCall(args) {
      return card(`Ping ${String(args.message ?? '')}`)
    },
  }))
}

// 生效路径（三步，缺一不可）：
//
//   1. 在 `src/index.ts` 里 import 并注册：
//        import { HELLO_TOOL_NAMES, registerYonHelloTools } from './host/hello-tool.ts'
//        ctx.effect(() => registerYonHelloTools(ctx), 'yon-panel: hello tool')
//   2. `npm run build` —— tsc 编 lib/，tsdown 打 client。`main` 指向 `lib/index.js`，
//      所以只改 src 不编译，重启后跑的还是旧的。
//   3. 重启 DSH。profile 里装的是这个包的一份副本
//      （`~/.dsh/profiles/<profile>/node_modules/dsh-plugin-yon-panel`），
//      本地开发要让它指到这份仓库，否则重启加载的仍是旧副本。
//
// 可选：在 `src/host/prompt.ts` 的 `YON_PROMPT_TEXT` 里补一行，把这个工具族写进
// 整体图景。不写也不影响调用，只是模型少了那句「什么时候该想起它」。
