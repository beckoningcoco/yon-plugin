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

/** Minimal slot-service stand-in: records registrations and runs inject callbacks at once. */
function stubSlots() {
  const registrations: Registration[] = []
  const slots = {
    register(options: Record<string, unknown>, component: unknown): () => void {
      registrations.push({ name: String(options.name), options, component })
      return () => {}
    },
    inject(_key: string, callback: () => unknown): () => void {
      callback()
      return () => {}
    },
  }
  return { slots, registrations }
}

/**
 * Mount the plugin over the two declared services.
 * @returns the context, the recorder, the locale spy, and the plugin fiber.
 */
async function bench() {
  const ctx = new Context()
  const { slots, registrations } = stubSlots()
  const registerLocale = vi.fn()
  ctx.provide('slots', slots as never)
  ctx.provide('locale', { register: registerLocale } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, registrations, registerLocale, fiber }
}

describe('dsh-plugin-yon-panel browser plugin', () => {
  it('declares the two services it needs', () => {
    expect([...inject]).toEqual(['slots', 'locale'])
  })

  it('registers one ordered action into the sidebar footer seat', async () => {
    const { registrations } = await bench()

    const action = registrations.find(entry => entry.name === 'sidebar.footer.action')

    // The footer action plus one entry per built-in surface: project, skills,
    // datasources, knowledge base, digestion ledger.
    expect(registrations).toHaveLength(6)
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

  it('registers the five built-in entries in order: project, skills, datasources, wiki, digest', async () => {
    const { registrations } = await bench()

    const entries = registrations.filter(item => item.name === 'yon.panel.item')

    expect(entries.map(entry => entry.options.id)).toEqual(['project', 'skills', 'datasources', 'wiki', 'digest'])
    expect(entries.map(entry => entry.options.order)).toEqual([10, 20, 30, 40, 50])
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
