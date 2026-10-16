/** The port an attached Arthas agent serves its HTTP API on. */
export declare const ARTHAS_HTTP_PORT = 8563;
/** The port the same agent serves telnet on. Not used; named so a report can say what it is. */
export declare const ARTHAS_TELNET_PORT = 3658;
/**
 * How long a short command may take.
 *
 * Measured: `sc -d`, `jad`, `options` and a plain `ognl` all answer in well under
 * a second on a live NCC. Twenty seconds is not a performance budget, it is the
 * point at which "this agent is not going to answer" becomes more likely than
 * "this command is slow", and saying so beats hanging the tool call.
 */
export declare const SHORT_COMMAND_TIMEOUT_MS = 20000;
/** One entry of a response's `results` array. */
export interface ArthasResult {
    /**
     * `enhancer` (a registration succeeded and says how many classes it touched),
     * `watch` (one observed call), `status` (the command's exit code) or `reset`.
     *
     * Left as a plain string rather than a union of literals: the set is Arthas's,
     * not this package's, and a command this file has never seen can return a type
     * that no union here would admit — which would turn a usable response into a
     * parse failure.
     */
    readonly type: string;
    readonly [field: string]: unknown;
}
/** One `exec` response, as Arthas sends it. */
export interface ArthasResponse {
    /** The command Arthas says it ran, echoed back. */
    readonly command: string;
    readonly jobId?: number;
    readonly jobStatus?: string;
    readonly timeExpired?: boolean;
    readonly results: readonly ArthasResult[];
    readonly sessionId?: string;
    readonly state: string;
    /** Present when `state` is not `SUCCEEDED`: Arthas's own explanation. */
    readonly message?: string;
    /** The raw body, kept for the one case that needs to show what arrived. */
    readonly raw: unknown;
}
/** One command to run. */
export interface ArthasExecRequest {
    /** The agent's HTTP port; `8563` unless the operator moved it. */
    readonly port: number;
    /** The Arthas command line, exactly as it would be typed at the prompt. */
    readonly command: string;
    /**
     * Deadline in milliseconds. Omit for an observation, which must be allowed to
     * wait for something that has not happened yet.
     */
    readonly timeoutMs?: number;
    /** Cancellation from the tool call. */
    readonly signal?: AbortSignal;
}
/** The `status` result: Arthas's own exit code for the command it ran. */
export interface ArthasStatus {
    /** 0 when the command did its work; -1, with a `message`, when it did not. */
    readonly statusCode: number;
    readonly message?: string;
}
/**
 * The command's own exit status.
 *
 * **Measured, and it contradicts the obvious reading of the API.** Arthas answers
 * `state: "SUCCEEDED"` for commands that failed. Three failures were issued
 * against a live agent and all three came back `SUCCEEDED`: a `watch` of a method
 * that does not exist, an `ognl` whose class cannot be resolved, and a
 * `sc -d` for a class that is nowhere on the classpath. `state` reports that the
 * *request* was handled, not that the *command* worked.
 *
 * What reports the command is the `status` result: `statusCode` 0 on success,
 * `-1` with a `message` on failure. A caller that trusted `state` would read
 * every failure as an empty success — which is the most expensive mistake this
 * API offers, because "the watch registered nothing" and "the watch is fine and
 * simply has not fired yet" would look identical.
 */
export declare function statusOf(response: ArthasResponse): ArthasStatus | undefined;
/**
 * Did the command itself succeed?
 *
 * `state: "FAILED"` is the other way to fail, and it is the rarer one: it is what
 * an unparseable command line produces (`nosuchcommand: command not found`), with
 * no `body` at all. That shape has no `status` to read, so the absence of a
 * `status` is not treated as success.
 */
export declare function commandSucceeded(response: ArthasResponse): boolean;
/**
 * A message with terminal colour removed.
 *
 * Arthas's own hints carry ANSI escapes — the "No class or method is affected"
 * help text wraps every command name in `\u001b[32m` … `\u001b[m`. Passed through
 * to the model or the panel they are noise that costs tokens and renders as
 * garbage, so they are stripped once, here, rather than by every consumer.
 */
export declare function plainMessage(text: string): string;
/**
 * The per-result text Arthas produced, when it produced any.
 *
 * Only interesting for `watch`: `value` is the expression's rendered output. A
 * caller printing results should prefer its own rendering; this is for the paths
 * that have to show whatever arrived.
 */
export declare function valueOf(result: ArthasResult): string | undefined;
/**
 * The `enhancer` result: what a `watch`/`trace` registered, and whether it took.
 *
 * Failure is reported here rather than through `state`. Measured:
 *
 * ```json
 * {"type":"enhancer","success":false,"message":"No class or method is affected",
 *  "effect":{"classCount":1,"methodCount":0,"listenerId":6}}
 * ```
 *
 * Note `classCount: 1` alongside `success: false` — the count is of classes
 * *considered*, not of classes enhanced, so it must never be read on its own as
 * evidence that an observation was installed.
 */
