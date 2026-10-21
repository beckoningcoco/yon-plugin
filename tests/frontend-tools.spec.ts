/**
 * The front-end tools: what the model is offered, what a call actually reads, and
 * what it refuses.
 *
 * The refusals are the point. `ncc_fe_read` is the second place this plugin hands
 * the model the contents of a file the operator pointed at, and it keeps the same
 * three rules `ncc_home_read` keeps: the argument is an id rather than a path,
 * every resolved path must land inside the registered root, and the values of
 * secret keys come back masked.
 *
 * The registration is seeded through the service, over a scratch store — the
 * default document is the operator's own, and a test writing that would be
 * editing the machine it runs on.
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFrontendStore } from '../src/host/frontend-store.ts'
import { createYonFrontendsService } from '../src/host/frontend-service.ts'
import { FRONTEND_TOOL_NAMES, registerYonFrontendTools } from '../src/host/frontend-tools.ts'
import type { YonToolDefinition, YonToolExecution } from '../src/host/tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/**
 * Make one empty directory for a case.
 * @returns its path.
 */
async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'yon-fe-tools-'))
  temporary.push(dir)
  return dir
}

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** One recorded execution, as the registry would hand it over. */
function execution(name: string): YonToolExecution {
  return { name, arguments: {}, callId: 'call-1', signal: liveSignal, agent: {} }
}

/**
 * A scratch project, registered through the service, and the tools over it.
 *
 * The fixture is a minimal real shape: one page entry under `src/`, one event
 * file beside it, one runtime file under `src/platform/` (which a search must
 * skip), a `config.json`, a credentials file (which a read must mask), and a
 * binary file (which a read must refuse).
 */
async function bench() {
  const dir = await scratch()
  const root = join(dir, 'hotwebs')
  const page = join(root, 'src', 'cmp', 'bank', 'bankcontrast_tzwy', 'list')
  await mkdir(join(page, 'events'), { recursive: true })
  await mkdir(join(root, 'src', 'platform'), { recursive: true })
  await writeFile(join(page, 'index.js'),
    '// 银行对账列表页\nimport save from "./events/save";\nconst url = "/nccloud/cmp/bank/bankcontrast.do";\n', 'utf8')
  await writeFile(join(page, 'events', 'save.js'), 'export default function save() {}\n', 'utf8')
  await writeFile(join(root, 'src', 'platform', 'react.js'), '// runtime library\n', 'utf8')
  await writeFile(join(root, 'config.json'), JSON.stringify({ buildEntryPath: ['./src/cmp/bank/*/list/index.js'] }), 'utf8')
  await writeFile(join(root, 'config.properties'), 'db.host=10.0.0.9\nclient_secret=abc1234567890\n', 'utf8')
  await writeFile(join(root, 'src', 'cmp', 'bank', 'logo.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x01]))

  const store = createFrontendStore(join(dir, 'frontend_config.json'))
  const handle = createYonFrontendsService(store, join(dir, 'index'))
  const saved = await handle.service.save({ path: root.replace(/\\/g, '/'), product: 'ncc', version: '2005' })

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  const registry = {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  }
  ctx.provide('tools', registry as never)
  const dispose = registerYonFrontendTools(ctx, handle.service)

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }

  const call = async (name: string, args: unknown): Promise<unknown> =>
    await tool(name).execute(args, execution(name))

  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await call(name, args)
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }

  return { ctx, store, root, id: saved.id, registered, tool, call, render, dispose, handle }
}

