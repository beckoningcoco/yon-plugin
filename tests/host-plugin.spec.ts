/**
 * The host half's activation contract: it opens both domains, publishes the
 * stores as `ctx.yonProjects` and `ctx.yonSkills`, contributes its bundled
 * skills where a registry exists, mounts the `/yon/api` route, and tears all of
 * it down with its own fiber.
 *
 * The services are stand-ins: what this package owns is the wiring, and the real
 * backend/route behaviour is proven by the end-to-end check against a running
 * server.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  BIP_META_TOOL_NAMES, CLASS_TOOL_NAMES, DATASOURCE_TOOL_NAMES, DIGEST_TOOL_NAMES, DOMAIN_NAME,
  GBK_TOOL_NAMES, HOME_TOOL_NAMES, KNOWLEDGE_TOOL_NAMES, META_TOOL_NAMES, SKILL_DOMAIN_NAME,
  WIKI_TOOL_NAMES, WIKI_WRITE_TOOL_NAMES,
  YON_BUNDLED_SKILLS, YON_PROMPT_ORDER, YON_PROMPT_SECTION, YON_PROMPT_TEXT,
  YON_SKILL_SOURCE, apply, inject, YON_TOOL_NAMES,
} from '../src/index.ts'

/** Every tool this package registers, in the order apply() adds them. */
const ALL_TOOL_NAMES = [
  ...YON_TOOL_NAMES, ...DATASOURCE_TOOL_NAMES, ...WIKI_TOOL_NAMES, ...WIKI_WRITE_TOOL_NAMES,
  ...GBK_TOOL_NAMES, ...KNOWLEDGE_TOOL_NAMES, ...CLASS_TOOL_NAMES, ...HOME_TOOL_NAMES,
  ...META_TOOL_NAMES, ...BIP_META_TOOL_NAMES, ...DIGEST_TOOL_NAMES,
]

/** An always-empty `KvTable`, enough for the store to construct and refresh. */
function emptyTable() {
  return {
    get: (): undefined => undefined,
    entries: (): IterableIterator<[string, never]> => new Map<string, never>().entries(),
    keys: (): IterableIterator<string> => new Map<string, never>().keys(),
    size: 0,
    put: async (): Promise<void> => {},
    delete: async (): Promise<boolean> => false,
    update: async (): Promise<never> => { throw new Error('missing-key') },
  }
}

/**
 * Mount the host half over stand-in services.
 * @param withWebServer - whether this deployment has an HTTP carrier at all.
 * @param withSkills - whether this deployment mounts a skill registry.
 * @param withSystemPrompt - whether this deployment runs an agent loop at all.
 */
async function bench(withWebServer = true, withSkills = false, withSystemPrompt = true) {
  const ctx = new Context()
  const closeDomain = vi.fn(async () => {})
  const open = vi.fn(async (spec: { name?: string }) => ({
    name: spec.name,
    table: () => emptyTable(),
    close: closeDomain,
  }))
  const disposeRoute = vi.fn()
  const register = vi.fn((_route: unknown) => disposeRoute)
  const disposeTool = vi.fn()
  const registerTool = vi.fn((_definition: unknown) => disposeTool)
  const disposeSkill = vi.fn()
  const registerSkill = vi.fn((_skill: unknown) => disposeSkill)
  const disposeSection = vi.fn()
  const registerSection = vi.fn((_section: unknown) => disposeSection)
  ctx.provide('storageDomain', { open } as never)
  ctx.provide('tools', { register: registerTool } as never)
  if (withWebServer) ctx.provide('webServer', { register } as never)
  if (withSystemPrompt) ctx.provide('systemPrompt', { section: registerSection } as never)
  if (withSkills) {
    ctx.provide('skills', {
      register: registerSkill,
      snapshot: async () => ({ skills: [], complete: true }),
      get: async () => undefined,
    } as never)
  }

  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return {
    ctx, open, register, closeDomain, disposeRoute, registerTool, disposeTool,
    registerSkill, disposeSkill, registerSection, disposeSection, fiber,
  }
}

