/** The Yon sidebar-foot action and the panel it opens above itself. */
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { YonPanelRootFace } from './slots.ts';
/** Composed props of the sidebar footer-action entry: all four shares, all derived. */
export type YonPanelRootProps = PropsRuntime<'sidebar.footer.action'> & PropsRenderSlots<'yon.panel.item'> & InjectFace<YonPanelRootFace> & PropsLocale<'yonPanel'>;
/**
 * Render the trigger and, while open, its surface above the trigger. The panel
 * hangs upward because the action sits at the sidebar foot, with the settings
 * row below it; the sidebar clips overflow, so the panel is a fixed-position
 * element placed from the trigger's measured rect rather than from document
 * flow. The trigger keeps one icon cell in both column widths.
 * @param props - composed slot props.
 * @returns the trigger plus the open panel.
 */
export declare function YonPanelRoot({ usePanel, useItems, onToggle, onSetOpen, renderSlot, t, }: YonPanelRootProps): import("react").JSX.Element;
