/**
 * The project management surface: one floating panel with the project list, the
 * selected project's own columns, and an editable row per dynamic field.
 *
 * Components in this package hold no data access of their own: every call
 * arrives as a callback ({@link ProjectApi} methods projected through an inject
 * face), and what the panel shows is local render state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  JsonValue, ProjectDetail, ProjectStatus, ProjectSummary,
} from '../../shared/types.ts'
import { PROJECT_STATUSES } from '../../shared/types.ts'
import type { ProjectApi } from './api.ts'
import css from './ProjectManager.module.css'

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface ProjectManagerProps extends ProjectApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * Render a field value into its editable text.
 * @param value - stored value.
 * @returns text the operator can edit; objects and arrays stay JSON.
 */
function formatValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * Read edited text back into a value.
 * @param text - what the operator typed.
 * @returns the parsed JSON value, or the text itself when it is not JSON.
 */
function parseValue(text: string): JsonValue {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    // Plain text is the common case ("10.0.0.1", "张三"); JSON is the exception.
    return text
  }
}

/** Copy for one project status. */
const STATUS_KEYS = {
  active: 'project.status.active',
  paused: 'project.status.paused',
  done: 'project.status.done',
} as const satisfies Record<ProjectStatus, string>

/** One editable field row: the name is the identity, the value is edited in place. */
function FieldRow({ fieldKey, value, t, busy, onSave, onRemove }: {
  fieldKey: string
  value: JsonValue
  t: TranslateNS<'yonPanel'>
  busy: boolean
  onSave(fieldKey: string, value: JsonValue): void
  onRemove(fieldKey: string): void
}) {
  const [text, setText] = useState(() => formatValue(value))

  // A save elsewhere (or another field's write) republishes the stored value.
  useEffect(() => { setText(formatValue(value)) }, [value])

  return (
    <div className={css.fieldRow}>
      <span className={css.fieldKey} title={fieldKey}>{fieldKey}</span>
      <input
        className={css.input}
        value={text}
        aria-label={`${fieldKey} · ${t('project.fieldValue')}`}
        disabled={busy}
        onChange={event => { setText(event.target.value) }}
        onBlur={() => {
          if (text !== formatValue(value)) onSave(fieldKey, parseValue(text))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <button
        type="button"
        className={css.iconButton}
        aria-label={`${t('project.removeField')}: ${fieldKey}`}
        disabled={busy}
        onClick={() => { onRemove(fieldKey) }}
      >
        ×
      </button>
    </div>
  )
}

/**
 * Render the surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the floating project panel.
 */
export function ProjectManager({ t, onClose, ...api }: ProjectManagerProps) {
  const root = useRef<HTMLDivElement | null>(null)
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [selected, setSelected] = useState<ProjectDetail>()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [draftName, setDraftName] = useState('')
  const [draftCode, setDraftCode] = useState('')
  const [removing, setRemoving] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useDismissOnOutsidePointer(root, true, onClose)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  /** Run one async action with the shared busy/error envelope. */
  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }, [])

  /** Reload the list and keep a project selected. */
  const reload = useCallback((keepId?: string, archived = includeArchived): void => {
    void run(async () => {
      const list = await api.listProjects(archived)
      setProjects(list)
      const target = keepId ?? list[0]?.projectId
      setSelected(target === undefined ? undefined : await api.getProject(target))
    })
  }, [api, includeArchived, run])

  useEffect(() => { reload(undefined, includeArchived) }, [includeArchived]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (projectId: string): void => {
    void run(async () => { setSelected(await api.getProject(projectId)) })
  }

  const create = (): void => {
    const name = draftName.trim()
    if (name === '') return
    void run(async () => {
      const created = await api.createProject({ name, code: draftCode.trim() })
      setDraftName('')
      setDraftCode('')
      const list = await api.listProjects(includeArchived)
      setProjects(list)
      setSelected(created)
    })
  }

  const writeField = (projectId: string, fieldKey: string, value: JsonValue): void => {
    void run(async () => { setSelected(await api.setField(projectId, fieldKey, value)) })
  }

  const dropField = (projectId: string, fieldKey: string): void => {
    void run(async () => { setSelected(await api.removeField(projectId, fieldKey)) })
  }

  const addField = (): void => {
    const key = newKey.trim()
    if (key === '' || selected === undefined) return
    void run(async () => {
      setSelected(await api.setField(selected.projectId, key, parseValue(newValue)))
      setNewKey('')
      setNewValue('')
    })
  }

  const setArchived = (projectId: string, archived: boolean): void => {
    void run(async () => {
      await api.archiveProject(projectId, archived)
      const list = await api.listProjects(includeArchived)
      setProjects(list)
      setSelected(undefined)
      setRemoving(false)
    })
  }

  const removeProject = (projectId: string): void => {
    void run(async () => {
      await api.removeProject(projectId)
      setRemoving(false)
      const list = await api.listProjects(includeArchived)
      setProjects(list)
      setSelected(list[0] === undefined ? undefined : await api.getProject(list[0].projectId))
    })
  }

  const fields = Object.entries(selected?.fields ?? {})

  return (
    <div ref={root} className={css.surface} role="dialog" aria-label={t('item.project')}>
      <header className={css.header}>
        <span className={css.title}>{t('item.project')}</span>
        <label className={css.toggle}>
          <input
            type="checkbox"
            checked={includeArchived}
            disabled={busy}
            onChange={(event) => { setIncludeArchived(event.target.checked) }}
          />
          {t('project.showArchived')}
        </label>
        <button type="button" className={css.iconButton} aria-label={t('panel.close')} onClick={onClose}>
          ×
        </button>
      </header>

      {error !== undefined && <p className={css.error} role="alert">{t('project.failed', { message: error })}</p>}

      <div className={css.body}>
        <section className={css.listPane}>
          <div className={css.createRow}>
            <input
              className={css.input}
              placeholder={t('project.name')}
              aria-label={t('project.name')}
              value={draftName}
              disabled={busy}
              onChange={event => { setDraftName(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') create() }}
            />
            <input
              className={css.input}
              placeholder={t('project.code')}
              aria-label={t('project.code')}
              value={draftCode}
              disabled={busy}
              onChange={event => { setDraftCode(event.target.value) }}
              onKeyDown={(event) => { if (event.key === 'Enter') create() }}
            />
            <button
              type="button"
              className={css.primary}
              disabled={busy || draftName.trim() === ''}
              onClick={create}
            >
              {t('project.new')}
            </button>
          </div>

          {projects.length === 0 && error === undefined
            ? <p className={css.note}>{t('project.empty')}</p>
            : (
              <ul className={css.projects}>
                {projects.map((project) => (
                  <li key={project.projectId}>
                    <button
                      type="button"
                      className={css.projectRow}
                      data-project={project.projectId}
                      data-selected={project.projectId === selected?.projectId ? '' : undefined}
                      data-archived={project.archived ? '' : undefined}
                      onClick={() => { select(project.projectId) }}
                    >
                      <span className={css.projectName}>{project.name}</span>
                      {project.code !== '' && <span className={css.projectCode}>{project.code}</span>}
                      <span className={css.projectMeta}>
                        {t('project.fieldCount', { count: project.fieldCount })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className={css.detailPane}>
          {selected === undefined
            ? <p className={css.note}>{t('project.pickHint')}</p>
            : (
              <>
                <div className={css.detailHead}>
                  <strong className={css.detailName}>{selected.name}</strong>
                  <span className={css.status}>{t(STATUS_KEYS[selected.status])}</span>
                  <button
                    type="button"
                    className={css.link}
                    disabled={busy}
                    onClick={() => { setArchived(selected.projectId, !selected.archived) }}
                  >
                    {selected.archived ? t('project.restore') : t('project.archive')}
                  </button>
                  <button
                    type="button"
                    className={css.link}
                    data-danger={removing ? '' : undefined}
                    disabled={busy}
                    onClick={() => {
                      if (removing) removeProject(selected.projectId)
                      else setRemoving(true)
                    }}
                  >
                    {removing ? `${t('project.remove')}?` : t('project.remove')}
                  </button>
                </div>

                <h3 className={css.sectionTitle}>{t('project.fields')}</h3>
                <div className={css.fields}>
                  {fields.map(([fieldKey, value]) => (
                    <FieldRow
                      key={fieldKey}
                      fieldKey={fieldKey}
                      value={value}
                      t={t}
                      busy={busy}
                      onSave={(key, next) => { writeField(selected.projectId, key, next) }}
                      onRemove={(key) => { dropField(selected.projectId, key) }}
                    />
                  ))}
                </div>

                <div className={css.addRow}>
                  <input
                    className={css.input}
                    placeholder={t('project.fieldKey')}
                    aria-label={t('project.fieldKey')}
                    value={newKey}
                    disabled={busy}
                    onChange={event => { setNewKey(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') addField() }}
                  />
                  <input
                    className={css.input}
                    placeholder={t('project.fieldValue')}
                    aria-label={t('project.fieldValue')}
                    value={newValue}
                    disabled={busy}
                    onChange={event => { setNewValue(event.target.value) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') addField() }}
                  />
                  <button
                    type="button"
                    className={css.primary}
                    disabled={busy || newKey.trim() === ''}
                    onClick={addField}
                  >
                    {t('project.addField')}
                  </button>
                </div>
              </>
            )}
        </section>
      </div>

      {busy && <span className={css.busy}>{t('project.saving')}</span>}
    </div>
  )
}
