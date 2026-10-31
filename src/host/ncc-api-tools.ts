/**
 * NCC OpenAPI 调用，暴露给模型的三件工具。
 *
 * - `ncc_api_list_envs` 回答“配了哪些环境”，不读 secret；
 * - `ncc_api_save_env` 新增/更新一条环境，secret 只向内写，回答里永远打码；
 * - `ncc_api_call` 取 token、签名、发请求，把状态码和响应体原样带回来。
 *
 * 三个工具都不碰数据库、不碰浏览器：HTTP 一条链路，签名算法在 `ncc-api.ts` 里，
 * 与随包的 Python 版逐行对齐。
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  callNccApi,
  findNccApiEnv,
  loadNccApiConfig,
  nccApiConfigPath,
  saveNccApiConfig,
  NccApiError,
  type NccApiEnv,
  type NccApiConfig,
} from './ncc-api.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition, YonToolExecution } from './tools.ts'

/** 本模块的工具名，供注册与文档引用。 */
export const NCC_API_TOOL_NAMES = ['ncc_api_list_envs', 'ncc_api_save_env', 'ncc_api_call'] as const

const text = (value: string): YonTextBlock[] => [{ type: 'text', text: value }]

/** 读一个必填字符串参数。 */
function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new NccApiError('invalid-input', `参数 ${key} 必须是非空字符串`)
  }
  return value.trim()
}

/** 读一个可选字符串参数。 */
function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 一条环境的对外视图：不含 secret，公钥只给长度。 */
interface EnvView {
  readonly name: string
  readonly host: string
  readonly client_id: string
  readonly biz_center: string
  readonly dsname: string
  readonly version: string
  readonly has_secret: boolean
  readonly pubkey_length: number
}

function viewOf(env: NccApiEnv): EnvView {
  return {
    name: env.name,
    host: env.host,
    client_id: env.client_id,
    biz_center: env.biz_center,
    dsname: env.dsname,
    version: env.version === 'old' ? 'old' : 'new',
    has_secret: env.client_secret !== '',
    pubkey_length: env.pubkey.length,
  }
}

