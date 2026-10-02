/**
 * The panel's row projection: which entries the panel shows, in what order, and
 * under what names.
 *
 * This is the piece that decides whether a button can appear nameless, so the
 * cases below are mostly about the edges: an entry that declares no name, one
 * that declares an empty one, one with no id to address at all, and the two
 * signals (registration, language) that make the same registrations read
 * differently.
 */
import { describe, expect, it, vi } from 'vitest'
import { createYonPanelItemRows, type ItemRowSources } from '../src/client/item-rows.ts'

/** One registration as the projection reads it: the two option fields it touches. */
interface Entry {
  options: {
    id?: string
    label?: string | (() => string)
  }
}

/**
 * Stand-in for the seat and the locale service: a recorded ledger, the two
 * change signals they publish, and the calls that stand in for a registration
 * and a language switch.
 * @param entries - the ledger to start with.
 * @returns the projection plus the gestures that move it.
 */
function bench(entries: Entry[] = []) {
  const seatListeners = new Set<() => void>()
  const localeListeners = new Set<() => void>()
  const sources: ItemRowSources = {
    slots: {
      entries: () => entries,
      subscribe: (_key, fn) => {
        seatListeners.add(fn)
        return () => { seatListeners.delete(fn) }
      },
    },
    locale: {
      subscribe: (fn) => {
        localeListeners.add(fn)
        return () => { localeListeners.delete(fn) }
      },
    },
  }
  const rows = createYonPanelItemRows(sources)
  return {
    rows,
    /** Register one more entry and announce it, as the registry does. */
    register(entry: Entry) {
      entries.push(entry)
      for (const fn of [...seatListeners]) fn()
    },
    /** Announce a change without moving the ledger. */
    announce: () => { for (const fn of [...seatListeners]) fn() },
    /** Announce a language switch: the same registrations, read again. */
    switchLocale: () => { for (const fn of [...localeListeners]) fn() },
    subscriptions: () => ({ seat: seatListeners.size, locale: localeListeners.size }),
  }
}

describe('yon panel item rows', () => {
  it('projects the seat in registration order, under each entry own name', () => {
    const { rows } = bench([
      { options: { id: 'project', label: '项目管理' } },
      { options: { id: 'skills', label: '技能' } },
    ])

    expect(rows.getSnapshot()).toEqual([
      { id: 'project', label: '项目管理' },
      { id: 'skills', label: '技能' },
    ])
  })

  it('names an entry that declares no name by its registration id', () => {
    const { rows } = bench([
      { options: { id: 'third-party' } },
      // An empty label is not a name either: falling back only on `undefined`
      // would leave this row drawn with nothing in it.
      { options: { id: 'blank', label: '' } },
      { options: { id: 'plain', label: 'Sibling' } },
    ])

    expect(rows.getSnapshot()).toEqual([
      { id: 'third-party', label: 'third-party' },
      { id: 'blank', label: 'blank' },
      { id: 'plain', label: 'Sibling' },
    ])
  })

  it('skips a registration with no id, which has no row to address', () => {
    const { rows } = bench([{ options: { label: 'Anonymous' } }])

    expect(rows.getSnapshot()).toEqual([])
  })

  it('re-reads a thunked name, so a language switch renames the same entry', () => {
    let dictionary = '项目管理'
    const { rows, switchLocale } = bench([{ options: { id: 'project', label: () => dictionary } }])
    const before = rows.getSnapshot()
    expect(before).toEqual([{ id: 'project', label: '项目管理' }])

    dictionary = 'Project management'
    switchLocale()

    // The registration never moved: only what its name resolves to did.
    expect(rows.getSnapshot()).toEqual([{ id: 'project', label: 'Project management' }])
    expect(rows.getSnapshot()).not.toBe(before)
  })

  it('keeps the previous array while the rows are unchanged', () => {
    const { rows, announce } = bench([{ options: { id: 'project', label: () => '项目管理' } }])
    const before = rows.getSnapshot()

    // A thunk that resolves to the same string is not a change: rebuilding the
    // array here would re-render the panel on every registration elsewhere.
    announce()

    expect(rows.getSnapshot()).toBe(before)
  })

  it('picks up an entry registered after the panel was built', () => {
    const { rows, register } = bench()
    expect(rows.getSnapshot()).toEqual([])

    register({ options: { id: 'project', label: '项目管理' } })

    expect(rows.getSnapshot()).toEqual([{ id: 'project', label: '项目管理' }])
  })

  it('notifies live subscribers once per real change and stops after unsubscribe', () => {
    const { rows, register, announce } = bench()
    const listener = vi.fn()
    const unsubscribe = rows.subscribe(listener)

    register({ options: { id: 'project', label: '项目管理' } })
    announce()
    expect(listener).toHaveBeenCalledTimes(1)

    register({ options: { id: 'skills', label: '技能' } })
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    register({ options: { id: 'wiki', label: '知识库' } })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('drops both subscriptions on dispose', () => {
    const { rows, register, switchLocale, subscriptions } = bench()
    const listener = vi.fn()
    rows.subscribe(listener)

    rows.dispose()

    expect(subscriptions()).toEqual({ seat: 0, locale: 0 })
    register({ options: { id: 'project', label: '项目管理' } })
    switchLocale()
    expect(listener).not.toHaveBeenCalled()
  })
})
