/** Slot contract this package owns: the button seat inside the Yon panel. */

// Type-only: ui-sidebar's SlotMap merge — the `sidebar.footer.action` seat this
// entry occupies, rendered at the sidebar foot directly above the settings row.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { BrowserApi } from './browser/api.ts'
import type { RequirementApi } from './requirement/api.ts'
import type { DataSourceApi } from './datasource/api.ts'
import type { DigestApi } from './digest/api.ts'
import type { HomeApi } from './home/api.ts'
import type { IterationApi } from './iteration/api.ts'
import type { MemoryApi } from './memory/api.ts'
import type { ProjectApi } from './project/api.ts'
import type { SkillApi } from './skill/api.ts'
import type { WikiApi } from './wiki/api.ts'

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
  pushOverlay(): () => void
}

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
  pushOverlay(): () => void
}

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
  pushOverlay(): () => void
}

/**
 * Data face the panel's iteration-ledger entry receives: the ledger API plus the
 * same panel-level gesture.
 *
 * It borrows nothing, like the wiki and digest entries: the ledger is a file this
 * plugin owns, and it knows nothing of projects, vaults or installations.
 */
export type IterationItemFace = IterationApi & {
  /**
   * Announce a layer standing above the panel (the ledger surface).
   * @returns the release for that layer.
   */
  pushOverlay(): () => void
}

/**
 * Data face the panel's browser entry receives: the browser API plus the same
 * panel-level gesture.
 *
 * It borrows nothing, like the wiki and ledger entries. The one operation it has that
 * no sibling does is the launch itself — the only call in this panel that starts a
 * process on the operator's machine — which is why that row's stop is a two-step
 * confirmation and why nothing else on this list may end it.
 */
export type BrowserItemFace = BrowserApi & {
  /**
   * Announce a layer standing above the panel (the browser surface).
   * @returns the release for that layer.
   */
  pushOverlay(): () => void
}

/**
 * Data face the panel's requirement entry receives: the ledger API, the project list its
 * project picker needs, and the same panel-level gesture.
 *
 * The project list arrives as the project API's own operation, exactly as it does for the
 * datasource entry, because binding an entry to a project is one of the operations this
 * surface performs — and a second implementation would be a second answer to "which
 * projects belong in a picker" (whether archived ones are in or out).
 *
 * This is the only entry whose subject the model also writes. Nothing about that changes
 * the face — the write verbs here are the operator's (`remove` has no tool at all) — but
 * it is why the surface opens on a ledger rather than on a form.
 */
export type RequirementItemFace = RequirementApi & {
  /**
   * The projects an entry may belong to.
   * @param includeArchived - keep soft-deleted projects in the answer.
   * @returns the summaries.
   */
  listProjects: ProjectApi['listProjects']
  /**
   * Announce a layer standing above the panel (the requirement surface).
   * @returns the release for that layer.
   */
  pushOverlay(): () => void
}

/**
 * Data face the panel's project-memory entry receives: the memory API, the project list
 * its filter needs, and the same panel-level gesture.
 *
 * The project list arrives as the project API's own operation, exactly as it does for the
 * datasource and requirement entries: the filter has to offer exactly the projects those
 * surfaces offer, archived ones excluded by the same rule.
 *
 * This is the one face in the panel with **no create and no update**. The model writes
 * memories through its own tools (`host/memory-tools.ts`); a person looking at this screen
 * can read one and delete one, and that is the whole of it. A form for typing a memory in
 * would be a form for inventing one, and every memory in the bank is injected into a later
 * session as something that was found out.
 */
export type MemoryItemFace = MemoryApi & {
  /**
   * The projects the filter may narrow to.
   * @param includeArchived - keep soft-deleted projects in the answer.
   * @returns the summaries.
   */
  listProjects: ProjectApi['listProjects']
  /**
   * Announce a layer standing above the panel (the memory surface).
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

/** Owner share of one panel button seat: the panel's live open state and name. */
export interface YonPanelItemOwnerProps {
  /** Whether the panel hosting this button is open (true whenever it renders). */
  readonly open: boolean
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
  readonly label: string
}

/** One entry in the panel's row projection: its registration id and its name. */
export interface YonPanelItemRow {
  /** The registration id of the entry this row addresses. */
  readonly id: string
  /** The entry's resolved display name; see {@link YonPanelItemOwnerProps.label}. */
  readonly label: string
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
    /** The panel's rows, in registration order: which entries it hosts, and their names. */
    items: PanelSource<readonly YonPanelItemRow[]>
  }
  /** Flip the panel open/closed (the trigger gesture). */
  onToggle(): void
  /** Set the panel open state (outside-pointer and Escape dismissal). */
  onSetOpen(open: boolean): void
}
