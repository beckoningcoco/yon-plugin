/**
 * The skill surface: the skills this plugin ships on one side of the list, the
 * operator's own on the other, and the selected skill's instructions beside
 * them, inside the framework's own dialog chrome.
 *
 * The split is the point, and it is enforced rather than merely described. A
 * skill this plugin registers exists only while the plugin does, so it can be
 * switched off here; a skill the operator wrote lives in their own skill
 * directories, so this surface shows it and never offers to change it. The host
 * refuses a switch on any name this plugin does not ship, so the rule holds even
 * if a later version of this file forgets it.
 *
 * Nothing here fetches: every call arrives as a prop from the entry's inject
 * face, which is what keeps this file testable without the host.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Button, Input, MarkdownText, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillDetail, SkillView } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { SkillApi } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** Below this many skills the list is short enough to read without a search box. */
const SEARCH_THRESHOLD = 8

/**
 * A description longer than this folds to four lines.
 *
 * The value is not a preference — it sits in a gap in the data. The thirteen
 * skills this plugin ships split cleanly: seven descriptions of 101 characters
 * or fewer, six of 182 or more, and nothing in between. Anything in that band
 * separates the same two groups. See `.clampOn` for why this is a character
 * count and not a measurement of the laid-out box.
 */
const DESC_FOLD_AT = 120

/**
 * The mark in front of every skill row: a sheet with a folded corner.
 * @param props.size - rendered box size; the empty state asks for a larger one.
 * @returns the decorative glyph.
 */
function SkillMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.6 2.3h5.3l3.5 3.5v6.9a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9V3.2a.9.9 0 0 1 .9-.9Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.75 2.5v3.4h3.4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface SkillManagerProps extends SkillApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/**
 * Render the skill surface.
 * @param props - injected API, copy seat, and close verb.
 * @returns the dialog.
 */
