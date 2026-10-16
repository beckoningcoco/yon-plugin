import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ArthasItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's live
 * open state and this entry's name, and the inject face carries the debugger
 * operations.
 */
export type ArthasItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<ArthasItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the debugger surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function ArthasItem({ t, label, pushOverlay, ...api }: ArthasItemProps): import("react").JSX.Element;
