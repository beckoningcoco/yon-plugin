import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { NccApiApi } from './api.ts';
/** 组合后的 props。 */
export type NccApiManagerProps = {
    t: TranslateNS<'yonPanel'>;
    onClose: () => void;
} & NccApiApi;
/**
 * Render the surface.
 * @param props - the translate function, the close gesture and the API face.
 * @returns the dialog.
 */
export declare function NccApiManager({ t, onClose, ...api }: NccApiManagerProps): import("react").JSX.Element;
