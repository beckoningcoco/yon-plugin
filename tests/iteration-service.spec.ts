/**
 * The service's three rules, which are what make the ledger worth reading: a row is
 * always open when it lands, a model's repeat is not a second row, and a document
 * that cannot be read is never written over.
 *
 * Every case passes its own scratch document. The default path is the operator's
 * own ledger, and a spec that appended to it would be recording notes about this
 * plugin on the machine running the suite.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIterationStore } from '../src/host/iteration-store.ts'
import {
  createYonIterationService, IterationError, type YonIterationService,
} from '../src/host/iteration-service.ts'
import type { SaveIterationInput } from '../src/shared/types.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A ledger in its own scratch directory, plus the path it lives at. */
async function ledger(): Promise<{ service: YonIterationService, path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-iteration-service-'))
  temporary.push(dir)
  const path = join(dir, 'iteration.json')
  return { service: createYonIterationService(createIterationStore(path)), path }
}

/** The smallest filing the model can make. */
const MINIMAL: SaveIterationInput = { kind: 'gap', symptom: '为了拿到表名绕了三步' }

/** Record one note, with dedupe off unless the case asks for it. */
async function file(
  service: YonIterationService,
  input: Partial<SaveIterationInput> & Pick<SaveIterationInput, 'kind' | 'symptom'>,
  options?: { readonly dedupe?: boolean },
) {
  return await service.create({ ...input }, options)
}

/** The error a call threw, or a failed assertion saying it did not throw. */
async function refusal(work: Promise<unknown>): Promise<IterationError> {
  try {
    await work
  } catch (error) {
    expect(error).toBeInstanceOf(IterationError)
    return error as IterationError
  }
  throw new Error('expected the call to be refused, but it resolved')
}

describe('YonIterationService.create', () => {
  it('stamps every row with its own id and the host\'s clock', async () => {
    const { service } = await ledger()
    const before = new Date().toISOString()
    const created = await Promise.all(Array.from({ length: 10 }, async (_, index) =>
      await file(service, { ...MINIMAL, symptom: `症状 ${index}` })))

    const ids = created.map(entry => entry.row.id)
    expect(new Set(ids).size).toBe(10)
    // The model cannot pass a timestamp — the session has no trustworthy clock — so
    // the host's own read is the only one on every row.
    for (const entry of created) {
      expect(entry.row.at >= before).toBe(true)
      expect(Number.isNaN(Date.parse(entry.row.at))).toBe(false)
    }
  })

  it('files a row from the two required fields alone', async () => {
    const { service } = await ledger()
    const { row, created } = await file(service, MINIMAL)
    expect(created).toBe(true)
    expect(row.kind).toBe('gap')
    expect(row.symptom).toBe(MINIMAL.symptom)
    // A default that is not `medium` would make the operator triage rows the model
    // never graded, which is how a ledger becomes a backlog.
    expect(row.severity).toBe('medium')
    expect(row.status).toBe('open')
    expect(row.scene).toBe('')
    expect(row.suggestion).toBe('')
  })

  it('trims free text and refuses an empty symptom', async () => {
    const { service } = await ledger()
    const { row } = await file(service, { kind: 'improvement', symptom: '  绕路了  ', target: ' wiki_lookup ' })
    expect(row.symptom).toBe('绕路了')
    expect(row.target).toBe('wiki_lookup')

    const error = await refusal(file(service, { kind: 'gap', symptom: '   ' }))
    expect(error.code).toBe('invalid-input')
    expect(error.message).toContain('symptom')
  })

  it('refuses a value outside a declared enum, naming the field', async () => {
    const { service } = await ledger()
    const kind = await refusal(service.create({ kind: 'bug' as never, symptom: 'x' }))
    expect(kind.code).toBe('invalid-input')
    expect(kind.message).toContain('kind')

    const severity = await refusal(service.create({ kind: 'gap', symptom: 'x', severity: 'urgent' as never }))
    expect(severity.message).toContain('severity')

    // Nothing landed: a refused filing must not leave a half-built row behind.
    expect((await service.list()).rows).toEqual([])
  })

  it('refuses text long past a readable length', async () => {
    const { service } = await ledger()
    const error = await refusal(file(service, { kind: 'gap', symptom: 'x'.repeat(2001) }))
    expect(error.code).toBe('invalid-input')
    expect(error.message).toContain('2001')
  })
})

