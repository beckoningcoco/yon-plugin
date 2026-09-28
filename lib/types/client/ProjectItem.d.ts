/** The panel's built-in Project management entry: one icon cell, described on hover. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * Composed props of one panel button seat. The owner share carries the panel's
 * live open state; this entry is interactive chrome for the section it will
 * open, so it renders its own label instead of the panel's copy.
 */
export type ProjectItemProps = PropsRuntime<'yon.panel.item'> & PropsLocale<'yonPanel'>;
/**
 * Render the Project management entry: an icon cell whose full description
 * arrives on hover and as the accessible name, so the panel stays a compact
 * grid of glyphs while every entry stays identifiable.
 * @param props - composed slot props.
 * @returns the entry button.
 */
export declare function ProjectItem({ t }: ProjectItemProps): import("react").JSX.Element;
