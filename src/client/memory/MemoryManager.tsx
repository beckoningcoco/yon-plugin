/**
 * 项目记忆的那一屏：某个人（多半是模型）在这个项目上查出来的事实，给使用者看。
 *
 * ## 这一屏为什么只有「看」和「删」
 *
 * 记忆是**某人查出来的事实**，不是一份可以填写的表格。把它做成新建表单，等于允许一个
 * 人凭印象编一条，而库里每一条都会被注入到下一个会话里——编出来的一条会被当成事实用。
 * 所以写与改都在模型那边（`host/memory-tools.ts` 的四个工具），这一屏给使用者的是
 * 两件事：**核对**（它到底记了什么、出处是什么、是谁的项目），以及**删掉**（这条根本
 * 不对，或者不该留着）。
 *
 * 这也是它与隔壁迭代面板的分工所在：那边模型只能追加、人做全部状态变更；这边模型能
 * 改、人只能删。两边的共同点是**删除永远不是模型的动作**。
 *
 * ## 三个界面上的决定
 *
 * - **摘要按类型排**（坑、环境事实、决定、偏好、做法）：前两类不知道就会做错事，
 *   所以它们在筛选器的最左边，也是 `MEMORY_TYPES` 的顺序。
 * - **搜索走后端**：记忆的价值在一句话的正文里，而面板手上只有摘要。所以关键词交给
 *   `list({ query })`（它会开文件搜正文），输入停 300 毫秒再发。
 * - **正文按需读**：列表只带摘要，展开一条才 `read()` 取全文并留在内存里，翻回去不再
 *   请求。这与注入路径的选择是同一条理由——不为还没看的东西付代价。
 *
 * 这一屏不发任何请求：每个调用都从 entry 的 inject face 作为 prop 进来。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemoryListRow, MemoryType, MemoryView, ProjectSummary } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { ProjectApi } from '../project/api.ts'
import type { MemoryApi } from './api.ts'
import { TYPE_LABEL_KEYS, TYPES, countTypes } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** 输入停多久才把关键词发出去。 */
const SEARCH_DEBOUNCE_MS = 300

/** Props of the surface: the injected API, the project list, the copy seat, and the close verb. */
export interface MemoryManagerProps extends MemoryApi {
  readonly t: TranslateNS<'yonPanel'>
  readonly listProjects: ProjectApi['listProjects']
  onClose(): void
}

/** 一条异常报出来的话；认不出来时给个字符串，别让界面显示 [object Object]。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 日期部分。时间戳是 ISO，这一屏只读得到「哪天记的」——具体到分钟在这里没有用处，
 * 而满屏的时分秒会把真正要看的标题挤小。
 * @param stamp - the ISO stamp the host applied.
 * @returns `YYYY-MM-DD`, or the raw value when it does not parse.
 */
