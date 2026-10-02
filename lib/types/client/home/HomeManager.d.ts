import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { HomeApi } from './api.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface HomeManagerProps extends HomeApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the installation surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export declare function HomeManager({ t, onClose, ...api }: HomeManagerProps): import("react").JSX.Element;
