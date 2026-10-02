/**
 * The knowledge base surface: every registered vault on one side, and on the
 * other what that vault actually is — how much of it can answer a query, how its
 * pages connect, what it keeps citing and cannot find, and what it has been asked.
 *
 * Same shape as the other three surfaces, on purpose: the shared stylesheet
 * carries the pane split, the list, the property grid and the action row, and the
 * dialog chrome comes from `Modal`. Only what a vault has that a connection does
 * not is added here.
 *
 * The tabs exist because a vault is no longer a thing you only check the size of.
 * With 5374 pages, 52 580 reference edges and 2840 uncovered entities, a single
 * column of facts would be a wall — and the three questions an operator has
 * (what is in here, what is missing, is anyone using it) deserve separate answers.
 *
 * Read-only by design. Nothing on this surface writes to a vault: adding one stays
 * a file edit, because a machine path is not something to invite somebody to type
 * into a browser field.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  WikiCardView, WikiGapView, WikiHealthReport, WikiLevel, WikiLogEntry,
  WikiRelationGroupView, WikiSearchPayload, WikiVaultView,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { YonPanelKey } from '../locales.ts'
import type { WikiApi } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** How much of a vault's log the activity tab shows. */
const HISTORY_LIMIT = 8

/** How many hits a search lists before it stops drawing them. */
const HIT_LIMIT = 40

/** How long typing settles before a search is sent. */
const SEARCH_DEBOUNCE_MS = 300

/** How long a copy confirmation stays on screen. */
const COPY_LINGER_MS = 1600

/** The three tabs, and which question each answers. */
type Tab = 'overview' | 'gaps' | 'activity'

/** Which translation key names each level. Spelled out because `t` takes literals. */
const LEVEL_KEY: Record<WikiLevel, YonPanelKey> = {
  'query-ready': 'wiki.level.query-ready',
  locatable: 'wiki.level.locatable',
  concept: 'wiki.level.concept',
}

/** Which translation key names each kind of relation. */
const KIND_KEY: Record<string, YonPanelKey> = {
  reference: 'wiki.kind.reference',
  refType: 'wiki.kind.refType',
  implements: 'wiki.kind.implements',
  composition: 'wiki.kind.composition',
  depends: 'wiki.kind.depends',
  extends: 'wiki.kind.extends',
  parent: 'wiki.kind.parent',
}

/** Props the entry hands this surface. */
export interface WikiManagerProps extends WikiApi, PropsLocale<'yonPanel'> {
  /** Close the surface. */
  onClose(): void
}

/**
 * The vault mark: an open book, matching the cell that opened this surface.
 * @returns the decorative svg.
 */
function BookMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.75 3.25h4.1c.66 0 1.15.53 1.15 1.18v8.32H3.9a1.15 1.15 0 0 1-1.15-1.15z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M13.25 3.25h-4.1c-.66 0-1.15.53-1.15 1.18v8.32h4.1a1.15 1.15 0 0 0 1.15-1.15z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The copy affordance, matching the field table's in the project surface.
 * @returns the decorative svg.
 */
function CopyMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.25 3.75H3.9c-.6 0-1.15.5-1.15 1.15v6.35" stroke="currentColor" strokeWidth="1.3"
        strokeLinecap="round" />
    </svg>
  )
}

/**
 * The confirmation that replaces it once the text is on the clipboard.
 * @returns the decorative svg.
 */
function CheckMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * A byte count in the unit a person reads it in.
 * @param value - the size in bytes.
 * @returns the formatted size.
 */
function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}

/** One labelled figure in the overview. */
function Stat({ label, value, note }: { label: string, value: string, note?: string }) {
  return (
    <div className={cn(css.stat)}>
      <span className={cn(css.statLabel)}>{label}</span>
      <span className={cn(css.statValue)}>{value}</span>
      {note !== undefined && <span className={cn(css.statNote)}>{note}</span>}
    </div>
  )
}

/**
 * A share bar for one level.
 *
 * Drawn from the page counts rather than stored: the widths are the point, and a
 * number alone makes the operator compute the proportion themselves.
 */