function dayOf(stamp: string): string {
  if (stamp === '') return '—'
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return stamp
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 类型徽标的配色。
 *
 * 只有「坑」用告警色：它是唯一一条「不知道就会出错」的类型。环境事实用中性偏亮，
 * 决定与偏好共用静音色——它们是背景，不该跟坑抢注意力。
 * @param type - the memory's type.
 * @returns the shared tag class for it.
 */
function typeTag(type: MemoryType): string | undefined {
  if (type === 'pitfall') return base.tagFail
  if (type === 'env-fact') return base.tagPass
  return base.tagMuted
}

/**
 * Render the memory dialog.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export function MemoryManager({
  list, read, remove, listProjects, onClose, t,
}: MemoryManagerProps) {
  const [rows, setRows] = useState<readonly MemoryListRow[]>([])
  const [path, setPath] = useState('')
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([])
  /** 索引在、读不出来时宿主给的那句话。 */
  const [unreadable, setUnreadable] = useState<string | undefined>(undefined)
  /** 一次彻底失败的调用，带重试。 */
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(true)
  const [type, setType] = useState<MemoryType | 'all'>('all')
  const [projectId, setProjectId] = useState('')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | undefined>(undefined)
  /** 展开过的那几条的全文，按 id 留着。 */
  const [bodies, setBodies] = useState<Readonly<Record<string, MemoryView>>>({})
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const [flash, setFlash] = useState<string | undefined>(undefined)

  /**
   * 把输入框里的字推迟成一次查询。
   *
   * 搜索走后端（正文里的词只有它搜得到），所以每敲一个字就是一次请求；300 毫秒是
   * 「停下来想下一个词」与「等太久以为没反应」之间的折中。
   */
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(draft.trim()) }, SEARCH_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [draft])

  /**
   * 当前筛选下的整份列表。
   *
   * 筛选条件交给宿主而不是在本地过滤：关键词要搜正文（本地只有摘要），而项目与类型
   * 也顺便让宿主一起筛，免得两边各有一套「哪些算匹配」的规则。
   */
  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const payload = await list({
        ...type === 'all' ? {} : { type },
        ...projectId === '' ? {} : { project: projectId },
        ...query === '' ? {} : { query },
      })
      setRows(payload.rows)
      setPath(payload.path)
      setUnreadable(payload.error)
      setFailure(undefined)
    } catch (error) {
      setFailure(messageOf(error))
    } finally {
      setBusy(false)
    }
  }, [list, type, projectId, query])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let live = true
    void listProjects()
      .then(found => { if (live) setProjects(found) })
      // 项目列表拉不到不该让整屏打不开：记忆里带着项目名，筛选器少一个下拉而已。
      .catch(() => { if (live) setProjects([]) })
    return () => { live = false }
  }, [listProjects])

  /** 展开一条，第一次展开时把全文取回来。 */
  const toggle = useCallback(async (id: string): Promise<void> => {
    setConfirmId(undefined)
    if (openId === id) {
      setOpenId(undefined)
      return
    }
    setOpenId(id)
    if (bodies[id] !== undefined) return
    try {
      const { memory } = await read(id)
      setBodies(current => ({ ...current, [id]: memory }))
    } catch (error) {
      setFailure(messageOf(error))
    }
  }, [openId, bodies, read])

  /** 删掉一条：先移出列表再重读，因为索引与文件是两次写。 */
  const drop = useCallback(async (id: string): Promise<void> => {
    setConfirmId(undefined)
    try {
      await remove(id)
      setOpenId(current => (current === id ? undefined : current))
      setFlash(t('memory.removed'))
      await load()
    } catch (error) {
      setFailure(messageOf(error))
    }
  }, [remove, load, t])

  const counts = useMemo(() => countTypes(rows), [rows])
  const tally = t('memory.tally', { count: rows.length })

  return (
    <Modal
      open
      onClose={onClose}
      title={t('memory.title')}
      closeLabel={t('memory.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('memory.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('memory.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body, css.memScrollBody)}>
        <section className={cn(base.detailPane)} aria-label={t('memory.title')}>
          <div className={css.memToolbar}>
            <p className={cn(css.memTally, busy ? css.memDim : undefined)}>{tally}</p>
            <div className={css.memActions}>
              <div className={css.memFilters} role="group" aria-label={t('memory.filterAll')}>
                <button
                  type="button"
                  className={cn(css.memFilter, type === 'all' ? css.memFilterOn : undefined)}
                  aria-pressed={type === 'all'}
                  onClick={() => { setType('all') }}
                >
                  {t('memory.filterAll')}
                </button>
                {TYPES.map(value => (
                  <button
                    key={value}
                    type="button"
                    className={cn(css.memFilter, type === value ? css.memFilterOn : undefined)}
                    aria-pressed={type === value}
                    onClick={() => { setType(value) }}
                  >
                    {t(TYPE_LABEL_KEYS[value])}
                    {counts[value] === 0 ? '' : ` ${counts[value]}`}
                  </button>
                ))}
              </div>
              {projects.length > 1 && (
                <select
                  className={css.memSelect}
                  aria-label={t('memory.projectAll')}
                  value={projectId}
                  onChange={(event) => { setProjectId(event.target.value) }}
                >
                  <option value="">{t('memory.projectAll')}</option>
                  {projects.map(project => (
                    <option key={project.projectId} value={project.projectId}>{project.name}</option>
                  ))}
                </select>
              )}
              <div className={css.memSearch}>
                <Input
                  type="search"
                  className={cn(base.inputFill)}
                  aria-label={t('memory.search')}
                  placeholder={t('memory.search')}
                  value={draft}
                  onChange={(event) => { setDraft(event.target.value) }}
                />
              </div>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
                {busy ? t('memory.loading') : t('memory.refresh')}
              </Button>
            </div>
          </div>

          {/* 这一屏最容易让人误会的就是「为什么没有新建」——所以第一句话就说清它是什么、
              谁在写、这里的动词是什么。 */}
          <p className={css.memNote}>{t('memory.intro')}</p>

          {flash !== undefined && <p className={css.memNote} role="status">{flash}</p>}
          {unreadable !== undefined && (
            <p className={css.memNote}>{t('memory.readFailed', { message: unreadable })}</p>
          )}

          {!busy && rows.length === 0 && (
            <div className={cn(base.empty)}>
              <span className={cn(base.emptyMark)} aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
                  <path d="M3.4 2.6h6.2l3 3.1v7.7H3.4z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                  <path d="M9.6 2.6v3.1h3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                  <path d="M5.6 8.2h4.4M5.6 10.6h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
              </span>
              <p className={cn(base.emptyTitle)}>
                {query !== '' || type !== 'all' || projectId !== ''
                  ? t('memory.emptyFiltered')
                  : t('memory.empty')}
              </p>
            </div>
          )}

          <div className={css.memList}>
            {rows.map(row => {
              const open = openId === row.id
              const body = bodies[row.id]
              return (
                <article key={row.id} className={css.memRow}>
                  <button
                    type="button"
                    className={css.memRowHead}
                    aria-expanded={open}
                    onClick={() => { void toggle(row.id) }}
                  >
                    <span className={cn(base.tag, typeTag(row.type))}>{t(TYPE_LABEL_KEYS[row.type])}</span>
                    <span className={css.memRowTitle}>{row.title}</span>
                    <span className={css.memRowTime}>{dayOf(row.createdAt)}</span>
                    <span className={css.memRowProject}>{row.projectName}</span>
                  </button>
                  {!open && row.snippet !== '' && <p className={css.memRowSnippet}>{row.snippet}</p>}

                  {open && (
                    <div className={css.memDetail}>
                      <p className={css.memDetailBody}>
                        {body === undefined ? t('memory.reading') : body.body === '' ? t('memory.noBody') : body.body}
                      </p>
                      <dl className={css.memDetailGrid}>
                        <dt>{t('memory.fieldProject')}</dt>
                        <dd>{row.projectName}</dd>
                        <dt>{t('memory.fieldSource')}</dt>
                        <dd>{row.source === '' ? t('memory.noSource') : row.source}</dd>
                        <dt>{t('memory.fieldWhen')}</dt>
                        <dd>
                          {dayOf(row.createdAt)}
                          {dayOf(row.updatedAt) === dayOf(row.createdAt) ? '' : ` → ${dayOf(row.updatedAt)}`}
                        </dd>
                        <dt>{t('memory.fieldId')}</dt>
                        <dd className={css.memDetailMono}>{row.id}</dd>
                      </dl>

                      {confirmId === row.id ? (
                        <p className={css.memRemoveAsk}>
                          <span>{t('memory.removeAsk')}</span>
                          <Button size="sm" variant="primary" onClick={() => { void drop(row.id) }}>
                            {t('memory.removeConfirm')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirmId(undefined) }}>
                            {t('memory.cancel')}
                          </Button>
                        </p>
                      ) : (
                        <div className={css.memRowVerbs}>
                          <Button size="sm" variant="ghost" onClick={() => { setConfirmId(row.id) }}>
                            {t('memory.remove')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>

          <p className={cn(css.memFootPath)}>{path}</p>
        </section>
      </div>
    </Modal>
  )
}
