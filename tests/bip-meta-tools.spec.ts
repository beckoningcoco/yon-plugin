/**
 * The flagship metadata tools: what the model is offered, and what it reads back.
 *
 * `bip-meta.spec.ts` covers the reader against fixtures. This file covers the boundary the
 * model actually touches — the two definitions, the text they render, and the errors they
 * raise — and it is written against the **shipped** snapshots on purpose: here the answer
 * text *is* the product, and a fixture would only assert the wording against a corpus no
 * operator has.
 *
 * The one case that exists because of a defect: a bad `kind` used to raise `HomeError`,
 * because the kind surface is reused from the NCC metadata pair and that helper is a Home
 * module's. A 旗舰版 tool reporting a Home error is exactly the kind of cross-line leak the
 * product-line split exists to prevent, so it is pinned here.
 */
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BipMetaError } from '../src/host/bip-meta.ts'
import { BIP_META_TOOL_NAMES, registerYonBipMetaTools } from '../src/host/bip-meta-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** A signal stand-in: these tools await a cached parse, nothing cancellable. */
const liveSignal = new AbortController().signal

/** Mount the tools over a recording registry, the way the host half does. */
function bench() {
  const ctx = new Context()
  const tools = new Map<string, YonToolDefinition>()
  const dispose = vi.fn()
  ctx.provide('tools', {
    register: (definition: YonToolDefinition) => {
      tools.set(definition.name, definition)
      return dispose
    },
  } as never)
  const unmount = registerYonBipMetaTools(ctx)
  return { ctx, tools, dispose, unmount }
}

/** One call, as the registry would hand it over; these tools read only the signal. */
function execution(name: string, args: unknown): YonToolExecution {
  return { name, arguments: args, callId: 'call-1', signal: liveSignal }
}

/** The text a call would hand the model. */
async function answer(tools: Map<string, YonToolDefinition>, name: string, args: unknown): Promise<string> {
  const definition = tools.get(name)
  if (definition === undefined) throw new Error(`not registered: ${name}`)
  const value = await definition.execute(args, execution(name, args))
  const blocks = definition.output.render(args, value)
  return blocks.map(block => block.text).join('')
}

/** The error a call raises, or nothing when it unexpectedly succeeds. */
async function failure(tools: Map<string, YonToolDefinition>, name: string, args: unknown): Promise<unknown> {
  const definition = tools.get(name)
  if (definition === undefined) throw new Error(`not registered: ${name}`)
  try {
    await definition.execute(args, execution(name, args))
    return undefined
  } catch (error) {
    return error
  }
}

