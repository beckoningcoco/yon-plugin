/**
 * Yon panel, browser half: one action at the sidebar foot, directly above
 * the settings row — the trigger plus the panel chrome — that declares the
 * `yon.panel.item` seat every feature package contributes its buttons to. This
 * plugin owns the surface and its open state only; what a button does belongs
 * to the package that adds it.
 *
 * Nine buttons ship here: project management, the skills this plugin
 * contributes, the operator's database connections, the knowledge base, the
 * digestion ledger, the installation directories, the iteration ledger, the
 * debug browser, and the requirement ledger.
 * None of them is a second
 * kind of seat — all nine take the same one, which is the point of the seat
 * existing. Each declares its own
 * `label`, so the panel names its rows from the seat rather than from what the
 * entries happen to draw. Two of them also borrow an operation from a sibling —
 * the datasource entry and the requirement entry both offer the project list
 * through the project API itself, so every surface names the same projects by
 * the same rule.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: ui-sidebar declares the `sidebar.footer.action` seat.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createYonPanelStore } from './panel-store.ts'
import { createYonPanelItemRows } from './item-rows.ts'
import { createBrowserApi } from './browser/api.ts'
import { createDataSourceApi } from './datasource/api.ts'
import { createDigestApi } from './digest/api.ts'
import { createHomeApi } from './home/api.ts'
import { createIterationApi } from './iteration/api.ts'
import { createProjectApi } from './project/api.ts'
import { createRequirementApi } from './requirement/api.ts'
import { createSkillApi } from './skill/api.ts'
import { createWikiApi } from './wiki/api.ts'
import { BrowserItem } from './BrowserItem.tsx'
import { DataSourceItem } from './DataSourceItem.tsx'
import { DigestItem } from './DigestItem.tsx'
import { HomeItem } from './HomeItem.tsx'
import { IterationItem } from './IterationItem.tsx'
import { ProjectItem } from './ProjectItem.tsx'
import { RequirementItem } from './RequirementItem.tsx'
import { SkillItem } from './SkillItem.tsx'
import { WikiItem } from './WikiItem.tsx'
import { YonPanelRoot } from './YonPanelRoot.tsx'
import { en, zh, type YonPanelKey } from './locales.ts'

export type { YonPanelItemOwnerProps, YonPanelRootFace, YonPanelSnapshot } from './slots.ts'
export type { DataSourceItemFace, ProjectItemFace, SkillItemFace, WikiItemFace } from './slots.ts'
export type { BrowserItemFace, DigestItemFace, HomeItemFace, IterationItemFace } from './slots.ts'
export type { RequirementItemFace } from './slots.ts'
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
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yon-panel: dictionaries')

  const panel = createYonPanelStore()
  // The panel's row list — which entries it hosts and what each is called. Built
  // here, not inside a component, because it is a projection of the seat rather
  // than of any one entry's render; the panel reads it as a hook source and each
  // entry receives its own name through the owner share below.
  const itemRows = createYonPanelItemRows(ctx)
  ctx.effect(() => () => { itemRows.dispose() }, 'yon-panel: item rows')
  // One API client per apply: components receive its operations through the
  // entry's inject face below, so no component builds a URL or fetches.
  const projectApi = createProjectApi()
  const skillApi = createSkillApi()
  const dataSourceApi = createDataSourceApi()
  const wikiApi = createWikiApi()
  const digestApi = createDigestApi()
  const homeApi = createHomeApi()
  const iterationApi = createIterationApi()
  const browserApi = createBrowserApi()
  const requirementApi = createRequirementApi()

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
      hooks: { panel, items: itemRows },
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
    // What the panel calls this button. The name is the seat's own field, so the
    // panel can name every entry it hosts without rendering one first — and a
    // contributor's entry arrives labelled without that package holding any of
    // this dictionary. A thunk, because it is translated: the panel re-reads it
    // when the language changes, instead of keeping the name it was built under.
    label: () => t('item.project'),
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
    label: () => t('item.skills'),
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
    label: () => t('item.datasource'),
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
    label: () => t('item.wiki'),
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
    label: () => t('item.digest'),
    inject: () => ({ ...digestApi, pushOverlay: () => panel.pushOverlay() }),
  }, DigestItem))

  // The installation directories, sixth. This is the one cell whose value is not
  // in the panel at all: registering a Home here is what lets the model look up
  // the installation itself instead of asking for its path in every new
  // conversation. The surface is also where the answer is checked — a probe says
  // whether the path really is an installation before anything reads from it.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'home',
    order: 60,
    locale: NS,
    label: () => t('item.home'),
    inject: () => ({ ...homeApi, pushOverlay: () => panel.pushOverlay() }),
  }, HomeItem))

  // The iteration ledger, seventh — the second cell that reports on the model's own
  // work, and the only one the model writes to. It is here rather than in the
  // transcript because a shortcoming noticed mid-session and forgotten at its end
  // is a shortcoming nobody can act on; the model appends, the operator reads and
  // decides, and this surface is where the deciding happens.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'iteration',
    order: 70,
    locale: NS,
    label: () => t('item.iteration'),
    inject: () => ({ ...iterationApi, pushOverlay: () => panel.pushOverlay() }),
  }, IterationItem))

  // The debug browser, eighth, and the only cell in this panel that starts a process.
  //
  // It is here because the alternative is a shell command someone has to remember: the
  // front-end automation line needs a browser on a debug port with its own user-data
  // directory, and this surface is where that browser is picked, remembered and watched.
  // Its stop button is the only thing in this panel that ends something on the machine,
  // and it only ever ends an instance whose ledger row is on this screen.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'browser',
    order: 80,
    locale: NS,
    label: () => t('item.browser'),
    inject: () => ({ ...browserApi, pushOverlay: () => panel.pushOverlay() }),
  }, BrowserItem))

  // The requirement ledger, ninth — the second cell the model writes to, and the first one
  // whose subject is the operator's own work rather than this plugin's.
  //
  // It borrows the project list from the project API, as the datasource cell does: an entry
  // belongs to a project, and the picker has to offer exactly the projects the project
  // surface offers.
  //
  // Its write verbs are the operator's. Archive and delete have no tool at all — a model
  // that could quietly retire a requirement would be deciding what the operator still wants.
  ctx.slots.inject('yon.panel.item', () => ctx.slots.register({
    name: 'yon.panel.item',
    id: 'requirement',
    order: 90,
    locale: NS,
    label: () => t('item.requirement'),
    inject: () => ({
      ...requirementApi,
      listProjects: projectApi.listProjects,
      pushOverlay: () => panel.pushOverlay(),
    }),
  }, RequirementItem))
}
