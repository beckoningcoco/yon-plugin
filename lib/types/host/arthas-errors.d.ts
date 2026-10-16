/**
 * What can go wrong when the panel drives Arthas, and what each failure means.
 *
 * One error type for the whole feature rather than one per module. The reason is
 * the model-facing text: every tool renders errors through the same handler, and
 * a single class with a `code` is what lets that handler say something useful
 * about a failure without a chain of `instanceof` checks that a new module would
 * silently fall through.
 *
 * The codes are grouped by what the caller should do about them, which is the
 * only grouping that earns its keep:
 *
 * - **The operator must act** — `not-attached` (nothing is attached to that PID;
 *   run the attach first), `unavailable` (no Arthas distribution is registered or
 *   downloaded yet).
 * - **The call was wrong** — `invalid-input` (a missing or malformed argument),
 *   `not-found` (an id that names nothing), `command-failed` (Arthas ran the
 *   command and it failed; the message is Arthas's own).
 * - **Try again, or give up** — `timeout`, `disconnected`, `transport`,
 *   `bad-response`, `cancelled`.
 */
/** Every failure this feature can report. */
export type ArthasErrorCode = 
/** An argument was missing, empty, or not the shape it has to be. */
'invalid-input'
/** An id (Arthas environment, PID, session) names nothing that exists. */
 | 'not-found'
/** Nothing is listening on the agent's port: not attached, or a wrong port. */
 | 'not-attached'
/** The connection dropped, typically because the agent exited. */
 | 'disconnected'
/** The deadline passed. */
 | 'timeout'
/** The caller cancelled. */
 | 'cancelled'
/** The request could not be completed for a reason not covered above. */
 | 'transport'
/** Something answered, but not with an Arthas response. */
 | 'bad-response'
/** Arthas ran the command and reported a failure of its own. */
 | 'command-failed'
/** No usable Arthas distribution: neither downloaded nor registered. */
 | 'unavailable'
/** Anything else, including the filesystem. */
 | 'failed';
/** The codes `arthas-http.ts` can raise on its own. */
export type ArthasHttpErrorCode = Extract<ArthasErrorCode, 'not-attached' | 'disconnected' | 'timeout' | 'cancelled' | 'transport' | 'bad-response'>;
/** One Arthas failure, carrying the code that says what to do about it. */
export declare class ArthasError extends Error {
    readonly code: ArthasErrorCode;
    constructor(code: ArthasErrorCode, message: string);
}
/**
 * A failure of the transport or of exchanging messages with the agent.
 *
 * Separate from `ArthasError` so `arthas-http.ts` can be typed to raise only the
 * transport-shaped codes — a module that cannot run a command has no business
 * reporting `invalid-input`, and saying so in the type is cheaper than a review
 * comment nobody reads.
 */
export declare class ArthasHttpError extends ArthasError {
    readonly code: ArthasHttpErrorCode;
    constructor(code: ArthasHttpErrorCode, message: string);
}
