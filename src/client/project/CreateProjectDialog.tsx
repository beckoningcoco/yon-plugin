/**
 * Creating a project is one short form, so it happens in the framework's own
 * dialog: a mask to hold attention, Escape and the close button to leave, and
 * the page's focus returned to whatever opened it.
 *
 * The dialog owns its draft and its own failure text; the caller owns the call
 * and the decision to close, because only the caller knows what a created
 * project means to the rest of the surface.
 */
import { useEffect } from 'react'
import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { cn } from '../cn.ts'
import { useComposingGuard } from './useComposing.ts'
import css from '../panel.module.css'

/** What the dialog hands back on create. */
export interface CreateProjectDraft {
  /** Trimmed, non-empty name. */
  readonly name: string
  /** Trimmed code; empty when the operator left it alone. */
  readonly code: string
}

/** Props of the create dialog. */
export interface CreateProjectDialogProps {
  /** Whether the dialog is showing. */
  open: boolean
  /** Copy seat. */
  t: TranslateNS<'yonPanel'>
  /** Leave without creating. */
  onCancel(): void
  /**
   * Create the project. A rejection is reported inside the dialog, which stays
   * open so the operator can correct the name instead of retyping it.
   * @param draft - the trimmed name and code.
   */
  onCreate(draft: CreateProjectDraft): Promise<void>
}

/**
 * Render the create-project dialog.
 * @param props - open state, copy, cancel and create verbs.
 * @returns the dialog, or nothing while it is closed.
 */
export function CreateProjectDialog({ open, t, onCancel, onCreate }: CreateProjectDialogProps) {
  const guard = useComposingGuard()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  // Every opening starts from an empty form: a draft from the last attempt is
  // never silently reused.
  useEffect(() => {
    if (!open) return
    setName('')
    setCode('')
    setError(undefined)
    setBusy(false)
  }, [open])

  const submit = (): void => {
    const trimmed = name.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    setError(undefined)
    void onCreate({ name: trimmed, code: code.trim() })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => { setBusy(false) })
  }

  const onEnter = (event: { key: string; preventDefault(): void }): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('project.createTitle')}
      closeLabel={t('project.cancel')}
      description={t('project.createHint')}
      footer={(
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>{t('project.cancel')}</Button>
          <Button variant="primary" disabled={busy || name.trim() === ''} onClick={submit}>
            {busy ? t('project.createBusy') : t('project.createConfirm')}
          </Button>
        </>
      )}
    >
      <div className={cn(css.form)}>
        <div className={cn(css.formRow)}>
          <span className={cn(css.formLabel)}>{t('project.name')}</span>
          <Input
            className={cn(css.inputFill)}
            aria-label={t('project.name')}
            placeholder={t('project.namePlaceholder')}
            value={name}
            autoFocus
            disabled={busy}
            onChange={event => { setName(event.target.value) }}
            onCompositionStart={guard.onCompositionStart}
            onCompositionEnd={guard.onCompositionEnd}
            onKeyDown={(event) => {
              if (guard.isComposing(event)) return
              onEnter(event)
            }}
          />
        </div>
        <div className={cn(css.formRow)}>
          <span className={cn(css.formLabel)}>{t('project.code')}</span>
          <Input
            className={cn(css.inputFill)}
            aria-label={t('project.code')}
            placeholder={t('project.codePlaceholder')}
            value={code}
            disabled={busy}
            onChange={event => { setCode(event.target.value) }}
            onCompositionStart={guard.onCompositionStart}
            onCompositionEnd={guard.onCompositionEnd}
            onKeyDown={(event) => {
              if (guard.isComposing(event)) return
              onEnter(event)
            }}
          />
        </div>
        {error !== undefined && (
          <p className={cn(css.formError)} role="alert">{t('project.actionFailed', { message: error })}</p>
        )}
      </div>
    </Modal>
  )
}
