/**
 * The knowledge base surface: every registered vault on one side, the selected
 * one's state on the other, and a way to rebuild an index that has fallen behind.
 *
 * Same shape as the other three surfaces, on purpose: the shared stylesheet
 * carries the pane split, the list, the property grid and the action row, and the
 * dialog chrome comes from `Modal`. What this file adds is only what a vault has
 * that a connection does not — an index, a page count, and the fact that a vault is
 * a directory on this machine rather than a set of credentials.
 *
 * Read-only by design. The two things a knowledge base needs from a panel are
 * seeing what is registered and refreshing what was indexed; adding a vault stays
 * a file edit, because a machine path is not something to invite somebody to type
 * into a browser field.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WikiLogEntry, WikiVaultView } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import type { WikiApi } from './api.ts'
import base from '../panel.module.css'
import css from './panel.module.css'

/** How much of a vault's log the detail pane shows. */
const HISTORY_LIMIT = 8

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
 * Render the knowledge base dialog.
 * @param props - the wiki API, the copy, and the close gesture.
 * @returns the dialog.
 */
export function WikiManager({ listVaults, rebuildVault, recentWrites, onClose, t }: WikiManagerProps) {
  const [vaults, setVaults] = useState<readonly WikiVaultView[]>([])
  const [selected, setSelected] = useState<string | undefined>(undefined)
  /** The vault being rebuilt, or `'*'` while every vault is. */
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  /** The vault's own history, newest first. */
  const [recent, setRecent] = useState<readonly WikiLogEntry[]>([])

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

  // The history follows the selection rather than being loaded once: a vault's log
  // is the whole point of showing it, and showing another vault's would be worse
  // than showing nothing.
  useEffect(() => {
    if (currentId === undefined) {
      setRecent([])
      return
    }
    let live = true
    void recentWrites(currentId, HISTORY_LIMIT)
      .then(entries => { if (live) setRecent(entries) })
      .catch(() => { if (live) setRecent([]) })
    return () => { live = false }
  }, [recentWrites, currentId, busy])

  const rebuild = async (vault?: string): Promise<void> => {
    setBusy(vault ?? '*')
    setFailure(undefined)
    try {
      const answer = await rebuildVault(vault)
      setVaults(answer.vaults)
    } catch (cause: unknown) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  const tabbable = selected ?? vaults[0]?.id
  const when = (vault: WikiVaultView): string => vault.indexedAt === undefined
    ? t('wiki.neverIndexed')
    : vault.indexedAt.slice(0, 19).replace('T', ' ')

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
                        onClick={() => { setSelected(vault.id) }}
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

              <dl className={cn(base.props)}>
                <dt className={cn(base.propLabel)}>{t('wiki.path')}</dt>
                <dd className={cn(base.propValue)}>
                  <span className={cn(css.mono)}>{current.path}</span>
                </dd>

                <dt className={cn(base.propLabel)}>{t('wiki.pages')}</dt>
                <dd className={cn(base.propValue)}>{current.ready ? current.pages : '—'}</dd>

                <dt className={cn(base.propLabel)}>{t('wiki.indexedAt')}</dt>
                <dd className={cn(base.propValue)}>{current.ready ? when(current) : '—'}</dd>

                <dt className={cn(base.propLabel)}>{t('wiki.state')}</dt>
                <dd className={cn(base.propValue)}>
                  {current.ready ? t('wiki.ready') : t('wiki.notReady')}
                </dd>
              </dl>

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

              <p className={cn(base.hint)}>{t('wiki.rebuildHint')}</p>

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
