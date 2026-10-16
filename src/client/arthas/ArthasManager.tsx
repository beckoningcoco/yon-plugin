/**
 * 运行时调试的那一屏：模型在一个正在服务的进程里观测了什么、跑过什么命令。
 *
 * ## 这一屏为什么把审计摆在会话旁边，而不是收进一个页签
 *
 * 设计文档第九节把它写成要求而不是偏好：`ognl` 等于任意代码执行。一个只显示成功
 * `watch` 结果的事件流，显示的正好是无害的那一半；而需要先点一下才看得见的东西，在真
 * 出事的那一刻不算看得见。所以会话和审计同屏，危险那一类还额外有一条左边框（不靠颜色
 * 单独承担——色觉差异、深色主题、投影仪，三种里至少有一种会把它抹平）。
 *
 * ## 这一屏不发任何请求
 *
 * 每个调用都从 entry 的 inject face 作为 prop 进来（`ArthasItem.tsx`），组件不知道 URL。
 *
 * ## 刷新策略，以及那个已知落差
 *
 * `exec` 是**原子**的：一个 `watch -n 5` 要等 5 次命中全部发生才返回，中途读不到任何增量。
 * 所以「事件流逐条冒出来」这件事在 HTTP 通道上做不到（设计文档第十一节把它记为待验证的
 * websocket）。这里能做的是：**只对已经展开的、还在观测中的会话轮询**，而且只读那个会话的
 * 详情——不重扫进程。整屏刷新要跑一次 `jps` 加一次 agent 探测（约一秒），拿它当心跳会把
 * 一个诊断工具变成它自己的负载。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ArthasAuditView, ArthasEventView, ArthasPanelPayload, ArthasSessionDetail,
  ArthasSessionView, ArthasTargetView,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import { SESSION_STATE_KEYS, clockOf, durationOf, eventLabelKey, type ArthasClientApi } from './api.ts'
import { ReplayView } from './ReplayView.tsx'
import base from '../panel.module.css'
import css from './panel.module.css'

/** 观测中的会话多久回读一次。 */
const WATCH_POLL_MS = 3_000

/** Props of the surface: the injected API, the copy seat, and the close verb. */
export interface ArthasManagerProps extends ArthasClientApi {
  readonly t: TranslateNS<'yonPanel'>
  onClose(): void
}

/** 一条异常报出来的话；认不出来时给个字符串，别让界面显示 [object Object]。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 一个会话的短标签，用它的类名或它的 id。
 * @param session - the session row.
 * @returns what to call it in a list.
 */
function labelOf(session: ArthasSessionView): string {
  return session.className ?? `#${session.id}`
}

/**
 * One `watch` result's own line.
 * @param event - the result row.
 * @returns the text to show beside the type.
 */
function whereOf(event: ArthasEventView): string {
  const parts = [event.className, event.methodName].filter((one): one is string => one !== undefined)
  return parts.length === 0 ? '' : parts.join('#')
}

/** 目标进程表的一行。 */
function TargetRow({ target, hostPid, busy, t, onAttach }: {
  readonly target: ArthasTargetView
  readonly hostPid: number | undefined
  readonly busy: boolean
  readonly t: TranslateNS<'yonPanel'>
  onAttach(pid: number): void
}) {
  const isHost = target.attached
  return (
    <tr>
      <td className={css.arthasTargetPid}>{target.pid}</td>
      <td className={css.arthasTargetClass}>
        {target.mainClass}
        {target.home !== undefined && <span className={css.arthasTargetHome}>{target.home}</span>}
      </td>
      <td className={isHost ? css.arthasHost : css.arthasNotHost}>
        {isHost ? t('arthas.agentHere') : t('arthas.notAttached')}
      </td>
      <td>
        {!isHost && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || hostPid !== undefined}
            title={hostPid === undefined ? undefined : t('arthas.agentElsewhere', { pid: hostPid })}
            onClick={() => { onAttach(target.pid) }}
          >
            {t('arthas.attach')}
          </Button>
        )}
      </td>
    </tr>
  )
}

