/**
 * The panel's row projection: which entries occupy the button seat, in what
 * order, and what each is called.
 *
 * The panel renders its rows from this, not from whatever the entries happen to
 * draw. That inversion is the point: a list seat can be inspected, ordered and
 * named before any of its entries is mounted, which is what lets the panel label
 * a foreign entry without that package knowing the panel's copy, and what makes
 * "every button has a name" a property of the panel rather than a habit each
 * contributor has to keep.
 *
 * The names live on the registration (`label`, a string or a thunk resolved per
 * read) because that is where the harness already keeps the display label of a
 * list entry — the same field the conversation view projects its tabs from.
 */
import type { PanelSource, YonPanelItemRow } from './slots.ts';
/** The seat this projection reads. */
declare const SEAT = "yon.panel.item";
/**
 * The service surface this projection reads, structurally — the two slot methods
 * that carry the ledger and the one locale signal that invalidates it. Declared
 * narrowly rather than taken from the context type so this module can be driven
 * by a test bench with no renderer behind it, and so no harness release's service
 * shape leaks into the projection.
 */
export interface ItemRowSources {
    slots: {
        /**
         * Snapshot the seat's entries in registration order.
         * @param key - the seat key.
         * @returns the entries, each carrying its registration options.
         */
        entries(key: typeof SEAT): readonly StoredItem[];
        /**
         * Subscribe to registration changes on the seat (batched by the registry).
         * @param key - the seat key.
         * @param fn - change callback.
         * @returns unsubscribe.
         */
        subscribe(key: typeof SEAT, fn: () => void): () => void;
    };
    locale: {
        /**
         * Subscribe to locale changes. Labels are thunks read per render, so a
         * language switch changes what the same registrations are called — without
         * this the rows would keep the names of the language they were built in.
         * @param fn - change callback.
         * @returns unsubscribe.
         */
        subscribe(fn: () => void): () => void;
    };
}
/** The one field of a stored entry this projection reads. */
interface StoredItem {
    options: {
        id?: string | undefined;
        label?: string | (() => string) | undefined;
    };
}
/** The projection, plus the teardown for the two subscriptions that feed it. */
export interface YonPanelItemRows extends PanelSource<readonly YonPanelItemRow[]> {
    /** Drop both subscriptions. */
    dispose(): void;
}
/**
 * Build the panel's row projection over one apply world.
 * @param ctx - the two services the projection reads.
 * @returns the row source and its teardown.
 */
export declare function createYonPanelItemRows(ctx: ItemRowSources): YonPanelItemRows;
export {};
