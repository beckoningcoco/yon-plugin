/**
 * Reading and editing GBK-encoded source files, exposed to the agent as one tool.
 *
 * ## Why this needs a tool at all
 *
 * A NCC customisation tree holds `.java` files that are GBK on disk, while every
 * general-purpose editor and search tool decodes UTF-8. Reading one gives mojibake;
 * searching one silently never matches a Chinese term; editing one and saving it
 * writes UTF-8 over GBK and corrupts every Chinese literal in the file — silently,
 * because the damage is a `?` or a replacement character rather than an error.
 *
 * The bundled `gbk_edit.py` handles all three correctly, and this module is how the
 * model reaches it. The path differs per installation and a skill body is inlined
 * at build time, so a skill cannot name it; hosting the call here means the model
 * asks for an edit and never learns a path.
 *
 * ## The contract with the script
 *
 * Arguments map one-to-one onto the script's own flags, because the script is also
 * usable by hand and the two must not drift. `edits` is the one addition: the model
 * supplies an array and this module writes it to a temporary file, since the script
 * reads its edit list from disk.
 *
 * A write stops for the operator's approval. That is the same disposition the
 * project and datasource writes use, so one session permission preset governs
 * everything that can change a file.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { dispositionOf, permissionsOf } from './tools.ts'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'
import type { RunSubprocess } from './datasource-probe.ts'

/** Every tool this module owns. */
export const GBK_TOOL_NAMES = ['ncc_gbk_edit'] as const

/**
 * The bundled editor, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL works
 * for the compiled plugin and for a spec running against the sources.
 */
export const GBK_EDIT_SCRIPT_PATH = fileURLToPath(
  new URL('../../resources/knowledge/ncc/tools/gbk_edit.py', import.meta.url),
)

/** How long one run may take before its process tree is terminated. */
const RUN_TIMEOUT_MS = 30_000

/** How long a terminated child gets to exit before it is killed outright. */
const RUN_GRACE_MS = 3_000

/** Memory cap per stream; anything larger is noise, not an answer. */
const MAX_STREAM_BYTES = 512 * 1024

/** The executable name looked up on the operator's PATH. */
const PYTHON_COMMAND = 'python'

/** What a call can fail with. */
export class GbkError extends Error {
  constructor(readonly code: 'invalid-input' | 'failed', message: string) {
    super(message)
    this.name = 'GbkError'
  }
}

/** One substitution the model asked for. */
interface Edit {
  readonly old: string
  readonly new: string
  readonly count?: number
}

/** The arguments one call carries, validated. */
interface GbkCall {
  readonly path: string
  readonly read: boolean
  readonly lines?: string
  readonly grep?: string
  readonly edits?: readonly Edit[]
  readonly convert?: 'utf8' | 'gbk' | 'gb18030'
  readonly encoding?: string
  readonly dryRun: boolean
  readonly backup: boolean
}

/** Read one argument as a required non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GbkError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/** Read the `edits` argument into at least one usable substitution. */
function asEdits(value: unknown): readonly Edit[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    throw new GbkError('invalid-input', 'edits 必须是非空数组，元素形如 { old, new, count? }')
  }
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new GbkError('invalid-input', `edits[${index}] 必须是对象`)
    }
    const row = entry as Record<string, unknown>
    if (typeof row.old !== 'string') {
      throw new GbkError('invalid-input', `edits[${index}].old 必须是字符串`)
    }
    if (typeof row.new !== 'string') {
      throw new GbkError('invalid-input', `edits[${index}].new 必须是字符串`)
    }
    const count = typeof row.count === 'number' ? row.count : undefined
    return count === undefined
      ? { old: row.old, new: row.new }
      : { old: row.old, new: row.new, count }
  })
}

/** Validate one call's arguments. */
function asCall(args: Record<string, unknown>): GbkCall {
  const path = asString(args.path, 'path')
  const read = args.read === true
  const lines = typeof args.lines === 'string' && args.lines !== '' ? args.lines : undefined
  const grep = typeof args.grep === 'string' && args.grep !== '' ? args.grep : undefined
  const edits = asEdits(args.edits)
  const rawConvert = args.convert
  if (rawConvert !== undefined && rawConvert !== 'utf8' && rawConvert !== 'gbk' && rawConvert !== 'gb18030') {
    throw new GbkError('invalid-input', 'convert 只能是 utf8 / gbk / gb18030')
  }
  const convert = rawConvert as GbkCall['convert']
  const encoding = typeof args.encoding === 'string' && args.encoding !== '' ? args.encoding : undefined

  if (!read && grep === undefined && edits === undefined && convert === undefined) {
    throw new GbkError(
      'invalid-input',
      '没有指定任何操作：至少要给 read / grep / edits / convert 之一',
    )
  }

  return {
    path,
    read,
    ...(lines === undefined ? {} : { lines }),
    ...(grep === undefined ? {} : { grep }),
    ...(edits === undefined ? {} : { edits }),
    ...(convert === undefined ? {} : { convert }),
    ...(encoding === undefined ? {} : { encoding }),
    dryRun: args.dryRun === true,
    backup: args.backup === true,
  }
}

