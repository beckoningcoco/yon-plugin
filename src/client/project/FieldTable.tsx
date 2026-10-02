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
 * A value is read as text and becomes an input only once it is clicked. A value
 * can be long - a whole 联调记录, a whole connection string - and a box that is
 * always an input hides the tail of it behind the cursor; read as text it wraps
 * and shows itself. Structured values (an object, an array, or a JSON *string*,
 * which is how the real stores hold a datasource config) are read as a key-value
 * list rather than a blob of JSON; only a container nested deeper than one level
 * falls back to indented JSON. Editing always starts from the text that is
 * stored, so an edit that changes nothing writes nothing.
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

/** How one stored value reads. */
type FieldRead =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'pairs'; readonly rows: readonly FieldPair[] }
  | { readonly kind: 'json'; readonly text: string }

/** One line of the key-value list. */
interface FieldPair {
  /** The key: an object's own key, or {@link FIELD_ITEM_MARK} for an array entry. */
  readonly key: string
  /** The value as a scalar: a string verbatim, anything else as JSON spells it. */
  readonly value: string
}

/**
 * What an array entry shows in the key column. Not an index: `0` and `1` read
 * like data, while this mark only says "here is one of them".
 */
const FIELD_ITEM_MARK = '·'

/**
 * Read a value as a container, or `undefined` when it is not one.
 *
 * Two sources, and the second is the one that matters in practice: the value is
 * an object or an array, or the value is a *string* that looks like JSON. The
 * panel stores JSON when it can parse it, but a value typed by hand into the
 * store - a datasource config, a password vault entry - arrives as one long
 * string, and dumping that string into a row is exactly the report this fixes.
 * @param value - stored value.
 * @returns the container, or `undefined` for anything read as plain text.
 */
function asContainer(value: JsonValue): Record<string, JsonValue> | JsonValue[] | undefined {
  if (value !== null && typeof value === 'object') return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return parsed !== null && typeof parsed === 'object'
      ? parsed as Record<string, JsonValue> | JsonValue[]
      : undefined
  } catch {
    // Half-written JSON stays itself: showing the text as typed beats an error
    // and beats an empty row.
    return undefined
  }
}

/**
 * The key-value pairs of a flat container, or `undefined` once it nests.
 *
 * A nest deeper than one level falls back to JSON rather than indenting: this
 * grid is where a value is glanced at, and an indented key-value list two levels
 * down is harder to read than the JSON it came from. Whoever wants structure has
 * the knowledge panel's tree.
 * @param container - the value read as a container.
 * @returns one row per entry, or `undefined` when any entry is itself a container.
 */
function flatPairs(container: Record<string, JsonValue> | JsonValue[]): readonly FieldPair[] | undefined {
  const items: readonly (readonly [string, JsonValue])[] = Array.isArray(container)
    ? container.map((item, index): readonly [string, JsonValue] => [String(index), item])
    : Object.entries(container)
  const rows: FieldPair[] = []
  for (const [key, item] of items) {
    if (item !== null && typeof item === 'object') return undefined
    rows.push({ key: Array.isArray(container) ? FIELD_ITEM_MARK : key, value: scalarText(item) })
  }
  // An empty container has no rows to list; let it take the JSON path, where at
  // least the `{}` or `[]` that is stored can be seen.
  return rows.length === 0 ? undefined : rows
}

/**
 * Render a scalar as JSON spells it, except a string, which is itself.
 * @param value - a non-container value.
 * @returns its display text.
 */
function scalarText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * Decide how one stored value reads.
 * @param value - stored value.
 * @returns the text, the key-value list, or indented JSON.
 */
