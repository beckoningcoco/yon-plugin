/**
 * The project surface: one list on the left, the selected project's properties
 * and fields on the right, inside the framework's own dialog chrome.
 *
 * The layout carries the two lessons the first version learned. Creating a
 * project is not a form parked in the middle of the list: it is one action that
 * opens a dialog when the operator asks for it. And a project's own columns
 * (name, code, status) are editable in place, because an API that can update
 * them is useless if the only way to fix a typo is to delete the project and
 * rebuild its fields.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject
 * face, which is what keeps this file testable without the host.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button, Input, Modal, Pill, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectDetail, ProjectStatus, ProjectSummary } from '../../shared/types.ts'
import { PROJECT_STATUSES } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { ProjectApi } from './api.ts'
import { CreateProjectDialog, type CreateProjectDraft } from './CreateProjectDialog.tsx'
import { FieldTable } from './FieldTable.tsx'
import { InlineText } from './InlineText.tsx'
import css from '../panel.module.css'

/** Below this many projects the list is short enough to read without a search box. */
const SEARCH_THRESHOLD = 8

/** Copy for one project status. */
const STATUS_KEYS = {
  active: 'project.status.active',
  paused: 'project.status.paused',
  done: 'project.status.done',
} as const satisfies Record<ProjectStatus, string>

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface ProjectManagerProps extends ProjectApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * The mark in front of every project row: the same filing-box outline the panel
 * entry uses, drawn here so the list and the entry read as one feature.
 * @param props.size - rendered box size; the empty state asks for a larger one.
 * @returns the decorative glyph.
 */
function ProjectMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.75" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.75 6h12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * Render the project surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog, plus its create dialog and its removal confirmation.
 */