function LevelBar({ level, pages, total, t }: {
  level: WikiLevel
  pages: number
  total: number
  t: PropsLocale<'yonPanel'>['t']
}) {
  const share = total === 0 ? 0 : pages / total
  return (
    <div className={cn(css.levelRow)}>
      <span className={cn(css.levelName)}>{t(LEVEL_KEY[level])}</span>
      <span className={cn(css.levelBar)} aria-hidden="true">
        <span className={cn(css.levelFill, level === 'locatable' ? css.fillMid : undefined,
          level === 'concept' ? css.fillLow : undefined)}
          style={{ width: `${Math.max(share * 100, pages === 0 ? 0 : 0.6)}%` }} />
      </span>
      <span className={cn(css.levelCount)}>{pages}</span>
      <span className={cn(css.levelShare)}>{total === 0 ? '—' : `${(share * 100).toFixed(1)}%`}</span>
    </div>
  )
}

/** One group of relations: how many, and a few names. */
function RelationRow({ group, t }: {
  group: WikiRelationGroupView
  t: PropsLocale<'yonPanel'>['t']
}) {
  const more = group.total > group.sample.length ? ' …' : ''
  return (
    <div className={cn(css.relRow)}>
      <span className={cn(css.relKind)}>{t(KIND_KEY[group.kind] ?? 'wiki.kind.other')}</span>
      <span className={cn(css.relCount)}>{group.total}</span>
      <span className={cn(css.relNames)}>{group.sample.join('、')}{more}</span>
    </div>
  )
}

/**
 * Render the knowledge base dialog.
 * @param props - the wiki API, the copy, and the close gesture.
 * @returns the dialog.
 */
