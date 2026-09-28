/**
 * The bundled-skill lifecycle: what gets registered and when, what a switch
 * does, and what the panel is told about skills this plugin does not own.
 *
 * The skill registry is a stand-in, because what this package owns is the
 * lifecycle it drives — register on attach, withdraw on switch-off and on
 * teardown, and never take a name it does not ship.
 */
import { describe, expect, it, vi } from 'vitest'
import { YON_BUNDLED_SKILLS } from '../src/host/skill-catalog.generated.ts'
import type { YonSkillDomain } from '../src/host/skill-domain.ts'
import {
  SkillError, YON_SKILL_SOURCE, createYonSkillsService,
  type YonSkillRegistration, type YonSkillRegistry, type YonSkillSummary,
} from '../src/host/skill-registry.ts'

/** The first bundled skill; every case here runs against the shipped catalog. */
const FIRST = YON_BUNDLED_SKILLS[0] as (typeof YON_BUNDLED_SKILLS)[number]

/** One in-memory `KvTable`, enough for the durable switch store. */
function memoryTable() {
  const rows = new Map<string, { enabled: boolean; updatedAt: number }>()
  return {
    get: (key: string) => rows.get(key),
    entries: () => rows.entries(),
    keys: () => rows.keys(),
    put: async (key: string, value: { enabled: boolean; updatedAt: number }) => { rows.set(key, value) },
    delete: async (key: string) => rows.delete(key),
    update: async () => { throw new Error('missing-key') },
  }
}

/** A domain stand-in exposing exactly the one table the service asks for. */
function fakeDomain() {
  const table = memoryTable()
  return { table: () => table } as unknown as YonSkillDomain
}

/** A registry stand-in: it records registrations and can report a catalog. */
function fakeRegistry(catalog: readonly YonSkillSummary[] = [], complete = true) {
  const disposers = new Map<string, () => void>()
  const register = vi.fn((skill: YonSkillRegistration) => {
    const dispose = vi.fn(() => { disposers.delete(skill.name) })
    disposers.set(skill.name, dispose)
    return dispose
  })
  const registry: YonSkillRegistry = {
    register,
    snapshot: async () => ({ skills: catalog, complete }),
    get: async (name) => {
      const found = catalog.find(skill => skill.name === name)
      return found === undefined ? undefined : { ...found, content: 'body' }
    },
  }
  return { registry, register, disposers }
}

/** A skill the operator owns, as the merged catalog reports it. */
const OPERATOR_SKILL: YonSkillSummary = {
  name: 'operator-skill',
  description: 'The operator wrote this one.',
  source: 'user-agents',
  provider: 'filesystem',
  invocation: { modelInvocable: true, userInvocable: true },
}

