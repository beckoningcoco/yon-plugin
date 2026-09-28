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
import { type Domain } from '@deepseek-ai/dsh-storage-domain';
/** Domain (and therefore backend storage unit) name; `^[a-z][a-z0-9_]*$`. */
export declare const SKILL_DOMAIN_NAME = "yon_skills";
/** Current stored format version. */
export declare const SKILL_DOMAIN_VERSION = 1;
/** One skill's switch state. */
declare const skillPreferenceSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
/** The stored switch row. */
export type SkillPreferenceRow = z.infer<typeof skillPreferenceSchema>;
/** The declared domain, opened by the host plugin's `apply`. */
export declare const YON_SKILL_DOMAIN: {
    name: string;
    version: number;
    layout: string;
    tables: {
        skill_preferences: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<string, {
            enabled: boolean;
            updatedAt: number;
        }>;
    };
};
/** An opened domain for {@link YON_SKILL_DOMAIN}. */
export type YonSkillDomain = Domain<typeof YON_SKILL_DOMAIN>;
export {};
