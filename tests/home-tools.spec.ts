/**
 * The Home tools: what the model is offered, what a call actually reads, and —
 * the half that is a safety boundary rather than a feature — what it refuses.
 *
 * The refusals are the point. `ncc_home_read` is the one place this plugin hands
 * the model the contents of a file the operator pointed at, and three of its
 * rules exist to keep that from being a general file reader: the `home` argument
 * is an id rather than a path, every resolved path must land inside the
 * registered root, and the values of secret keys come back masked.
 *
 * The registrations are seeded by writing the store document directly rather than
 * through `service.save()`. Saving would mirror into the operator's real
 * `~/.claude/skills` tree — the merge rules are covered in `home-mirror.spec.ts`,
 * which passes a scratch root.
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHomeStore, type StoredHome } from '../src/host/home-store.ts'
import { createYonHomesService } from '../src/host/home-service.ts'
import { probeHome } from '../src/host/home-probe.ts'
import { HOME_TOOL_NAMES, registerYonHomeTools } from '../src/host/home-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(prefix = 'yon-home-tools-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/** One recorded execution, as the registry would hand it over. */
function execution(name: string): YonToolExecution {
  return { name, arguments: {}, callId: 'call-1', signal: liveSignal, agent: {} }
}

/**
 * The GBK bytes of the handful of characters these fixtures use.
 *
 * Spelled as bytes rather than produced by an encoder, because Node ships no GBK
 * encoder and the whole point of the fixture is that it is *not* UTF-8: writing
 * the text as UTF-8 would make the case pass against a reader that never left
 * UTF-8. The mapping is asserted by the case itself, which fails loudly on
 * mojibake.
 */
const GBK_BYTES: Record<string, readonly number[]> = {
  // 中文注释：这是一个测试
  中: [0xD6, 0xD0], 文: [0xCE, 0xC4], 注: [0xD7, 0xA2], 释: [0xCA, 0xCD],
  // 冒号 is fullwidth; the fixtures use the ASCII one, so only the characters
  // above and the label below need mapping.
  测: [0xB2, 0xE2], 试: [0xCA, 0xD4],
}

/**
 * A GBK file's bytes, built from the table above.
 * @param parts - the characters, ASCII passed through.
 * @returns the bytes.
 */
function gbkBytes(parts: readonly (string | number)[]): Buffer {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'number') {
      out.push(part)
      continue
    }
    for (const char of part) {
      const mapped = GBK_BYTES[char]
      if (mapped === undefined) {
        out.push(char.charCodeAt(0))
        continue
      }
      out.push(...mapped)
    }
  }
  return Buffer.from(out)
}

/**
 * Mount the Home tools over a scratch store and a scratch Home directory.
 *
 * @returns the registry, the service, the fixture root, and the tools by name.
 */
async function bench() {
  const dir = await scratch()
  const root = join(dir, 'home')
  await mkdir(join(root, 'modules', 'aert', 'classes'), { recursive: true })
  await mkdir(join(root, 'ierp', 'bin'), { recursive: true })
  await writeFile(join(root, 'modules', 'aert', 'classes', 'Cache.java'), gbkBytes(['/* ', '中', '文', '注', '释', ' */']))
  await writeFile(join(root, 'modules', 'aert', 'query.bmf'), '<bill name="QueryScheme"/>', 'utf8')
  await writeFile(join(root, 'modules', 'aert', 'other.bmf'), '<bill name="Other"/>', 'utf8')
  await writeFile(join(root, 'config.properties'),
    'db.host=10.0.0.9\nclient_secret=abc1234567890\nuser=admin\n', 'utf8')
  await writeFile(join(root, 'binary.jar'), Buffer.from([0x50, 0x4B, 0x00, 0x01, 0x02]), 'utf8')

  const store = createHomeStore(join(dir, 'home_config.json'))
  const seeded: StoredHome = {
    id: 'ncc-2111',
    path: root.replace(/\\/g, '/'),
    product: 'ncc',
    version: '2111',
    isDefault: true,
    profile: await probeHome(root),
  }
  await store.write([seeded])

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)

  const handle = createYonHomesService(store)
  const dispose = registerYonHomeTools(ctx, handle.service)

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }

  /** Run one call and return the value, not the rendered text. */
  const call = async (name: string, args: unknown): Promise<unknown> =>
    await tool(name).execute(args, execution(name))

  /** Run one call and return the text the model would read. */
  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await call(name, args)
    const blocks = tool(name).output.render(args, value)
    return blocks.map(block => block.text).join('\n')
  }

  return { ctx, store, root, id: seeded.id, registered, tool, call, render, dispose, handle }
}

