/** Panel open state, owned by the plugin and projected into the slot entry. */

import type { PanelSource, YonPanelSnapshot } from './slots.ts'

/** Panel state source plus the gestures that move it. */
export interface YonPanelStore extends PanelSource<YonPanelSnapshot> {
  /** Show the panel. */
  open(): void
  /** Hide the panel. */
  close(): void
  /** Flip the panel. */
  toggle(): void
}

/**
 * Create the panel state source. One handle per `apply` call: the source
 * identity stays stable (the renderer caches the hook binding per source) and
 * its snapshot reference changes only when the open state actually moves.
 * @returns the panel store.
 */
export function createYonPanelStore(): YonPanelStore {
  let snapshot: YonPanelSnapshot = { open: false }
  const listeners = new Set<() => void>()
  const publish = (open: boolean): void => {
    if (snapshot.open === open) return
    snapshot = { open }
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    open: () => { publish(true) },
    close: () => { publish(false) },
    toggle: () => { publish(!snapshot.open) },
  }
}
