/**
 * The dynamic fields of one project: one editable row per field, plus the row
 * that adds the next one.
 *
 * Two decisions are worth stating. A value saves when the row loses focus, so
 * typing stays cheap; the row - never the whole table - carries the result, so
 * a failure is reported where the operator is looking and never blocks the row
 * they moved on to. And a value is only parsed as JSON when it looks structured:
 * reading `13800138000` as a number would quietly round a phone number, so plain
 * text stays text.
 *
 * Removing a field asks first, in the same small dialog the rest of the product
 * uses for a destructive act; the row's own cross only opens it.
 */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { JsonValue } from '../../shared/types.ts'
import { cn } from '../cn.ts'
import { useComposingGuard } from './useComposing.ts'
import css from '../panel.module.css'

/** How long the "saved" note stays on a row before the row goes quiet again. */
const SAVED_LINGER_MS = 1600

/** How long the copy button holds its result before going quiet again. */
const COPY_LINGER_MS = 1600

/**
 * The copy glyph: two offset frames, drawn here rather than imported so the mark
 * does not track one harness release's icon names.
 * @returns the decorative svg.
 */
function CopyMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.5" y="5.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M10.5 3.5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The copy button's outcome glyph.
 * @returns the decorative svg.
 */
function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Per-row save state, owned here rather than by the project. */
type RowState = 'saving' | 'saved' | 'failed'

/**
 * Render a stored value into its editable text.
 * @param value - stored value.
 * @returns text the operator can edit; objects and arrays stay JSON.
 */
function formatValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * Read edited text back into a value.
 * @param text - what the operator typed.
 * @returns the parsed value for structured JSON, otherwise the text itself.
 */
function parseValue(text: string): JsonValue {
  const trimmed = text.trim()
  if (trimmed === '') return ''
  const structured = trimmed.startsWith('{') || trimmed.startsWith('[')
  const literal = trimmed === 'true' || trimmed === 'false' || trimmed === 'null'
  if (!structured && !literal) return text
  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    // A near-JSON typo stays exactly what was typed: a silently different value
    // is worse than an unparsed one.
    return text
  }
}

/** Props of one field row. */
interface FieldRowProps {
  fieldKey: string
  value: JsonValue
  state: RowState | undefined
  t: TranslateNS<'yonPanel'>
  onSave(text: string): void
  onRetry(text: string): void
  onAskRemove(): void
}

/**
 * Render one field: its name as the row label, its value editable in place.
 * @param props - field identity, stored value, row state, and the row's verbs.
 * @returns the row.
 */
function FieldRow({ fieldKey, value, state, t, onSave, onRetry, onAskRemove }: FieldRowProps) {
  const [text, setText] = useState(() => formatValue(value))
  // The copy result belongs to this row's button; nothing else needs to know.
  const [copy, setCopy] = useState<'copied' | 'failed'>()
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()

  // A store round trip republishes the value; a failed save leaves `value`
  // untouched, so the operator's text survives to be retried.
  useEffect(() => { setText(formatValue(value)) }, [value])

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  /** Put the row's current text on the clipboard and say what happened. */
  const copyValue = (): void => {
    const settleCopy = (outcome: 'copied' | 'failed'): void => {
      setCopy(outcome)
      if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => { setCopy(undefined) }, COPY_LINGER_MS)
    }
    // What is on screen is what leaves: an edit that is not saved yet still copies.
    void writeClipboard(text).then(
      accepted => { settleCopy(accepted ? 'copied' : 'failed') },
      () => { settleCopy('failed') },
    )
  }

  return (
    <div className={cn(css.fieldRow)}>
      <span className={cn(css.fieldKey)} title={fieldKey}>{fieldKey}</span>
      <Input
        className={cn(css.inputFill)}
        aria-label={`${fieldKey} · ${t('project.fieldValue')}`}
        aria-invalid={state === 'failed'}
        value={text}
        onChange={(event) => { setText(event.target.value) }}
        onBlur={() => { if (text !== formatValue(value)) onSave(text) }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          event.currentTarget.blur()
        }}
      />
      {state === 'failed'
        ? (
          <button type="button" className={cn(css.rowFailed)} onClick={() => { onRetry(text) }}>
            {t('project.fieldFailed')}
          </button>
        )
        : (
          <span className={cn(css.rowState)} role="status">
            {state === 'saving' ? t('project.fieldSaving') : state === 'saved' ? t('project.fieldSaved') : ''}
          </span>
        )}
      <button
        type="button"
        className={cn(
          css.rowIcon,
          copy === 'copied' ? css.rowCopied : undefined,
          copy === 'failed' ? css.rowCopyFailed : undefined,
        )}
        aria-label={copy === 'copied'
          ? t('project.copied')
          : copy === 'failed' ? t('project.copyFailed') : t('project.copyValueLabel', { name: fieldKey })}
        title={t('project.copyValue')}
        disabled={text === ''}
        onClick={copyValue}
      >
        {copy === 'copied' ? <CheckMark /> : <CopyMark />}
      </button>
      <button
        type="button"
        className={cn(css.rowIcon, css.rowRemove)}
        aria-label={`${t('project.fieldRemove')}: ${fieldKey}`}
        title={t('project.fieldRemove')}
        onClick={onAskRemove}
      >
        ×
      </button>
    </div>
  )
}

/** Props of the field table. */
export interface FieldTableProps {
  /** Project the rows belong to; changing it drops every draft and row state. */
  projectId: string
  /** Stored fields, keyed by the operator's own name. */
  fields: Record<string, JsonValue>
  /** Copy seat. */
  t: TranslateNS<'yonPanel'>
  /**
   * Store one field.
   * @param fieldKey - the field's name.
   * @param value - parsed value.
   */
  onSave(fieldKey: string, value: JsonValue): Promise<void>
  /**
   * Remove one field.
   * @param fieldKey - the field's name.
   */
  onRemove(fieldKey: string): Promise<void>
  /** Whether the "add a field" row is open. */
  adding: boolean
  /** Open or close the "add a field" row. */
  onAddingChange(adding: boolean): void
}