describe('the flagship metadata tools', () => {
  let mounted: ReturnType<typeof bench>

  beforeEach(() => {
    mounted = bench()
  })

  it('registers both tools, and withdraws them on unmount', () => {
    expect([...mounted.tools.keys()]).toEqual([...BIP_META_TOOL_NAMES])

    mounted.unmount()
    expect(mounted.dispose).toHaveBeenCalledTimes(BIP_META_TOOL_NAMES.length)
  })

  it('names the product line, and says what it cannot answer', () => {
    // Two claims that would be lies if they went missing: which line it serves, and that
    // the enumeration values are absent. Both are the reason the tool is safe to reach
    // for, so their removal is a regression rather than a wording change.
    const find = mounted.tools.get('bip_meta_find')?.description ?? ''
    const detail = mounted.tools.get('bip_meta_detail')?.description ?? ''

    expect(find).toContain('旗舰版')
    expect(find).toContain('BIP')
    expect(find).toContain('ncc_meta_find')
    expect(find).toContain('not in the payloads')
    expect(detail).toContain('旗舰版')
    expect(detail).toContain('ncc_meta_detail')
  })

  it('finds an entity by its Chinese label and renders the table', async () => {
    const text = await answer(mounted.tools, 'bip_meta_find', { kind: 'entity', q: '采购入库单' })

    expect(text).toContain('PurInRecord')
    expect(text).toContain('采购入库单主表')
    expect(text).toContain('st_purinrecord')
    expect(text).toContain('135 列 + 7 个子表')
  })

  it('finds a field by physical name and by label, naming both spellings', async () => {
    const byColumn = await answer(mounted.tools, 'bip_meta_find', { kind: 'field', q: 'vouchdate' })
    const byLabel = await answer(mounted.tools, 'bip_meta_find', { kind: 'field', q: '单据日期' })

    expect(byColumn).toContain('vouchdate（单据日期）')
    expect(byLabel).toContain('vouchdate（单据日期）')
    expect(byColumn).toContain('st_purinrecord')
  })

  it('lists an enumeration with the columns that use it, and says the values are not here', async () => {
    const text = await answer(mounted.tools, 'bip_meta_find', { kind: 'enum', q: 'st_writeOffStatus' })

    expect(text).toContain('st_writeOffStatus')
    expect(text).toContain('write_off_status（冲销状态）')
    expect(text).toContain('没有它的取值表')
  })

  it('says how many hits were withheld when the limit cuts the answer', async () => {
    const text = await answer(mounted.tools, 'bip_meta_find', { kind: 'field', q: 'code', limit: 2 })

    expect(text).toContain('只列了前 2 个')
  })

  it('reads one entity by its exact URI, and reports the sub-tables it could not resolve', async () => {
    const text = await answer(mounted.tools, 'bip_meta_detail', { entity: 'st.purinrecord.PurInRecord' })

    expect(text).toContain('PurInRecord（采购入库单主表）')
    expect(text).toContain('st_purinrecord')
    expect(text).toContain('id（ID）')
    expect(text).toContain('主键')
    // `code` is the entity's own code column, per the payload's codeAttribute.
    expect(text).toContain('code（单据编号）')
    expect(text).toContain('子表')
  })

  it('accepts the table name as readily as the URI', async () => {
    const byTable = await answer(mounted.tools, 'bip_meta_detail', { entity: 'st_purinrecord' })
    const byUri = await answer(mounted.tools, 'bip_meta_detail', { entity: 'st.purinrecord.PurInRecord' })

    expect(byTable).toEqual(byUri)
  })

  it('offers the candidates when a term is ambiguous, and never picks one', async () => {
    const error = await failure(mounted.tools, 'bip_meta_detail', { entity: 'st.salesout' })

    expect(error).toBeInstanceOf(BipMetaError)
    expect((error as BipMetaError).code).toBe('invalid-input')
    // Both spellings of the answer are in the message; the caller narrows, not the tool.
    expect((error as Error).message).toContain('SalesOut')
    expect((error as Error).message).toContain('st.salesout.SalesOut')
    expect((error as Error).message).toContain('SalesOutsCharacteristics')
  })

  it('says the corpus is partial when a term matches nothing', async () => {
    const error = await failure(mounted.tools, 'bip_meta_detail', { entity: 'no.such.Entity' })

    expect(error).toBeInstanceOf(BipMetaError)
    expect((error as BipMetaError).code).toBe('not-found')
    expect((error as Error).message).toContain('只覆盖一部分实体')
  })

  it('raises its own error class, not a Home one, for a bad kind', async () => {
    // The regression this file was written for: `kind` is validated by the NCC pair's
    // `asQueryKind`, which is a Home module's helper and throws `HomeError`. Translated
    // at the boundary so a 旗舰版 tool never reports a Home error.
    const error = await failure(mounted.tools, 'bip_meta_find', { kind: 'nonsense', q: 'x' })

    expect(error).toBeInstanceOf(BipMetaError)
    expect((error as Error).name).toBe('BipMetaError')
    expect((error as BipMetaError).code).toBe('invalid-input')
    expect((error as Error).message).toContain('nonsense')
  })

  it('rejects an empty query rather than answering everything', async () => {
    const blank = await failure(mounted.tools, 'bip_meta_find', { kind: 'entity', q: '   ' })
    const missing = await failure(mounted.tools, 'bip_meta_detail', {})

    expect(blank).toBeInstanceOf(BipMetaError)
    expect((blank as BipMetaError).code).toBe('invalid-input')
    expect(missing).toBeInstanceOf(BipMetaError)
    expect((missing as BipMetaError).code).toBe('invalid-input')
  })
})
