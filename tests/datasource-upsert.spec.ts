/**
 * `datasource_upsert` 的契约：写下去什么、给模型看什么、给人看什么，以及门怎么判。
 *
 * 三条各自都能在别处悄悄坏掉，所以分开钉：
 *
 * - **patch 语义**：省略的字段沿用已存值。`service_name` 曾经是「省略即清空」
 *   （`datasource-service.ts` 的 save 里写着 `?? ''`），于是一个只想改地址的调用会
 *   顺手把库名抹掉；登录名同理会把密码丢掉。第一条用例就是它。
 * - **密码只进不出**：写进使用者的配置文件，不进任何答案，也不进审批预览——
 *   预览是操作者审批卡上的那段文字，它出现在会话记录里。
 * - **门**：只读会话拒绝、默认要人点头、`approval=never` 放行；而审批卡上的文字
 *   与真正执行的计划出自同一份 `planUpsert`，所以「批准的就是写下去的」。
 *
 * 数据源文件一律建在临时目录：默认路径是使用者自己的 db_config.json，用例往那儿
 * 写就等于在跑测试的机器上动他的连接。
 */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DATASOURCE_TOOL_NAMES, registerYonDataSourceTools } from '../src/host/datasource-tools.ts'
import { createDataSourceStore } from '../src/host/datasource-store.ts'
import { createYonDataSourcesService } from '../src/host/datasource-service.ts'
import type { DataSourceRunner, RunRequest, RunResult } from '../src/host/datasource-probe.ts'
import type { YonProjectsService } from '../src/host/service.ts'
import type {
  YonPermissions,
  YonSessionLike,
  YonToolDefinition,
  YonToolExecution,
} from '../src/host/tools.ts'

/** Directories this spec made, removed after each case. */
const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true })
})

/** A signal stand-in: these tools await nothing cancellable. */
const liveSignal = new AbortController().signal

/** A session stand-in whose log carries whatever permission events a case needs. */
function sessionWith(permissions: Partial<YonPermissions> | undefined): YonSessionLike {
  const events: Array<{ type: string; data: unknown }> = []
  if (permissions?.sandbox !== undefined) events.push({ type: 'sandbox/mode', data: { mode: permissions.sandbox } })
  if (permissions?.approval !== undefined) events.push({ type: 'approval/policy', data: { policy: permissions.approval } })
  return { seq: events.length, eventAt: (seq: number) => events[seq] }
}

/** One recorded execution, as the registry would hand it over. */
function execution(name: string, args: unknown, permissions?: Partial<YonPermissions>): YonToolExecution {
  return {
    name,
    arguments: args,
    callId: 'call-1',
    signal: liveSignal,
    agent: { session: sessionWith(permissions) },
  }
}

/** The one project this spec binds connections to. */
const PROJECT = { projectId: 'prj-shouchuang', name: '首创(NCC1909)', code: 'shouchuang' }

/**
 * A project store stand-in: `resolve` answers by id, name or code the way the real
 * one does, and `get` is what the service reads a binding's display name through.
 */
function projectsStub(): YonProjectsService {
  const detail = { ...PROJECT, status: 'active', archived: false, fieldCount: 0, fields: {} }
  return {
    list: () => [detail],
    get: (projectId: string) => (projectId === PROJECT.projectId ? detail : undefined),
    resolve: (ref: string) => (ref === PROJECT.projectId || ref === PROJECT.name || ref === PROJECT.code
      ? { kind: 'found', project: detail }
      : { kind: 'missing' }),
  } as unknown as YonProjectsService
}

/** A runner stand-in: it records what it was asked and answers what the case says. */
function runnerStub(options: {
  available?: boolean
  unavailableReason?: string
  result?: Partial<RunResult>
} = {}): DataSourceRunner & { readonly requests: RunRequest[] } {
  const requests: RunRequest[] = []
  return {
    requests,
    available: options.available ?? true,
    unavailableReason: options.unavailableReason,
    async run(request: RunRequest): Promise<RunResult> {
      requests.push(request)
      return { ok: true, latencyMs: 7, output: 'OK\n1', rowCount: 1, ...options.result }
    },
  }
}

/** The document every case starts from: one single-login branch, one with two logins. */
const DOCUMENT = {
  projects: {
    '首创(NCC1909)': {
      type: 'oracle',
      test: {
        host: '10.10.9.11',
        port: 1521,
        service_name: 'oragbk',
        users: { SCNCC: 'scncc123456' },
      },
    },
    '多登录': {
      type: 'oracle',
      prod: {
        host: '10.0.0.9',
        port: 1521,
        service_name: 'ORCL',
        users: { A: 'pa', B: 'pb' },
      },
    },
  },
}