/** Whether one call could change a file on disk. */
export function isGbkWrite(args: unknown): boolean {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return false
  const row = args as Record<string, unknown>
  if (row.dryRun === true) return false
  return row.edits !== undefined || row.convert !== undefined
}

/** One run's outcome. */
interface GbkRun {
  readonly ok: boolean
  readonly exitCode: number | null
  readonly output: string
  readonly error?: string
}

/**
 * Run the bundled editor once.
 * @param command - the resolved python executable.
 * @param call - the validated arguments.
 * @param subprocess - the subprocess service.
 * @param signal - cancellation from the tool call.
 * @returns what the script printed, and whether it succeeded.
 */
async function runEditor(
  command: string,
  call: GbkCall,
  subprocess: RunSubprocess,
  signal: AbortSignal,
): Promise<GbkRun> {
  const argv: string[] = [command, GBK_EDIT_SCRIPT_PATH, call.path]
  if (call.encoding !== undefined) argv.push('--encoding', call.encoding)
  if (call.read) argv.push('--read')
  if (call.lines !== undefined) argv.push('--lines', call.lines)
  if (call.grep !== undefined) argv.push('--grep', call.grep)
  if (call.convert !== undefined) argv.push('--convert', call.convert)
  if (call.dryRun) argv.push('--dry-run')
  if (call.backup) argv.push('--backup')

  // The script reads its edit list from a file, so the array the model supplied
  // becomes one. Written under the system temporary directory and removed in the
  // finally below, because an edit list is not worth leaving behind.
  let scratch: string | undefined
  try {
    if (call.edits !== undefined) {
      scratch = await mkdtemp(join(tmpdir(), 'yon-gbk-'))
      const editsPath = join(scratch, 'edits.json')
      await writeFile(editsPath, JSON.stringify(call.edits, null, 2), 'utf8')
      argv.push('--edits', editsPath)
    }

    const handle = subprocess.spawn({
      argv,
      // The script resolves nothing relative to the working directory, but a
      // predictable one keeps its own error messages readable.
      cwd: fileURLToPath(new URL('../../resources/knowledge/ncc/tools/', import.meta.url)),
      stdio: {
        // The script prompts before an ambiguous match; with no stdin it exits
        // instead of hanging on a question nobody can answer.
        stdin: 'ignore',
        stdout: { maxBytes: MAX_STREAM_BYTES },
        stderr: { maxBytes: MAX_STREAM_BYTES },
      },
      graceMs: RUN_GRACE_MS,
      signal,
    })

    const timer = setTimeout(() => { handle.terminate() }, RUN_TIMEOUT_MS)
    try {
      const outcome = await handle.done
      const stdout = handle.collected.stdout?.readFrom(0).text ?? ''
      const stderr = handle.collected.stderr?.readFrom(0).text ?? ''
      const ok = outcome.exitCode === 0
      return {
        ok,
        exitCode: outcome.exitCode,
        output: stdout.trimEnd(),
        ...(ok || stderr.trim() === '' ? {} : { error: stderr.trim() }),
      }
    } finally {
      clearTimeout(timer)
    }
  } finally {
    if (scratch !== undefined) await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** One tool definition over the registry's contract. */
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
      render: (_args, value) => [{ type: 'text', text: spec.render(value as V) }] as YonTextBlock[],
    },
    async execute(args: unknown, exec: { readonly signal: AbortSignal }): Promise<unknown> {
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        throw new GbkError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new GbkError('invalid-input', `${spec.name} 已被取消`)
      return await spec.execute(args as Record<string, unknown>, exec.signal)
    },
    presentCall: (args: unknown) =>
      (args === null || typeof args !== 'object' || Array.isArray(args))
        ? undefined
        : spec.presentCall(args as Record<string, unknown>),
  }
}

/** The JSON Schema of the answer. */
const VALUE = {
  type: 'object',
  required: ['ok', 'output'],
  properties: {
    ok: { type: 'boolean' },
    exitCode: { type: ['number', 'null'] },
    output: { type: 'string' },
    error: { type: 'string' },
  },
} as const

/** One line naming what a call asked for, built from raw arguments. */
function describe(args: Record<string, unknown>): string {
  const parts: string[] = [String(args.path ?? '')]
  if (args.read === true) {
    parts.push(typeof args.lines === 'string' ? `读 ${args.lines} 行` : '读全文')
  }
  if (typeof args.grep === 'string') parts.push(`搜索 ${args.grep}`)
  if (Array.isArray(args.edits)) parts.push(`替换 ${args.edits.length} 处`)
  if (typeof args.convert === 'string') parts.push(`转码 → ${args.convert}`)
  if (args.dryRun === true) parts.push('（dry-run）')
  return parts.join('  ·  ')
}

