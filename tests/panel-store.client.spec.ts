import { describe, expect, it, vi } from 'vitest'
import { createYonPanelStore } from '../src/client/panel-store.ts'

describe('yon panel store', () => {
  it('starts closed with nothing above it', () => {
    expect(createYonPanelStore().getSnapshot()).toEqual({ open: false, overlayDepth: 0 })
  })

  it('moves through open, close and toggle', () => {
    const store = createYonPanelStore()
    store.open()
    expect(store.getSnapshot().open).toBe(true)
    store.close()
    expect(store.getSnapshot().open).toBe(false)
    store.toggle()
    expect(store.getSnapshot().open).toBe(true)
    store.toggle()
    expect(store.getSnapshot().open).toBe(false)
  })

  it('keeps the snapshot reference stable while the fact does not move', () => {
    const store = createYonPanelStore()
    const before = store.getSnapshot()
    store.close()
    expect(store.getSnapshot()).toBe(before)
    store.open()
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('notifies live subscribers once per real change and stops after unsubscribe', () => {
    const store = createYonPanelStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.open()
    store.open()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.close()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('counts the layers above the panel so one Escape closes one layer', () => {
    const store = createYonPanelStore()
    store.open()

    const releaseSurface = store.pushOverlay()
    expect(store.getSnapshot()).toEqual({ open: true, overlayDepth: 1 })

    const releaseDialog = store.pushOverlay()
    expect(store.getSnapshot().overlayDepth).toBe(2)

    releaseDialog()
    expect(store.getSnapshot().overlayDepth).toBe(1)

    releaseSurface()
    expect(store.getSnapshot()).toEqual({ open: true, overlayDepth: 0 })

    // Releasing twice must not cancel a layer someone else still holds.
    releaseSurface()
    expect(store.getSnapshot().overlayDepth).toBe(0)
  })

  it('keeps the open fact independent of the layer count', () => {
    const store = createYonPanelStore()
    const release = store.pushOverlay()
    store.open()
    expect(store.getSnapshot()).toEqual({ open: true, overlayDepth: 1 })

    store.close()
    expect(store.getSnapshot()).toEqual({ open: false, overlayDepth: 1 })

    release()
    expect(store.getSnapshot()).toEqual({ open: false, overlayDepth: 0 })
  })

  it('tolerates a subscriber unsubscribing during publication', () => {
    const store = createYonPanelStore()
    const second = vi.fn()
    const unsubscribeFirst = store.subscribe(() => { unsubscribeFirst() })
    store.subscribe(second)

    store.open()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
