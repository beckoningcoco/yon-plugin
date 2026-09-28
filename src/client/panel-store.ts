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
  /**
   * Announce one layer standing above the panel: the project surface, and the
   * dialogs that surface opens on top of itself. While a layer is up, the
   * panel's own dismissals stand down — Escape belongs to the top layer, and a
   * click inside that layer is not a click outside the panel.
   * @returns the release for that layer; call it when the layer closes.
   */
  pushOverlay(): () => void
}

/**
 * Create the panel state source. One handle per `apply` call: the source
 * identity stays stable (the renderer caches the hook binding per source) and
 * its snapshot reference changes only when the state actually moves.
 * @returns the panel store.
 */
export function createYonPanelStore(): YonPanelStore {
  let snapshot: YonPanelSnapshot = { open: false, overlayDepth: 0 }
  let overlayDepth = 0
  const listeners = new Set<() => void>()
  const publish = (open: boolean): void => {
    if (snapshot.open === open && snapshot.overlayDepth === overlayDepth) return
    snapshot = { open, overlayDepth }
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
    pushOverlay: () => {
      overlayDepth += 1
      publish(snapshot.open)
      let released = false
      return () => {
        // Releasing twice would let one layer cancel another's protection.
        if (released) return
        released = true
        overlayDepth = Math.max(0, overlayDepth - 1)
        publish(snapshot.open)
      }
    },
  }
}
