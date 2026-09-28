/**
 * Yon panel, browser half: one action at the sidebar foot, directly above
 * the settings row — the trigger plus the panel chrome — that declares the
 * `yon.panel.item` seat every feature package contributes its buttons to. This
 * plugin owns the surface and its open state only; what a button does belongs
 * to the package that adds it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type YonPanelKey } from './locales.ts';
export type { YonPanelItemOwnerProps, YonPanelRootFace, YonPanelSnapshot } from './slots.ts';
export type { YonPanelKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The Yon panel's copy. */
        yonPanel: YonPanelKey;
    }
}
/** Required services: the slot registry and this plugin's own copy. */
export declare const inject: string[];
/**
 * Client plugin body: the sidebar footer-action entry with its declared button
 * seat.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
