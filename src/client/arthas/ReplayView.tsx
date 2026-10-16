/**
 * 面板页签 B：现场重放。
 *
 * ## 这一屏为什么值得单独存在
 *
 * 整条离线回放链的价值全在**反馈回路**上：一次改动跑同一个现场，四秒出结果。工具那一半
 * 已经能跑，但「跑完有没有变、变成什么样」在工具的输出里是一大段文本。这一屏把**两次回放
 * 摆在一起**，差异行直接标出来 —— 那才是设计文档里说的「给人看的、可视的回归验证」。
 *
 * ## 为什么忽略 cost 头
 *
 * 实测：同一个 dump 跑两次，只有 `# cost=Nms` 那一行不同。不排除它，每一次对比都会报
 * 「有差异」，而一个总是报差异的工具就是没人读的工具 —— 那正是这个模块存在的意义反过来。
 *
 * ## 一键重放的条件
 *
 * 「重放」按钮只在 dump 带**来源侧车**时可用（`arthas_capture` 抓的时候顺手写的那份
 * json）。没有它就得自己填类名、方法名、表达式、环境 —— 四个字段，而这四个字段正是
 * 「让人重新打一遍他刚才已经打过的东西」，恰恰是离线循环想省掉的。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ReplayDiff, ReplayDump, ReplayEnvironment, ReplayPanelPayload, ReplayRun,
} from '../../shared/types.ts'
import { cn } from '../cn.ts'
import { clockOf, durationOf, type ReplayApi } from './api.ts'
import css from './panel.module.css'

/** Props of tab B: the replay operations and the copy seat. */
export interface ReplayViewProps extends ReplayApi {
  readonly t: TranslateNS<'yonPanel'>
}

/** 一条异常报出来的话。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 字节数写成人读的样子。 */
function bytesOf(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
  return `${Math.round(value / 104857.6) / 10} MB`
}

/** 一次回放的一行。 */
function RunRow({ run, selected, onPick, t }: {
  readonly run: ReplayRun
  readonly selected: boolean
  onPick(): void
  readonly t: TranslateNS<'yonPanel'>
}) {
  return (
    <div className={cn(css.arthasSessionRow, selected ? css.arthasAuditRisky : undefined)}>
      <button type="button" className={css.arthasSessionOpen} onClick={onPick}>
        <span className={css.arthasSessionId}>{run.ok ? '✅' : '❌'}</span>
        <span className={css.arthasSessionCommand}>{run.className}#{run.methodName}</span>
        <span className={css.arthasSessionHits}>
          {run.costMs === undefined ? '' : durationOf(run.costMs)}
        </span>
        <span className={css.arthasSessionState}>{clockOf(run.at)}</span>
      </button>
    </div>
  )
}

/**
 * Render the replay surface.
 * @param props - the replay API and the copy seat.
 * @returns the tab body.
 */
