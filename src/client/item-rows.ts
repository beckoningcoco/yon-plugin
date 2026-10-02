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

import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelSource, YonPanelItemRow } from './slots.ts'

/** The seat this projection reads. */
const SEAT = 'yon.panel.item'

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
    entries(key: typeof SEAT): readonly StoredItem[]
    /**
     * Subscribe to registration changes on the seat (batched by the registry).
     * @param key - the seat key.
     * @param fn - change callback.
     * @returns unsubscribe.
     */
    subscribe(key: typeof SEAT, fn: () => void): () => void
  }
  locale: {
    /**
     * Subscribe to locale changes. Labels are thunks read per render, so a
     * language switch changes what the same registrations are called — without
     * this the rows would keep the names of the language they were built in.
     * @param fn - change callback.
     * @returns unsubscribe.
     */
    subscribe(fn: () => void): () => void
  }
}

/** The one field of a stored entry this projection reads. */
interface StoredItem {
  options: {
    id?: string | undefined
    label?: string | (() => string) | undefined
  }
}

/** The projection, plus the teardown for the two subscriptions that feed it. */
export interface YonPanelItemRows extends PanelSource<readonly YonPanelItemRow[]> {
  /** Drop both subscriptions. */
  dispose(): void
}

/**
 * Compare two row lists by what a reader would see: same ids in the same order,
 * under the same names. Rebuilding the array on every notification would be
 * invisible to React (it compares by snapshot reference), so returning the
 * previous array when nothing moved is what keeps a re-registration from
 * re-rendering the panel.
 * @param left - the current rows.
 * @param right - the candidate rows.
 * @returns whether the two are equivalent.
 */
function sameRows(left: readonly YonPanelItemRow[], right: readonly YonPanelItemRow[]): boolean {
  if (left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]
    return other !== undefined && row.id === other.id && row.label === other.label
  })
}

/**
 * Build the panel's row projection over one apply world.
 * @param ctx - the two services the projection reads.
 * @returns the row source and its teardown.
 */
export function createYonPanelItemRows(ctx: ItemRowSources): YonPanelItemRows {
  let rows: readonly YonPanelItemRow[] = []
  const listeners = new Set<() => void>()

  const project = (): void => {
    const next: YonPanelItemRow[] = []
    for (const entry of ctx.slots.entries(SEAT)) {
      const id = entry.options.id
      // An id-less list entry has no cell address to render and no name to fall
      // back to; the registry admits it, so the projection skips it.
      if (id === undefined) continue
      // An empty label is not a name: falling back to the id would otherwise be
      // skipped for exactly the entry that has nothing to show, and the panel
      // would draw a button announcing nothing.
      const declared = resolveSlotLabel(entry.options.label)
      next.push({ id, label: declared === undefined || declared === '' ? id : declared })
    }
    if (sameRows(next, rows)) return
    rows = next
    for (const listener of [...listeners]) listener()
  }

  const stopSlots = ctx.slots.subscribe(SEAT, project)
  const stopLocale = ctx.locale.subscribe(project)
  // Seeded, not merely subscribed: the panel reads this during its first render,
  // which is before the entries registered after it have been announced.
  project()

  return {
    getSnapshot: () => rows,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => {
      stopSlots()
      stopLocale()
      listeners.clear()
    },
  }
}