describe('home tools', () => {
  it('registers the three tools under their declared names', async () => {
    const { registered, dispose } = await bench()
    expect(registered.map(definition => definition.name)).toEqual([...HOME_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.description.length).toBeGreaterThan(40)
      expect(definition.parameters).toMatchObject({ type: 'object' })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
    }
    dispose()
    expect(registered).toHaveLength(0)
  })

  it('says which id to call when nothing is registered', async () => {
    const { call, tool } = await bench()
    const empty = await call('ncc_home_list', {})
    const blocks = tool('ncc_home_list').output.render({}, empty)
    expect(blocks[0]?.text).toContain('安装目录')
  })

  it('hands the model the id, the path and what the probe found', async () => {
    const { render } = await bench()
    const text = await render('ncc_home_list', {})
    expect(text).toContain('ncc-2111')
    // The name is derived, not stored: this line is where the model reads it, and
    // there is no field anywhere it could have been read from instead.
    expect(text).toContain('NCC2111')
    expect(text).toContain('[NCC 2111]')
    expect(text).toContain('NCC 安装目录')
    expect(text).toContain('默认')
    // Every path that exists, including the module-relative one: the answer lists
    // what the model may `under`, not just the fixed roots.
    expect(text).toContain('有的路径：modules、modules/*/classes、ierp/bin')
    expect(text).toContain('类索引：没有')
  })

  it('refuses an id it does not know, and names the ones it does', async () => {
    const { call } = await bench()
    await expect(call('ncc_home_read', { home: 'no-such-id', path: 'config.properties' }))
      .rejects.toThrow(/ncc-2111/)
  })

  it('refuses a path in place of an id, so a path nobody registered cannot be read', async () => {
    const { call, root } = await bench()
    await expect(call('ncc_home_read', { home: root, path: 'config.properties' }))
      .rejects.toThrow(/没有登记这个 Home/)
  })

  describe('ncc_home_find', () => {
    it('finds by extension and returns Home-relative paths', async () => {
      const { render } = await bench()
      const text = await render('ncc_home_find', { home: 'ncc-2111', ext: 'bmf' })
      expect(text).toContain('modules/aert/query.bmf')
      expect(text).toContain('modules/aert/other.bmf')
      // Relative to the Home, never the machine path: the model addresses what it
      // finds by passing it straight back to ncc_home_read.
      expect(text).not.toContain('E:')
    })

    it('narrows by name and honours a limit', async () => {
      const { call } = await bench()
      const all = await call('ncc_home_find', { home: 'ncc-2111', ext: '.bmf' }) as { matches: unknown[] }
      expect(all.matches).toHaveLength(2)
      const one = await call('ncc_home_find', { home: 'ncc-2111', ext: 'bmf', limit: 1 }) as { matches: unknown[] }
      expect(one.matches).toHaveLength(1)
      // `name` matches the file name, not the file's contents — the bill inside
      // `query.bmf` happens to be called QueryScheme, and that is not what this
      // argument searches.
      const named = await call('ncc_home_find', { home: 'ncc-2111', name: 'QUERY' }) as { matches: { rel: string }[] }
      expect(named.matches.map(match => match.rel)).toEqual(['modules/aert/query.bmf'])
    })

    it('refuses a call with neither name nor ext', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_find', { home: 'ncc-2111' })).rejects.toThrow(/至少要给一个/)
    })

    it('refuses an under that escapes the Home', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_find', { home: 'ncc-2111', ext: 'bmf', under: '../..' }))
        .rejects.toThrow(/必须在这个 Home 之内/)
    })
  })

  describe('ncc_home_read', () => {
    it('decodes a GBK source file and says which encoding it used', async () => {
      const { call } = await bench()
      const value = await call('ncc_home_read', { home: 'ncc-2111', path: 'modules/aert/classes/Cache.java' }) as {
        encoding: string
        text: string
      }
      expect(value.encoding).toBe('gb18030')
      expect(value.text).toContain('中文注释')
    })

    it('reads a UTF-8 file as UTF-8', async () => {
      const { call } = await bench()
      const value = await call('ncc_home_read', { home: 'ncc-2111', path: 'modules/aert/query.bmf' }) as {
        encoding: string
        text: string
      }
      expect(value.encoding).toBe('utf-8')
      expect(value.text).toContain('QueryScheme')
    })

    it('masks the value of a secret key and leaves everything else alone', async () => {
      const { call, tool } = await bench()
      const value = await call('ncc_home_read', { home: 'ncc-2111', path: 'config.properties' }) as {
        masked: readonly string[]
        text: string
      }
      expect(value.masked).toContain('client_secret')
      // The secret itself must not reach the conversation...
      expect(value.text).not.toContain('abc1234567890')
      expect(value.text).toContain('***')
      // ...while the values an operator debugs a connection with do.
      expect(value.text).toContain('db.host=10.0.0.9')
      expect(value.text).toContain('user=admin')

      const blocks = tool('ncc_home_read').output.render({}, value)
      expect(blocks[0]?.text).toContain('密钥值被打码')
      expect(blocks[0]?.text).not.toContain('abc1234567890')
    })

    it('refuses a binary file and points at the class search instead', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_read', { home: 'ncc-2111', path: 'binary.jar' }))
        .rejects.toThrow(/二进制/)
    })

    it('refuses a path outside the Home, in either separator', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_read', { home: 'ncc-2111', path: '../home_config.json' }))
        .rejects.toThrow(/必须在这个 Home 之内/)
      await expect(call('ncc_home_read', { home: 'ncc-2111', path: '..\\home_config.json' }))
        .rejects.toThrow(/必须在这个 Home 之内/)
    })

    it('refuses an absolute path that lands outside the Home', async () => {
      const { call } = await bench()
      // The containment test is `path.relative`, not a prefix, so a sibling tree
      // that shares the Home's name is outside it too — and an absolute path is
      // judged by the same rule as a relative one.
      await expect(call('ncc_home_read', { home: 'ncc-2111', path: 'C:/Windows/win.ini' }))
        .rejects.toThrow(/必须在这个 Home 之内/)
    })

    it('refuses a directory, and says which tool to use instead', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_read', { home: 'ncc-2111', path: 'modules' }))
        .rejects.toThrow(/ncc_home_find/)
    })

    it('reads a line window, and reports the window it actually returned', async () => {
      const { call } = await bench()
      const value = await call('ncc_home_read', {
        home: 'ncc-2111', path: 'config.properties', lines: '2-2',
      }) as { from: number; to: number; text: string }
      expect([value.from, value.to]).toEqual([2, 2])
      expect(value.text).toContain('client_secret')
      expect(value.text).not.toContain('db.host')
    })

    it('refuses a malformed line window rather than reading the whole file', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_read', { home: 'ncc-2111', path: 'config.properties', lines: 'from line 2' }))
        .rejects.toThrow(/lines/)
    })

    it('says which encoding it used, so a wrong reading is visible', async () => {
      const { render } = await bench()
      const text = await render('ncc_home_read', { home: 'ncc-2111', path: 'modules/aert/classes/Cache.java' })
      expect(text).toContain('按 gb18030 解码')
    })

    it('refuses an encoding it does not know instead of falling back silently', async () => {
      const { call } = await bench()
      await expect(call('ncc_home_read', {
        home: 'ncc-2111', path: 'config.properties', encoding: 'shift-jis',
      })).rejects.toThrow(/不认识的编码/)
    })

    it('truncates a long file at a line boundary and says so', async () => {
      const { call, root } = await bench()
      const long = Array.from({ length: 4000 }, (_unused, index) => `line ${index} ${'x'.repeat(40)}`).join('\n')
      await writeFile(join(root, 'long.txt'), long, 'utf8')
      const value = await call('ncc_home_read', { home: 'ncc-2111', path: 'long.txt' }) as {
        truncated: boolean
        text: string
        to: number
        totalLines: number
      }
      expect(value.truncated).toBe(true)
      expect(value.text).toContain('输出到')
      expect(value.to).toBeLessThan(value.totalLines)
      // Whole lines only: the last line returned is one the file actually has.
      expect(value.text).toContain(`line ${value.to - 1} `)
    })
  })
})