describe('bundled skills', () => {
  it('lists its own skills and stays complete when no registry is mounted', async () => {
    const { service } = createYonSkillsService(fakeDomain())

    const payload = await service.list()

    expect(payload.complete).toBe(true)
    expect(payload.skills.map(skill => skill.name)).toEqual(YON_BUNDLED_SKILLS.map(skill => skill.name))
    expect(payload.skills.every(skill => skill.managed)).toBe(true)
    expect(payload.skills[0]?.source).toBe(YON_SKILL_SOURCE)
    // Nothing can be offered without a registry, and the service says so rather
    // than pretending the skills are live.
    expect(service.isLive()).toBe(false)
  })

  it('registers every bundled skill on attach, stamped with this plugin as the source', async () => {
    const { registry, register } = fakeRegistry()
    const handle = createYonSkillsService(fakeDomain())

    handle.attach(registry)

    expect(register.mock.calls.map(call => call[0].name))
      .toEqual(YON_BUNDLED_SKILLS.map(skill => skill.name))
    expect(register.mock.calls.every(call => call[0].source === YON_SKILL_SOURCE)).toBe(true)
    expect(handle.service.isLive()).toBe(true)
  })

  it('withdraws a skill when it is switched off, and offers it again when switched back on', async () => {
    const { registry, disposers } = fakeRegistry()
    const handle = createYonSkillsService(fakeDomain())
    handle.attach(registry)
    const dispose = disposers.get(FIRST.name)

    const off = await handle.service.setEnabled(FIRST.name, false)
    expect(off.enabled).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(disposers.has(FIRST.name)).toBe(false)

    const on = await handle.service.setEnabled(FIRST.name, true)
    expect(on.enabled).toBe(true)
    expect(disposers.has(FIRST.name)).toBe(true)
  })

  it('keeps a switched-off skill out of the catalog after a restart', async () => {
    const domain = fakeDomain()
    const first = createYonSkillsService(domain)
    first.attach(fakeRegistry().registry)
    await first.service.setEnabled(FIRST.name, false)

    // A second service over the same domain is what the next boot looks like.
    const { registry, register } = fakeRegistry()
    const second = createYonSkillsService(domain)
    second.attach(registry)

    expect(register.mock.calls.map(call => call[0].name))
      .toEqual(YON_BUNDLED_SKILLS.filter(skill => skill.name !== FIRST.name).map(skill => skill.name))
  })

  it('refuses to switch a skill this plugin does not ship', async () => {
    const handle = createYonSkillsService(fakeDomain())
    handle.attach(fakeRegistry().registry)

    // The panel can list the operator's skills, and this is the line that keeps
    // it from ever switching one.
    await expect(handle.service.setEnabled('operator-skill', false))
      .rejects.toBeInstanceOf(SkillError)
  })

  it('lists the operator half from the catalog without repeating its own registered skills', async () => {
    const catalog: readonly YonSkillSummary[] = [
      { ...OPERATOR_SKILL },
      {
        name: FIRST.name,
        description: FIRST.description,
        source: YON_SKILL_SOURCE,
        provider: 'runtime',
        invocation: { modelInvocable: true, userInvocable: true },
      },
    ]
    const handle = createYonSkillsService(fakeDomain())
    handle.attach(fakeRegistry(catalog).registry)

    const payload = await handle.service.list()

    expect(payload.skills.map(skill => skill.name))
      .toEqual([...YON_BUNDLED_SKILLS.map(skill => skill.name), OPERATOR_SKILL.name])
    const theirs = payload.skills.filter(skill => !skill.managed)
    expect(theirs.map(skill => skill.name)).toEqual([OPERATOR_SKILL.name])
    // Read-only is a property of the row, not a promise in the copy: the panel
    // renders no switch for anything it does not manage.
    expect(theirs.every(skill => skill.source !== YON_SKILL_SOURCE)).toBe(true)
  })

  it('reads a skill body for both halves', async () => {
    const handle = createYonSkillsService(fakeDomain())
    handle.attach(fakeRegistry([OPERATOR_SKILL]).registry)

    const mine = await handle.service.read(FIRST.name)
    const theirs = await handle.service.read(OPERATOR_SKILL.name)

    expect(mine?.content).toBe(FIRST.content)
    expect(theirs?.content).toBe('body')
    expect(await handle.service.read('nobody-has-this')).toBeUndefined()
  })

  it('passes an unreadable catalog through as incomplete', async () => {
    const handle = createYonSkillsService(fakeDomain())
    handle.attach(fakeRegistry([OPERATOR_SKILL], false).registry)

    const payload = await handle.service.list()

    expect(payload.complete).toBe(false)
    // A partial read still answers with what it has.
    expect(payload.skills.length).toBeGreaterThan(YON_BUNDLED_SKILLS.length - 1)
  })

  it('withdraws everything on dispose, so uninstalling leaves nothing behind', async () => {
    const { registry, disposers } = fakeRegistry()
    const handle = createYonSkillsService(fakeDomain())
    handle.attach(registry)

    handle.dispose()

    expect(disposers.size).toBe(0)
    expect(handle.service.isLive()).toBe(false)
  })
})
