import { describe, expect, it, vi } from 'vitest'
import { createYonPanelStore } from '../src/client/panel-store.ts'

describe('yon panel store', () => {
  it('starts closed', () => {
    expect(createYonPanelStore().getSnapshot()).toEqual({ open: false })
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

  it('tolerates a subscriber unsubscribing during publication', () => {
    const store = createYonPanelStore()
    const second = vi.fn()
    const unsubscribeFirst = store.subscribe(() => { unsubscribeFirst() })
    store.subscribe(second)

    store.open()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