/**
 * Read one environment branch straight back out of the file the tool wrote.
 * @param path - the document's path.
 * @param configKey - the connection group.
 * @param env - the branch.
 * @returns the stored branch, or an empty object when nothing is there.
 */
async function branchOf(
  path: string,
  configKey: string,
  env: string,
): Promise<Record<string, unknown>> {
  const document = JSON.parse(await readFile(path, 'utf8')) as {
    projects?: Record<string, Record<string, Record<string, unknown>>>
  }
  return document.projects?.[configKey]?.[env] ?? {}
}

/**
 * Read one connection group (the members beside its branches: `type`, `projectId`).
 * @param path - the document's path.
 * @param configKey - the connection group.
 * @returns the stored group, or an empty object when nothing is there.
 */
async function groupOf(path: string, configKey: string): Promise<Record<string, unknown>> {
  const document = JSON.parse(await readFile(path, 'utf8')) as {
    projects?: Record<string, Record<string, unknown>>
  }
  return document.projects?.[configKey] ?? {}
}

/**
 * Mount the datasource tools over a scratch document.
 * @param runner - the statement runner to inject; a recording stub by default.
 * @returns the tools by name, and the callers this suite drives them through.
 */
async function bench(runner: ReturnType<typeof runnerStub> = runnerStub()) {
  const dir = await mkdtemp(join(tmpdir(), 'yon-datasource-upsert-'))
  temporary.push(dir)
  const path = join(dir, 'db_config.json')

  const ctx = new Context()
  const registered: YonToolDefinition[] = []
  ctx.provide('tools', {
    register(definition: YonToolDefinition): () => void {
      registered.push(definition)
      return () => { registered.splice(registered.indexOf(definition), 1) }
    },
  } as never)

  const store = createDataSourceStore(path)
  await store.write(DOCUMENT)
  const sources = createYonDataSourcesService(store, projectsStub(), runner).service
  registerYonDataSourceTools(ctx, sources, projectsStub())

  const tool = (name: string): YonToolDefinition => {
    const found = registered.find(candidate => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }
  const call = async (name: string, args: unknown): Promise<Record<string, unknown>> =>
    await tool(name).execute(args, execution(name, args)) as Record<string, unknown>
  const render = async (name: string, args: unknown): Promise<string> => {
    const value = await call(name, args)
    return tool(name).output.render(args, value).map(block => block.text).join('\n')
  }
  /**
   * Ask the family's own gate what it would do with one call.
   * @returns `allow` / `ask` (with the approval card's text) / `deny`.
   */
  const gate = async (
    name: string,
    args: unknown,
    permissions?: Partial<YonPermissions>,
  ): Promise<{ kind: string; reason?: string }> =>
    await ctx.waterfall(
      'tools/pre-execute',
      execution(name, args, permissions),
      () => Promise.resolve({ kind: 'allow' as const }),
    ) as { kind: string; reason?: string }

  return { path, registered, tool, call, render, gate, runner }
}

describe('这一族注册了什么', () => {
  it('registers exactly the three declared names', async () => {
    const { registered } = await bench()
    expect(registered.map(definition => definition.name)).toEqual([...DATASOURCE_TOOL_NAMES])
    for (const definition of registered) {
      expect(definition.parameters).toMatchObject({ type: 'object', additionalProperties: false })
      expect(definition.output.schema).toMatchObject({ type: 'object' })
    }
  })

  it('never lets a caller pass `users` as a raw object of secrets', async () => {
    // 密码只能一个登录名一份地传（user + password），不能整表灌进去：整表就是
    // 「把别人的密码抄一遍」，而这个工具不该有任何场合需要它。
    const { tool } = await bench()
    const properties = (tool('datasource_upsert').parameters as {
      properties: Record<string, unknown>
    }).properties
    expect(Object.keys(properties)).not.toContain('users')
  })
})

describe('写入与 patch', () => {
  it('新建一个分支，字段全部落盘', async () => {
    const { call, path } = await bench()
    const result = await call('datasource_upsert', {
      key: '新环境(NCC1909)::dev',
      db_type: 'oracle',
      host: '10.0.0.1',
      port: 1521,
      service_name: 'orcl',
      user: 'U',
      password: 'p',
    })
    expect(result.created).toBe(true)
    expect(await branchOf(path, '新环境(NCC1909)', 'dev')).toMatchObject({
      host: '10.0.0.1',
      port: 1521,
      service_name: 'orcl',
      users: { U: 'p' },
    })
  })

  it('只想改地址：省略的字段一律沿用（库名、登录名、类型都不许被抹掉）', async () => {
    const { call, path } = await bench()
    const result = await call('datasource_upsert', {
      key: '首创(NCC1909)::test',
      host: '10.10.9.12',
    })
    expect(result.created).toBe(false)
    expect(await branchOf(path, '首创(NCC1909)', 'test')).toEqual({
      host: '10.10.9.12',
      port: 1521,
      service_name: 'oragbk',
      users: { SCNCC: 'scncc123456' },
    })
    expect((await groupOf(path, '首创(NCC1909)')).type).toBe('oracle')
  })

  it('空串是「清空库名」，不是「沿用」', async () => {
    const { call, path } = await bench()
    const result = await call('datasource_upsert', {
      key: '首创(NCC1909)::test',
      service_name: '',
    })
    expect((await branchOf(path, '首创(NCC1909)', 'test')).service_name).toBe('')
    expect(result.changes).toContain('库名已清空（原 oragbk）')
  })

  it('换登录名时把旧密码一并替换，并在回答里说清', async () => {
    const { call, path } = await bench()
    const result = await call('datasource_upsert', {
      key: '首创(NCC1909)::test',
      user: 'SCNCC2',
      password: 'p2',
    })
    expect((await branchOf(path, '首创(NCC1909)', 'test')).users).toEqual({ SCNCC2: 'p2' })
    expect(result.changes).toContain('登录名：SCNCC → SCNCC2（原密码一并替换）')
  })

  it('user 与 password 必须成对', async () => {
    const { call } = await bench()
    await expect(call('datasource_upsert', { key: '首创(NCC1909)::test', user: 'X' }))
      .rejects.toThrow('password')
    await expect(call('datasource_upsert', { key: '首创(NCC1909)::test', password: 'x' }))
      .rejects.toThrow('user')
  })

  it('key 必须写成「名称::环境」', async () => {
    const { call } = await bench()
    await expect(call('datasource_upsert', { key: '首创(NCC1909)', host: '10.0.0.1' }))
      .rejects.toThrow('名称::环境')
  })

  it('新建却不给 db_type / host / port 时逐个说清缺哪个', async () => {
    const { call } = await bench()
    await expect(call('datasource_upsert', { key: '另一个::test', host: '10.0.0.1', port: 1521 }))
      .rejects.toThrow('db_type')
    await expect(call('datasource_upsert', { key: '另一个::test', db_type: 'oracle', port: 1521 }))
      .rejects.toThrow('host')
    await expect(call('datasource_upsert', { key: '另一个::test', db_type: 'oracle', host: '10.0.0.1' }))
      .rejects.toThrow('port')
  })

  it('不给任何改动时照写不误，但回答里说没有任何改动', async () => {
    const { render } = await bench()
    const text = await render('datasource_upsert', { key: '首创(NCC1909)::test' })
    expect(text).toContain('没有任何改动')
  })
})

describe('多登录名的分支', () => {
  it('只给一个登录名会被拒绝，并点名已存的是哪几个', async () => {
    const { call } = await bench()
    await expect(call('datasource_upsert', { key: '多登录::prod', user: 'C', password: 'pc' }))
      .rejects.toThrow('已存 2 个登录名（A、B）')
  })

  it('带 replace_logins: true 才替换', async () => {
    const { call, path } = await bench()
    const result = await call('datasource_upsert', {
      key: '多登录::prod',
      user: 'C',
      password: 'pc',
      replace_logins: true,
    })
    expect((await branchOf(path, '多登录', 'prod')).users).toEqual({ C: 'pc' })
    expect(result.changes).toContain('登录名：A、B → C（原密码一并替换）')
  })
})

describe('绑定项目', () => {
  it('按项目名绑定，落盘的是 id', async () => {
    const { call, path } = await bench()
    const result = await call('datasource_upsert', {
      key: '首创(NCC1909)::test',
      project: '首创(NCC1909)',
    })
    expect((await groupOf(path, '首创(NCC1909)')).projectId).toBe(PROJECT.projectId)
    expect(result.changes).toContain('绑定项目：首创(NCC1909)')
  })

  it('空串解绑', async () => {
    const { call, path } = await bench()
    await call('datasource_upsert', { key: '首创(NCC1909)::test', project: '首创(NCC1909)' })
    await call('datasource_upsert', { key: '首创(NCC1909)::test', project: '' })
    expect(await groupOf(path, '首创(NCC1909)')).not.toHaveProperty('projectId')
  })

  it('不认识的项目名照实说找不到', async () => {
    const { call } = await bench()
    await expect(call('datasource_upsert', { key: '首创(NCC1909)::test', project: '没有这个项目' }))
      .rejects.toThrow('no project matches')
  })
})

describe('verify', () => {
  it('写入后探活，把结果写进回答', async () => {
    const { render, runner } = await bench()
    const text = await render('datasource_upsert', {
      key: '首创(NCC1909)::test',
      host: '10.10.9.12',
      verify: true,
    })
    expect(runner.requests).toHaveLength(1)
    expect(runner.requests[0]?.sql).toBe('SELECT 1 FROM DUAL')
    expect(text).toContain('探活：连通')
  })

  it('探活不可用时写入依然完成，回答只说探活失败', async () => {
    // 「存进去」和「连得上」是两件事。这一条钉住这个区分：探活失败不许被写成
    // 写入失败，否则调用方会以为没写进去而重试。
    const { render, path } = await bench(
      runnerStub({ available: false, unavailableReason: '测试里说不可用' }),
    )
    const text = await render('datasource_upsert', {
      key: '首创(NCC1909)::test',
      host: '10.10.9.12',
      verify: true,
    })
    expect(text).toContain('写入已完成，但探活失败')
    expect((await branchOf(path, '首创(NCC1909)', 'test')).host).toBe('10.10.9.12')
  })
})

describe('密码的去向', () => {
  it('回答里只说密码的去向，不出现密码本身', async () => {
    const { render } = await bench()
    // 登录名没变、只重设密码：说「重设」，不说「SCNCC → SCNCC」。
    const reset = await render('datasource_upsert', {
      key: '首创(NCC1909)::test',
      user: 'SCNCC',
      password: 'scncc123456',
    })
    expect(reset).toContain('重设登录名「SCNCC」的密码')
    expect(reset).not.toContain('scncc123456')

    // 换了登录名：说清旧密码一并替换。
    const changed = await render('datasource_upsert', {
      key: '首创(NCC1909)::test',
      user: 'SCNCC2',
      password: 'scncc123456',
    })
    expect(changed).toContain('登录名：SCNCC → SCNCC2（原密码一并替换）')
    expect(changed).not.toContain('scncc123456')
  })
})

describe('门', () => {
  it('只读会话直接拒绝写连接', async () => {
    const { gate } = await bench()
    const decision = await gate(
      'datasource_upsert',
      { key: '首创(NCC1909)::test', host: '10.0.0.1' },
      { sandbox: 'read-only' },
    )
    expect(decision.kind).toBe('deny')
    expect(decision.reason).toContain('仅可查看')
  })

  it('默认要人点头，审批卡上就是那份预览', async () => {
    const { gate } = await bench()
    const decision = await gate(
      'datasource_upsert',
      { key: '首创(NCC1909)::test', host: '10.10.9.12' },
      { sandbox: 'workspace-write' },
    )
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('更新数据源「首创(NCC1909)::test」')
    expect(decision.reason).toContain('地址：10.10.9.11 → 10.10.9.12')
  })

  it('新建时预览列出会写下去的字段，而不是一份空 diff', async () => {
    const { gate } = await bench()
    const decision = await gate(
      'datasource_upsert',
      { key: '新环境(NCC1909)::dev', db_type: 'oracle', host: '10.0.0.1', port: 1521 },
      { sandbox: 'workspace-write' },
    )
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('新建数据源「新环境(NCC1909)::dev」')
    expect(decision.reason).toContain('类型：oracle')
    expect(decision.reason).toContain('地址：10.0.0.1:1521')
  })

  it('审批卡里没有密码', async () => {
    const { gate } = await bench()
    const decision = await gate(
      'datasource_upsert',
      { key: '首创(NCC1909)::test', user: 'SCNCC', password: 'scncc123456' },
      { sandbox: 'workspace-write' },
    )
    expect(decision.kind).toBe('ask')
    expect(decision.reason).toContain('重设登录名「SCNCC」的密码')
    expect(decision.reason).not.toContain('scncc123456')
  })

  it('approval=never 时放行（那是操作者自己选的）', async () => {
    const { gate } = await bench()
    const decision = await gate(
      'datasource_upsert',
      { key: '首创(NCC1909)::test', host: '10.10.9.12' },
      { sandbox: 'workspace-write', approval: 'never' },
    )
    expect(decision.kind).toBe('allow')
  })

  it('参数不可用时不去问人，交给工具自己报错', async () => {
    // 问一个跑不起来的调用是噪音，而且那一下审批会让人以为自己要批准什么。
    const { gate } = await bench()
    const decision = await gate('datasource_upsert', { key: '没有分隔符' }, { sandbox: 'workspace-write' })
    expect(decision.kind).toBe('allow')
  })

  it('datasource_query 的门没有被这一族的新分支带偏', async () => {
    const { gate } = await bench()
    // 一条只读语句不该被问；一条会改数据的语句才问。
    expect((await gate('datasource_query', { key: '首创(NCC1909)::test', sql: 'SELECT 1 FROM DUAL' })).kind)
      .toBe('allow')
    expect((await gate('datasource_query', { key: '首创(NCC1909)::test', sql: 'DELETE FROM x' })).kind)
      .toBe('ask')
  })
})
