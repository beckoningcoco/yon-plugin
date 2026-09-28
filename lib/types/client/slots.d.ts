/** Slot contract this package owns: the button seat inside the yon_btn panel. */
import type { ProjectApi } from './project/api.ts';
/**
 * Data face the panel's built-in entry receives: the project API, closed over the
 * apply world. The component calls these operations; it never builds a URL, never
 * fetches, and never subscribes.
 */
export type ProjectItemFace = ProjectApi;
/**
 * Bare observable source: the getSnapshot/subscribe pair the DSH renderer binds
 * into a \`use<Name>\` selector hook. Declared here rather than imported, so this
 * plugin carries no compile-time dependency on one harness release's type names.
 */
export interface PanelSource<T> {
    /** Read the cached snapshot reference (stable between changes). */
    getSnapshot(): T;
    /** Subscribe to snapshot invalidation. */
    subscribe(listener: () => void): () => void;
}
/** Panel state shared with every contributed button. */
export interface YonPanelSnapshot {
    /** Whether the panel surface is currently showing. */
    readonly open: boolean;
}
/** Owner share of one panel button seat: the panel's live open state. */
export interface YonPanelItemOwnerProps {
    /** Whether the panel hosting this button is open (true whenever it renders). */
    readonly open: boolean;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * One button inside the yon_btn panel. A list seat: each feature package
         * claims a fresh `id` and orders itself with `order`, and the panel renders
         * every live entry without addressing any specific one.
         */
        'yon.panel.item': {
            kind: 'list';
            scope: 'root';
            owner: YonPanelItemOwnerProps;
        };
    }
}
/**
 * Registrant face the panel shell projects to its component. The reserved
 * `hooks` compartment carries bare observables only — the renderer binds
 * `hooks.panel` to the component's `usePanel` selector hook.
 */
export interface YonPanelRootFace {
    hooks: {
        /** Live panel state. */
        panel: PanelSource<YonPanelSnapshot>;
    };
    /** Flip the panel open/closed (the trigger gesture). */
    onToggle(): void;
    /** Set the panel open state (outside-pointer and Escape dismissal). */
    onSetOpen(open: boolean): void;
}
