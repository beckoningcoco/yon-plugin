/**
 * The host half's activation contract: it opens the project domain, publishes
 * the store as `ctx.yonProjects`, mounts the `/yon/api` route, and tears all
 * three down with its own fiber.
 *
 * The two services are stand-ins: what this package owns is the wiring, and the
 * real backend/route behaviour is proven by the end-to-end check against a
 * running server.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { DOMAIN_NAME, apply, inject } from '../src/index.ts'

/** An always-empty `KvTable`, enough for the store to construct and refresh. */
function emptyTable() {
  return {
    get: (): undefined => undefined,
    entries: (): IterableIterator<[string, never]> => new Map<string, never>().entries(),
    keys: (): IterableIterator<string> => new Map<string, never>().keys(),
    size: 0,
    put: async (): Promise<void> => {},
    delete: async (): Promise<boolean> => false,
    update: async (): Promise<never> => { throw new Error('missing-key') },
  }
}

/** Mount the host half over stand-in services. */
async function bench() {
  const ctx = new Context()
  const closeDomain = vi.fn(async () => {})
  const open = vi.fn(async (_spec: unknown) => ({
    name: DOMAIN_NAME,
    table: () => emptyTable(),
    close: closeDomain,
  }))
  const disposeRoute = vi.fn()
  const register = vi.fn((_route: unknown) => disposeRoute)
  ctx.provide('storageDomain', { open } as never)
  ctx.provide('webServer', { register } as never)

  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, open, register, closeDomain, disposeRoute, fiber }
}

describe('dsh-plugin-yon-panel host half', () => {
  it('declares the two services it needs', () => {
    expect([...inject]).toEqual(['storageDomain', 'webServer'])
  })

  it('opens the declared domain', async () => {
    const { open } = await bench()

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]?.[0]).toMatchObject({ name: DOMAIN_NAME, version: 1 })
  })

  it('publishes the store as ctx.yonProjects for in-process consumers', async () => {
    const { ctx } = await bench()

    const store = ctx.get('yonProjects') as { list(): readonly unknown[] } | undefined

    expect(store).toBeDefined()
    expect(store?.list()).toEqual([])
  })

  it('serves the API under the shared prefix', async () => {
    const { register } = await bench()

    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0]?.[0]).toMatchObject({ kind: 'prefix', path: '/yon/api' })
  })

  it('closes the domain and drops the route with its own fiber', async () => {
    const { closeDomain, disposeRoute, fiber } = await bench()

    await fiber.dispose()

    expect(closeDomain).toHaveBeenCalledTimes(1)
    expect(disposeRoute).toHaveBeenCalledTimes(1)
  })
})