export function WikiManager({
  listVaults, rebuildVault, recentWrites, health, search, pageCard, citers, onClose, t,
}: WikiManagerProps) {
  const [vaults, setVaults] = useState<readonly WikiVaultView[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  /** The vault being rebuilt, or `'*'` while every vault is. */
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  /** The vault's health, and the log tail the activity tab also holds. */
  const [report, setReport] = useState<WikiHealthReport | undefined>(undefined)
  const [recent, setRecent] = useState<readonly WikiLogEntry[]>([])
  /** What the operator typed, and what came back for it. */
  const [term, setTerm] = useState('')
  const [found, setFound] = useState<WikiSearchPayload | undefined>(undefined)
  const [searching, setSearching] = useState(false)
  /** The page card opened from a hit, and the card being loaded. */
  const [card, setCard] = useState<WikiCardView | undefined>(undefined)
  const [cardBusy, setCardBusy] = useState<string | undefined>(undefined)
  /** The gap whose citers are open, and what came back for it. */
  const [openGap, setOpenGap] = useState<string | undefined>(undefined)
  const [gapCiters, setGapCiters] = useState<readonly string[]>([])
  const [gapBusy, setGapBusy] = useState(false)
  /** How long the last rebuild took, so a slow one has a number attached to it. */
  const [rebuildMs, setRebuildMs] = useState<number | undefined>(undefined)
  /** Whether copying the path worked, and the timer that clears the confirmation. */
  const [copied, setCopied] = useState<'copied' | 'failed' | undefined>(undefined)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setFailure(undefined)
    try {
      const answer = await listVaults()
      setVaults(answer.vaults)
    } catch (cause: unknown) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [listVaults])

  useEffect(() => { void load() }, [load])

  const current = vaults.find(vault => vault.id === selected) ?? vaults[0]
  const currentId = current?.id
  const ready = current?.ready === true

  // Health and history follow the selection, and reload after a rebuild: the log
  // is the whole point of showing it, and showing a stale one after rebuilding
  // would say the rebuild did nothing.
  useEffect(() => {
    if (currentId === undefined || !ready) {
      setReport(undefined)
      setRecent([])
      return
    }
    let live = true
    void health(currentId).then(answer => { if (live) setReport(answer.reports[0]) })
      .catch(() => { if (live) setReport(undefined) })
    void recentWrites(currentId, HISTORY_LIMIT)
      .then(entries => { if (live) setRecent(entries) })
      .catch(() => { if (live) setRecent([]) })
    return () => { live = false }
  }, [health, recentWrites, currentId, ready, busy])

  // Typing settles before the search is sent, so a six-character term is one call
  // rather than six. A cleared box clears the answer with it.
  useEffect(() => {
    const wanted = term.trim()
    if (wanted === '') {
      setFound(undefined)
      setSearching(false)
      return
    }
    let live = true
    setSearching(true)
    const timer = setTimeout(() => {
      void search(wanted, currentId, HIT_LIMIT)
        .then(answer => { if (live) setFound(answer) })
        .catch(() => { if (live) setFound(undefined) })
        .finally(() => { if (live) setSearching(false) })
    }, SEARCH_DEBOUNCE_MS)
    return () => { live = false; clearTimeout(timer) }
  }, [search, term, currentId])

  const rebuild = async (vault?: string): Promise<void> => {
    setBusy(vault ?? '*')
    setFailure(undefined)
    const started = Date.now()
    try {
      const answer = await rebuildVault(vault)
      setVaults(answer.vaults)
      // Measured here rather than reported by the host: the two differ by one
      // local round trip, and the number exists to answer "why is this slow".
      setRebuildMs(Date.now() - started)
    } catch (cause: unknown) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  /** Put the vault path on the clipboard, since it is a machine fact people paste. */
  const copyPath = (): void => {
    const settle = (outcome: 'copied' | 'failed'): void => {
      setCopied(outcome)
      if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => { setCopied(undefined) }, COPY_LINGER_MS)
    }
    void writeClipboard(current?.path ?? '').then(
      accepted => { settle(accepted ? 'copied' : 'failed') },
      () => { settle('failed') },
    )
  }

  const openCard = async (page: string): Promise<void> => {
    setCardBusy(page)
    try {
      const answer = await pageCard(page, currentId)
      setCard(answer.card)
    } catch (cause: unknown) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCardBusy(undefined)
    }
  }

  const toggleGap = async (uri: string): Promise<void> => {
    if (openGap === uri) {
      setOpenGap(undefined)
      setGapCiters([])
      return
    }
    setOpenGap(uri)
    setGapCiters([])
    setGapBusy(true)
    try {
      const answer = await citers(uri, currentId)
      setGapCiters(answer.pages)
    } catch {
      setGapCiters([])
    } finally {
      setGapBusy(false)
    }
  }

  const tabbable = selected ?? vaults[0]?.id
  const when = (vault: WikiVaultView): string => vault.indexedAt === undefined
    ? t('wiki.neverIndexed')
    : vault.indexedAt.slice(0, 19).replace('T', ' ')

  const tabs = useMemo(() => ([
    { id: 'overview' as const, label: t('wiki.tab.overview'), count: undefined },
    { id: 'gaps' as const, label: t('wiki.tab.gaps'), count: report?.graph.missingEntities },
    { id: 'activity' as const, label: t('wiki.tab.activity'), count: report?.usage.total },
  ]), [t, report])

  /** The overview: what the vault is, and what its pages can answer. */
  const overview = report === undefined ? null : (
    <>
      <dl className={cn(base.props)}>
        <dt className={cn(base.propLabel)}>{t('wiki.path')}</dt>
        <dd className={cn(base.propValue)}>
          <span className={cn(css.pathRow)}>
            <span className={cn(css.mono)}>{current?.path}</span>
            <button
              type="button"
              className={cn(css.copyBtn,
                copied === 'copied' ? css.copyOk : undefined,
                copied === 'failed' ? css.copyBad : undefined)}
              aria-label={copied === 'copied'
                ? t('wiki.copied')
                : copied === 'failed' ? t('wiki.copyFailed') : t('wiki.copyPath')}
              title={t('wiki.copyPath')}
              onClick={copyPath}
            >
              {copied === 'copied' ? <CheckMark /> : <CopyMark />}
            </button>
          </span>
        </dd>

        <dt className={cn(base.propLabel)}>{t('wiki.pages')}</dt>
        <dd className={cn(base.propValue)}>{current?.ready === true ? current.pages : '—'}</dd>

        <dt className={cn(base.propLabel)}>{t('wiki.indexedAt')}</dt>
        <dd className={cn(base.propValue)}>{current?.ready === true ? when(current) : '—'}</dd>

        <dt className={cn(base.propLabel)}>{t('wiki.indexBytes')}</dt>
        <dd className={cn(base.propValue)}>
          {report.indexBytes === undefined ? '—' : bytes(report.indexBytes)}
        </dd>

        {rebuildMs !== undefined && (
          <>
            <dt className={cn(base.propLabel)}>{t('wiki.lastRebuild')}</dt>
            <dd className={cn(base.propValue)}>{`${rebuildMs} ms`}</dd>
          </>
        )}
      </dl>

      <h4 className={cn(css.subTitle)}>{t('wiki.levels')}</h4>
      <div className={cn(css.levelList)}>
        {report.levels.map(entry => (
          <LevelBar key={entry.level} level={entry.level} pages={entry.pages}
            total={report.pages} t={t} />
        ))}
      </div>
      <p className={cn(base.note)}>{t('wiki.levelHint')}</p>

      <h4 className={cn(css.subTitle)}>{t('wiki.connectivity')}</h4>
      <div className={cn(css.statBlock)}>
        <Stat label={t('wiki.withOutgoing')} value={`${report.graph.withOutgoing}`}
          note={`/ ${report.pages}`} />
        <Stat label={t('wiki.withIncoming')} value={`${report.graph.withIncoming}`}
          note={`/ ${report.pages}`} />
        <Stat label={t('wiki.isolated')} value={`${report.graph.isolated}`} />
        <Stat label={t('wiki.edges')}
          value={`${report.graph.resolvedEdges + report.graph.danglingEdges}`} />
        {/* 这段注释一行要 293.48px，留在值列里会把这一行撑成两行（30px，其余四行
            15px）；挪出来自成一行，五行才等高。 */}
        <p className={cn(base.note, css.statFootnote)}>{t('wiki.edgeDetail', {
          resolved: report.graph.resolvedEdges,
          dangling: report.graph.danglingEdges,
        })}</p>
        <Stat label={t('wiki.missing')} value={`${report.graph.missingEntities}`} />
      </div>
    </>
  )

  /** The gaps tab: what the pages keep citing and no page covers. */
  const gaps = report === undefined ? null : (
    <>
      <h4 className={cn(css.subTitle)}>{t('wiki.gapsTitle')}</h4>
      {/* 这段提醒放在清单**上面**：放在下面时它的顶边在 pane 顶下方 460px、高 48px，
          而 pane 只有 450px 高——一个字都看不到（详见本文件 panel.module.css 的
          .gapList 注释）。 */}
      <p className={cn(base.note)}>{t('wiki.gapNote')}</p>
      {report.gaps.length === 0
        ? <p className={cn(base.note)}>{t('wiki.noGaps')}</p>
        : (
          <ul className={cn(css.gapList)}>
            {report.gaps.map((gap: WikiGapView, index) => (
              <li key={gap.uri} className={cn(css.gapItem)}>
                <div className={cn(css.gapRow)}>
                  <span className={cn(css.gapRank)}>{index + 1}</span>
                  <span className={cn(css.gapUri)}>{gap.uri}</span>
                  <span className={cn(css.gapCited)}>{t('wiki.citedTimes', { count: gap.cited })}</span>
                  <button type="button" className={cn(base.foldToggle, css.gapToggle)}
                    onClick={() => { void toggleGap(gap.uri) }}>
                    <span>{openGap === gap.uri ? t('wiki.hideCiters') : t('wiki.showCiters')}</span>
                    {/* 两个标签叠在同一格里、只让隐形的那个占宽：按钮的宽度就与展开态
                        无关了。否则展开那一行的被引次数会跟着往右跳（实测 36px，见
                        panel.module.css 的 .gapToggle）。 */}
                    <span className={cn(css.gapToggleGhost)} aria-hidden="true">{t('wiki.showCiters')}</span>
                    <span className={cn(css.gapToggleGhost)} aria-hidden="true">{t('wiki.hideCiters')}</span>
                  </button>
                </div>
                {openGap === gap.uri && (
                  <div className={cn(css.citers)}>
                    {gapBusy
                      ? <span className={cn(base.note)}>{t('wiki.citersLoading')}</span>
                      : gapCiters.length === 0
                        ? <span className={cn(base.note)}>{t('wiki.searchNoHit')}</span>
                        : (
                          <ul className={cn(css.citerList)}>
                            {gapCiters.slice(0, 40).map(page => (
                              <li key={page}>
                                <button type="button" className={cn(css.citerLink)}
                                  onClick={() => { void openCard(page) }}>{page}</button>
                              </li>
                            ))}
                            {gapCiters.length > 40 && (
                              <li className={cn(base.note)}>
                                {t('wiki.citersMore', { count: gapCiters.length - 40 })}
                              </li>
                            )}
                          </ul>
                        )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </>
  )

  /** The activity tab: what has been written, and what has been asked. */
  const activity = report === undefined ? null : (
    <>
      <h4 className={cn(css.subTitle)}>{t('wiki.activityTotal', { count: report.usage.total })}</h4>
      {report.usage.total === 0
        ? <p className={cn(base.note)}>{t('wiki.noActivity')}</p>
        : (
          <div className={cn(css.stats)}>
            <div className={cn(css.termBlock)}>
              <span className={cn(css.statLabel)}>{t('wiki.missedTerms')}</span>
              {report.usage.misses.length === 0
                ? <span className={cn(base.note)}>{t('wiki.searchNoHit')}</span>
                : (
                  <ul className={cn(css.termList)}>
                    {report.usage.misses.slice(0, 10).map(miss => (
                      <li key={miss.term} className={cn(css.termRow)}>
                        <span className={cn(css.termText)}>{miss.term}</span>
                        <span className={cn(css.termCount)}>{t('wiki.times', { count: miss.count })}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <div className={cn(css.termBlock)}>
              <span className={cn(css.statLabel)}>{t('wiki.topTerms')}</span>
              <ul className={cn(css.termList)}>
                {report.usage.popular.slice(0, 10).map(entry => (
                  <li key={entry.term} className={cn(css.termRow)}>
                    <span className={cn(css.termText)}>{entry.term}</span>
                    <span className={cn(css.termCount)}>{t('wiki.times', { count: entry.count })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

      <h4 className={cn(css.subTitle)}>{t('wiki.recent')}</h4>
      {recent.length === 0
        ? <p className={cn(base.note)}>{t('wiki.recentEmpty')}</p>
        : (
          <ul className={cn(css.logList)}>
            {recent.map((entry, index) => (
              <li key={`${entry.date}-${String(index)}`} className={cn(css.logRow)}>
                <span className={cn(css.logDate)}>{entry.date}</span>
                <span className={cn(css.logText)}>{entry.text}</span>
              </li>
            ))}
          </ul>
        )}
    </>
  )

  /** One page as a card: what it can answer, and where it leads. */
  const cardView = card === undefined ? null : (
    <div className={cn(css.card)}>
      <div className={cn(css.cardHead)}>
        <span className={cn(css.cardTitle)}>{card.name}</span>
        <span className={cn(css.mono)}>{card.uri ?? card.page}</span>
        <button type="button" className={cn(css.cardClose)}
          onClick={() => { setCard(undefined) }}>{t('wiki.hideCiters')}</button>
      </div>
      <div className={cn(css.cardFacts)}>
        <span className={cn(base.tag, card.level === 'concept' ? base.tagMuted : undefined)}>
          {t(LEVEL_KEY[card.level])}
        </span>
        {card.fieldCount !== undefined && (
          <span className={cn(css.cardFact)}>{t('wiki.cardFields', { count: card.fieldCount })}</span>
        )}
        <span className={cn(css.cardFact)}>
          {card.table === undefined ? t('wiki.cardNoTable') : `${t('wiki.cardTable')} ${card.table}`}
        </span>
        {card.version !== undefined && <span className={cn(css.cardFact)}>{card.version}</span>}
      </div>
      {card.lacks.length > 0 && (
        <ul className={cn(css.lacks)}>
          {card.lacks.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
      {card.outgoing.length > 0 && (
        <>
          <h5 className={cn(css.cardSub)}>{t('wiki.cardOutgoing')}</h5>
          {card.outgoing.map(group => <RelationRow key={group.kind} group={group} t={t} />)}
        </>
      )}
      {card.incomingGroups.length > 0 && (
        <>
          <h5 className={cn(css.cardSub)}>{t('wiki.cardIncoming')}</h5>
          {card.incomingGroups.map(group => <RelationRow key={group.kind} group={group} t={t} />)}
        </>
      )}
      {card.unresolved.total > 0 && (
        <p className={cn(base.note)}>{t('wiki.cardUnresolved', { count: card.unresolved.total })}</p>
      )}
      <p className={cn(base.note)}>{card.page}</p>
    </div>
  )

  /** Search results, shown in place of the tabs while a term is typed. */
  const results = found === undefined ? null : (
    <div className={cn(css.results)}>
      <p className={cn(css.resultHead)}>
        {t('wiki.searchSummary', { scanned: found.scanned, hits: found.hits.length })}
      </p>
      {found.hits.length === 0
        ? <p className={cn(base.note)}>{t('wiki.searchNoHit')}</p>
        : (
          <>
            <ul className={cn(css.resultList)}>
              {found.hits.map(hit => (
                <li key={hit.page}>
                  <button type="button" className={cn(css.resultRow)}
                    disabled={cardBusy !== undefined}
                    onClick={() => { void openCard(hit.page) }}>
                    <span className={cn(css.resultName)}>{hit.name}</span>
                    <span className={cn(css.mono)}>{hit.uri ?? hit.page}</span>
                    <span className={cn(css.resultFacts)}>
                      <span className={cn(base.tag, hit.level === 'concept' ? base.tagMuted : undefined)}>
                        {t(LEVEL_KEY[hit.level])}
                      </span>
                      {hit.fieldCount !== undefined && <span>{t('wiki.cardFields', { count: hit.fieldCount })}</span>}
                      {hit.table !== undefined && <span className={cn(css.mono)}>{hit.table}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={cn(base.note)}>{t('wiki.searchCardHint')}</p>
          </>
        )}
    </div>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={t('wiki.title')}
      closeLabel={t('wiki.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={cn(base.error)} role="alert">
          <span className={cn(base.errorText)}>{t('wiki.actionFailed', { message: failure })}</span>
          <button type="button" className={cn(base.errorAction)} onClick={() => { void load() }}>
            {t('wiki.retry')}
          </button>
        </p>
      )}

      <div className={cn(base.body)}>
        <section className={cn(base.listPane)} aria-label={t('wiki.list')}>
          <div className={cn(base.listHead)}>
            <span className={cn(base.listTitle)}>{t('wiki.list')}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== undefined || vaults.length === 0}
              onClick={() => { void rebuild() }}
            >
              {busy === '*' ? t('wiki.rebuilding') : t('wiki.rebuildAll')}
            </Button>
          </div>

          {loading
            ? <p className={cn(base.note)}>{t('wiki.loading')}</p>
            : vaults.length === 0
              ? <p className={cn(base.note)}>{t('wiki.empty')}</p>
              : (
                <ul className={cn(base.projects)} role="listbox" aria-label={t('wiki.list')}>
                  {vaults.map(vault => (
                    <li key={vault.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={vault.id === current?.id}
                        tabIndex={vault.id === tabbable ? 0 : -1}
                        className={cn(base.projectRow, !vault.ready ? css.rowNotReady : undefined)}
                        onClick={() => {
                          setSelected(vault.id)
                          setCard(undefined)
                          setTerm('')
                          setOpenGap(undefined)
                        }}
                      >
                        <span className={cn(base.projectMark)} aria-hidden="true"><BookMark /></span>
                        <span className={cn(base.projectName)} title={vault.path}>{vault.label}</span>
                        <span className={cn(base.projectMeta)}>
                          {vault.ready ? `${vault.pages} ${t('wiki.pagesUnit')}` : t('wiki.notReady')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </section>

        <section className={cn(base.detailPane)}>
          {current === undefined ? (
            <div className={cn(base.empty)}>
              <span className={cn(base.emptyMark)} aria-hidden="true"><BookMark /></span>
              <p className={cn(base.emptyTitle)}>{t('wiki.empty')}</p>
              <p className={cn(base.note)}>{t('wiki.emptyHint')}</p>
            </div>
          ) : (
            <>
              <h3 className={cn(css.title)}>
                {current.label}
                <span className={cn(base.projectMeta)}>{current.id}</span>
              </h3>

              <div className={cn(css.searchRow)}>
                <input
                  className={cn(base.inputFill, css.searchInput)}
                  type="search"
                  value={term}
                  placeholder={t('wiki.searchPlaceholder')}
                  aria-label={t('wiki.search')}
                  onChange={event => { setTerm(event.target.value) }}
                />
                {searching && <span className={cn(base.note)}>{t('wiki.searching')}</span>}
              </div>

              {results ?? (
                <>
                  <div className={cn(css.tabs)} role="tablist" aria-label={t('wiki.title')}>
                    {tabs.map(entry => (
                      <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        className={cn(css.tab, tab === entry.id ? css.tabActive : undefined)}
                        onClick={() => { setTab(entry.id) }}
                      >
                        {entry.label}
                        {entry.count !== undefined && <span className={cn(css.tabCount)}>{entry.count}</span>}
                      </button>
                    ))}
                  </div>

                  {tab === 'overview' && overview}
                  {tab === 'gaps' && gaps}
                  {tab === 'activity' && activity}
                </>
              )}

              {cardView}

              {tab === 'overview' && current.ready && (
                <p className={cn(base.hint)}>{t('wiki.rebuildHint')}</p>
              )}

              <div className={cn(base.detailActions)}>
                <Button
                  size="sm"
                  disabled={busy !== undefined || !current.ready}
                  onClick={() => { void rebuild(current.id) }}
                >
                  {busy === current.id ? t('wiki.rebuilding') : t('wiki.rebuild')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => { void load() }}
                >
                  {t('wiki.refresh')}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}
