import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { FrontendItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the
 * front-end source operations and the overlay announcement.
 */
export type FrontendItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<FrontendItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the source surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function FrontendItem({ t, label, pushOverlay, ...api }: FrontendItemProps): import("react").JSX.Element;
