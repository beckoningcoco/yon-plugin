import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ProjectItemFace } from './slots.ts';
/**
 * Composed props of this panel button seat: the owner share carries the panel's
 * live open state, and the inject face carries the project operations plus the
 * overlay announcement.
 */
export type ProjectItemProps = PropsRuntime<'yon.panel.item'> & InjectFace<ProjectItemFace> & PropsLocale<'yonPanel'>;
/**
 * Render the entry cell and, while open, the project surface.
 * @param props - composed slot props.
 * @returns the cell, plus the dialog when it is showing.
 */
export declare function ProjectItem({ t, pushOverlay, ...api }: ProjectItemProps): import("react").JSX.Element;
