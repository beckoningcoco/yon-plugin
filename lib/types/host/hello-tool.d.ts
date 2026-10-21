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
import type { Context } from '@deepseek-ai/cordis';
/** 这个模块拥有的全部工具名，供 `index.ts` 汇总导出。 */
export declare const HELLO_TOOL_NAMES: readonly ["yon_ping"];
/** 一次调用失败。工具抛出它，宿主把 `message` 交给模型。 */
export declare class HelloError extends Error {
    readonly code: 'invalid-input';
    constructor(code: 'invalid-input', message: string);
}
/**
 * 注册本模块的工具。
 * @param ctx - 带工具注册表的宿主上下文。
 * @returns 撤销这次注册的 disposer，交给 `ctx.effect` 管生命周期。
 */
export declare function registerYonHelloTools(ctx: Context): () => void;
