/** Slot contract this package owns: the button seat inside the Yon panel. */
import type { DataSourceApi } from './datasource/api.ts';
import type { DigestApi } from './digest/api.ts';
import type { HomeApi } from './home/api.ts';
import type { ProjectApi } from './project/api.ts';
import type { SkillApi } from './skill/api.ts';
import type { WikiApi } from './wiki/api.ts';
/**
 * Data face the panel's built-in entry receives: the project API, closed over the
 * apply world, plus the one panel-level gesture the entry needs. The component
 * calls these operations; it never builds a URL, never fetches, and never
 * subscribes.
 */
export type ProjectItemFace = ProjectApi & {
    /**
     * Announce a layer standing above the panel (the project surface). The panel's
     * own Escape and outside-click dismissals stand down while one is up.
     * @returns the release for that layer.
     */
    pushOverlay(): () => void;
};
/**
 * Data face the panel's skill entry receives: the skill API plus the same
 * panel-level gesture. Kept a separate face rather than merged into
 * {@link ProjectItemFace}, because a feature package must be able to receive
 * exactly the operations it uses.
 */
export type SkillItemFace = SkillApi & {
    /**
     * Announce a layer standing above the panel (the skill surface).
     * @returns the release for that layer.
     */
    pushOverlay(): () => void;
};
/**
 * Data face the panel's datasource entry receives: the datasource API, the
 * project list its binding picker needs, and the same panel-level gesture.
 *
 * The project list arrives as the project API's own operation rather than a
 * second implementation of the same call, so the picker offers exactly the
 * projects the project surface offers — archived ones excluded by the same rule,
 * with no second copy of that rule to keep in step.
 */
export type DataSourceItemFace = DataSourceApi & {
    /**
     * The projects a connection may be bound to.
     * @param includeArchived - keep soft-deleted projects in the answer.
     * @returns the summaries.
     */
    listProjects: ProjectApi['listProjects'];
    /**
     * Announce a layer standing above the panel (the datasource surface).
     * @returns the release for that layer.
     */
    pushOverlay(): () => void;
};
/**
 * Data face the panel's knowledge base entry receives: the wiki API plus the same
 * panel-level gesture.
 *
 * No sibling operation is borrowed here, unlike the datasource entry: a vault is
 * addressed by its own id, and the knowledge base knows nothing of projects.
 */
export type WikiItemFace = WikiApi & {
    /**
     * Announce a layer standing above the panel (the knowledge base surface).
     * @returns the release for that layer.
     */
    pushOverlay(): () => void;
};
/**
 * Data face the panel's digestion-ledger entry receives: the ledger API plus the
 * same panel-level gesture.
 *
 * It borrows nothing, like the wiki entry: the ledger is a file this plugin owns
 * and appends to itself, and it knows nothing of projects or vaults.
 */
export type DigestItemFace = DigestApi & {
    /**
     * Announce a layer standing above the panel (the ledger surface).
     * @returns the release for that layer.
     */
    pushOverlay(): () => void;
};
/**
 * Data face the panel's installation-directory entry receives: the Home API plus
 * the same panel-level gesture.
 *
 * It borrows nothing, like the wiki and ledger entries: a Home is addressed by its
 * own generated id, and nothing about it belongs to a project or a vault.
 */
export type HomeItemFace = HomeApi & {
    /**
     * Announce a layer standing above the panel (the Home surface).
     * @returns the release for that layer.
     */
    pushOverlay(): () => void;
};
/**
 * Bare observable source: the getSnapshot/subscribe pair the DSH renderer binds
 * into a `use<Name>` selector hook. Declared here rather than imported, so this
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
    /**
     * How many layers stand above the panel right now. The panel keeps its own
     * dismissals (Escape, outside click) while this is above zero, so one Escape
     * closes the top layer instead of the whole stack.
     */
    readonly overlayDepth: number;
}
/** Owner share of one panel button seat: the panel's live open state and name. */
export interface YonPanelItemOwnerProps {
    /** Whether the panel hosting this button is open (true whenever it renders). */
    readonly open: boolean;
    /**
     * What to call this entry, resolved by the panel from the entry's own
     * registration `label` — a string, or a thunk read per render so it follows the
     * active locale. Never empty: an entry that declares no label is named by its
     * registration id, so no button is anonymous.
     *
     * The shell supplies it rather than each entry reading its own dictionary key,
     * because the panel is the one place that knows every entry it hosts: it can
     * order, list, and name them without having rendered any of them, which is what
     * lets a foreign entry arrive labelled without that package knowing the panel's
     * copy at all.
     */
    readonly label: string;
}
/** One entry in the panel's row projection: its registration id and its name. */
export interface YonPanelItemRow {
    /** The registration id of the entry this row addresses. */
    readonly id: string;
    /** The entry's resolved display name; see {@link YonPanelItemOwnerProps.label}. */
    readonly label: string;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * One button inside the Yon panel. A list seat: each feature package
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
        /** The panel's rows, in registration order: which entries it hosts, and their names. */
        items: PanelSource<readonly YonPanelItemRow[]>;
    };
    /** Flip the panel open/closed (the trigger gesture). */
    onToggle(): void;
    /** Set the panel open state (outside-pointer and Escape dismissal). */
    onSetOpen(open: boolean): void;
}