export interface ArthasEnhancement {
    readonly success: boolean;
    readonly classCount: number;
    readonly methodCount: number;
    /** Arthas's reason, when `success` is false. */
    readonly message?: string;
}
/** The `enhancer` result of a response, when the command registered something. */
export declare function enhancerOf(response: ArthasResponse): ArthasEnhancement | undefined;
/**
 * How many classes still carry enhancements, read from a `reset`.
 *
 * **Measured, and the shape is not the one the design notes assumed.** Those
 * notes expected a `reset` to answer with an `enhancer` result carrying
 * `effect.classCount`. It actually answers:
 *
 * ```json
 * {"type":"reset","affect":{"classCount":0,"methodCount":0,"listenerId":0,"cost":0}}
 * ```
 *
 * This matters beyond tidiness: the cleanup rule is "keep issuing `reset <class>`
 * until the count reaches 0", and a count read from a field that is not there
 * comes back undefined, which a loop would treat as "done" and leave the
 * enhancement installed. The `enhancer` branch is kept as a fallback because a
 * `reset` racing a `watch` registration has been seen to answer in that shape.
 */
export declare function classCountOf(response: ArthasResponse): number | undefined;
/**
 * One node of a traced call: a method the `trace` command observed being entered.
 *
 * `costUs` is in **microseconds**, not milliseconds. Measured: a traced
 * `BgrReportSyncServiceImpl#now` answered `cost: 222900` for a call that takes about
 * 223 ms, and a second hit answered `47800`. Reading that field as milliseconds
 * would overstate every duration by a thousandfold.
 */
export interface ArthasTraceNode {
    readonly className: string;
    readonly methodName: string;
    /** This node's own cost, in microseconds. */
    readonly costUs: number;
    /** How many times it was called inside the traced call; 1 at the top level. */
    readonly times: number;
    readonly children: readonly ArthasTraceNode[];
}
/** One observed call: the top-level methods entered, on the thread that ran them. */
export interface ArthasTraceHit {
    /** When it happened, as the target JVM reported it. */
    readonly at: string;
    readonly thread: string;
    readonly calls: readonly ArthasTraceNode[];
}
/**
 * The calls a `trace` command observed — one entry per hit.
 *
 * **Measured, and better than the design notes assumed.** Those notes expected to parse
 * a rendered tree of text back into numbers. Arthas instead answers with structure: one
 * `{"type":"trace","root":{…}}` result per hit, where `root` is the *thread* and the
 * traced method sits in `root.children`. So nothing here parses prose, and a `trace`
 * costs no more parsing than a `watch` does.
 */
export declare function traceHits(results: readonly ArthasResult[]): readonly ArthasTraceHit[];
/**
 * Run one command against one attached agent.
 *
 * @param request - the port, the command, and the deadline (or its absence).
 * @returns Arthas's own response, including the ones that report failure: a
 *          command that failed is a successful call that has a sad answer, and
 *          throwing would lose the `results` a caller needs to explain it.
 * @throws ArthasHttpError when nothing answered, or what answered was not Arthas.
 */
export declare function execArthas(request: ArthasExecRequest): Promise<ArthasResponse>;
/**
 * Is anything listening on this agent's HTTP port?
 *
 * Used before a command rather than instead of one: `execArthas` is the only
 * thing that can tell a live agent from a process that merely holds the port, and
 * this exists so a caller can say "nothing is attached to PID 45076" instead of
 * quoting a connection error.
 *
 * @param port - the HTTP port to probe.
 * @param timeoutMs - how long to wait for the probe; kept short, it is a hint.
 * @returns true when a TCP connection is accepted.
 */
export declare function isAgentListening(port: number, timeoutMs?: number): Promise<boolean>;
/**
 * Why a response's command did not work, in words a caller can act on.
 *
 * **This is the function that exists because `state` lies.** Arthas answers
 * `state: "SUCCEEDED"` for commands that failed, so the only honest reading comes
 * from `status.statusCode` — and, for a registration, from `enhancer.success`.
 *
 * A caller that skipped this would report "the watch is fine and simply has not
 * fired yet" for a watch that never registered at all. Those two look identical
 * from `state` alone and they call for opposite next steps, which is why this
 * lives beside the response types rather than in whichever caller needed it first.
 *
 * @param response - whatever Arthas answered.
 * @returns the reason, with terminal colour stripped, or undefined on success.
 */
export declare function failureText(response: ArthasResponse): string | undefined;