describe('YonIterationService dedupe', () => {
  it('answers a repeat with the row already filed', async () => {
    const { service } = await ledger()
    const input = { kind: 'gap' as const, symptom: '同一件事', target: 'wiki_lookup' }
    const first = await file(service, input, { dedupe: true })
    const second = await file(service, input, { dedupe: true })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    // The id comes back so the caller can say 「这条已经记过了」 with something to
    // point at, rather than filing a twin the operator has to notice and merge.
    expect(second.row.id).toBe(first.row.id)
    expect((await service.list()).rows).toHaveLength(1)
  })

  it('appends when the row already filed is no longer open', async () => {
    const { service } = await ledger()
    const input = { kind: 'gap' as const, symptom: '同一件事', target: 'wiki_lookup' }
    const first = await file(service, input, { dedupe: true })
    await service.update(first.row.id, { status: 'fixed' })

    // Dedupe guards against filing one complaint twice, not against recording a
    // recurrence of something that was closed — that second note is new information.
    const second = await file(service, input, { dedupe: true })
    expect(second.created).toBe(true)
    expect(second.row.id).not.toBe(first.row.id)
    expect((await service.list()).rows).toHaveLength(2)
  })

  it('never matches a note with no target', async () => {
    const { service } = await ledger()
    const input = { kind: 'gap' as const, symptom: '同一件事' }
    expect((await file(service, input, { dedupe: true })).created).toBe(true)
    // Two notes that share only a sentence share nothing that makes them one note.
    expect((await file(service, input, { dedupe: true })).created).toBe(true)
    expect((await service.list()).rows).toHaveLength(2)
  })

  it('always appends when the caller did not ask for dedupe', async () => {
    const { service } = await ledger()
    const input = { kind: 'gap' as const, symptom: '同一件事', target: 'wiki_lookup' }
    await file(service, input)
    // The panel's own form: a person may record two similar things and knows why.
    expect((await file(service, input)).created).toBe(true)
    expect((await service.list()).rows).toHaveLength(2)
  })
})

describe('YonIterationService.list', () => {
  it('reports the ledger newest first, with the file\'s order as the tie-break', async () => {
    const { service, path } = await ledger()
    for (const symptom of ['第一', '第二', '第三']) await file(service, { kind: 'gap', symptom })
    const { rows } = await service.list()
    expect(rows.map(row => row.symptom)).toEqual(['第三', '第二', '第一'])
    expect((await service.list()).path).toBe(path)
  })

  it('narrows by status and by kind, and lists everything when asked for nothing', async () => {
    const { service } = await ledger()
    const gap = await file(service, { kind: 'gap', symptom: '缺一步' })
    await file(service, { kind: 'improvement', symptom: '可以更快' })
    await service.update(gap.row.id, { status: 'accepted' })

    expect((await service.list()).rows).toHaveLength(2)
    expect((await service.list({ status: 'open' })).rows.map(row => row.symptom)).toEqual(['可以更快'])
    expect((await service.list({ status: 'all' })).rows).toHaveLength(2)
    expect((await service.list({ kind: 'gap' })).rows.map(row => row.symptom)).toEqual(['缺一步'])
  })
})

describe('YonIterationService.update and remove', () => {
  it('moves the status and the severity, and nothing else', async () => {
    const { service } = await ledger()
    const { row } = await file(service, { ...MINIMAL, severity: 'low', scene: '查字段', target: 'wiki_lookup' })
    const updated = await service.update(row.id, { status: 'accepted', severity: 'high' })

    expect(updated.status).toBe('accepted')
    expect(updated.severity).toBe('high')
    // The note's own text is the model's account of what happened; a triage
    // dropdown must not be able to rewrite it.
    expect(updated.symptom).toBe(row.symptom)
    expect(updated.scene).toBe('查字段')
    expect(updated.target).toBe('wiki_lookup')
    expect(updated.at).toBe(row.at)
    expect((await service.list()).rows[0]).toEqual(updated)
  })

  it('refuses a status or severity outside the declared set', async () => {
    const { service } = await ledger()
    const { row } = await file(service, MINIMAL)
    expect((await refusal(service.update(row.id, { status: 'done' as never }))).code).toBe('invalid-input')
    expect((await refusal(service.update(row.id, { severity: 'critical' as never }))).code).toBe('invalid-input')
    expect((await service.list()).rows[0]?.status).toBe('open')
  })

  it('refuses an id the ledger does not hold', async () => {
    const { service } = await ledger()
    await file(service, MINIMAL)
    const patch = await refusal(service.update('it-nope', { status: 'fixed' }))
    expect(patch.code).toBe('not-found')
    expect(patch.message).toContain('it-nope')
    expect((await refusal(service.remove('it-nope'))).code).toBe('not-found')
  })

  it('removes the row and hands back its id', async () => {
    const { service } = await ledger()
    const { row } = await file(service, MINIMAL)
    expect(await service.remove(row.id)).toBe(row.id)
    expect((await service.list()).rows).toEqual([])
  })
})

describe('YonIterationService over an unreadable document', () => {
  const BROKEN = '{"rows": [{"id": "it-1", '

  /** A ledger whose document exists and does not parse. */
  async function brokenLedger(): Promise<{ service: YonIterationService, path: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'yon-iteration-broken-'))
    temporary.push(dir)
    const path = join(dir, 'iteration.json')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path, BROKEN, 'utf8')
    return { service: createYonIterationService(createIterationStore(path)), path }
  }

  it('reports the error to a reader rather than throwing at it', async () => {
    const { service, path } = await brokenLedger()
    const listed = await service.list()
    expect(listed.rows).toEqual([])
    expect(listed.error).toContain(path)
  })

  it('refuses every mutation, and leaves the operator\'s bytes alone', async () => {
    const { service, path } = await brokenLedger()
    expect((await refusal(file(service, MINIMAL))).code).toBe('invalid-input')
    expect((await refusal(service.update('it-1', { status: 'fixed' }))).code).toBe('invalid-input')
    expect((await refusal(service.remove('it-1'))).code).toBe('invalid-input')
    // The file is the only copy of whatever the operator wrote by hand; writing one
    // row on top of it would be the one unrecoverable outcome here.
    expect(await readFile(path, 'utf8')).toBe(BROKEN)
  })
})
