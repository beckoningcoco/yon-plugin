import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { DigestApi } from './api.ts';
/** Composed props of the ledger surface. */
export interface DigestManagerProps extends DigestApi, PropsLocale<'yonPanel'> {
    /** Close the dialog. */
    onClose(): void;
}
/**
 * Render the ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export declare function DigestManager({ summary, onClose, t }: DigestManagerProps): import("react").JSX.Element;