export function SkillManager({ t, onClose, ...api }: SkillManagerProps) {
  const [skills, setSkills] = useState<readonly SkillView[]>([])
  const [complete, setComplete] = useState(true)
  const [selected, setSelected] = useState<SkillDetail>()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [descriptionOpen, setDescriptionOpen] = useState(false)

  const list = useRef<HTMLUListElement | null>(null)
  // A late answer is dropped rather than repainting a newer selection.
  const listSeq = useRef(0)
  const detailSeq = useRef(0)
  const focusedOnce = useRef(false)

  const forget = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause)

  /** Read the list, keeping the selection when it is still there. */
  const load = useCallback((keepName?: string): Promise<void> => {
    const seq = ++listSeq.current
    setLoading(true)
    setFailure(undefined)
    return api.listSkills().then(
      async (payload) => {
        if (seq !== listSeq.current) return
        setSkills(payload.skills)
        setComplete(payload.complete)
        const remembered = keepName
          ?? (payload.skills.some(skill => skill.name === selected?.name)
            ? selected?.name
            : payload.skills[0]?.name)
        if (remembered === undefined) {
          setSelected(undefined)
          return
        }
        const detail = await api.getSkill(remembered)
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
  }, [api])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const select = (name: string): void => {
    const seq = ++detailSeq.current
    void api.getSkill(name).then(
      (detail) => { if (seq === detailSeq.current) setSelected(detail) },
      (cause: unknown) => { if (seq === detailSeq.current) setFailure(forget(cause)) },
    )
  }

  // The chrome the host's markdown asks for: its copy button and footnotes
  // heading. Memoised on `t` because the host keys its renderer table off this
  // object's identity — a fresh one per render would rebuild it on every
  // keystroke in the search box, with a 2000-character body on screen.
  const markdownLabels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel: t('skill.copyCode'), copiedLabel: t('skill.copied') },
    footnotes: t('skill.footnotes'),
  }), [t])

  /** Flip the selected skill, then re-read so the list shows the new state too. */
  const toggle = (): void => {
    const target = selected
    if (target === undefined || !target.managed) return
    void (async () => {
      setBusy(true)
      setFailure(undefined)
      try {
        setSelected(await api.setSkillEnabled(target.name, !target.enabled))
        const payload = await api.listSkills()
        setSkills(payload.skills)
        setComplete(payload.complete)
      } catch (cause: unknown) {
        setFailure(forget(cause))
      } finally {
        setBusy(false)
      }
    })()
  }

  /** The first row is reachable by Tab before anything is selected. */
  const tabbableName = selected?.name ?? skills[0]?.name

  // Focus lands inside the dialog rather than on the page behind it, and it
  // lands on a row so the arrow keys work immediately.
  useEffect(() => {
    if (loading || focusedOnce.current) return
    focusedOnce.current = true
    list.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus()
  }, [loading])

  // An unfolded description belongs to the skill it was unfolded on. Selecting
  // another one by keyboard lands on the pane's 停用 button almost immediately,
  // so the state has to follow the selection rather than the click that made it.
  useEffect(() => { setDescriptionOpen(false) }, [selected?.name])

  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? skills
    : skills.filter((skill) =>
      skill.name.toLowerCase().includes(needle)
      || skill.description.toLowerCase().includes(needle))
  const mine = visible.filter(skill => skill.managed)
  const theirs = visible.filter(skill => !skill.managed)

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (visible.length === 0) return
    event.preventDefault()
    const current = visible.findIndex(skill => skill.name === selected?.name)
    const last = visible.length - 1
    const next = event.key === 'ArrowDown'
      ? Math.min(last, current + 1)
      : Math.max(0, current <= 0 ? 0 : current - 1)
    const target = visible[next]
    if (target === undefined) return
    select(target.name)
    list.current?.querySelector<HTMLElement>(`[data-skill="${target.name}"]`)?.focus()
  }

  /**
   * One row. Both groups render through here, so a row looks and behaves the
   * same wherever it sits; the heading above it is what tells them apart.
   * @param skill - the row's skill.
   * @returns the list item.
   */
  const row = (skill: SkillView) => (
    <li key={skill.name}>
      <button
        type="button"
        role="option"
        aria-selected={skill.name === selected?.name}
        tabIndex={skill.name === tabbableName ? 0 : -1}
        className={cn(base.projectRow, skill.managed && !skill.enabled ? css.rowOff : undefined)}
        data-skill={skill.name}
        onClick={() => { select(skill.name) }}
      >
        <span className={cn(base.projectMark)} aria-hidden="true"><SkillMark /></span>
        <span className={cn(base.projectName)} title={skill.name}>{skill.name}</span>
        {skill.managed && (
          <span className={cn(base.projectMeta)}>
            {skill.enabled ? t('skill.enabled') : t('skill.disabled')}
          </span>
        )}
      </button>
    </li>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={t('skill.title')}
      closeLabel={t('skill.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('skill.readFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('skill.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body)}>
        <section className={cn(base.listPane)} aria-label={t('skill.list')}>
          <div className={cn(base.listHead)}>
            <span className={cn(base.listTitle)}>{t('skill.list')}</span>
          </div>

          {skills.length >= SEARCH_THRESHOLD && (
            <Input
              type="search"
              className={cn(base.inputFill)}
              aria-label={t('skill.search')}
              placeholder={t('skill.search')}
              value={query}
              onChange={(event) => { setQuery(event.target.value) }}
            />
          )}

          {!complete && <p className={cn(base.note)}>{t('skill.partial')}</p>}

          <div className={cn(css.groups)}>
            {mine.length > 0 && (
              <div>
                <p className={cn(css.group)}>{t('skill.mine')}</p>
                <ul
                  ref={list}
                  className={cn(base.projects)}
                  role="listbox"
                  aria-label={t('skill.mine')}
                  onKeyDown={onListKeyDown}
                >
                  {mine.map(row)}
                </ul>
              </div>
            )}

            {theirs.length > 0 && (
              <div>
                <p className={cn(css.group)}>{t('skill.theirs')}</p>
                <ul
                  className={cn(base.projects)}
                  role="listbox"
                  aria-label={t('skill.theirs')}
                  onKeyDown={onListKeyDown}
                >
                  {theirs.map(row)}
                </ul>
              </div>
            )}
          </div>

          {/* Said out loud, not left to be inferred: the operator's own skills
              live in an agent preset's scope layer, and a request from this
              panel cannot name that scope. An empty second group would read as
              "your skills are gone" instead of "this panel does not cover them". */}
          <p className={cn(base.note, css.scopeHint)}>{t('skill.scopeHint')}</p>

          {needle !== '' && visible.length === 0 && (
            <p className={cn(base.note)}>{t('skill.searchEmpty', { query: query.trim() })}</p>
          )}
        </section>

        <section className={cn(base.detailPane)}>
          {selected === undefined
            ? (
              <div className={cn(base.empty)}>
                <span className={cn(base.emptyMark)} aria-hidden="true"><SkillMark size={28} /></span>
                <p className={cn(base.emptyTitle)}>
                  {loading
                    ? t('skill.loading')
                    : skills.length === 0 ? t('skill.empty') : t('skill.pickHint')}
                </p>
              </div>
            )
            : (
              <>
                <div className={cn(css.head)}>
                  <h3 className={cn(css.title)}>
                    {selected.name}
                    <span className={cn(base.projectMeta)}>
                      {selected.managed
                        ? selected.enabled ? t('skill.enabled') : t('skill.disabled')
                        : t('skill.readonly')}
                    </span>
                  </h3>

                  {selected.managed && (
                    <Button
                      variant={selected.enabled ? 'outline' : 'primary'}
                      size="sm"
                      disabled={busy}
                      onClick={toggle}
                    >
                      {selected.enabled ? t('skill.disable') : t('skill.enable')}
                    </Button>
                  )}
                </div>

                <p className={cn(base.note)}>
                  {selected.managed ? t('skill.managedHint') : t('skill.readonlyHint')}
                </p>

                <dl className={cn(base.props)}>
                  <dt className={cn(base.propLabel)}>{t('skill.description')}</dt>
                  <dd className={cn(base.propValue)}>
                    <span className={cn(css.clamp, !descriptionOpen && css.clampOn)}>
                      {selected.description}
                    </span>
                    {selected.description.length > DESC_FOLD_AT && (
                      <button
                        type="button"
                        className={cn(base.foldToggle)}
                        aria-expanded={descriptionOpen}
                        onClick={() => { setDescriptionOpen(!descriptionOpen) }}
                      >
                        {descriptionOpen ? t('skill.fold') : t('skill.unfold')}
                      </button>
                    )}
                  </dd>

                  {selected.whenToUse !== undefined && (
                    <>
                      <dt className={cn(base.propLabel)}>{t('skill.whenToUse')}</dt>
                      <dd className={cn(base.propValue)}>{selected.whenToUse}</dd>
                    </>
                  )}

                  <dt className={cn(base.propLabel)}>{t('skill.source')}</dt>
                  <dd className={cn(base.propValue)}>{selected.source}</dd>
                </dl>

                <hr className={cn(base.rule)} />

                <h4 className={cn(base.sectionTitle)}>{t('skill.body')}</h4>
                <div className={cn(css.doc)}>
                  <MarkdownText text={selected.content} labels={markdownLabels} />
                </div>
              </>
            )}
        </section>
      </div>
    </Modal>
  )
}