export function ProjectManager({ t, onClose, ...api }: ProjectManagerProps) {
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  const [selected, setSelected] = useState<ProjectDetail>()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [addingField, setAddingField] = useState(false)

  const list = useRef<HTMLUListElement | null>(null)
  // A late answer is dropped rather than repainting a newer selection.
  const listSeq = useRef(0)
  const detailSeq = useRef(0)
  const pendingScroll = useRef<string>()
  const focusedOnce = useRef(false)

  const forget = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  /** Read the list, keeping the selection when it is still there. */
  const load = useCallback((keepId?: string, archived = includeArchived): Promise<void> => {
    const seq = ++listSeq.current
    setLoading(true)
    setFailure(undefined)
    return api.listProjects(archived).then(
      async (rows) => {
        if (seq !== listSeq.current) return
        setProjects(rows)
        const remembered = keepId ?? (rows.some(row => row.projectId === selected?.projectId)
          ? selected?.projectId
          : rows[0]?.projectId)
        if (remembered === undefined) {
          setSelected(undefined)
          return
        }
        const detail = await api.getProject(remembered)
        if (seq !== listSeq.current) return
        setSelected(detail)
      },
      (cause: unknown) => {
        if (seq !== listSeq.current) return
        setFailure(forget(cause))
      },
    ).finally(() => {
      if (seq === listSeq.current) setLoading(false)
    })
    // `selected` is read as a hint only: refetching on every selection change
    // would reload the surface the operator is already looking at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, includeArchived])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(undefined, includeArchived) }, [includeArchived])

  const select = (projectId: string): void => {
    const seq = ++detailSeq.current
    void api.getProject(projectId).then(
      (detail) => { if (seq === detailSeq.current) setSelected(detail) },
      (cause: unknown) => { if (seq === detailSeq.current) setFailure(forget(cause)) },
    )
  }

  /** Run one surface-wide action with the shared busy/error envelope. */
  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      await action()
    } catch (cause: unknown) {
      setFailure(forget(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  /** The first row is reachable by Tab before anything is selected. */
  const tabbableId = selected?.projectId ?? projects[0]?.projectId

  // Focus lands inside the dialog rather than on the page behind it, and it
  // lands on a row so the arrow keys work immediately.
  useEffect(() => {
    if (loading || focusedOnce.current) return
    focusedOnce.current = true
    list.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus()
  }, [loading])

  // A freshly created project is scrolled into view: the list does not jump by
  // itself, and the operator has just been told the project exists.
  useEffect(() => {
    const target = pendingScroll.current
    if (target === undefined) return
    pendingScroll.current = undefined
    list.current?.querySelector<HTMLElement>(`[data-project="${target}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [projects])

  const create = (draft: CreateProjectDraft): Promise<void> =>
    run(async () => {
      const created = await api.createProject({ name: draft.name, code: draft.code })
      pendingScroll.current = created.projectId
      setCreating(false)
      await load(created.projectId)
    })

  /** Store one of the project's own columns; the list keeps step with it. */
  const patch = (change: { name?: string; code?: string; status?: ProjectStatus }): void => {
    const target = selected
    if (target === undefined) return
    void run(async () => {
      const detail = await api.updateProject(target.projectId, change)
      setSelected(current => (current?.projectId === detail.projectId ? detail : current))
      setProjects(await api.listProjects(includeArchived))
    })
  }

  const setArchived = (archived: boolean): void => {
    const target = selected
    if (target === undefined) return
    void run(async () => {
      await api.archiveProject(target.projectId, archived)
      setProjects(await api.listProjects(includeArchived))
      setSelected(undefined)
      setAddingField(false)
    })
  }

  const removeForever = (): void => {
    const target = selected
    if (target === undefined) return
    void run(async () => {
      await api.removeProject(target.projectId)
      setConfirmingRemove(false)
      setAcknowledged(false)
      setAddingField(false)
      const rows = await api.listProjects(includeArchived)
      setProjects(rows)
      const next = rows[0]
      setSelected(next === undefined ? undefined : await api.getProject(next.projectId))
    })
  }

  /** The top layer owns Escape: an open dialog closes first, not the surface. */
  const requestClose = (): void => {
    if (creating || confirmingRemove) return
    onClose()
  }

  /** Store the value of the project the row belongs to, never a newer selection. */
  const applyDetail = (detail: ProjectDetail): void => {
    setSelected(current => (current?.projectId === detail.projectId ? detail : current))
  }

  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? projects
    : projects.filter((project) =>
      project.name.toLowerCase().includes(needle) || project.code.toLowerCase().includes(needle))

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (visible.length === 0) return
    event.preventDefault()
    const current = visible.findIndex(project => project.projectId === selected?.projectId)
    const last = visible.length - 1
    const next = event.key === 'ArrowDown'
      ? Math.min(last, current + 1)
      : Math.max(0, current <= 0 ? 0 : current - 1)
    const target = visible[next]
    if (target === undefined) return
    select(target.projectId)
    list.current?.querySelector<HTMLElement>(`[data-project="${target.projectId}"]`)?.focus()
  }

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        title={t('project.title')}
        closeLabel={t('project.close')}
        className={cn(css.manager)}
        contentClassName={cn(css.managerContent)}
      >
        {failure !== undefined && (
          <p className={cn(css.error)} role="alert">
            <span className={cn(css.errorText)}>{t('project.readFailed', { message: failure })}</span>
            <button type="button" className={cn(css.errorAction)} onClick={() => { void load() }}>
              {t('project.retry')}
            </button>
          </p>
        )}

        <div className={cn(css.body)}>
          <section className={cn(css.listPane)} aria-label={t('project.list')}>
            <div className={cn(css.listHead)}>
              <span className={cn(css.listTitle)}>{t('project.list')}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => { setCreating(true) }}
              >
                + {t('project.new')}
              </Button>
            </div>

            {projects.length >= SEARCH_THRESHOLD && (
              <Input
                type="search"
                className={cn(css.inputFill)}
                aria-label={t('project.search')}
                placeholder={t('project.search')}
                value={query}
                onChange={(event) => { setQuery(event.target.value) }}
              />
            )}

            <ul
              ref={list}
              className={cn(css.projects)}
              role="listbox"
              aria-label={t('project.list')}
              onKeyDown={onListKeyDown}
            >
              {visible.map((project) => (
                <li key={project.projectId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={project.projectId === selected?.projectId}
                    tabIndex={project.projectId === tabbableId ? 0 : -1}
                    className={cn(css.projectRow)}
                    data-project={project.projectId}
                    data-archived={project.archived ? '' : undefined}
                    onClick={() => { select(project.projectId) }}
                  >
                    <span className={cn(css.projectMark)} aria-hidden="true"><ProjectMark /></span>
                    <span className={cn(css.projectName)} title={project.name}>{project.name}</span>
                    {project.code !== '' && <span className={cn(css.projectCode)}>{project.code}</span>}
                    {project.fieldCount > 0 && (
                      <span className={cn(css.projectMeta)}>{t('project.fieldCount', { count: project.fieldCount })}</span>
                    )}
                    {project.archived && <span className={cn(css.projectArchived)}>{t('project.archived')}</span>}
                  </button>
                </li>
              ))}
            </ul>

            {needle !== '' && visible.length === 0 && (
              <p className={cn(css.note)}>{t('project.searchEmpty', { query: query.trim() })}</p>
            )}

            <label className={cn(css.archivedToggle)}>
              <input
                type="checkbox"
                checked={includeArchived}
                disabled={busy}
                onChange={(event) => { setIncludeArchived(event.target.checked) }}
              />
              {t('project.showArchived')}
            </label>
          </section>

          <section className={cn(css.detailPane)}>
            {selected === undefined
              ? (
                <div className={cn(css.empty)}>
                  <span className={cn(css.emptyMark)} aria-hidden="true"><ProjectMark size={28} /></span>
                  <p className={cn(css.emptyTitle)}>
                    {projects.length === 0 ? t('project.empty') : t('project.pickHint')}
                  </p>
                  {projects.length === 0 && (
                    <>
                      <p className={cn(css.note)}>{t('project.emptyHint')}</p>
                      <Button variant="primary" onClick={() => { setCreating(true) }}>
                        {t('project.new')}
                      </Button>
                    </>
                  )}
                </div>
              )
              : (
                <>
                  <InlineText
                    variant="title"
                    className={cn(css.detailName)}
                    value={selected.name}
                    label={t('project.renameProject')}
                    placeholder={t('project.namePlaceholder')}
                    disabled={busy}
                    onCommit={(next) => { patch({ name: next }) }}
                  />

                  <dl className={cn(css.props)}>
                    <dt className={cn(css.propLabel)}>{t('project.code')}</dt>
                    <dd className={cn(css.propValue)}>
                      <InlineText
                        value={selected.code}
                        label={t('project.changeCode')}
                        placeholder={t('project.codePlaceholder')}
                        emptyText={t('project.codeEmpty')}
                        disabled={busy}
                        onCommit={(next) => { patch({ code: next }) }}
                      />
                    </dd>

                    <dt className={cn(css.propLabel)}>{t('project.status')}</dt>
                    <dd className={cn(css.propValue)}>
                      <span className={cn(css.statusGroup)} role="group" aria-label={t('project.status')}>
                        {PROJECT_STATUSES.map(status => (
                          <Pill
                            key={status}
                            active={status === selected.status}
                            disabled={busy}
                            aria-pressed={status === selected.status}
                            onClick={() => {
                              if (status !== selected.status) patch({ status })
                            }}
                          >
                            {t(STATUS_KEYS[status])}
                          </Pill>
                        ))}
                      </span>
                    </dd>
                  </dl>

                  <div className={cn(css.detailActions)}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => { setArchived(!selected.archived) }}
                    >
                      {selected.archived ? t('project.restore') : t('project.archive')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(css.dangerButton)}
                      disabled={busy}
                      onClick={() => { setAcknowledged(false); setConfirmingRemove(true) }}
                    >
                      {t('project.remove')}
                    </Button>
                  </div>

                  <hr className={cn(css.rule)} />

                  <FieldTable
                    projectId={selected.projectId}
                    fields={selected.fields}
                    t={t}
                    adding={addingField}
                    onAddingChange={setAddingField}
                    onSave={async (fieldKey, value) => {
                      applyDetail(await api.setField(selected.projectId, fieldKey, value))
                    }}
                    onRemove={async (fieldKey) => {
                      applyDetail(await api.removeField(selected.projectId, fieldKey))
                    }}
                  />
                </>
              )}
          </section>
        </div>
      </Modal>

      <CreateProjectDialog
        open={creating}
        t={t}
        onCancel={() => { setCreating(false) }}
        onCreate={create}
      />

      <RiskConfirmation
        open={confirmingRemove && selected !== undefined}
        title={t('project.removeTitle')}
        description={t('project.removeDescription', {
          name: selected?.name ?? '',
          count: selected?.fieldCount ?? 0,
        })}
        acknowledgeLabel={t('project.removeAcknowledge')}
        cancelLabel={t('project.cancel')}
        closeLabel={t('project.cancel')}
        confirmLabel={t('project.removeConfirm')}
        acknowledged={acknowledged}
        disabled={busy}
        onAcknowledgedChange={setAcknowledged}
        onCancel={() => { setConfirmingRemove(false) }}
        onConfirm={removeForever}
      />
    </>
  )
}
