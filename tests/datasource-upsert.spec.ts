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

/**
 * 写库的门。
 *
 * 这一组钉的是一件当时设计错了的事：原来会改数据的语句在 `approval=never` 下
 * 直接放行，理由是「那是操作者自己选的」。对插件自己的库（项目、记忆、知识库）
 * 这句话成立——东西是他的，他说别问就别问。**客户数据库不成立**：库里没有一行
 * 属于他，一句 INSERT 也不像改字段那样事后改回来；最不能发生的就是没人看过它。
 *
 * 所以这一族的判定里根本没有「放行」这个结果，只剩「问人」和「拒绝」。顺带把
 * 判定本身从关键词黑名单倒过来变成只读白名单：黑名单列不全能改数据的写法，
 * `CALL` / `BEGIN` / `EXEC` / `RENAME` 都不含它列的那些词，于是被判成读语句——
 * 而门对「非破坏性」是直接放过去的，连只读会话都不拦。
 */
describe('写库的门', () => {
  const KEY = '首创(NCC1909)::test'

  /** 一批语句逐条过门，返回「语句 → 判定」。 */
  async function judge(sqls: readonly string[], permissions?: Partial<YonPermissions>) {
    const { gate } = await bench()
    const verdicts: Array<[string, string]> = []
    for (const sql of sqls) {
      const decision = await gate('datasource_query', { key: KEY, sql }, permissions)
      verdicts.push([sql, decision.kind])
    }
    return verdicts
  }

  it('完全权限下写语句依然被拒，不静默执行', async () => {
    // 使用者把权限开到最大，并且明确说了「不要问我」。文件、项目、记忆都可以照做，
    // 客户库不行——「没人可问」不是「可以写」。
    const fullAccess: Partial<YonPermissions> = { sandbox: 'danger-full-access', approval: 'never' }
    const { gate } = await bench()

    const decision = await gate('datasource_query', { key: KEY, sql: 'DELETE FROM x' }, fullAccess)
    expect(decision.kind).toBe('deny')
    expect(decision.reason).toContain('从不询问')
    // 拒绝理由要说清怎么才能继续，否则模型只会反复重试同一条。
    expect(decision.reason).toContain('询问')
  })

  it('工作区内修改 + never 同样被拒', async () => {
    // 完全权限不是这道门的分界线：插件碰得到什么，和谁同意过这次写库，是两件事。
    expect(await judge(['UPDATE x SET a = 1'], { sandbox: 'workspace-write', approval: 'never' }))
      .toEqual([['UPDATE x SET a = 1', 'deny']])
  })

  it('只读会话拒绝，说的仍然是权限', async () => {
    const { gate } = await bench()
    const decision = await gate('datasource_query', { key: KEY, sql: 'DELETE FROM x' },
      { sandbox: 'read-only', approval: 'ask' })
    expect(decision.kind).toBe('deny')
    expect(decision.reason).toContain('仅可查看')
  })

  it('会询问的会话里，写语句问人', async () => {
    expect(await judge(['DELETE FROM x'])).toEqual([['DELETE FROM x', 'ask']])
    expect(await judge(['DELETE FROM x'], { sandbox: 'danger-full-access', approval: 'ask' }))
      .toEqual([['DELETE FROM x', 'ask']])
  })

  it('不拼 INSERT 的写法也要过门', async () => {
    // 这几种都能改数据，却一个写关键词都不含。旧的黑名单把它们全当读语句放过去，
    // 而且是直接 return next()，只读会话那层检查也没走到。
    expect(await judge([
      'CALL sp_close_month()',
      'BEGIN sp_close_month(); END;',
      'EXEC sp_close_month',
      'RENAME TABLE a TO b',
      'REPLACE INTO t VALUES (1)',
      'GRANT SELECT ON t TO u',
      'LOCK TABLES t WRITE',
    ])).toEqual([
      ['CALL sp_close_month()', 'ask'],
      ['BEGIN sp_close_month(); END;', 'ask'],
      ['EXEC sp_close_month', 'ask'],
      ['RENAME TABLE a TO b', 'ask'],
      ['REPLACE INTO t VALUES (1)', 'ask'],
      ['GRANT SELECT ON t TO u', 'ask'],
      ['LOCK TABLES t WRITE', 'ask'],
    ])
  })

  it('读形态里藏着写也要过门', async () => {
    // 首词是读，写关键词在后面：PostgreSQL 的数据修改 CTE，以及靠驱动执行的多语句。
    expect(await judge([
      'WITH x AS (DELETE FROM t RETURNING id) SELECT * FROM x',
      'SELECT 1; DROP TABLE t',
      'SELECT * FROM t FOR UPDATE',
    ])).toEqual([
      ['WITH x AS (DELETE FROM t RETURNING id) SELECT * FROM x', 'ask'],
      ['SELECT 1; DROP TABLE t', 'ask'],
      ['SELECT * FROM t FOR UPDATE', 'ask'],
    ])
  })

  it('纯读语句不再被误拦', async () => {
    // 白名单要够宽，否则每条 SELECT 都弹一次审批，人很快就开始闭眼点同意。
    expect(await judge([
      'SELECT 1 FROM DUAL',
      'select * from t where a = 1',
      '  -- 先看一眼行数\nSELECT count(*) FROM t',
      '/* 核对字段 */ DESCRIBE t',
      'WITH x AS (SELECT 1 FROM DUAL) SELECT * FROM x',
      'SHOW TABLES',
    ])).toEqual([
      ['SELECT 1 FROM DUAL', 'allow'],
      ['select * from t where a = 1', 'allow'],
      ['  -- 先看一眼行数\nSELECT count(*) FROM t', 'allow'],
      ['/* 核对字段 */ DESCRIBE t', 'allow'],
      ['WITH x AS (SELECT 1 FROM DUAL) SELECT * FROM x', 'allow'],
      ['SHOW TABLES', 'allow'],
    ])
  })

  it('认不出是读的，一律按写处理', async () => {
    // 判不出来的东西归类到哪边，就是这个门的安全边界：归到「读」等于放行。
    expect(await judge([
      '-- 只有注释',
      '/* 没闭合',
      'SOMETHING NEW FROM ORACLE',
    ])).toEqual([
      ['-- 只有注释', 'ask'],
      ['/* 没闭合', 'ask'],
      ['SOMETHING NEW FROM ORACLE', 'ask'],
    ])
  })

  it('参数不可用时不去问人', async () => {
    // 问一个跑不起来的调用是噪音，而且那一下审批会让人以为自己批准了什么。
    const { gate } = await bench()
    expect((await gate('datasource_query', { key: KEY })).kind).toBe('allow')
    expect((await gate('datasource_query', { key: KEY, sql: '' })).kind).toBe('allow')
    expect((await gate('datasource_query', { key: KEY, sql: '   ' })).kind).toBe('allow')
  })
})