describe('front-end tools', () => {
  it('registers the five tools under their declared names', async () => {
    const { registered, dispose } = await bench()
    expect(registered.map(definition => definition.name)).toEqual([...FRONTEND_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.description.length).toBeGreaterThan(40)
      expect(definition.parameters).toMatchObject({ type: 'object' })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
    }
    dispose()
    expect(registered).toHaveLength(0)
  })

  it('tells the model where to register one when nothing is', async () => {
    const dir = await scratch()
    const store = createFrontendStore(join(dir, 'frontend_config.json'))
    const ctx = new Context()
    const registered: YonToolDefinition[] = []
    ctx.provide('tools', {
      register(definition: YonToolDefinition) { registered.push(definition); return () => {} },
    } as never)
    registerYonFrontendTools(ctx, createYonFrontendsService(store).service)
    const list = registered.find(definition => definition.name === 'ncc_fe_list')
    if (list === undefined) throw new Error('no ncc_fe_list')
    const value = await list.execute({}, execution('ncc_fe_list'))
    const text = list.output.render({}, value).map(block => block.text).join('\n')
    expect(text).toContain('前端源码')
    expect(text).toContain('hotwebs')
  })

  it('hands the model the id, the version, what the probe found and the build switch', async () => {
    const { render } = await bench()
    const text = await render('ncc_fe_list', {})
    expect(text).toContain('fe-ncc-2005')
    expect(text).toContain('NCC2005')
    expect(text).toContain('前端源码工程')
    expect(text).toContain('1 个页面节点')
    expect(text).toContain('config.json 构建入口')
    // The single-entry build switch is the most expensive line in this scaffold.
    expect(text).toContain('buildEntryPath')
  })

  it('refuses an id it does not know, and names the ones it does', async () => {
    const { call } = await bench()
    await expect(call('ncc_fe_read', { frontend: 'fe-ncc-9999', path: 'config.json' }))
      .rejects.toThrow(/fe-ncc-2005/)
  })

  it('refuses a path in place of an id, so a path nobody registered cannot be read', async () => {
    const { call, root } = await bench()
    await expect(call('ncc_fe_read', { frontend: root, path: 'config.json' }))
      .rejects.toThrow(/没有登记这个前端源码工程/)
  })

  describe('ncc_fe_find', () => {
    it('finds by extension and returns project-relative paths', async () => {
      const { render, root } = await bench()
      const text = await render('ncc_fe_find', { frontend: 'fe-ncc-2005', ext: 'js' })
      expect(text).toContain('src/cmp/bank/bankcontrast_tzwy/list/index.js')
      expect(text).toContain('src/cmp/bank/bankcontrast_tzwy/list/events/save.js')
      // Never the machine path: the model addresses what it finds by passing it
      // straight back to ncc_fe_read.
      expect(text).not.toContain(root)
    })

    it('skips the runtime library and says so', async () => {
      const { call, render } = await bench()
      const value = await call('ncc_fe_find', { frontend: 'fe-ncc-2005', name: 'react' }) as { matches: unknown[] }
      expect(value.matches).toEqual([])
      const text = await render('ncc_fe_find', { frontend: 'fe-ncc-2005', name: 'index.js' })
      expect(text).toContain('src/platform')
    })

    it('refuses a call with neither name nor ext', async () => {
      const { call } = await bench()
      await expect(call('ncc_fe_find', { frontend: 'fe-ncc-2005' })).rejects.toThrow(/至少要给一个/)
    })

    it('refuses a subtree outside the project', async () => {
      const { call } = await bench()
      await expect(call('ncc_fe_find', { frontend: 'fe-ncc-2005', under: '../..', name: 'x' }))
        .rejects.toThrow()
    })
  })

  describe('ncc_fe_read', () => {
    it('reads a page source, naming the encoding and the line window', async () => {
      const { render } = await bench()
      const text = await render('ncc_fe_read', { frontend: 'fe-ncc-2005', path: 'src/cmp/bank/bankcontrast_tzwy/list/index.js' })
      expect(text).toContain('按 utf-8 解码')
      expect(text).toContain('银行对账列表页')
      expect(text).toContain('/nccloud/cmp/bank/bankcontrast.do')
    })

    it('honours a line window', async () => {
      const { render } = await bench()
      const text = await render('ncc_fe_read', {
        frontend: 'fe-ncc-2005', path: 'src/cmp/bank/bankcontrast_tzwy/list/index.js', lines: '2',
      })
      expect(text).toContain('import save')
      expect(text).not.toContain('const url')
    })

    it('masks a secret value in a config file', async () => {
      const { render } = await bench()
      const text = await render('ncc_fe_read', { frontend: 'fe-ncc-2005', path: 'config.properties' })
      expect(text).toContain('db.host=10.0.0.9')
      expect(text).not.toContain('abc1234567890')
      expect(text).toContain('client_secret')
    })

    it('refuses a binary file', async () => {
      const { call } = await bench()
      await expect(call('ncc_fe_read', { frontend: 'fe-ncc-2005', path: 'src/cmp/bank/logo.png' }))
        .rejects.toThrow(/二进制/)
    })

    it('refuses a path that escapes the project', async () => {
      const { call } = await bench()
      await expect(call('ncc_fe_read', { frontend: 'fe-ncc-2005', path: '../../../etc/passwd' }))
        .rejects.toThrow(/之内/)
    })
  })

  describe('ncc_fe_pages', () => {
    it('says whether a page index exists, and what it holds', async () => {
      const { render, handle, id } = await bench()
      expect(await render('ncc_fe_list', {})).toContain('页面索引：没有')
      // Building through one tool is visible in the other: both read the same
      // stored document, and the list row is where the model looks first.
      await handle.service.pages(id)
      const text = await render('ncc_fe_list', {})
      expect(text).toContain('页面索引：1 节点 · 1 入口')
    })

    it('lists page nodes with their build entries and the path to read', async () => {
      const { render } = await bench()
      const text = await render('ncc_fe_pages', { frontend: 'fe-ncc-2005' })
      expect(text).toContain('cmp/bank/bankcontrast_tzwy')
      expect(text).toContain('list → src/cmp/bank/bankcontrast_tzwy/list/index.js')
      expect(text).toContain('共 1 个页面节点 / 1 个入口')
      // Component folders under src/platform are not pages and never appear.
      expect(text).not.toContain('src/platform')
    })

    it('narrows by term and says when nothing matches', async () => {
      const { render } = await bench()
      expect(await render('ncc_fe_pages', { frontend: 'fe-ncc-2005', term: 'bank' }))
        .toContain('bankcontrast_tzwy')
      const empty = await render('ncc_fe_pages', { frontend: 'fe-ncc-2005', term: 'zzz' })
      expect(empty).toContain('没有匹配的页面节点')
      expect(empty).toContain('ncc_fe_find')
    })
  })

  describe('ncc_fe_grep', () => {
    it('finds a literal string in the page source and names the skips', async () => {
      const { render } = await bench()
      const text = await render('ncc_fe_grep', { frontend: 'fe-ncc-2005', pattern: 'bankcontrast' })
      expect(text).toContain('src/cmp/bank/bankcontrast_tzwy/list/index.js:3')
      expect(text).toContain('/nccloud/cmp/bank/bankcontrast.do')
      expect(text).toContain('src/platform')
    })

    it('finds a regular expression', async () => {
      const { render } = await bench()
      const text = await render('ncc_fe_grep', {
        frontend: 'fe-ncc-2005', pattern: '/nccloud/.*bank', regex: true,
      })
      expect(text).toContain('bankcontrast.do')
    })

    it('says so when nothing matches', async () => {
      const { render } = await bench()
      expect(await render('ncc_fe_grep', { frontend: 'fe-ncc-2005', pattern: 'zzz-nothing' }))
        .toContain('没有找到')
    })

    it('refuses an empty pattern', async () => {
      const { call } = await bench()
      await expect(call('ncc_fe_grep', { frontend: 'fe-ncc-2005', pattern: '  ' }))
        .rejects.toThrow(/pattern 必须是非空字符串/)
    })
  })
})