export function ReplayView({ t, replayPanel, replayRun, replayDiff, replayPrepare }: ReplayViewProps) {
  const [state, setState] = useState<ReplayPanelPayload | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<readonly string[]>([])
  const [diff, setDiff] = useState<ReplayDiff | undefined>(undefined)
  const [shown, setShown] = useState<string | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setState(await replayPanel())
      setFailure(undefined)
    } catch (error) {
      setFailure(messageOf(error))
    } finally {
      setBusy(false)
    }
  }, [replayPanel])

  useEffect(() => { void load() }, [load])

  const environments = state?.environments ?? []
  const dumps = state?.dumps ?? []
  const runs = state?.runs ?? []
  const firstEnv = environments[0]?.id

  /** 一键重放：用 dump 自己的来源 + 第一个环境。 */
  const onReplay = useCallback((dump: ReplayDump): void => {
    const origin = dump.origin
    if (origin === undefined || firstEnv === undefined) return
    setBusy(true)
    void replayRun({
      env: firstEnv,
      dump: dump.name,
      className: origin.className,
      methodName: origin.methodName,
    })
      .then(run => { setShown(run.output); return load() })
      .catch((error: unknown) => { setFailure(messageOf(error)) })
      .finally(() => { setBusy(false) })
  }, [replayRun, load, firstEnv])

  const onPick = useCallback((id: string): void => {
    setPicked(previous => {
      if (previous.includes(id)) return previous.filter(one => one !== id)
      // 只留两条：对比是两两的，第三条会把界面变成一个需要解释的状态。
      return [...previous, id].slice(-2)
    })
    setDiff(undefined)
  }, [])

  const onDiff = useCallback((): void => {
    const [left, right] = picked
    if (left === undefined || right === undefined) return
    setBusy(true)
    void replayDiff(left, right)
      .then(setDiff)
      .catch((error: unknown) => { setFailure(messageOf(error)) })
      .finally(() => { setBusy(false) })
  }, [picked, replayDiff])

  return (
    <div>
      <div className={css.arthasToolbar}>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { void load() }}>
          {busy ? t('arthas.loading') : t('arthas.refresh')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || picked.length !== 2}
          onClick={onDiff}
        >
          {t('arthas.replayCompare')}
        </Button>
        {picked.length > 0 && <span className={css.arthasNote}>{t('arthas.replayPicked', { count: picked.length })}</span>}
      </div>

      {failure !== undefined && <p className={css.arthasFailure} role="alert">{failure}</p>}
      <p className={css.arthasNote}>{t('arthas.replayIntro')}</p>

      <section className={css.arthasSection}>
        <h3 className={css.arthasSectionTitle}>
          {t('arthas.replayDumps')}
          <span className={css.arthasSectionHint}>{t('arthas.replayDumpsHint')}</span>
        </h3>
        {dumps.length === 0
          ? <p className={css.arthasEmpty}>{t('arthas.replayNoDumps')}</p>
          : (
            <div className={css.arthasSessions}>
              {dumps.map(dump => (
                <div key={dump.name} className={css.arthasSessionRow}>
                  <span className={css.arthasSessionOpen}>
                    <span className={css.arthasSessionCommand}>{dump.name}</span>
                    <span className={css.arthasSessionHits}>{bytesOf(dump.bytes)}</span>
                    <span className={css.arthasSessionState}>
                      {dump.origin === undefined
                        ? t('arthas.replayNoOrigin')
                        : `${dump.origin.className}#${dump.origin.methodName}`}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || dump.origin === undefined || firstEnv === undefined}
                    title={firstEnv === undefined ? t('arthas.replayNeedEnv') : undefined}
                    onClick={() => { onReplay(dump) }}
                  >
                    {t('arthas.replayGo')}
                  </Button>
                </div>
              ))}
            </div>
          )}
      </section>

      <section className={css.arthasSection}>
        <h3 className={css.arthasSectionTitle}>
          {t('arthas.replayEnvs')}
          <span className={css.arthasSectionHint}>{t('arthas.replayEnvsHint')}</span>
        </h3>
        {environments.length === 0
          ? <p className={css.arthasEmpty}>{t('arthas.replayNoEnvs')}</p>
          : (
            <div className={css.arthasAudit}>
              {environments.map(environment => (
                <div key={environment.id} className={css.arthasAuditRow}>
                  <span className={css.arthasAuditKind}>{environment.id}</span>
                  <span className={css.arthasAuditCommand}>{environment.className}</span>
                  <span className={css.arthasAuditOutcome}>
                    {t('arthas.replayEnvDetail', { entries: environment.entries, size: bytesOf(environment.jarBytes) })}
                  </span>
                </div>
              ))}
            </div>
          )}
      </section>

      <section className={css.arthasSection}>
        <h3 className={css.arthasSectionTitle}>
          {t('arthas.replayRuns')}
          <span className={css.arthasSectionHint}>{t('arthas.replayRunsHint')}</span>
        </h3>
        {runs.length === 0
          ? <p className={css.arthasEmpty}>{t('arthas.replayNoRuns')}</p>
          : (
            <div className={css.arthasSessions}>
              {runs.map(run => (
                <RunRow
                  key={run.id}
                  run={run}
                  selected={picked.includes(run.id)}
                  onPick={() => { onPick(run.id) }}
                  t={t}
                />
              ))}
            </div>
          )}
      </section>

      {diff !== undefined && (
        <section className={css.arthasSection}>
          <h3 className={css.arthasSectionTitle}>
            {diff.changed === 0 ? t('arthas.replaySame') : t('arthas.replayChanged', { count: diff.changed })}
          </h3>
          <div className={css.arthasEvents}>
            {diff.lines.filter(line => line.kind !== 'same').map((line, index) => (
              <article
                key={`${line.kind}-${index}`}
                className={cn(css.arthasEvent, line.kind === 'right' ? css.arthasAuditRisky : css.arthasEventFailed)}
              >
                <pre className={css.arthasEventValue}>
                  {(line.kind === 'left' ? '- ' : '+ ') + line.text}
                </pre>
              </article>
            ))}
            {diff.ignored.length > 0 && (
              <p className={css.arthasNote}>{t('arthas.replayIgnored', { list: diff.ignored.join('、') })}</p>
            )}
          </div>
        </section>
      )}

      {shown !== undefined && (
        <section className={css.arthasSection}>
          <h3 className={css.arthasSectionTitle}>{t('arthas.replayLast')}</h3>
          <pre className={css.arthasEventValue}>{shown}</pre>
        </section>
      )}
    </div>
  )
}
