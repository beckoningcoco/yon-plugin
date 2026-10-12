/**
 * The Chrome DevTools Protocol, spoken from Node.
 *
 * WHY THIS FILE EXISTS
 * The panel already starts a browser with a debugging port (`browser-system.ts`) and
 * already remembers how to reach it (`BrowserRunView.endpoint`). What it never had was
 * a client: everything up to the port was ours, and the port itself was handed to
 * whatever tool the operator pointed at it. This module is that client — the smallest
 * thing that can ask an endpoint who it is, then carry CDP commands over a socket.
 *
 * WHY NO DEPENDENCY
 * `WebSocket` is a global from Node 22 on, and the host this plugin runs inside is
 * Electron 43 (Node 22+) — measured on this machine, not assumed. Adding `ws` would put
 * a second, older implementation of the same protocol into a package whose whole
 * dependency list is `zod` plus the harness's storage packages.
 *
 * IDENTITY, NOT JUST REACHABILITY
 * `probeEndpoint` returns the `webSocketDebuggerUrl` the browser reports for *itself*.
 * `browser-service.ts` already uses that string as the token that tells one browser
 * apart from another on a port; keeping the same evidence here means the tool layer and
 * the panel's stop path agree on what "the browser on this port" means. A port that
 * answers with something that is not a CDP identity is reported as such rather than
 * being driven as if it were one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not launch, close or restart a browser. Those are `browser-system.ts`'s
 * decisions, made by a person through the panel. A drop is a drop: this layer reports
 * it and stops, because a client that reconnects on its own would be a second owner of
 * a process it did not start.
 *
 * @module yon-panel/cdp-client
 */
/** What went wrong, as a value the tool layer can branch on. */
export type CdpErrorCode = 
/** Nothing answered on the port, or the answer was not HTTP. */
'unreachable'
/** Something answered, but it is not a CDP endpoint. */
 | 'not-cdp'
/** The endpoint named a socket we could not open. */
 | 'socket-failed'
/** The connection is closed — the browser was closed by a person, most likely. */
 | 'closed'
/** A command outlived its budget. */
 | 'timeout'
/** The browser answered a command with an error. */
 | 'protocol';
/** One CDP failure, carrying its own code so callers stop matching on prose. */
export declare class CdpError extends Error {
    readonly code: CdpErrorCode;
    constructor(code: CdpErrorCode, message: string);
}
/**
 * A debugging endpoint, and the browser's own name for it.
 *
 * `token` is the identity evidence: it changes when a different browser takes the port,
 * which is exactly what `browser-service.ts` checks before it will end a run.
 */
export interface CdpEndpoint {
    /** The HTTP face, forward-slashed and without a trailing slash. */
    readonly http: string;
    /** The socket the browser told us to use. */
    readonly webSocket: string;
    /** `webSocketDebuggerUrl`, verbatim — the identity token. */
    readonly token: string;
    /** The browser's product string, e.g. `Edg/154.0.4258.62`. */
    readonly product: string;
}
/** One event the browser pushed at us. */
export interface CdpEvent {
    readonly method: string;
    readonly params: Record<string, unknown>;
    /** Present when the event came from a session we attached to. */
    readonly sessionId?: string;
}
/** A JSON value, as CDP answers are shaped. */
export type CdpMessage = Record<string, unknown>;
/** An unsubscriber, so callers can stop listening without closing the socket. */
export type CdpUnsubscribe = () => void;
/**
 * Ask an HTTP debug endpoint who it is.
 *
 * The answer is the same evidence `browser-system.ts` uses on its stop path, so a run
 * that is "alive" to the panel is connectable here and vice versa.
 * @param http - a URL such as `http://127.0.0.1:9222`, with or without `/json/version`.
 * @param signal - the caller's cancellation.
 * @returns the endpoint and its identity token.
 * @throws CdpError `unreachable` when nothing answers, `not-cdp` when the answer is not CDP.
 */
export declare function probeEndpoint(http: string, signal?: AbortSignal): Promise<CdpEndpoint>;
/**
 * One open CDP socket.
 *
 * A connection is cheap and disposable: the tool layer opens one per call rather than
 * holding a long-lived one, so a browser that was closed between two calls produces a
 * plain `closed` error instead of a stale socket nobody noticed.
 */
export declare class CdpConnection {
    #private;
    private constructor();
    /**
     * Open a socket to an endpoint.
     * @param endpoint - as `probeEndpoint` returned it.
     * @param signal - the caller's cancellation.
     * @returns the open connection.
     * @throws CdpError `socket-failed` when it never opens.
     */
    static open(endpoint: CdpEndpoint, signal?: AbortSignal): Promise<CdpConnection>;
    /** Whether this connection has been closed, by us or by the browser. */
    get closed(): boolean;
    /** Why it closed, when the reason is known. */
    get closedReason(): string | undefined;
    /**
     * Send one command and wait for its answer.
     * @param method - the CDP method, e.g. `Target.createTarget`.
     * @param params - its parameters.
     * @param sessionId - the attached session, when the command is session-scoped.
     * @returns the command's `result` object.
     * @throws CdpError `closed`, `timeout` or `protocol`.
     */
    send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<CdpMessage>;
    /**
     * Listen for browser-pushed events.
     * @param listener - called once per event.
     * @returns the unsubscriber.
     */
    on(listener: (event: CdpEvent) => void): CdpUnsubscribe;
    /** Close the socket. Safe to call twice; pending commands fail with `closed`. */
    close(): void;
}
