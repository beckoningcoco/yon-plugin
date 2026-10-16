import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type ReplayApi } from './api.ts';
/** Props of tab B: the replay operations and the copy seat. */
export interface ReplayViewProps extends ReplayApi {
    readonly t: TranslateNS<'yonPanel'>;
}
/**
 * Render the replay surface.
 * @param props - the replay API and the copy seat.
 * @returns the tab body.
 */
export declare function ReplayView({ t, replayPanel, replayRun, replayDiff, replayPrepare }: ReplayViewProps): import("react").JSX.Element;
