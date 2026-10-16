import type { ArthasPanelPayload, ArthasSessionDetail, ArthasTargetsPayload, ReplayDiff, ReplayEnvironment, ReplayPanelPayload, ReplayRun } from '../../shared/types.ts';
export { ApiError as ArthasApiError } from '../request.ts';
/** 这一屏会调的操作。 */
export interface ArthasApi {
    /** 一次读回面板要显示的全部状态。 */
    panel(): Promise<ArthasPanelPayload>;
    /** 一个会话连同它已经产出的结果。 */
    detail(id: string): Promise<ArthasSessionDetail>;
    /** 给一个 PID 挂 agent。与 `arthas_attach` 工具是同一个调用。 */
    attach(pid: number, port?: number): Promise<ArthasTargetsPayload>;
    /** 停一个会话并清掉它留下的增强。与 `arthas_watch_stop` 工具是同一段清理。 */
    stop(id: string): Promise<ArthasSessionDetail>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createArthasApi(): ArthasClientApi;
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
    replayPanel(): Promise<ReplayPanelPayload>;
    /** Run one capture offline, against the real code. */
    replayRun(input: {
        readonly env: string;
        readonly dump: string;
        readonly className: string;
        readonly methodName: string;
    }): Promise<ReplayRun>;
    /** Compare two runs. */
    replayDiff(left: string, right: string): Promise<ReplayDiff>;
    /** Build the classpath jar for one process's loader. */
    replayPrepare(pid: number, className: string): Promise<ReplayEnvironment>;
}
/** Everything the debugger surface can call. */
export type ArthasClientApi = ArthasApi & ReplayApi;
/**
 * 会话状态在界面上的名字。
 *
 * 存键而不是中文，理由与 `memory/api.ts` 相同：写成中文就得为英文再写一遍。类型写成
 * `YonPanelKey`，漏一个键时编译就不过。
 */
export declare const SESSION_STATE_KEYS: {
    readonly watching: "arthas.stateWatching";
    readonly settled: "arthas.stateSettled";
    readonly failed: "arthas.stateFailed";
    readonly stopped: "arthas.stateStopped";
};
/**
 * 一条结果在界面上的短标签。
 *
 * 按 `type` 给，因为那就是 Arthas 自己的分类：`watch` 是命中、`enhancer` 是注册结果、
 * `status` 是命令的退出码。没见过的类型原样显示关键字，而不是猜一个名字。
 * @param type - the `type` field of one result.
 * @returns the dictionary key to show, or undefined for an unknown type.
 */
export declare function eventLabelKey(type: string): 'arthas.eventWatch' | 'arthas.eventEnhancer' | 'arthas.eventStatus' | 'arthas.eventReset' | undefined;
/**
 * 时间戳显示成 `HH:MM:SS`。
 *
 * 这一屏看的是「刚才那一下」，日期在这里只会占位置；跨天之后仍然正确，因为同一天的
 * 事件本来就按顺序排在一起。
 * @param stamp - the millisecond stamp.
 * @returns the clock time.
 */
export declare function clockOf(stamp: number): string;
/**
 * 毫秒显示成人类读得懂的一小段。
 * @param ms - the duration.
 * @returns e.g. `0.57 ms` or `1.4 s`.
 */
export declare function durationOf(ms: number): string;
