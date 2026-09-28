/** `yonPanel` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger.label': 'yon_btn',
  'panel.title': 'yon 按钮面板',
  'panel.close': '关闭面板',
  'item.project': '项目管理面板',
  'project.new': '新建项目',
  'project.name': '名称',
  'project.code': '编码',
  'project.status': '状态',
  'project.status.active': '进行中',
  'project.status.paused': '已暂停',
  'project.status.done': '已完成',
  'project.fields': '字段',
  'project.fieldKey': '字段名',
  'project.fieldValue': '值',
  'project.addField': '新增字段',
  'project.removeField': '删除该字段',
  'project.archive': '归档',
  'project.restore': '恢复',
  'project.remove': '彻底删除',
  'project.showArchived': '显示已归档',
  'project.empty': '还没有项目，先建一个',
  'project.pickHint': '选一个项目，就能增删它的字段',
  'project.fieldCount': '{count} 个字段',
  'project.saving': '保存中…',
  'project.failed': '操作失败：{message}',
} satisfies Record<string, string>

/** The yonPanel namespace key union. */
export type YonPanelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger.label': 'yon_btn',
  'panel.title': 'yon button panel',
  'panel.close': 'Close panel',
  'item.project': 'Project management panel',
  'project.new': 'New project',
  'project.name': 'Name',
  'project.code': 'Code',
  'project.status': 'Status',
  'project.status.active': 'Active',
  'project.status.paused': 'Paused',
  'project.status.done': 'Done',
  'project.fields': 'Fields',
  'project.fieldKey': 'Field',
  'project.fieldValue': 'Value',
  'project.addField': 'Add field',
  'project.removeField': 'Remove this field',
  'project.archive': 'Archive',
  'project.restore': 'Restore',
  'project.remove': 'Delete permanently',
  'project.showArchived': 'Show archived',
  'project.empty': 'No projects yet — create one',
  'project.pickHint': 'Pick a project to add or remove its fields',
  'project.fieldCount': '{count} fields',
  'project.saving': 'Saving…',
  'project.failed': 'Failed: {message}',
} satisfies Record<YonPanelKey, string>
