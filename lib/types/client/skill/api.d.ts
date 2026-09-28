import type { SkillDetail, SkillListPayload } from '../../shared/types.ts';
/** The skill operations the UI drives. */
export interface SkillApi {
    /**
     * Every visible skill.
     * @returns the rows, plus whether every skill source could be read.
     */
    listSkills(): Promise<SkillListPayload>;
    /**
     * One skill with its instruction body.
     * @param name - skill identifier.
     * @returns the stored skill.
     */
    getSkill(name: string): Promise<SkillDetail>;
    /**
     * Turn one of this plugin's skills on or off.
     * @param name - skill identifier; must be one this plugin ships.
     * @param enabled - target state.
     * @returns the skill as it now stands.
     */
    setSkillEnabled(name: string, enabled: boolean): Promise<SkillDetail>;
}
/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export declare function createSkillApi(): SkillApi;