/** 一条结构化结果。 */
function EventRow({ event, t }: {
  readonly event: ArthasEventView
  readonly t: TranslateNS<'yonPanel'>
}) {
  const key = eventLabelKey(event.type)
  const failed = event.success === false || (event.statusCode !== undefined && event.statusCode !== 0)
  const where = whereOf(event)
  return (
    <article className={cn(css.arthasEvent, failed ? css.arthasEventFailed : undefined)}>
      <div className={css.arthasEventHead}>
        {event.ts !== undefined && <span className={css.arthasEventMeta}>{event.ts}</span>}
        <span className={css.arthasEventType}>{key === undefined ? event.type : t(key)}</span>
        {where !== '' && <span className={css.arthasEventWhere}>{where}</span>}
        <span className={css.arthasEventMeta}>
          {[
            event.accessPoint ?? '',
            event.cost === undefined ? '' : durationOf(event.cost),
            event.classCount === undefined ? '' : `classCount=${event.classCount}`,
            event.methodCount === undefined ? '' : `methodCount=${event.methodCount}`,
            event.statusCode === undefined ? '' : `statusCode=${event.statusCode}`,
          ].filter(part => part !== '').join(' · ')}
        </span>
      </div>
      {event.value !== undefined && <pre className={css.arthasEventValue}>{event.value}</pre>}
      {event.message !== undefined && <p className={css.arthasEventValue}>{event.message}</p>}
    </article>
  )
}

/** 审计的一行。 */
function AuditRow({ row, t }: {
  readonly row: ArthasAuditView
  readonly t: TranslateNS<'yonPanel'>
}) {
  return (
    <div className={cn(css.arthasAuditRow, row.risky ? css.arthasAuditRisky : undefined)}>
      <span className={css.arthasAuditAt}>{clockOf(row.at)}</span>
      <span className={css.arthasAuditKind}>
        {row.risky ? `${row.kind} ⚠` : row.kind}
      </span>
      <span className={css.arthasAuditPid}>PID {row.pid}</span>
      <span className={css.arthasAuditCommand}>{row.command}</span>
      {row.outcome !== undefined && <span className={css.arthasAuditOutcome}>{row.outcome}</span>}
    </div>
  )
}

/**
 * Render the debugger surface.
 * @param props - composed slot props.
 * @returns the dialog.
 */
