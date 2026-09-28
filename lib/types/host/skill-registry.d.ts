import type { SkillDetail, SkillListPayload } from '../shared/types.ts';
import type { YonSkillDomain } from './skill-domain.ts';
/** One runtime skill contribution, as the registry's `register()` consumes it. */
export interface YonSkillRegistration {
    /** Kebab-case identifier; the registry rejects anything else. */
    readonly name: string;
    /** Required and non-empty; the registry rejects an empty one. */
    readonly description: string;
    /** Optional extra routing guidance. */
    readonly whenToUse?: string;
    /** Origin label, prompt-visible metadata rather than precedence. */
    readonly source: string;
    /** The Markdown instruction body. */
    readonly content: string;
}
/** One skill the registry reports, invocation-neutral. */
export interface YonSkillSummary {
    readonly name: string;
    readonly description: string;
    readonly whenToUse?: string;
    readonly source: string;
    readonly provider: string;
    readonly invocation: {
        readonly modelInvocable: boolean;
        readonly userInvocable: boolean;
    };
}
/** One loaded skill, body included. */
export interface YonSkillDefinition extends YonSkillSummary {
    readonly content: string;
}
/**
 * One catalog read: the winning summaries plus whether discovery completed.
 * `complete: false` means some source could not be read and the list is partial.
 */
export interface YonSkillCatalog {
    readonly skills: readonly YonSkillSummary[];
    readonly complete: boolean;
}
/** Lookup context; `cwd` selects project roots, `signal` cancels discovery. */
export interface YonSkillLookup {
    readonly cwd?: string;
    readonly signal?: AbortSignal;
}
/** The slice of the skill registry this plugin uses. */
export interface YonSkillRegistry {
    /**
     * Register a runtime skill for this plugin's lifetime.
     * @param skill - the contribution.
     * @returns the disposer that withdraws it; inert if the name was already taken.
     */
    register(skill: YonSkillRegistration): () => void;
    /**
     * Read the merged catalog.
     * @param options - lookup context.
     * @returns the winning skills and whether discovery completed.
     */
    snapshot(options?: YonSkillLookup): Promise<YonSkillCatalog>;
    /**
     * Load one skill's body.
     * @param name - skill identifier.
     * @param options - lookup context.
     * @returns the skill, or undefined when nothing by that name is visible.
     */
    get(name: string, options?: YonSkillLookup): Promise<YonSkillDefinition | undefined>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The skill registry, mounted by the harness's own skill runtime. */
        skills: YonSkillRegistry;
    }
}
/**
 * Origin label stamped on every skill this plugin registers.
 *
 * The panel filters on exactly this: it is what separates "skills this plugin
 * ships and may switch off" from "skills the operator already had", without
 * storing a second copy of that distinction anywhere.
 */
export declare const YON_SKILL_SOURCE = "yon-panel";
/** A skill failure the caller can act on; the HTTP layer maps it to a status. */
export declare class SkillError extends Error {
    /** Machine code the API reports. */
    readonly code: 'not-found' | 'invalid-input';
    constructor(
    /** Machine code the API reports. */
    code: 'not-found' | 'invalid-input', message: string);
}
/** The panel-facing surface, reachable in-process as `ctx.yonSkills`. */
export interface YonSkillsService {
    /**
     * Every visible skill: this plugin's own first, then the operator's.
     * @returns the list rows plus whether every source could be read. Read
     *   without a `cwd`, so project-local skill directories are out of scope —
     *   this panel manages global skills.
     */
    list(): Promise<SkillListPayload>;
    /**
     * One skill with its instruction body.
     * @param name - skill identifier.
     * @returns the detail, or undefined when no such skill is visible.
     */
    read(name: string): Promise<SkillDetail | undefined>;
    /**
     * Turn one of this plugin's skills on or off, durably.
     * @param name - skill identifier; must be one this plugin ships.
     * @param enabled - target state.
     * @returns the skill as it now stands.
     */
    setEnabled(name: string, enabled: boolean): Promise<SkillDetail>;
    /**
     * Whether the skill registry is mounted at all. A deployment without it (a
     * minimal profile) still shows the list; nothing can be switched on there.
     * @returns whether registrations are live.
     */
    isLive(): boolean;
}
/** The service plus the plugin-owned registration lifecycle. */
export interface YonSkillsHandle {
    readonly service: YonSkillsService;
    /**
     * Start contributing skills through a mounted registry. Called once the
     * `skills` service appears — it is deliberately absent from this plugin's
     * `inject` array, because a missing service listed there would leave the
     * whole plugin pending and take the profile down.
     * @param registry - the mounted skill registry.
     * @returns the disposer withdrawing every registration it made.
     */
    attach(registry: YonSkillRegistry): () => void;
    /** Withdraw every registration and drop listeners. */
    dispose(): void;
}
/**
 * Build the skill service over an opened switch domain.
 * @param domain - the opened `yon_skills` domain.
 * @returns the service, its attach hook, and its disposer.
 */
export declare function createYonSkillsService(domain: YonSkillDomain): YonSkillsHandle;
