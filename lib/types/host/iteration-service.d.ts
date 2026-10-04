/**
 * The ledger the model writes and the panel reads.
 *
 * The service owns the read-modify-write cycle over the store, for the reason
 * `home-service.ts:1-9` gives: the store serialises its own writes, but two
 * mutations that each read first would both act on the state before either wrote.
 * Here that is not hypothetical — a model and an operator routinely act in the
 * same minute, and the model's append landing between the panel's read and its
 * write would be lost silently. So the whole cycle is queued here as well.
 *
 * It also owns the two rules that make the ledger trustworthy:
 *
 * **Nothing is written into a document that cannot be read.** If `iteration.json`
 * does not parse, every mutation refuses and says so. The alternative — reading
 * it as empty and writing one row back — would replace whatever the operator had
 * written by hand with a single new note, which is the worst outcome available
 * here. The panel's reads still work: `list()` reports the error rather than
 * throwing, because a reader that cannot see the file should at least be told why.
 *
 * **A model's repeat is not a second row.** `create(..., { dedupe: true })` refuses
 * to append a row whose `(target, symptom)` already sits in the ledger as `open`.
 * A model that hits the same shortcoming twice in one session would otherwise file
 * it twice, and a ledger with twenty copies of one complaint is a ledger nobody
 * reads. The match is exact and trimmed — deliberately dumb, because a fuzzy one
 * would need a threshold nobody could justify. `target` must be non-empty for the
 * match to apply at all: two notes with no target in common are not the same note,
 * and treating them as one would swallow real distinct findings.
 *
 * Dedupe is off for the panel. A person may record two similar things and knows
 * why.
 */
import { type IterationKind, type IterationListPayload, type IterationRowView, type IterationStatus, type SaveIterationInput, type UpdateIterationInput } from '../shared/types.ts';
import type { IterationStore } from './iteration-store.ts';
/** Why a ledger operation could not be carried out. */
export declare class IterationError extends Error {
    /** `invalid-input` answers 400, `not-found` answers 404. */
    readonly code: 'invalid-input' | 'not-found';
    constructor(
    /** `invalid-input` answers 400, `not-found` answers 404. */
    code: 'invalid-input' | 'not-found', message: string);
}
/** What `list` may be narrowed to. */
export interface IterationQuery {
    /** `all`, or absent, lists every status. */
    readonly status?: IterationStatus | 'all';
    readonly kind?: IterationKind;
}
/** One filing's outcome: the row as it now stands, and whether it is new. */
export interface IterationCreated {
    readonly row: IterationRowView;
    /** False when an identical open row already existed. */
    readonly created: boolean;
}
/** The ledger, as the tools, the routes and the panel use it. */
export interface YonIterationService {
    /** The document the notes live in, for the panel to name. */
    readonly storePath: string;
    list(query?: IterationQuery): Promise<IterationListPayload>;
    create(input: SaveIterationInput, options?: {
        readonly dedupe?: boolean;
    }): Promise<IterationCreated>;
    update(id: string, patch: UpdateIterationInput): Promise<IterationRowView>;
    remove(id: string): Promise<string>;
}
/**
 * Open the service over a store.
 *
 * No disposer, unlike `createYonHomesService`: that one holds a `disposed` flag
 * because a mount can be torn down between two of its own awaits, and it still
 * owes `defaultVersion()` an answer. Nothing here outlives the call that made it —
 * the queue drains and the flag would have nothing to guard.
 *
 * @param store - the ledger document.
 * @returns the service.
 */
export declare function createYonIterationService(store: IterationStore): YonIterationService;
