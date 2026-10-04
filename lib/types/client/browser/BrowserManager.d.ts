import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type BrowserApi } from './api.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface BrowserManagerProps extends BrowserApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the browser surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export declare function BrowserManager({ t, onClose, ...api }: BrowserManagerProps): import("react").JSX.Element;
