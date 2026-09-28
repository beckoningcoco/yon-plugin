/**
 * The knowledge base surface: which vaults are registered, how much is in them,
 * and a way to rebuild an index that has fallen behind.
 *
 * Read-only by design. The two things a knowledge base needs are here — seeing
 * what is registered, and refreshing what was indexed — while adding a vault stays
 * a file edit, because a vault path is a fact about this machine rather than
 * something the panel should invite someone to type by hand into a browser.
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WikiVaultView } from '../../shared/types.ts'
import type { WikiApi } from './api.ts'
import css from './panel.module.css'

/** Props the entry hands this surface. */
export interface WikiManagerProps extends WikiApi, PropsLocale<'yonPanel'> {
  /** Close the surface. */
  onClose(): void
}

/** One vault as a card: what it is, what it holds, and how to refresh it. */
function VaultCard({ vault, busy, onRebuild, t }: {
  vault: WikiVaultView
  busy: boolean
  onRebuild(vault: string): void
  t: WikiManagerProps['t']
}) {
  const when = vault.indexedAt === undefined
    ? t('wiki.neverIndexed')
    : vault.indexedAt.slice(0, 19).replace('T', ' ')

  return (
    <li className={css.card}>
      <div className={css.cardHead}>
        <span className={css.cardTitle}>{vault.label}</span>
        <span className={css.badge}>{vault.id}</span>
        {!vault.ready && <span className={css.badgeWarn}>{t('wiki.notReady')}</span>}
      </div>
      <div className={css.path}>{vault.path}</div>
      <div className={css.stats}>
        <span>{t('wiki.pages').replace('{count}', String(vault.pages))}</span>
        <span>·</span>
        <span>{t('wiki.indexedAt')} {when}</span>
      </div>
      <div className={css.actions}>
        <button
          type="button"
          className={css.button}
          disabled={busy || !vault.ready}
          onClick={() => { onRebuild(vault.id) }}
        >
          {busy ? t('wiki.rebuilding') : t('wiki.rebuild')}
        </button>
      </div>
    </li>
  )
}

/**
 * Render the knowledge base dialog.
 * @param props - the wiki API, the copy, and the close gesture.
 * @returns the dialog.
 */
export function WikiManager({ listVaults, rebuildVault, onClose, t }: WikiManagerProps) {
  const [vaults, setVaults] = useState<readonly WikiVaultView[]>([])
  const [busy, setBusy] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const answer = await listVaults()
      setVaults(answer.vaults)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [listVaults])

  useEffect(() => { void load() }, [load])

  const rebuild = async (vault?: string): Promise<void> => {
    setBusy(vault ?? 'all')
    setError(undefined)
    try {
      const answer = await rebuildVault(vault)
      setVaults(answer.vaults)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className={css.backdrop} role="presentation" onMouseDown={onClose}>
      <div
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('wiki.title')}
        onMouseDown={event => { event.stopPropagation() }}
      >
        <header className={css.head}>
          <h2 className={css.title}>{t('wiki.title')}</h2>
          <button type="button" className={css.close} onClick={onClose} aria-label={t('wiki.close')}>
            ×
          </button>
        </header>

        {error !== undefined && <p className={css.error}>{error}</p>}

        {loading
          ? <p className={css.empty}>{t('wiki.loading')}</p>
          : vaults.length === 0
            ? <p className={css.empty}>{t('wiki.empty')}</p>
            : (
              <ul className={css.list}>
                {vaults.map(vault => (
                  <VaultCard
                    key={vault.id}
                    vault={vault}
                    busy={busy !== undefined}
                    onRebuild={(id) => { void rebuild(id) }}
                    t={t}
                  />
                ))}
              </ul>
            )}

        <footer className={css.foot}>
          <button
            type="button"
            className={css.button}
            disabled={busy !== undefined || vaults.length === 0}
            onClick={() => { void rebuild() }}
          >
            {busy === 'all' ? t('wiki.rebuilding') : t('wiki.rebuildAll')}
          </button>
          <button type="button" className={css.buttonGhost} disabled={loading} onClick={() => { void load() }}>
            {t('wiki.refresh')}
          </button>
        </footer>
      </div>
    </div>
  )
}
