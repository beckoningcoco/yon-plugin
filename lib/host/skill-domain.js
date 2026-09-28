/**
 * The stored shape of this plugin's skill switches: one record per skill it
 * ships, keyed by the skill name.
 *
 * Only this plugin's own skills are ever written here. The operator's skills —
 * the ones already living in `~/.agents/skills`, in `~/.dsh/skills`, or in a
 * repository — are read through the registry and never touched by this domain,
 * so a switch stored here cannot shadow, move, or disturb one of them.
 *
 * A skill name is already `[a-z0-9-]`, which satisfies the per-record medium's
 * key grammar, so this table needs none of the key encoding the project field
 * keys require.
 */
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
/** Domain (and therefore backend storage unit) name; `^[a-z][a-z0-9_]*$`. */
export const SKILL_DOMAIN_NAME = 'yon_skills';
/** Current stored format version. */
export const SKILL_DOMAIN_VERSION = 1;
/** One skill's switch state. */
const skillPreferenceSchema = z.object({
    /** Whether the plugin registers this skill when it starts. */
    enabled: z.boolean(),
    updatedAt: z.number(),
});
/** The declared domain, opened by the host plugin's `apply`. */
export const YON_SKILL_DOMAIN = defineDomain({
    name: SKILL_DOMAIN_NAME,
    version: SKILL_DOMAIN_VERSION,
    // One small document per skill, so flipping one switch rewrites one record.
    layout: 'per-record',
    tables: {
        skill_preferences: domainTable(skillPreferenceSchema),
    },
});
