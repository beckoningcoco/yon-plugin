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
/** One Arthas failure, carrying the code that says what to do about it. */
export class ArthasError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ArthasError';
        this.code = code;
    }
}
/**
 * A failure of the transport or of exchanging messages with the agent.
 *
 * Separate from `ArthasError` so `arthas-http.ts` can be typed to raise only the
 * transport-shaped codes — a module that cannot run a command has no business
 * reporting `invalid-input`, and saying so in the type is cheaper than a review
 * comment nobody reads.
 */
export class ArthasHttpError extends ArthasError {
    constructor(code, message) {
        super(code, message);
        this.name = 'ArthasHttpError';
    }
}
