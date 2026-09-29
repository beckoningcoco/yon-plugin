/**
 * Yon panel, browser half: one action at the sidebar foot, directly above
 * the settings row — the trigger plus the panel chrome — that declares the
 * `yon.panel.item` seat every feature package contributes its buttons to. This
 * plugin owns the surface and its open state only; what a button does belongs
 * to the package that adds it.
 *
 * Three buttons ship here: project management, the skills this plugin
 * contributes, and the operator's database connections. None of them is a second
 * kind of seat — all three take the same one, which is the point of the seat
 * existing. The datasource entry is the one that also borrows an operation from
 * a sibling: its binding picker offers the project list through the project API
 * itself, so both surfaces name the same projects by the same rule.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: ui-sidebar declares the `sidebar.footer.action` seat.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createYonPanelStore } from './panel-store.ts'
import { createDataSourceApi } from './datasource/api.ts'
import { createDigestApi } from './digest/api.ts'
import { createProjectApi } from './project/api.ts'
import { createSkillApi } from './skill/api.ts'
import { createWikiApi } from './wiki/api.ts'
import { DataSourceItem } from './DataSourceItem.tsx'
import { DigestItem } from './DigestItem.tsx'
import { ProjectItem } from './ProjectItem.tsx'
import { SkillItem } from './SkillItem.tsx'
import { WikiItem } from './WikiItem.tsx'
import { YonPanelRoot } from './YonPanelRoot.tsx'
import { en, zh, type YonPanelKey } from './locales.ts'

export type { YonPanelItemOwnerProps, YonPanelRootFace, YonPanelSnapshot } from './slots.ts'
export type { DataSourceItemFace, ProjectItemFace, SkillItemFace, WikiItemFace } from './slots.ts'
export type { DigestItemFace } from './slots.ts'
export type { YonPanelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Yon panel's copy. */
    yonPanel: YonPanelKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'yonPanel'

/** Required services: the slot registry and this plugin's own copy. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: the sidebar footer-action entry with its declared button
 * seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yon-panel: dictionaries')

  const panel = createYonPanelStore()
  // One API client per apply: components receive its operations through the
  // entry's inject face below, so no component builds a URL or fetches.
  const projectApi = createProjectApi()
  const skillApi = createSkillApi()
  const dataSourceApi = createDataSourceApi()
  const wikiApi = createWikiApi()
  const digestApi = createDigestApi()

  // A fresh list id adds this action beside the shipped footer actions, above
  // the settings row; the children table declares (and thereby authorizes) the
  // panel's own button seat.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'yon-btn',
    order: 10,
    locale: NS,
    children: { 'yon.panel.item': { kind: 'list', scope: 'root' } },
    inject: () => ({
      hooks: { panel },
      onToggle: () => { panel.toggle() },
      onSetOpen: (open: boolean) => {
        if (open) panel.open()
        else panel.close()
      },
    }),
  }, YonPanelRoot))

  // The panel's own entry — the Project management cell. The seat is declared by
  // the registration above, so this contribution lands as soon as that
  // declaration exists: it takes the same `ctx.slots.inject` path any other
  // package takes to add a button.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'project',
    order: 10,
    locale: NS,
    // The entry gets the project operations plus the one panel-level gesture its
    // surface needs: announcing itself as a layer above the panel, so the panel
    // stops answering Escape and outside clicks while it is up.
    inject: () => ({ ...projectApi, pushOverlay: () => panel.pushOverlay() }),
  }, ProjectItem))

  // The skill cell, beside it: same seat, same contract, its own surface. The
  // shell addresses neither entry by name, so adding a button is exactly this —
  // one more registration against the same seat.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'skills',
    order: 20,
    locale: NS,
    inject: () => ({ ...skillApi, pushOverlay: () => panel.pushOverlay() }),
  }, SkillItem))

  // The datasource cell, third. Its face carries the project list as well,
  // because binding a connection to a project is one of the operations this
  // surface performs — and reusing the project API's own call is what keeps the
  // picker from inventing a second, subtly different project list.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'datasources',
    order: 30,
    locale: NS,
    inject: () => ({
      ...dataSourceApi,
      listProjects: projectApi.listProjects,
      pushOverlay: () => panel.pushOverlay(),
    }),
  }, DataSourceItem))

  // The knowledge base cell, fourth. It borrows nothing from its siblings: the
  // vaults are its own list, and the surface reports on them rather than editing
  // them, so a machine path is never typed into a browser field.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'wiki',
    order: 40,
    locale: NS,
    inject: () => ({ ...wikiApi, pushOverlay: () => panel.pushOverlay() }),
  }, WikiItem))

  // The digestion ledger, fifth — and the only cell that reports on the model's
  // own work rather than on the operator's material. A verdict that lives only
  // inside the session that produced it cannot be acted on later; this is where
  // it goes to be seen.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'digest',
    order: 50,
    locale: NS,
    inject: () => ({ ...digestApi, pushOverlay: () => panel.pushOverlay() }),
  }, DigestItem))
}
