// @vitest-environment jsdom
/**
 * The plugin's registration contract, asserted against a minimal stand-in for
 * the two services it declares rather than against the harness's own client
 * runtime: the published client halves are loader artifacts, and this repository
 * tests what the plugin contributes, not how the host renders it.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

// The plugin body imports the host's baseline UI kit; its published client half
// is a loader artifact rather than source, so the spec stubs it out.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: { children: unknown }) => children,
  useAnchoredPosition: () => null,
  useDismissOnOutsidePointer: () => {},
}))

/** One recorded register() call. */
interface Registration {
  readonly name: string
  readonly options: Record<string, unknown>
  readonly component: unknown
}

/**
 * Minimal slot-service stand-in: records registrations, runs inject callbacks at
 * once, and serves the ledger the panel's row projection reads.
 *
 * A new registration is announced to the key's subscribers, as the real registry
 * announces it — that announcement is what the panel listens for, so a stand-in
 * that recorded silently would leave the panel looking at an empty seat.
 */
function stubSlots() {
  const registrations: Registration[] = []
  const listeners = new Map<string, Set<() => void>>()
  const slots = {
    register(options: Record<string, unknown>, component: unknown): () => void {
      registrations.push({ name: String(options.name), options, component })
      for (const listener of [...listeners.get(String(options.name)) ?? []]) listener()
      return () => {}
    },
    inject(_key: string, callback: () => unknown): () => void {
      callback()
      return () => {}
    },
    entries(key: string): readonly { options: Record<string, unknown> }[] {
      return registrations
        .filter(entry => entry.name === key)
        .map(entry => ({ options: entry.options }))
    },
    subscribe(key: string, fn: () => void): () => void {
      const set = listeners.get(key) ?? new Set<() => void>()
      set.add(fn)
      listeners.set(key, set)
      return () => { set.delete(fn) }
    },
  }
  return { slots, registrations }
}

/**
 * Minimal locale stand-in: `register` records the call, and `bind` translates
 * through the dictionaries that were registered. That is all this plugin reads
 * from the service — including through the seat's label thunks, which are what
 * the panel's row projection resolves.
 * @returns the service, plus the spy the dictionary test asserts on.
 */
function stubLocale() {
  const registerLocale = vi.fn()
  const dicts = new Map<string, Record<string, string>>()
  const locale = {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): () => void {
      registerLocale(ns, dictionaries)
      for (const [id, dict] of Object.entries(dictionaries)) dicts.set(`${ns}:${id}`, dict)
      return () => {}
    },
    bind(ns: string): (key: string) => string {
      return key => dicts.get(`${ns}:zh`)?.[key] ?? key
    },
    subscribe(): () => void {
      return () => {}
    },
  }
  return { locale, registerLocale }
}

/**
 * Mount the plugin over the two declared services.
 * @returns the context, the recorder, the locale spy, and the plugin fiber.
 */
async function bench() {
  const ctx = new Context()
  const { slots, registrations } = stubSlots()
  const { locale, registerLocale } = stubLocale()
  ctx.provide('slots', slots as never)
  ctx.provide('locale', locale as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, registrations, registerLocale, fiber }
}

/** Read a seat label as the panel does: a plain string, or a thunk resolved now. */
const readLabel = (label: unknown): string | undefined =>
  typeof label === 'function' ? (label as () => string)() : label as string | undefined

