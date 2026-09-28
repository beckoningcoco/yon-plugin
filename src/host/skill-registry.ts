/**
 * The skills this plugin contributes to the agent, and the switches that turn
 * them off.
 *
 * ## Why the registry and not a directory
 *
 * A skill registered here is a plain same-process value that exists exactly as
 * long as the plugin does. Installing the plugin offers it to every session;
 * uninstalling it takes the skill away. Nothing is ever written into the
 * operator's skill directories — no `~/.dsh/skills`, no `~/.agents/skills`, no
 * cleanup step that can fail halfway and leave a half-removed bundle behind.
 * That is the whole reason the bodies are inlined at build time
 * ({@link file://./skill-catalog.ts}) instead of dropped on disk at install.
 *
 * Two properties of the registry's own ordering matter, and both come from
 * `dsh-skill` rather than from anything chosen here:
 *
 * - **Runtime sits above user.** A skill registered here outranks one found in
 *   `~/.agents/skills` or `~/.dsh/skills`, and below anything the operator
 *   checked into a repository (`<project>/.dsh/skills`). A project that pins its
 *   own version of a skill therefore still wins.
 * - **Same-name runtime entries are first-wins.** Registering a name twice logs
 *   a warning and returns an inert disposer, so a double registration cannot
 *   quietly remove the live skill.
 *
 * ## The registry contract is declared, not imported
 *
 * For the reason `tools.ts` gives: the harness's skill package is not a
 * dependency a third-party plugin can install and pin against the deployment
 * actually running it. The declarations below are the documented calls this
 * plugin makes, and nothing more.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SkillDetail, SkillListPayload, SkillView } from '../shared/types.ts'
import { YON_BUNDLED_SKILLS } from './skill-catalog.generated.ts'
import type { YonBundledSkill } from './skill-catalog.ts'
import type { YonSkillDomain } from './skill-domain.ts'

/** One runtime skill contribution, as the registry's `register()` consumes it. */
export interface YonSkillRegistration {
  /** Kebab-case identifier; the registry rejects anything else. */
  readonly name: string
  /** Required and non-empty; the registry rejects an empty one. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Origin label, prompt-visible metadata rather than precedence. */
  readonly source: string
  /** The Markdown instruction body. */
  readonly content: string
}

/** One skill the registry reports, invocation-neutral. */
export interface YonSkillSummary {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly source: string
  readonly provider: string
  readonly invocation: {
    readonly modelInvocable: boolean
    readonly userInvocable: boolean
  }
}

/** One loaded skill, body included. */
export interface YonSkillDefinition extends YonSkillSummary {
  readonly content: string
}

/**
 * One catalog read: the winning summaries plus whether discovery completed.
 * `complete: false` means some source could not be read and the list is partial.
 */
export interface YonSkillCatalog {
  readonly skills: readonly YonSkillSummary[]
  readonly complete: boolean
}

/** Lookup context; `cwd` selects project roots, `signal` cancels discovery. */
export interface YonSkillLookup {
  readonly cwd?: string
  readonly signal?: AbortSignal
}

/** The slice of the skill registry this plugin uses. */
export interface YonSkillRegistry {
  /**
   * Register a runtime skill for this plugin's lifetime.
   * @param skill - the contribution.
   * @returns the disposer that withdraws it; inert if the name was already taken.
   */
  register(skill: YonSkillRegistration): () => void

  /**
   * Read the merged catalog.
   * @param options - lookup context.
   * @returns the winning skills and whether discovery completed.
   */
  snapshot(options?: YonSkillLookup): Promise<YonSkillCatalog>

  /**
   * Load one skill's body.
   * @param name - skill identifier.
   * @param options - lookup context.
   * @returns the skill, or undefined when nothing by that name is visible.
   */
  get(name: string, options?: YonSkillLookup): Promise<YonSkillDefinition | undefined>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The skill registry, mounted by the harness's own skill runtime. */
    skills: YonSkillRegistry
  }
}

/**
 * Origin label stamped on every skill this plugin registers.
 *
 * The panel filters on exactly this: it is what separates "skills this plugin
 * ships and may switch off" from "skills the operator already had", without
 * storing a second copy of that distinction anywhere.
 */
export const YON_SKILL_SOURCE = 'yon-panel'

/** Provider label the registry stamps on runtime registrations. */
const RUNTIME_PROVIDER = 'runtime'

/** A skill failure the caller can act on; the HTTP layer maps it to a status. */
export class SkillError extends Error {
  constructor(
    /** Machine code the API reports. */
    readonly code: 'not-found' | 'invalid-input',
    message: string,
  ) {
    super(message)
    this.name = 'SkillError'
  }
}

/** The panel-facing surface, reachable in-process as `ctx.yonSkills`. */
export interface YonSkillsService {
  /**
   * Every visible skill: this plugin's own first, then every other
   * deployment-level contribution.
   *
   * The read selects the registry's **global layer**, which is where this
   * plugin's own registrations land and where DSH expects deployment-level
   * providers to land (its own bundle patch says so: "deployment-level
   * providers — repository plugins, a host skill-filesystem row — register into
   * its global layer"). A skill discovered from disk is deliberately not here:
   * DSH mounts `skill-filesystem` inside each agent preset, so those skills
   * belong to a scope that a request with no session behind it cannot name.
   * That is the right boundary for a panel that manages what this plugin ships.
   * @returns the list rows plus whether every source could be read.
   */
  list(): Promise<SkillListPayload>

