import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProjectItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state and this entry's name, and the inject face carries the project
 * operations plus the overlay announcement.
 */
export type ProjectItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<ProjectItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry row and, while open, the project surface.
 * @param props - composed slot props.
 * @returns the row, plus the dialog when it is showing.
 */
export declare function ProjectItem({ t, label, pushOverlay, ...api }: ProjectItemProps): import("react").JSX.Element;