/** 一个工具定义，按注册中心的契约声明。 */
function defineTool<V>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  outputSchema: Record<string, unknown>
  render(value: V): string
  execute(args: Record<string, unknown>, signal: AbortSignal): Promise<V>
  presentCall(args: Record<string, unknown>): YonToolCallView
}): YonToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: spec.outputSchema,
      render: (_args, value) => text(spec.render(value as V)),
    },
    async execute(args: unknown, exec: YonToolExecution): Promise<unknown> {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new NccApiError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new NccApiError('invalid-input', `${spec.name} 已被取消`)
      return spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** 列出环境的结果。 */
interface ListValue {
  readonly path: string
  readonly active: string
  readonly count: number
  readonly envs: readonly EnvView[]
}

/** 保存环境的结果。 */
interface SaveValue {
  readonly path: string
  readonly name: string
  readonly created: boolean
  readonly active: string
  readonly env: EnvView
}

/** 调用接口的结果。 */
interface CallValue {
  readonly env: string
  readonly apiPath: string
  readonly ok: boolean
  readonly status: number
  readonly tokenCostMs: number
  readonly body: string
}

/**
 * 注册三个工具。
 * @param ctx - the plugin context whose `tools` registry receives them.
 * @returns a disposer that unregisters all three.
 */
export function registerYonNccApiTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool<ListValue>({
    name: 'ncc_api_list_envs',
    description:
      '列出本机已配置的 NCC OpenAPI 环境（host / biz_center / dsname / client_id / 版本）。不返回 secret 与公钥正文。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: {
      type: 'object',
      required: ['path', 'count', 'envs'],
      properties: {
        path: { type: 'string' },
        active: { type: 'string' },
        count: { type: 'number' },
        envs: { type: 'array', items: { type: 'object' } },
      },
    },
    async execute(): Promise<ListValue> {
      const config = loadNccApiConfig()
      return {
        path: nccApiConfigPath(),
        active: config.active,
        count: config.envs.length,
        envs: config.envs.map(viewOf),
      }
    },
    presentCall: () => ({ card: 'generic', title: '列出 NCC OpenAPI 环境', kind: 'read' }),
    render: (value) => {
      if (value.count === 0) {
        return `还没有配置环境。文件：${value.path}\n用 ncc_api_save_env 存一条，或把已有的 ncc-api-tester-config.json 迁过来。`
      }
      const lines = value.envs.map(env =>
        `· ${env.name}  ${env.host}  biz_center=${env.biz_center}  dsname=${env.dsname}  client_id=${env.client_id}  版本=${env.version}`)
      return `配置：${value.path}\n当前默认：${value.active === '' ? '（未设置）' : value.active}\n共 ${value.count} 个环境：\n${lines.join('\n')}`
    },
  })))

  disposers.push(ctx.tools.register(defineTool<SaveValue>({
    name: 'ncc_api_save_env',
    description:
      '新增或更新一条 NCC OpenAPI 环境（host / client_id / client_secret / 公钥 / biz_center / dsname）。同名则合并：不传 secret 或公钥时保留原值。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '环境名，如 环卫2111_本地' },
        host: { type: 'string', description: '如 47.93.224.130:917 或 https://host:port' },
        client_id: { type: 'string' },
        biz_center: { type: 'string', description: '账套编码，如 HW001' },
        client_secret: { type: 'string', description: '不传则保留原值' },
        pubkey: { type: 'string', description: 'RSA 公钥 base64（不含 PEM 头尾）；不传则保留原值' },
        dsname: { type: 'string', description: '数据源名，如 NCCHW' },
        version: { type: 'string', enum: ['new', 'old'], description: 'new=2005 及以上（默认），old=更早' },
        set_active: { type: 'boolean', description: '是否设为默认环境' },
      },
      required: ['name', 'host', 'client_id', 'biz_center'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['path', 'name', 'created', 'active', 'env'],
      properties: {
        path: { type: 'string' },
        name: { type: 'string' },
        created: { type: 'boolean' },
        active: { type: 'string' },
        env: { type: 'object' },
      },
    },
    async execute(args): Promise<SaveValue> {
      const name = requireString(args, 'name')
      const host = requireString(args, 'host')
      const clientId = requireString(args, 'client_id')
      const bizCenter = requireString(args, 'biz_center')
      const config = loadNccApiConfig()
      const existing = config.envs.find(env => env.name === name)

      const secret = optionalString(args, 'client_secret') ?? existing?.client_secret ?? ''
      const pubkey = optionalString(args, 'pubkey') ?? existing?.pubkey ?? ''
      if (secret === '') throw new NccApiError('invalid-input', `环境「${name}」缺少 client_secret`)
      if (pubkey === '') throw new NccApiError('invalid-input', `环境「${name}」缺少公钥 pubkey`)

      const version = optionalString(args, 'version') === 'old' ? 'old' : 'new'
      const next: NccApiEnv = {
        name,
        host,
        client_id: clientId,
        client_secret: secret,
        pubkey,
        biz_center: bizCenter,
        dsname: optionalString(args, 'dsname') ?? existing?.dsname ?? '',
        version,
      }

      const envs = existing === undefined
        ? [...config.envs, next]
        : config.envs.map(env => env.name === name ? next : env)
      const setActive = args.set_active === true || (existing === undefined && config.active === '')
      const active = setActive ? name : config.active
      saveNccApiConfig({ active, envs })

      return {
        path: nccApiConfigPath(),
        name,
        created: existing === undefined,
        active,
        env: viewOf(next),
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `保存 NCC OpenAPI 环境：${typeof args.name === 'string' ? args.name : ''}`,
      kind: 'other',
    }),
    render: (value) => {
      const head = value.created ? '已新增环境' : '已更新环境'
      return `${head}「${value.name}」\n文件：${value.path}\nhost=${value.env.host}  client_id=${value.env.client_id}  biz_center=${value.env.biz_center}  dsname=${value.env.dsname}\nsecret 已写入（不显示）  公钥长度=${value.env.pubkey_length}\n当前默认环境：${value.active}`
    },
  })))

  disposers.push(ctx.tools.register(defineTool<CallValue>({
    name: 'ncc_api_call',
    description:
      '调用 NCC OpenAPI：自动取 token（RSA 加密 secret + SHA256 签名）、带 access_token 调业务接口，返回 HTTP 状态码与响应体原文。',
    parameters: {
      type: 'object',
      properties: {
        env: { type: 'string', description: '环境名，见 ncc_api_list_envs' },
        api_path: { type: 'string', description: '如 /nccloud/api/uapbd/newproject/add' },
        body: { type: 'string', description: '请求体 JSON 字符串，如 {"project_code":"X01"}' },
        timeout_ms: { type: 'number', description: '超时毫秒，默认 120000' },
      },
      required: ['env', 'api_path', 'body'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['env', 'apiPath', 'ok', 'status', 'tokenCostMs', 'body'],
      properties: {
        env: { type: 'string' },
        apiPath: { type: 'string' },
        ok: { type: 'boolean' },
        status: { type: 'number' },
        tokenCostMs: { type: 'number' },
        body: { type: 'string' },
      },
    },
    async execute(args): Promise<CallValue> {
      const envName = requireString(args, 'env')
      const apiPath = requireString(args, 'api_path')
      const rawBody = args.body
      const body = typeof rawBody === 'string'
        ? rawBody
        : (rawBody !== null && typeof rawBody === 'object' ? JSON.stringify(rawBody) : '')
      if (body.trim() === '') throw new NccApiError('invalid-input', '参数 body 必须是非空 JSON 字符串')
      const timeout = typeof args.timeout_ms === 'number' && Number.isFinite(args.timeout_ms) && args.timeout_ms > 0
        ? Math.min(args.timeout_ms, 300_000)
        : 120_000

      const config: NccApiConfig = loadNccApiConfig()
      const env = findNccApiEnv(config, envName)
      const result = await callNccApi(env, apiPath, body, timeout)
      return {
        env: env.name,
        apiPath: result.apiPath,
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        tokenCostMs: result.tokenCostMs,
        body: result.body,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `调用 NCC OpenAPI：${typeof args.api_path === 'string' ? args.api_path : ''}`,
      kind: 'other',
      rawInput: args,
    }),
    render: (value) => {
      const head = `POST ${value.apiPath} @ ${value.env} → HTTP ${value.status}${value.ok ? '' : '（失败）'}，取 token ${value.tokenCostMs}ms`
      const body = value.body.length > 4000 ? `${value.body.slice(0, 4000)}\n…（已截断，共 ${value.body.length} 字符）` : value.body
      return `${head}\n${body}`
    },
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
