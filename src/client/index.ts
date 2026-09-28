/**
 * yon_btn panel, browser half: one action at the sidebar foot, directly above
 * the settings row — the trigger plus the panel chrome — that declares the
 * `yon.panel.item` seat every feature package contributes its buttons to. This
 * plugin owns the surface and its open state only; what a button does belongs
 * to the package that adds it.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: ui-sidebar declares the `sidebar.footer.action` seat.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the renderer-owned slots service.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createYonPanelStore } from './panel-store.ts'
import { createProjectApi } from './project/api.ts'
import { ProjectItem } from './ProjectItem.tsx'
import { YonPanelRoot } from './YonPanelRoot.tsx'
import { en, zh, type YonPanelKey } from './locales.ts'

export type { YonPanelItemOwnerProps, YonPanelRootFace, YonPanelSnapshot } from './slots.ts'
export type { YonPanelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The yon_btn panel's copy. */
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
}