/** The subprocess service, read lazily so a deployment without one still loads. */
function subprocessOf(ctx: Context): RunSubprocess | undefined {
  return ctx.get('subprocess') as RunSubprocess | undefined
}

/**
 * Register the GBK editing tool and its write gate.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws every registration.
 */
export function registerYonGbkTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'ncc_gbk_edit',
    description: 'Read or edit a GBK-encoded source file — a NCC customisation .java tree is the '
      + 'usual case. General editor and search tools decode UTF-8, so a GBK file reads as mojibake, '
      + 'never matches a Chinese search term, and is CORRUPTED by a normal save; this tool does all '
      + 'three correctly and refuses a write it cannot make reversible.\n'
      + 'Operations (give at least one):\n'
      + '- read: true — print the file decoded; add lines: "180-240" to narrow it\n'
      + '- grep: "正则" — print matching lines with numbers\n'
      + '- edits: [{old, new, count?}] — substitute; count is the exact number of matches expected '
      + '(default 1), and a mismatch aborts the whole write rather than editing the wrong place\n'
      + '- convert: "utf8" | "gbk" | "gb18030" — transcode in place\n'
      + 'Set dryRun: true to see a diff without writing, and backup: true to keep a .bak. Writes stop '
      + 'for the operator\'s approval.\n'
      + 'After convert: "utf8", pass encoding: "utf-8" on later calls — the file is UTF-8 by then.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'The file to read or edit, absolute or relative to the working directory.' },
        read: { type: 'boolean', description: 'Print the file decoded with --encoding.' },
        lines: { type: 'string', description: 'With read: a line range, "A" or "A-B", 1-based.' },
        grep: { type: 'string', description: 'Print lines matching this regular expression, with line numbers.' },
        edits: {
          type: 'array',
          description: 'Substitutions, applied in order. count must equal the number of matches found or the write is refused.',
          items: {
            type: 'object',
            required: ['old', 'new'],
            properties: {
              old: { type: 'string', description: 'Text to find. Write line breaks as \\n; CRLF files are normalised.' },
              new: { type: 'string', description: 'Replacement text.' },
              count: { type: 'number', description: 'Exact number of matches expected; defaults to 1.' },
            },
          },
        },
        convert: {
          type: 'string',
          enum: ['utf8', 'gbk', 'gb18030'],
          description: 'Transcode the file in place. Pair with dryRun to see the size change first.',
        },
        encoding: {
          type: 'string',
          description: 'Encoding to READ the file with (default gb18030). Pass "utf-8" for a file already converted.',
        },
        dryRun: { type: 'boolean', description: 'Show the diff and write nothing.' },
        backup: { type: 'boolean', description: 'Copy the file to <path>.bak before writing.' },
      },
    },
    outputSchema: VALUE,
    async execute(args, signal) {
      const call = asCall(args)
      const subprocess = subprocessOf(ctx)
      if (subprocess === undefined) {
        throw new GbkError('failed', '这个部署没有 subprocess 服务，无法运行 GBK 编辑脚本。')
      }
      const command = await subprocess.resolveExecutable(PYTHON_COMMAND)
      const run = await runEditor(command, call, subprocess, signal)
      return run as unknown as { ok: boolean; output: string }
    },
    render(value) {
      const run = value as GbkRun
      if (!run.ok) {
        return [
          `操作失败（退出码 ${run.exitCode ?? '未知'}）：`,
          run.error ?? run.output ?? '（没有更多信息）',
          '',
          '排查：确认 python 在 PATH 上、目标文件存在且可读写。',
        ].join('\n')
      }
      return run.output === '' ? '完成（脚本没有输出）。' : run.output
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `GBK：${describe(args)}`,
        kind: isGbkWrite(args) ? 'other' : 'read',
        rawInput: args.path,
      }
    },
  })))

  // The gate. A read never reaches it; a write inherits exactly the disposition
  // the other write tools use, so one session preset governs all of them.
  disposers.push(ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'ncc_gbk_edit') return next()
    if (!isGbkWrite(exec.arguments)) return next()

    const disposition = dispositionOf(true, permissionsOf(exec.agent?.session))
    if (disposition === 'run') return next()
    if (disposition === 'refuse') {
      return {
        kind: 'deny' as const,
        reason: '当前会话是「仅可查看」权限，不能改动文件。'
          + '要改动请把会话切到「工作区内修改」或「完全权限」（/permission workspace-write）。',
      }
    }
    return {
      kind: 'ask' as const,
      reason: '这次调用会改动磁盘上的文件，执行前请确认：\n\n'
        + '  GBK 文件的写入不可逆：脚本会在落盘前校验解码/编码能否逐字节还原，'
        + '校验不过就整体拒绝，但一旦写入成功，就只能靠 .bak 或版本控制回退。\n\n'
        + '建议先用 dryRun: true 看一眼 diff，再用 backup: true 落盘。',
    }
  }))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
