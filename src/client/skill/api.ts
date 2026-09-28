/**
 * The skill calls the UI drives: thin calls against `/yon/api/skills`.
 *
 * The panel needs exactly three things from this module — the merged list (this
 * plugin's skills first, the operator's after), one skill's body, and the
 * switch. The switch only ever accepts a name this plugin ships: the host
 * answers 404 for anything else, so the panel cannot use it to disturb a skill
 * living in the operator's own directories.
 */
import { request } from '../request.ts'
import type {
  SetSkillEnabledInput, SkillDetail, SkillListPayload,
} from '../../shared/types.ts'

/** The skill operations the UI drives. */
export interface SkillApi {
  /**
   * Every visible skill.
   * @returns the rows, plus whether every skill source could be read.
   */
  listSkills(): Promise<SkillListPayload>

  /**
   * One skill with its instruction body.
   * @param name - skill identifier.
   * @returns the stored skill.
   */
  getSkill(name: string): Promise<SkillDetail>

  /**
   * Turn one of this plugin's skills on or off.
   * @param name - skill identifier; must be one this plugin ships.
   * @param enabled - target state.
   * @returns the skill as it now stands.
   */
  setSkillEnabled(name: string, enabled: boolean): Promise<SkillDetail>
}

/**
 * Build the API client.
 * @returns the operations the UI calls.
 */
export function createSkillApi(): SkillApi {
  return {
    async listSkills() {
      return await request<SkillListPayload>('/skills')
    },

    async getSkill(name) {
      const answer = await request<{ skill: SkillDetail }>(
        `/skills/${encodeURIComponent(name)}`,
      )
      return answer.skill
    },

    async setSkillEnabled(name, enabled) {
      const body: SetSkillEnabledInput = { enabled }
      const answer = await request<{ skill: SkillDetail }>(
        `/skills/${encodeURIComponent(name)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      )
      return answer.skill
    },
  }
}
