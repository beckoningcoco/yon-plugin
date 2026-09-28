/** The node half only exists so a Loader row can mount the package. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

describe('ui-yon-panel node plugin', () => {
  it('mounts as a Loader row without providing anything host-side', async () => {
    ctx = new Context()

    await ctx.plugin({ apply }).await()

    // The browser half ships through exports["./client"]; this half exists only
    // so a Loader row has a module to import, so it provides no service.
    expect(ctx.get('slots')).toBeUndefined()
    expect(ctx.get('tools')).toBeUndefined()
  })
})
