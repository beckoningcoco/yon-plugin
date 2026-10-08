/**
 * 「本次会话现在在哪个项目上」，以及由它算出来的那一行计数提示。
 *
 * ## 为什么需要这么个东西
 *
 * 记忆的价值一半在「模型会想起来去查」——而它不会。所以注入分两处（设计稿 §6）：一处是
 * `project_read` 的返回值里带上标题（那是模型推断出项目之后一定会调的），另一处就是这里：
 * **其余工具末尾的一行计数**。
 *
 * 第二处要回答的问题是「本次会话现在在哪个项目上」，而**项目从来不是会话的属性**：它是
 * 模型从上下文里推断出来的，插件做的事只是**记住它推断的结果**（定稿时定的第一条口径）。
 *
 * 谁把项目记进来：任何解析出项目 id 的工具。今天只有 `project_read`——它是模型为了改配置
 * 一定会读的那一个，也是「我现在在这个项目上」最诚实的一个信号。
 *
 * 谁读它：`datasource_query` / `ncc_meta_find` / `bip_meta_find` / `wiki_lookup`——这四个
 * 参数里都没有项目，却最常发生在某个项目的活上。它们给的那一行不是记忆内容，是**路牌**：
 * 「这个项目还有 N 条记忆，`memory_recall` 可查」。
 *
 * ## 两个 WeakMap，同一个理由
 *
 * 键是**会话对象本身**，不是会话 id：插件拿不到 id，而对象身份足够——同一次会话里的每次
 * 工具调用拿到的是同一个 session 句柄。WeakMap 让它随会话结束被回收，而不是在插件里挂到
 * 进程结束。
 *
 * 没有会话时一律什么都不做：一次直接派发的调用没有「这一次对话」可归属，猜一个反而会
 * 把别人的项目当成它的。
 */
import type { YonToolExecution } from './tools.ts';
/**
 * 一行要附加到工具结果末尾的话，或者 undefined。
 *
 * 由装配处（`index.ts`）组装：它同时持有会话登记处与记忆服务，而各工具族只该看到这一个函数。
 * 这样四个工具族不必依赖记忆服务，也就不必知道它长什么样。
 */
export type MemoryHintLine = (exec: YonToolExecution) => Promise<string | undefined>;
/** 本次会话的项目归属，以及「这一屏已经提示过了」的记账。 */
export interface YonMemorySession {
    /**
     * 记下这一次调用把哪个项目变成了「当前项目」。
     * @param session - the calling agent's session, when the call has one.
     * @param projectId - the project it resolved to.
     */
    note(session: object | undefined, projectId: string): void;
    /**
     * 本次会话的当前项目。
     * @param session - the calling agent's session, when the call has one.
     * @returns the project id, or undefined when nothing has been resolved yet.
     */
    current(session: object | undefined): string | undefined;
    /**
     * 就这个项目提示一次；第二次来问同一个项目会拿到 false。
     *
     * 去重不是为省字节：同一次会话里把同一句话重复六遍，模型会学会跳过去，而那正好毁掉
     * 这句话存在的理由。
     *
     * @param session - the calling agent's session, when the call has one.
     * @param projectId - the project the hint would be about.
     * @returns true the first time this session asks about this project.
     */
    claim(session: object | undefined, projectId: string): boolean;
}
/**
 * Open the session registry.
 * @returns the registry, holding nothing that outlives a session.
 */
export declare function createYonMemorySession(): YonMemorySession;
/**
 * 把一行提示并进一个工具的结果里。
 *
 * 形态上是给值加一个 `memoryHint` 字段，而不是替换它：各工具的输出契约没有
 * `additionalProperties: false`，所以多一个字段仍然满足它自己的 schema，而那四个工具的
 * 值形状不必为了记住这一行而改。
 *
 * @param value - what the tool was going to return.
 * @param hint - the assembled hint provider, or undefined when the plugin has no bank.
 * @param exec - this call, for the session it belongs to.
 * @returns the value, with the line on it when there is one.
 */
export declare function withMemoryHint<V extends object>(value: V, hint: MemoryHintLine | undefined, exec: YonToolExecution): Promise<V & {
    readonly memoryHint?: string;
}>;
/**
 * 那一行在渲染时怎么念：一个空行加那句话，或者什么都没有。
 *
 * 渲染是同步的，所以它只能读值里已经放着的那一行——提示是异步算出来的，在 `execute`
 * 里就已经并进值了。
 *
 * @param value - the value one tool returned.
 * @returns the text to append, empty when there is nothing to append.
 */
export declare function memoryHintLine(value: unknown): string;
