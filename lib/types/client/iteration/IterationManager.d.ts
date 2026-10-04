import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { IterationApi } from './api.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface IterationManagerProps extends IterationApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the ledger dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export declare function IterationManager({ list, create, update, remove, onClose, t }: IterationManagerProps): import("react").JSX.Element;