/**
 * Render the field table.
 * @param props - project identity, stored fields, and the table's verbs.
 * @returns the rows, the add-field row, and the removal confirmation.
 */
export function FieldTable({
  projectId, fields, t, onSave, onRemove, adding, onAddingChange,
}: FieldTableProps) {
  const guard = useComposingGuard()
  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [confirmingKey, setConfirmingKey] = useState<string>()
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')
  // Remounting the draft row after a successful add is what re-focuses its name
  // box, so several fields can be added without reaching for the mouse.
  const [draftGeneration, setDraftGeneration] = useState(0)
  const linger = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    setRowState({})
    setConfirmingKey(undefined)
    setDraftKey('')
    setDraftValue('')
    setDraftGeneration(0)
    onAddingChange(false)
    // A different project is a different table; nothing carries over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => () => {
    for (const timer of Object.values(linger.current)) clearTimeout(timer)
  }, [])

  const settle = (fieldKey: string, state: RowState): void => {
    setRowState(current => ({ ...current, [fieldKey]: state }))
    const previous = linger.current[fieldKey]
    if (previous !== undefined) clearTimeout(previous)
    if (state !== 'saved') return
    linger.current[fieldKey] = setTimeout(() => {
      setRowState((current) => {
        const next = { ...current }
        delete next[fieldKey]
        return next
      })
    }, SAVED_LINGER_MS)
  }

  const store = (fieldKey: string, value: JsonValue): void => {
    settle(fieldKey, 'saving')
    void onSave(fieldKey, value).then(
      () => { settle(fieldKey, 'saved') },
      () => { settle(fieldKey, 'failed') },
    )
  }

  const addDraft = (): void => {
    const key = draftKey.trim()
    if (key === '') return
    store(key, parseValue(draftValue))
    setDraftKey('')
    setDraftValue('')
    setDraftGeneration(generation => generation + 1)
  }

  const confirmRemove = (): void => {
    const fieldKey = confirmingKey
    if (fieldKey === undefined) return
    setConfirmingKey(undefined)
    void onRemove(fieldKey).then(
      () => {
        setRowState((current) => {
          const next = { ...current }
          delete next[fieldKey]
          return next
        })
      },
      () => { settle(fieldKey, 'failed') },
    )
  }

  const entries = Object.entries(fields)

  return (
    <div className={cn(css.fields)}>
      <div className={cn(css.fieldsHead)}>
        <span className={cn(css.sectionTitle)}>{t('project.fields')}</span>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { onAddingChange(true) }}
          >
            + {t('project.addField')}
          </Button>
        )}
      </div>

      {entries.length === 0 && !adding && (
        <p className={cn(css.note)}>{t('project.fieldsEmpty')}</p>
      )}

      {entries.map(([fieldKey, value]) => (
        <FieldRow
          key={fieldKey}
          fieldKey={fieldKey}
          value={value}
          state={rowState[fieldKey]}
          t={t}
          onSave={(text) => { store(fieldKey, parseValue(text)) }}
          onRetry={(text) => { store(fieldKey, parseValue(text)) }}
          onAskRemove={() => { setConfirmingKey(fieldKey) }}
        />
      ))}

      {adding && (
        <div className={cn(css.fieldRow)} key={draftGeneration}>
          <Input
            className={cn(css.inputFill, css.draftKey)}
            aria-label={t('project.fieldKey')}
            placeholder={t('project.fieldKeyPlaceholder')}
            value={draftKey}
            autoFocus
            onChange={(event) => { setDraftKey(event.target.value) }}
            onCompositionStart={guard.onCompositionStart}
            onCompositionEnd={guard.onCompositionEnd}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { onAddingChange(false); return }
              if (event.key !== 'Enter' || guard.isComposing(event)) return
              event.preventDefault()
              addDraft()
            }}
          />
          <Input
            className={cn(css.inputFill)}
            aria-label={t('project.fieldValue')}
            placeholder={t('project.fieldValuePlaceholder')}
            value={draftValue}
            onChange={(event) => { setDraftValue(event.target.value) }}
            onCompositionStart={guard.onCompositionStart}
            onCompositionEnd={guard.onCompositionEnd}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { onAddingChange(false); return }
              if (event.key !== 'Enter' || guard.isComposing(event)) return
              event.preventDefault()
              addDraft()
            }}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={draftKey.trim() === ''}
            onClick={addDraft}
          >
            {t('project.fieldAdd')}
          </Button>
          <button
            type="button"
            className={cn(css.rowIcon)}
            aria-label={t('project.cancel')}
            title={t('project.cancel')}
            onClick={() => { onAddingChange(false) }}
          >
            ×
          </button>
        </div>
      )}

      {entries.length > 0 && <p className={cn(css.hint)}>{t('project.fieldsHint')}</p>}

      <Modal
        open={confirmingKey !== undefined}
        onClose={() => { setConfirmingKey(undefined) }}
        title={t('project.fieldRemove')}
        closeLabel={t('project.cancel')}
        description={t('project.fieldRemoveConfirm', { name: confirmingKey ?? '' })}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setConfirmingKey(undefined) }}>
              {t('project.cancel')}
            </Button>
            <Button variant="outline" className={cn(css.dangerButton)} onClick={confirmRemove}>
              {t('project.fieldRemoveYes')}
            </Button>
          </>
        )}
      />
    </div>
  )
}
