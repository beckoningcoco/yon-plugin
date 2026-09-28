import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SkillApi } from './api.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface SkillManagerProps extends SkillApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the skill surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export declare function SkillManager({ t, onClose, ...api }: SkillManagerProps): import("react").JSX.Element;
