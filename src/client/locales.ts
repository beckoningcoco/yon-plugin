/** `yonPanel` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger.label': 'yon_btn',
  'panel.title': 'yon 按钮面板',
  'panel.close': '关闭面板',
  'item.project': '项目管理面板',
} satisfies Record<string, string>

/** The yonPanel namespace key union. */
export type YonPanelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger.label': 'yon_btn',
  'panel.title': 'yon button panel',
  'panel.close': 'Close panel',
  'item.project': 'Project management panel',
} satisfies Record<YonPanelKey, string>