describe('dsh-plugin-yon-panel host half', () => {
  it('requires storage and the tool registry, and nothing else', () => {
    expect([...inject]).toEqual(['storageDomain', 'tools'])
  })

  it('opens both declared domains', async () => {
    const { open } = await bench()

    expect(open).toHaveBeenCalledTimes(2)
    expect(open.mock.calls[0]?.[0]).toMatchObject({ name: DOMAIN_NAME, version: 1 })
    expect(open.mock.calls[1]?.[0]).toMatchObject({ name: SKILL_DOMAIN_NAME, version: 1 })
  })

  it('publishes the store as ctx.yonProjects for in-process consumers', async () => {
    const { ctx } = await bench()

    const store = ctx.get('yonProjects') as { list(): readonly unknown[] } | undefined

    expect(store).toBeDefined()
    expect(store?.list()).toEqual([])
  })

  it('serves the API under the shared prefix', async () => {
    const { register } = await bench()

    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]?.[0]).toMatchObject({ kind: 'prefix', path: '/yon/api' })
  })

  it('loads in a deployment that has no web server at all', async () => {
    // Without this, listing `webServer` among the required services leaves the
    // entry pending forever, and a pending entry fails the whole profile.
    const { ctx, register, registerTool } = await bench(false)

    expect(register).not.toHaveBeenCalled()
    expect(registerTool).toHaveBeenCalledTimes(ALL_TOOL_NAMES.length)
    expect(ctx.get('yonProjects')).toBeDefined()
  })

  it('registers the tools and withdraws them with its own fiber', async () => {
    const { registerTool, disposeTool, fiber } = await bench()

    expect(registerTool.mock.calls.map(call => (call[0] as { name: string }).name))
      .toEqual(ALL_TOOL_NAMES)

    await fiber.dispose()
    expect(disposeTool).toHaveBeenCalledTimes(ALL_TOOL_NAMES.length)
  })

  it('publishes the skill service as ctx.yonSkills', async () => {
    const { ctx } = await bench()

    const skills = ctx.get('yonSkills') as { isLive(): boolean } | undefined

    expect(skills).toBeDefined()
    // Nothing is live without a registry — and the service still answers, which
    // is exactly what a deployment with no skill runtime depends on.
    expect(skills?.isLive()).toBe(false)
  })

  it('loads in a deployment that has no skill registry at all', async () => {
    // Without this, listing `skills` among the required services would leave the
    // entry pending forever, and a pending entry fails the whole profile.
    const { ctx, registerSkill } = await bench(true, false)

    expect(registerSkill).not.toHaveBeenCalled()
    expect(ctx.get('yonSkills')).toBeDefined()
  })

  it('registers the bundled skills and withdraws them with its own fiber', async () => {
    // The lifecycle the operator asked for: installed means offered, uninstalled
    // means gone, and never a file written into their own skill directories.
    const { registerSkill, disposeSkill, fiber } = await bench(true, true)

    expect(registerSkill.mock.calls.map(call => (call[0] as { name: string }).name))
      .toEqual(YON_BUNDLED_SKILLS.map(skill => skill.name))
    expect(registerSkill.mock.calls.map(call => (call[0] as { source: string }).source))
      .toEqual(YON_BUNDLED_SKILLS.map(() => YON_SKILL_SOURCE))

    await fiber.dispose()
    expect(disposeSkill).toHaveBeenCalledTimes(YON_BUNDLED_SKILLS.length)
  })

  it('closes both domains and drops the route with its own fiber', async () => {
    const { closeDomain, disposeRoute, fiber } = await bench()

    await fiber.dispose()

    expect(closeDomain).toHaveBeenCalledTimes(2)
    expect(disposeRoute).toHaveBeenCalledTimes(1)
  })

  it('contributes its capability section to the system prompt', async () => {
    const { registerSection } = await bench()

    expect(registerSection).toHaveBeenCalledTimes(1)
    expect(registerSection.mock.calls[0]?.[0]).toEqual({
      name: YON_PROMPT_SECTION,
      order: YON_PROMPT_ORDER,
      text: YON_PROMPT_TEXT,
    })
  })

  it('withdraws the prompt section with its own fiber', async () => {
    const { disposeSection, fiber } = await bench()

    await fiber.dispose()

    expect(disposeSection).toHaveBeenCalledTimes(1)
  })

  it('loads in a deployment that has no prompt registry at all', async () => {
    // Same reasoning as the web server and the skill registry: this plugin is
    // useful without an agent loop, and requiring the registry would leave the
    // entry pending — which fails the whole profile.
    const { ctx, registerSection, registerTool } = await bench(true, false, false)

    expect(registerSection).not.toHaveBeenCalled()
    expect(registerTool).toHaveBeenCalledTimes(ALL_TOOL_NAMES.length)
    expect(ctx.get('yonProjects')).toBeDefined()
  })
})
