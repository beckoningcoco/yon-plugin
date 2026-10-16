import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type ArthasClientApi } from './api.ts';
/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface ArthasManagerProps extends ArthasClientApi {
    readonly t: TranslateNS<'yonPanel'>;
    onClose(): void;
}
/**
 * Render the debugger surface.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export declare function ArthasManager({ t, onClose, panel, detail, attach, stop, replayPanel, replayRun, replayDiff, replayPrepare, }: ArthasManagerProps): import("react").JSX.Element;