  /**
   * One skill with its instruction body.
   * @param name - skill identifier.
   * @returns the detail, or undefined when no such skill is visible.
   */
  read(name: string): Promise<SkillDetail | undefined>

  /**
   * Turn one of this plugin's skills on or off, durably.
   * @param name - skill identifier; must be one this plugin ships.
   * @param enabled - target state.
   * @returns the skill as it now stands.
   */
  setEnabled(name: string, enabled: boolean): Promise<SkillDetail>

  /**
   * Whether the skill registry is mounted at all. A deployment without it (a
   * minimal profile) still shows the list; nothing can be switched on there.
   * @returns whether registrations are live.
   */
  isLive(): boolean
}

/** The service plus the plugin-owned registration lifecycle. */
export interface YonSkillsHandle {
  readonly service: YonSkillsService
  /**
   * Start contributing skills through a mounted registry. Called once the
   * `skills` service appears — it is deliberately absent from this plugin's
   * `inject` array, because a missing service listed there would leave the
   * whole plugin pending and take the profile down.
   * @param registry - the mounted skill registry.
   * @returns the disposer withdrawing every registration it made.
   */
  attach(registry: YonSkillRegistry): () => void
  /** Withdraw every registration and drop listeners. */
  dispose(): void
}

/**
 * Build the skill service over an opened switch domain.
 * @param domain - the opened `yon_skills` domain.
 * @returns the service, its attach hook, and its disposer.
 */
export function createYonSkillsService(domain: YonSkillDomain): YonSkillsHandle {
  const preferences = domain.table('skill_preferences')
  const bundled = new Map(YON_BUNDLED_SKILLS.map(skill => [skill.name, skill]))
  /** Live registrations, by skill name; presence is the real "is it on" answer. */
  const registrations = new Map<string, () => void>()
  let registry: YonSkillRegistry | undefined

  /**
   * Read one stored switch. A skill with no record counts as enabled, so a
   * fresh install ships its skills live instead of silently off.
   */
  const isEnabled = (name: string): boolean => preferences.get(name)?.enabled ?? true

  const present = (skill: YonBundledSkill): SkillView => ({
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    source: YON_SKILL_SOURCE,
    provider: RUNTIME_PROVIDER,
    managed: true,
    enabled: isEnabled(skill.name),
    // Registration omits the invocation policy, which the registry resolves to
    // both surfaces. Kept explicit here so the panel states what it got.
    modelInvocable: true,
    userInvocable: true,
  })

  const asView = (skill: YonSkillSummary): SkillView => ({
    name: skill.name,
    description: skill.description,
    ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
    source: skill.source,
    provider: skill.provider,
    managed: false,
    // Not this plugin's to switch: these come from the operator's own skill
    // directories, and the panel must never imply it can turn one off.
    enabled: true,
    modelInvocable: skill.invocation.modelInvocable,
    userInvocable: skill.invocation.userInvocable,
  })

  const detailOf = (skill: YonBundledSkill): SkillDetail => ({
    ...present(skill),
    content: skill.content,
  })

  /** Register one bundled skill, if a registry is mounted and it is not already in. */
  const registerOne = (skill: YonBundledSkill): void => {
    const active = registry
    if (active === undefined || registrations.has(skill.name)) return
    registrations.set(skill.name, active.register({
      name: skill.name,
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      source: YON_SKILL_SOURCE,
      content: skill.content,
    }))
  }

  /** Withdraw one registration; the map drop is what keeps the disposer single-shot. */
  const unregisterOne = (name: string): void => {
    const dispose = registrations.get(name)
    if (dispose === undefined) return
    registrations.delete(name)
    dispose()
  }

  const service: YonSkillsService = {
    isLive: () => registry !== undefined,

    async list() {
      const mine = YON_BUNDLED_SKILLS.map(present)
      // No registry is a complete answer, not a failed one: this plugin's own
      // skills are known from its build, so they list either way.
      if (registry === undefined) return { skills: mine, complete: true }
      // A registered skill also appears in the catalog (that is the point), so
      // the filter below is what keeps it from being listed twice.
      const catalog = await registry.snapshot()
      const theirs = catalog.skills
        .filter(skill => skill.source !== YON_SKILL_SOURCE)
        .map(asView)
      return { skills: [...mine, ...theirs], complete: catalog.complete }
    },

    async read(name) {
      const skill = bundled.get(name)
      if (skill !== undefined) return detailOf(skill)
      if (registry === undefined) return undefined
      const definition = await registry.get(name)
      return definition === undefined ? undefined : { ...asView(definition), content: definition.content }
    },

    async setEnabled(name, enabled) {
      const skill = bundled.get(name)
      if (skill === undefined) {
        throw new SkillError('not-found', `no skill "${name}" is shipped by this plugin`)
      }
      await preferences.put(name, { enabled, updatedAt: Date.now() })
      if (enabled) registerOne(skill)
      else unregisterOne(name)
      return detailOf(skill)
    },
  }

  return {
    service,

    attach(active) {
      registry = active
      for (const skill of YON_BUNDLED_SKILLS) {
        if (isEnabled(skill.name)) registerOne(skill)
      }
      return () => {
        for (const name of [...registrations.keys()]) unregisterOne(name)
        registry = undefined
      }
    },

    dispose() {
      for (const name of [...registrations.keys()]) unregisterOne(name)
      registry = undefined
    },
  }
}
