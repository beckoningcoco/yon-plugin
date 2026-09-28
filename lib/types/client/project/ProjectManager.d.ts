import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProjectApi } from './api.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface ProjectManagerProps extends ProjectApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the project surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog, plus its create dialog and its removal confirmation.
 */
export declare function ProjectManager({ t, onClose, ...api }: ProjectManagerProps): import("react").JSX.Element;
