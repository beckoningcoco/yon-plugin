/** Slot contract this package owns: the button seat inside the Yon panel. */

// Type-only: ui-sidebar's SlotMap merge — the `sidebar.footer.action` seat this
// entry occupies, rendered at the sidebar foot directly above the settings row.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DataSourceApi } from './datasource/api.ts'
import type { ProjectApi } from './project/api.ts'
import type { SkillApi } from './skill/api.ts'

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
  pushOverlay(): () => void
}

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
  pushOverlay(): () => void
}

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
  listProjects: ProjectApi['listProjects']
  /**
   * Announce a layer standing above the panel (the datasource surface).
   * @returns the release for that layer.
   */
  pushOverlay(): () => void
}

/**
 * Bare observable source: the getSnapshot/subscribe pair the DSH renderer binds
 * into a `use<Name>` selector hook. Declared here rather than imported, so this
 * plugin carries no compile-time dependency on one harness release's type names.
 */
export interface PanelSource<T> {
  /** Read the cached snapshot reference (stable between changes). */
  getSnapshot(): T
  /** Subscribe to snapshot invalidation. */
  subscribe(listener: () => void): () => void
}

/** Panel state shared with every contributed button. */
export interface YonPanelSnapshot {
  /** Whether the panel surface is currently showing. */
  readonly open: boolean
  /**
   * How many layers stand above the panel right now. The panel keeps its own
   * dismissals (Escape, outside click) while this is above zero, so one Escape
   * closes the top layer instead of the whole stack.
   */
  readonly overlayDepth: number
}

/** Owner share of one panel button seat: the panel's live open state. */
export interface YonPanelItemOwnerProps {
  /** Whether the panel hosting this button is open (true whenever it renders). */
  readonly open: boolean
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * One button inside the Yon panel. A list seat: each feature package
     * claims a fresh `id` and orders itself with `order`, and the panel renders
     * every live entry without addressing any specific one.
     */
    'yon.panel.item': {
      kind: 'list'
      scope: 'root'
      owner: YonPanelItemOwnerProps
    }
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
    panel: PanelSource<YonPanelSnapshot>
  }
  /** Flip the panel open/closed (the trigger gesture). */
  onToggle(): void
  /** Set the panel open state (outside-pointer and Escape dismissal). */
  onSetOpen(open: boolean): void
}