function readValue(value: JsonValue): FieldRead {
  const container = asContainer(value)
  if (container === undefined) return { kind: 'text', text: formatValue(value) }
  const rows = flatPairs(container)
  if (rows === undefined) return { kind: 'json', text: JSON.stringify(container, null, 2) }
  return { kind: 'pairs', rows }
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
  // A value is read as text until it is clicked: see the file header.
  const [editing, setEditing] = useState(false)
  // The copy result belongs to this row's button; nothing else needs to know.
  const [copy, setCopy] = useState<'copied' | 'failed'>()
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()

  // A store round trip republishes the value; a failed save leaves `value`
  // untouched, so the operator's text survives to be retried.
  useEffect(() => { setText(formatValue(value)) }, [value])

  // The row state closes the editor: a save that landed puts the value back to
  // being read, and a save that failed reopens it with the text still in it,
  // which is what makes the retry on that row mean "this text again".
  useEffect(() => {
    if (state === undefined) return
    setEditing(state === 'failed')
  }, [state])

  useEffect(() => () => {
    if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
  }, [])

  const read = readValue(value)
  // Reading a key-value list still copies the value as stored - one JSON blob -
  // because that is the form it is pasted into anything else as.
  const copyText = editing ? text : formatValue(value)
  const valueLabel = `${fieldKey} · ${t('project.fieldValue')}`

  /** Put the row's current text on the clipboard and say what happened. */
  const copyValue = (): void => {
    const settleCopy = (outcome: 'copied' | 'failed'): void => {
      setCopy(outcome)
      if (copyTimer.current !== undefined) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => { setCopy(undefined) }, COPY_LINGER_MS)
    }
    // What is on screen is what leaves: an edit that is not saved yet still copies.
    void writeClipboard(copyText).then(
      accepted => { settleCopy(accepted ? 'copied' : 'failed') },
      () => { settleCopy('failed') },
    )
  }

  /** Leave the editor: an edit that changed nothing is not a write. */
  const commit = (): void => {
    setEditing(false)
    if (text === formatValue(value)) return
    onSave(text)
  }

  return (
    // An editor is always the row's second line, whatever the value reads like;
    // a read key-value list is one too. Only read text keeps the value column.
    <div className={cn(css.fieldRow, (editing || read.kind !== 'text') && css.fieldRowWide)}>
      <span className={cn(css.fieldKey)} title={fieldKey}>{fieldKey}</span>
      {editing
        ? (
          <textarea
            className={cn(css.valueEditor)}
            aria-label={valueLabel}
            aria-invalid={state === 'failed'}
            rows={1}
            value={text}
            autoFocus
            onChange={(event) => { setText(event.target.value) }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setText(formatValue(value))
                setEditing(false)
                return
              }
              if (event.key !== 'Enter') return
              event.preventDefault()
              event.currentTarget.blur()
            }}
          />
        )
        : (
          <button
            type="button"
            className={cn(
              css.inlineText,
              css.inlineValue,
              css.fieldValueRead,
              read.kind === 'text' && read.text === '' && css.inlineEmpty,
            )}
            aria-label={valueLabel}
            title={read.kind === 'text' ? (read.text === '' ? t('project.fieldValuePlaceholder') : read.text) : formatValue(value)}
            onClick={() => { setEditing(true) }}
          >
            {read.kind === 'text' && (read.text === '' ? t('project.fieldValuePlaceholder') : read.text)}
            {read.kind === 'pairs' && (
              <span className={cn(css.valueGrid)}>
                {read.rows.flatMap((row, index) => [
                  <span key={`key-${index}`} className={cn(css.valueGridKey)}>{row.key}</span>,
                  <span key={`value-${index}`} className={cn(css.valueGridValue)}>{row.value}</span>,
                ])}
              </span>
            )}
            {read.kind === 'json' && <span className={cn(css.valueJson)}>{read.text}</span>}
          </button>
        )}
      {state === 'failed' && (
        <button type="button" className={cn(css.rowFailed)} onClick={() => { onRetry(text) }}>
          {t('project.fieldFailed')}
        </button>
      )}
      {/* The row's trailing slot: the save state and the two actions share one
          width, so a save never reflows the value beside them. While the state
          is up the actions step aside — a word and two glyphs at once is 116px
          of a 377px row. The state's own span stays mounted either way, because
          a live region has to be in the document before its text arrives for a
          screen reader to read that text out. */}
      <span className={cn(css.rowTrail)}>
        <span className={cn(css.rowState)} role="status">
          {state === 'saving' ? t('project.fieldSaving') : state === 'saved' ? t('project.fieldSaved') : ''}
        </span>
        {state === undefined && (
          <>
            <button
              type="button"
              className={cn(
                css.rowIcon,
                css.rowAction,
                copy === 'copied' ? css.rowCopied : undefined,
                copy === 'failed' ? css.rowCopyFailed : undefined,
              )}
              aria-label={copy === 'copied'
                ? t('project.copied')
                : copy === 'failed' ? t('project.copyFailed') : t('project.copyValueLabel', { name: fieldKey })}
              title={t('project.copyValue')}
              disabled={copyText === ''}
              onClick={copyValue}
            >
              {copy === 'copied' ? <CheckMark /> : <CopyMark />}
            </button>
            <button
              type="button"
              className={cn(css.rowIcon, css.rowAction, css.rowRemove)}
              aria-label={`${t('project.fieldRemove')}: ${fieldKey}`}
              title={t('project.fieldRemove')}
              onClick={onAskRemove}
            >
              ×
            </button>
          </>
        )}
      </span>
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