export function ArthasManager({
  t, onClose, panel, detail, attach, stop,
  replayPanel, replayRun, replayDiff, replayPrepare,
}: ArthasManagerProps) {
  const [tab, setTab] = useState<'observe' | 'replay'>('observe')
  const [state, setState] = useState<ArthasPanelPayload | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | undefined>(undefined)
  const [events, setEvents] = useState<ArthasSessionDetail | undefined>(undefined)

  // The newest `panel` function, so a reload triggered by a timer never calls a
  // stale closure after the host rebuilds the face.
  const reload = useRef(panel)
  reload.current = panel

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setState(await reload.current())
      setFailure(undefined)
    } catch (error) {
      setFailure(messageOf(error))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Only the opened session is polled. A whole-screen refresh runs `jps` and an
  // agent probe; as a heartbeat that would make a diagnostic tool into its own load.
  const opened = state?.sessions.find(session => session.id === openId)
  const watching = opened?.state === 'watching'
  useEffect(() => {
    if (openId === undefined) return undefined
    let live = true
    const read = async (): Promise<void> => {
      try {
        const answer = await detail(openId)
        if (live) setEvents(answer)
      } catch {
        // A poll that fails (the session vanished, the plugin restarted) is not worth
        // an error banner: the next successful whole-screen read says so properly.
      }
    }
    void read()
    if (!watching) return undefined
    const timer = setInterval(() => { void read() }, WATCH_POLL_MS)
    return () => { live = false; clearInterval(timer) }
  }, [openId, watching, detail])

  const onAttach = useCallback((pid: number): void => {
    setBusy(true)
    void attach(pid)
      .then(() => load())
      .catch((error: unknown) => { setFailure(messageOf(error)) })
      .finally(() => { setBusy(false) })
  }, [attach, load])

  const onStop = useCallback((id: string): void => {
    setBusy(true)
    void stop(id)
      .then(() => load())
      .catch((error: unknown) => { setFailure(messageOf(error)) })
      .finally(() => { setBusy(false) })
  }, [stop, load])

  const env = state?.env ?? []
  const agents = state?.agents
  const sessions = state?.sessions ?? []
  const audit = state?.audit ?? []

  return (
    <Modal
      open
      onClose={onClose}
      title={t('arthas.title')}
      closeLabel={t('arthas.close')}
      className={cn(base.manager)}
      contentClassName={cn(base.managerContent)}
    >
      {failure !== undefined && (
        <p className={css.arthasFailure} role="alert">
          <span>{t('arthas.failed', { message: failure })}</span>
          <Button size="sm" variant="outline" onClick={() => { void load() }}>{t('arthas.retry')}</Button>
        </p>
      )}

      <div className={cn(base.body, css.arthasScrollBody)}>
        {/* Two tabs rather than one long screen: observing and replaying are different
            jobs — the second is about history rather than about what is running now. */}
        <div className={css.arthasTabs}>
          {(['observe', 'replay'] as const).map(which => (
            <button
              key={which}
              type="button"
              className={cn(css.arthasTab, tab === which ? css.arthasTabOn : undefined)}
              aria-pressed={tab === which}
              onClick={() => { setTab(which) }}
            >
              {t(which === 'observe' ? 'arthas.tabObserve' : 'arthas.tabReplay')}
            </button>
          ))}
        </div>

        {tab === 'replay' && (
          <ReplayView
            t={t}
            replayPanel={replayPanel}
            replayRun={replayRun}
            replayDiff={replayDiff}
            replayPrepare={replayPrepare}
          />
        )}

        {tab === 'observe' && (
        <>
        <div className={css.arthasToolbar}>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
            {busy ? t('arthas.loading') : t('arthas.refresh')}
          </Button>
          <span className={css.arthasNote}>
            {env.length === 0
              ? t('arthas.envNone')
              : t('arthas.env', { list: env.map(one => one.version === '' ? one.id : `${one.id} ${one.version}`).join('、') })}
          </span>
        </div>

        {/* 这一屏最容易让人误会的是「这里能做什么」——所以第一句话就说清楚：看得到模型
            在服务里做了什么，而那两件改状态的事都跟工具是同一个调用。 */}
        <p className={css.arthasNote}>{t('arthas.intro')}</p>

        <section className={css.arthasSection}>
          <h3 className={css.arthasSectionTitle}>
            {t('arthas.targets')}
            <span className={css.arthasSectionHint}>{t('arthas.targetsHint', { port: agents?.port ?? 8563 })}</span>
          </h3>
          {agents?.error !== undefined && <p className={css.arthasNote}>{agents.error}</p>}
          {agents !== undefined && agents.error === undefined && agents.targets.length === 0 && (
            <p className={css.arthasEmpty}>{t('arthas.noTargets')}</p>
          )}
          {agents !== undefined && agents.targets.length > 0 && (
            <table className={css.arthasTargets}>
              <thead>
                <tr>
                  <th>{t('arthas.colPid')}</th>
                  <th>{t('arthas.colClass')}</th>
                  <th>{t('arthas.colAgent')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {agents.targets.map(target => (
                  <TargetRow
                    key={target.pid}
                    target={target}
                    hostPid={agents.agentPid}
                    busy={busy}
                    t={t}
                    onAttach={onAttach}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={css.arthasSection}>
          <h3 className={css.arthasSectionTitle}>
            {t('arthas.sessions')}
            <span className={css.arthasSectionHint}>{t('arthas.sessionsHint')}</span>
          </h3>
          {sessions.length === 0
            ? <p className={css.arthasEmpty}>{t('arthas.noSessions')}</p>
            : (
              <div className={css.arthasSessions}>
                {sessions.map(session => (
                  <div key={session.id} className={css.arthasSessionRow} data-open={openId === session.id ? 'true' : undefined}>
                    <button
                      type="button"
                      className={css.arthasSessionOpen}
                      aria-expanded={openId === session.id}
                      onClick={() => { setOpenId(openId === session.id ? undefined : session.id) }}
                    >
                      <span className={css.arthasSessionId}>#{session.id}</span>
                      <span className={css.arthasSessionState}>{t(SESSION_STATE_KEYS[session.state])}</span>
                      <span className={css.arthasSessionCommand}>{labelOf(session)}</span>
                      <span className={css.arthasSessionHits}>{t('arthas.hits', { hits: session.hits, expected: session.expected })}</span>
                    </button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { onStop(session.id) }}>
                      {t('arthas.stop')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          {opened !== undefined && (
            <div className={css.arthasEvents}>
              <p className={css.arthasNote}>{opened.command}</p>
              {opened.message !== undefined && <p className={css.arthasNote}>{opened.message}</p>}
              {(events?.events ?? []).length === 0
                ? <p className={css.arthasEmpty}>{watching ? t('arthas.waiting') : t('arthas.noEvents')}</p>
                : (events?.events ?? []).map((event, index) => (
                  <EventRow key={`${event.type}-${index}`} event={event} t={t} />
                ))}
            </div>
          )}
        </section>

        <section className={css.arthasSection}>
          <h3 className={css.arthasSectionTitle}>
            {t('arthas.audit')}
            <span className={css.arthasSectionHint}>{t('arthas.auditHint')}</span>
          </h3>
          {audit.length === 0
            ? <p className={css.arthasEmpty}>{t('arthas.noAudit')}</p>
            : (
              <div className={css.arthasAudit}>
                {audit.map(row => <AuditRow key={`${row.at}-${row.kind}-${row.command}`} row={row} t={t} />)}
              </div>
            )}
        </section>
        </>
        )}
      </div>
    </Modal>
  )
}
