import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FrontendApi } from './api.ts';
/** Props of the surface: the injected API and the close verb. */
export interface FrontendManagerProps extends FrontendApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the front-end source surface.
 * @param props - injected API and close verb.
 * @returns the dialog.
 */
export declare function FrontendManager({ t, onClose, ...api }: FrontendManagerProps): import("react").JSX.Element;
/**
 * The entry's glyph: a source file with a code bracket.
 * @returns the decorative svg.
 */
export declare function CodeMark(): import("react").JSX.Element;