describe('dsh-plugin-yon-panel browser plugin', () => {
  it('declares the two services it needs', () => {
    expect([...inject]).toEqual(['slots', 'locale'])
  })

  it('registers one ordered action into the sidebar footer seat', async () => {
    const { registrations } = await bench()

    const action = registrations.find(entry => entry.name === 'sidebar.footer.action')

    // The footer action plus one entry per built-in surface: project, skills,
    // datasources, knowledge base, digestion ledger, installations.
    expect(registrations).toHaveLength(7)
    expect(action?.options.id).toBe('yon-btn')
    expect(action?.options.order).toBe(10)
    expect(action?.options.children).toEqual({
      'yon.panel.item': { kind: 'list', scope: 'root' },
    })
  })

  it('declares its own panel seat by contributing the built-in entry into it', async () => {
    const { registrations } = await bench()

    // Registering into an undeclared key throws at load, so contributing to
    // `yon.panel.item` is itself the proof that the panel declared it.
    const entry = registrations.find(item => item.name === 'yon.panel.item')

    expect(entry?.options.id).toBe('project')
    expect(entry?.options.order).toBe(10)
  })

  it('gives the project entry the operations and the overlay announcement it needs', async () => {
    const { registrations } = await bench()

    const entry = registrations.find(item => item.name === 'yon.panel.item')
    const face = (entry?.options.inject as () => Record<string, unknown>)()

    // The project surface: every operation the components call, and no URL.
    for (const method of [
      'listProjects', 'getProject', 'createProject', 'updateProject',
      'setField', 'removeField', 'archiveProject', 'removeProject', 'pushOverlay',
    ]) {
      expect(typeof face[method]).toBe('function')
    }

    // Announcing the layer raises the panel's count, and releasing lowers it.
    const release = (face.pushOverlay as () => () => void)()
    const action = registrations.find(item => item.name === 'sidebar.footer.action')
    const panelFace = (action?.options.inject as () => {
      hooks: { panel: { getSnapshot(): { overlayDepth: number } } }
    })()
    expect(panelFace.hooks.panel.getSnapshot().overlayDepth).toBe(1)
    release()
    expect(panelFace.hooks.panel.getSnapshot().overlayDepth).toBe(0)
  })

  it('registers the six built-in entries in order: project, skills, datasources, wiki, digest, home', async () => {
    const { registrations } = await bench()

    const entries = registrations.filter(item => item.name === 'yon.panel.item')

    expect(entries.map(entry => entry.options.id))
      .toEqual(['project', 'skills', 'datasources', 'wiki', 'digest', 'home'])
    expect(entries.map(entry => entry.options.order)).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('names every built-in entry on its own registration, in the panel dictionary', async () => {
    const { registrations } = await bench()

    const entries = registrations.filter(item => item.name === 'yon.panel.item')

    // The panel draws each row from the seat rather than from what the entry
    // renders, so a button that shows no name is a missing label here — this is
    // the assertion that would catch one.
    expect(entries.map(entry => readLabel(entry.options.label)))
      .toEqual(['项目管理', '技能', '数据源', '知识库', '消化检查', 'Home 管理'])
  })

  it('projects the seat rows into the panel, so it can name the rows it hosts', async () => {
    const { registrations } = await bench()

    const action = registrations.find(item => item.name === 'sidebar.footer.action')
    const face = (action?.options.inject as () => {
      hooks: { items: { getSnapshot(): readonly { id: string; label: string }[] } }
    })()

    // Readable without rendering a single entry: that is the property the panel
    // needs to be able to order and name its rows at all.
    expect(face.hooks.items.getSnapshot()).toEqual([
      { id: 'project', label: '项目管理' },
      { id: 'skills', label: '技能' },
      { id: 'datasources', label: '数据源' },
      { id: 'wiki', label: '知识库' },
      { id: 'digest', label: '消化检查' },
      { id: 'home', label: 'Home 管理' },
    ])
  })

  it('gives the skill entry the skill operations and the overlay announcement', async () => {
    const { registrations } = await bench()

    const entry = registrations.find(item => item.options.id === 'skills')
    const face = (entry?.options.inject as () => Record<string, unknown>)()

    // The skill surface: every operation the panel calls, and no URL. The switch
    // is here, but the host is what refuses a name this plugin does not ship.
    for (const method of ['listSkills', 'getSkill', 'setSkillEnabled', 'pushOverlay']) {
      expect(typeof face[method]).toBe('function')
    }
    expect(face.listProjects).toBeUndefined()
  })

  it('registers its dictionaries under the plugin namespace', async () => {
    const { registerLocale } = await bench()

    expect(registerLocale).toHaveBeenCalledTimes(1)
    const [namespace, dictionaries] = registerLocale.mock.calls[0] as [string, Record<string, unknown>]
    expect(namespace).toBe('yonPanel')
    expect(Object.keys(dictionaries).sort()).toEqual(['en', 'zh'])
  })

  it('projects the panel store and its gestures into the entry inject face', async () => {
    const { registrations } = await bench()

    const action = registrations.find(entry => entry.name === 'sidebar.footer.action')
    const face = (action?.options.inject as () => {
      hooks: { panel: { getSnapshot(): { open: boolean; overlayDepth: number } } }
      onToggle(): void
      onSetOpen(open: boolean): void
    })()

    expect(face.hooks.panel.getSnapshot()).toEqual({ open: false, overlayDepth: 0 })
    face.onSetOpen(true)
    expect(face.hooks.panel.getSnapshot()).toEqual({ open: true, overlayDepth: 0 })
    face.onToggle()
    expect(face.hooks.panel.getSnapshot()).toEqual({ open: false, overlayDepth: 0 })
    face.onSetOpen(false)
    expect(face.hooks.panel.getSnapshot()).toEqual({ open: false, overlayDepth: 0 })
  })

  it('tears down without throwing', async () => {
    const { fiber } = await bench()

    await expect(fiber.dispose()).resolves.toBeUndefined()
  })
})
