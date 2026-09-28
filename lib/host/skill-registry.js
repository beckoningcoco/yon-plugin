import { YON_BUNDLED_SKILLS } from "./skill-catalog.generated.js";
/**
 * Origin label stamped on every skill this plugin registers.
 *
 * The panel filters on exactly this: it is what separates "skills this plugin
 * ships and may switch off" from "skills the operator already had", without
 * storing a second copy of that distinction anywhere.
 */
export const YON_SKILL_SOURCE = 'yon-panel';
/** Provider label the registry stamps on runtime registrations. */
const RUNTIME_PROVIDER = 'runtime';
/** A skill failure the caller can act on; the HTTP layer maps it to a status. */
export class SkillError extends Error {
    code;
    constructor(
    /** Machine code the API reports. */
    code, message) {
        super(message);
        this.code = code;
        this.name = 'SkillError';
    }
}
/**
 * Build the skill service over an opened switch domain.
 * @param domain - the opened `yon_skills` domain.
 * @returns the service, its attach hook, and its disposer.
 */
export function createYonSkillsService(domain) {
    const preferences = domain.table('skill_preferences');
    const bundled = new Map(YON_BUNDLED_SKILLS.map(skill => [skill.name, skill]));
    /** Live registrations, by skill name; presence is the real "is it on" answer. */
    const registrations = new Map();
    let registry;
    /**
     * Read one stored switch. A skill with no record counts as enabled, so a
     * fresh install ships its skills live instead of silently off.
     */
    const isEnabled = (name) => preferences.get(name)?.enabled ?? true;
    const present = (skill) => ({
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
    });
    const asView = (skill) => ({
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
    });
    const detailOf = (skill) => ({
        ...present(skill),
        content: skill.content,
    });
    /** Register one bundled skill, if a registry is mounted and it is not already in. */
    const registerOne = (skill) => {
        const active = registry;
        if (active === undefined || registrations.has(skill.name))
            return;
        registrations.set(skill.name, active.register({
            name: skill.name,
            description: skill.description,
            ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
            source: YON_SKILL_SOURCE,
            content: skill.content,
        }));
    };
    /** Withdraw one registration; the map drop is what keeps the disposer single-shot. */
    const unregisterOne = (name) => {
        const dispose = registrations.get(name);
        if (dispose === undefined)
            return;
        registrations.delete(name);
        dispose();
    };
    const service = {
        isLive: () => registry !== undefined,
        async list() {
            const mine = YON_BUNDLED_SKILLS.map(present);
            // No registry is a complete answer, not a failed one: this plugin's own
            // skills are known from its build, so they list either way.
            if (registry === undefined)
                return { skills: mine, complete: true };
            // A registered skill also appears in the catalog (that is the point), so
            // the filter below is what keeps it from being listed twice.
            const catalog = await registry.snapshot();
            const theirs = catalog.skills
                .filter(skill => skill.source !== YON_SKILL_SOURCE)
                .map(asView);
            return { skills: [...mine, ...theirs], complete: catalog.complete };
        },
        async read(name) {
            const skill = bundled.get(name);
            if (skill !== undefined)
                return detailOf(skill);
            if (registry === undefined)
                return undefined;
            const definition = await registry.get(name);
            return definition === undefined ? undefined : { ...asView(definition), content: definition.content };
        },
        async setEnabled(name, enabled) {
            const skill = bundled.get(name);
            if (skill === undefined) {
                throw new SkillError('not-found', `no skill "${name}" is shipped by this plugin`);
            }
            await preferences.put(name, { enabled, updatedAt: Date.now() });
            if (enabled)
                registerOne(skill);
            else
                unregisterOne(name);
            return detailOf(skill);
        },
    };
    return {
        service,
        attach(active) {
            registry = active;
            for (const skill of YON_BUNDLED_SKILLS) {
                if (isEnabled(skill.name))
                    registerOne(skill);
            }
            return () => {
                for (const name of [...registrations.keys()])
                    unregisterOne(name);
                registry = undefined;
            };
        },
        dispose() {
            for (const name of [...registrations.keys()])
                unregisterOne(name);
            registry = undefined;
        },
    };
}
