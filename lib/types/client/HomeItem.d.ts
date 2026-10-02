import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { HomeItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the Home
 * operations and the overlay announcement.
 */
export type HomeItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<HomeItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the installation surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function HomeItem({ t, label, pushOverlay, ...api }: HomeItemProps): import("react").JSX.Element;
