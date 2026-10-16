/**
 * Arthas 面板的调用与它的词汇。
 *
 * 与其余面板一样：api 客户端在 `apply` 世界里建好，通过 inject face 交给组件，
 * 所以组件从不发请求、也不知道 URL。
 *
 * 与其余面板**不一样**的是这一屏要回答的问题。「记忆」「需求」那些屏，人是在核对
 * 模型写下的东西；这一屏，人是在看**模型在一个正在服务的进程里做了什么**。设计文档
 * 第九节因此把审计定成要求而不是偏好——`ognl` 等于任意代码执行，模型执行过什么，
 * 人必须一眼看得见。所以这里的关系是：会话（AI 挂了什么观测）+ 审计（AI 跑了什么命令），
 * 两者并排而不是藏在筛选器后面。
 *
 * 这一屏能做的只有两件改状态的事：**attach** 和 **停止会话**，两者都调用工具层同一个
 * 服务方法。没有一条路由能解锁被拒的危险命令——那个决定属于人，而一个模型够得到的
 * URL 就是模型自己给自己解锁。
 */
import { request } from '../request.ts'
import type {
  ArthasPanelPayload, ArthasSessionDetail, ArthasTargetsPayload, ReplayDiff,
  ReplayEnvironment, ReplayPanelPayload, ReplayRun,
} from '../../shared/types.ts'

// 共用的失败类型沿用本模块的名字，与其余面板一致。
export { ApiError as ArthasApiError } from '../request.ts'

/** 这一屏会调的操作。 */
export interface ArthasApi {
  /** 一次读回面板要显示的全部状态。 */
  panel(): Promise<ArthasPanelPayload>
  /** 一个会话连同它已经产出的结果。 */
  detail(id: string): Promise<ArthasSessionDetail>
  /** 给一个 PID 挂 agent。与 `arthas_attach` 工具是同一个调用。 */
  attach(pid: number, port?: number): Promise<ArthasTargetsPayload>
  /** 停一个会话并清掉它留下的增强。与 `arthas_watch_stop` 工具是同一段清理。 */
  stop(id: string): Promise<ArthasSessionDetail>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createArthasApi(): ArthasClientApi {
  return {
    panel() {
      return request<ArthasPanelPayload>('/arthas')
    },
    detail(id) {
      return request<ArthasSessionDetail>(`/arthas/sessions/${encodeURIComponent(id)}`)
    },
    attach(pid, port) {
      return request<ArthasTargetsPayload>('/arthas/attach', {
        method: 'POST',
        body: JSON.stringify({ pid, ...port === undefined ? {} : { port } }),
      })
    },
    stop(id) {
      return request<ArthasSessionDetail>(`/arthas/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    replayPanel() {
      return request<ReplayPanelPayload>('/replay')
    },
    replayRun(input) {
      return request<ReplayRun>('/replay/run', { method: 'POST', body: JSON.stringify(input) })
    },
    replayDiff(left, right) {
      return request<ReplayDiff>('/replay/diff', {
        method: 'POST',
        body: JSON.stringify({ left, right }),
      })
    },
    replayPrepare(pid, className) {
      return request<ReplayEnvironment>('/replay/prepare', {
        method: 'POST',
        body: JSON.stringify({ pid, className }),
      })
    },
  }
}

/**
 * The offline-replay half (panel tab B): what can be replayed, and what has been.
 *
 * One screen's worth of reads plus the two actions the design notes call the point of
 * the whole module — run a capture again, and compare two runs. Preparing an
 * environment is here too, because the panel is where a person notices that none
 * exists yet, and "go and ask the model for one" is a worse answer than a button.
 */
export interface ReplayApi {
  /** Environments, captures and past runs, in one read. */
  replayPanel(): Promise<ReplayPanelPayload>
  /** Run one capture offline, against the real code. */
  replayRun(input: {
    readonly env: string
    readonly dump: string
    readonly className: string
    readonly methodName: string
  }): Promise<ReplayRun>
  /** Compare two runs. */
  replayDiff(left: string, right: string): Promise<ReplayDiff>
  /** Build the classpath jar for one process's loader. */
  replayPrepare(pid: number, className: string): Promise<ReplayEnvironment>
}

/** Everything the debugger surface can call. */
export type ArthasClientApi = ArthasApi & ReplayApi

/**
 * 会话状态在界面上的名字。
 *
 * 存键而不是中文，理由与 `memory/api.ts` 相同：写成中文就得为英文再写一遍。类型写成
 * `YonPanelKey`，漏一个键时编译就不过。
 */
export const SESSION_STATE_KEYS = {
  watching: 'arthas.stateWatching',
  settled: 'arthas.stateSettled',
  failed: 'arthas.stateFailed',
  stopped: 'arthas.stateStopped',
} as const

/**
 * 一条结果在界面上的短标签。
 *
 * 按 `type` 给，因为那就是 Arthas 自己的分类：`watch` 是命中、`enhancer` 是注册结果、
 * `status` 是命令的退出码。没见过的类型原样显示关键字，而不是猜一个名字。
 * @param type - the `type` field of one result.
 * @returns the dictionary key to show, or undefined for an unknown type.
 */
export function eventLabelKey(type: string): 'arthas.eventWatch' | 'arthas.eventEnhancer'
  | 'arthas.eventStatus' | 'arthas.eventReset' | undefined {
  switch (type) {
    case 'watch': return 'arthas.eventWatch'
    case 'enhancer': return 'arthas.eventEnhancer'
    case 'status': return 'arthas.eventStatus'
    case 'reset': return 'arthas.eventReset'
    default: return undefined
  }
}

/**
 * 时间戳显示成 `HH:MM:SS`。
 *
 * 这一屏看的是「刚才那一下」，日期在这里只会占位置；跨天之后仍然正确，因为同一天的
 * 事件本来就按顺序排在一起。
 * @param stamp - the millisecond stamp.
 * @returns the clock time.
 */
export function clockOf(stamp: number): string {
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return ''
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(part => String(part).padStart(2, '0'))
    .join(':')
}

/**
 * 毫秒显示成人类读得懂的一小段。
 * @param ms - the duration.
 * @returns e.g. `0.57 ms` or `1.4 s`.
 */
export function durationOf(ms: number): string {
  if (ms < 1000) return `${Math.round(ms * 100) / 100} ms`
  return `${Math.round(ms / 100) / 10} s`
}
