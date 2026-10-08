/**
 * Reading a binary document on this machine — Excel, PDF, Word, CSV — as text.
 *
 * ## Why this needs a tool at all
 *
 * A general-purpose read tool decodes UTF-8, and every one of these formats is
 * either a zip container or a byte stream, so reading one yields mojibake or a
 * refusal. What actually works here is a Python stack, and **which library
 * covers which format is not guessable**: it has to be probed, and getting it
 * wrong costs a session. The bundled `parse_doc.py` is that probe plus the
 * extraction, and this module is how the model reaches it.
 *
 * The path differs per installation and a skill body is inlined at build time,
 * so a skill cannot name it; hosting the call here means the model asks for a
 * parse and never learns a path — the same reason `gbk-tool.ts` exists.
 *
 * ## What the script knows that a caller would not
 *
 * Three facts are worth more than the extraction itself, and all three come
 * from the script rather than from this module:
 *
 * - The real type is decided by **magic bytes, not the extension**. An `.xls`
 *   exported from a 用友 environment is frequently an xlsx underneath, and
 *   handing that to openpyxl by extension fails outright.
 * - A PDF with no text layer is a **scan**, and every text extractor returns an
 *   empty string for it. `probe` says so instead of reporting "0 characters" as
 *   though the document were empty.
 * - Which formats this machine can actually read is a local fact. `probe`
 *   answers per file, and a missing library is named rather than swallowed.
 *
 * ## The contract with the script
 *
 * Arguments map one-to-one onto the script's own flags, because the script is
 * also usable by hand and the two must not drift. One deliberate omission:
 * `--out` is not exposed. A tool that writes a file would need the write gate
 * the GBK editor carries, and the model already has a write tool of its own.
 * Nothing here reaches the network — the script is offline by construction.
 *
 * ## Reading a large document
 *
 * The result lands in the conversation, so `maxChars` is bounded by default
 * rather than left open. A document too large for one call is read in pieces:
 * `probe` first for its size, then `pages` for a PDF or `sheet` for a workbook.
 */
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { YonTextBlock, YonToolCallView, YonToolDefinition } from './tools.ts'
import type { RunSubprocess } from './datasource-probe.ts'

/** Every tool this module owns. */
export const DOC_PARSE_TOOL_NAMES = ['doc_parse'] as const

/**
 * The bundled reader, located relative to this module.
 *
 * `lib/host/<file>.js` and `src/host/<file>.ts` are equally deep, so one URL
 * works for the compiled plugin and for a spec running against the sources.
 */
export const DOC_PARSE_SCRIPT_PATH = fileURLToPath(
  new URL('../../resources/doc-parse/parse_doc.py', import.meta.url),
)

/** How long one run may take before its process tree is terminated. */
const RUN_TIMEOUT_MS = 60_000

/** How long a terminated child gets to exit before it is killed outright. */
const RUN_GRACE_MS = 3_000

/** Memory cap per stream; a large document is still far below this. */
const MAX_STREAM_BYTES = 4 * 1024 * 1024

/** The executable name looked up on the operator's PATH. */
const PYTHON_COMMAND = 'python'

/**
 * How much of a body one call returns when the caller does not say.
 *
 * A whole document pasted into the conversation crowds out the work that needed
 * it, so the default is a substantial excerpt rather than everything; a caller
 * that wants the rest passes a larger `maxChars` or reads one page at a time.
 */
const DEFAULT_MAX_CHARS = 50_000

/** What a call can fail with. */
export class DocParseError extends Error {
  constructor(readonly code: 'invalid-input' | 'failed', message: string) {
    super(message)
    this.name = 'DocParseError'
  }
}

/** The arguments one call carries, validated. */
interface DocParseCall {
  readonly path: string
  readonly probe: boolean
  readonly format: 'text' | 'json'
  readonly pages?: string
  readonly sheet?: string
  readonly maxChars: number
}

/** Read one argument as a required non-empty string. */
function asString(value: unknown, argument: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DocParseError('invalid-input', `${argument} 必须是非空字符串`)
  }
  return value.trim()
}

/** Validate one call's arguments. */
function asCall(args: Record<string, unknown>): DocParseCall {
  const path = asString(args.path, 'path')

  const rawFormat = args.format
  if (rawFormat !== undefined && rawFormat !== 'text' && rawFormat !== 'json') {
    throw new DocParseError('invalid-input', 'format 只能是 text 或 json')
  }

  const pages = typeof args.pages === 'string' && args.pages !== '' ? args.pages : undefined
  if (pages !== undefined && !/^\d+(-\d+)?$/.test(pages)) {
    throw new DocParseError('invalid-input', 'pages 形如 "3" 或 "1-5"')
  }

  const sheet = typeof args.sheet === 'string' && args.sheet !== '' ? args.sheet : undefined

  let maxChars = DEFAULT_MAX_CHARS
  if (args.maxChars !== undefined) {
    if (typeof args.maxChars !== 'number' || !Number.isInteger(args.maxChars) || args.maxChars < 0) {
      throw new DocParseError('invalid-input', 'maxChars 必须是非负整数；0 表示不截断')
    }
    maxChars = args.maxChars
  }

  return {
    path,
    probe: args.probe === true,
    format: rawFormat === 'json' ? 'json' : 'text',
    ...(pages === undefined ? {} : { pages }),
    ...(sheet === undefined ? {} : { sheet }),
    maxChars,
  }
}

/** One run's outcome. */
interface DocParseRun {
  readonly ok: boolean
  readonly exitCode: number | null
  readonly output: string
  readonly error?: string
}

/** What each non-zero exit code means, phrased as the next thing to try. */
const EXIT_HINTS: Record<number, string> = {
  1: '这个格式在当前机器上解析不了 —— 脚本已经在上面的说明里给出了出路。',
  2: '参数或文件有问题：确认路径存在，且 pages 形如 "1-5"。',
  3: '缺少解析库。按上面点名的库装上再试，例如 pip install PyMuPDF python-docx openpyxl。',
  4: '脚本在解析过程中抛错，原因见上。',
}

/**
 * Run the bundled reader once.
 * @param command - the resolved python executable.
 * @param call - the validated arguments.
 * @param subprocess - the subprocess service.
 * @param signal - cancellation from the tool call.
 * @returns what the script printed, and whether it succeeded.
 */
async function runParse(
  command: string,
  call: DocParseCall,
  subprocess: RunSubprocess,
  signal: AbortSignal,
): Promise<DocParseRun> {
  const argv: string[] = [command, DOC_PARSE_SCRIPT_PATH, call.path]
  if (call.probe) argv.push('--probe')
  if (call.format === 'json') argv.push('--format', 'json')
  if (call.pages !== undefined) argv.push('--pages', call.pages)
  if (call.sheet !== undefined) argv.push('--sheet', call.sheet)
  argv.push('--max-chars', String(call.maxChars))

  const handle = subprocess.spawn({
    argv,
    // The script resolves nothing relative to the working directory, but a
    // predictable one keeps its own error messages readable.
    cwd: fileURLToPath(new URL('../../resources/doc-parse/', import.meta.url)),
    stdio: {
      // Nothing here prompts; with no stdin a script that somehow did would
      // exit instead of hanging on a question nobody can answer.
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
        throw new DocParseError('invalid-input', `${spec.name} 需要一个对象参数`)
      }
      if (exec.signal.aborted) throw new DocParseError('invalid-input', `${spec.name} 已被取消`)
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
    exitCode: { oneOf: [{ type: 'number' }, { type: 'null' }] },
    output: { type: 'string' },
    error: { type: 'string' },
  },
} as const

/** One line naming what a call asked for, built from raw arguments. */
function describe(args: Record<string, unknown>): string {
  const parts: string[] = [String(args.path ?? '')]
  if (args.probe === true) parts.push('探测')
  if (typeof args.pages === 'string') parts.push(`第 ${args.pages} 页`)
  if (typeof args.sheet === 'string') parts.push(`工作表 ${args.sheet}`)
  return parts.join('  ·  ')
}

/** The subprocess service, read lazily so a deployment without one still loads. */
function subprocessOf(ctx: Context): RunSubprocess | undefined {
  return ctx.get('subprocess') as RunSubprocess | undefined
}

/**
 * Register the document reader.
 * @param ctx - host context carrying the tool registry.
 * @returns the disposer that withdraws the registration.
 */
export function registerYonDocParseTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []

  disposers.push(ctx.tools.register(defineTool({
    name: 'doc_parse',
    description: 'Read a binary document on this machine — Excel (.xlsx/.xlsm), PDF, Word (.docx), '
      + 'CSV/TSV — and get its text, tables and structure. A general-purpose read tool decodes UTF-8, '
      + 'so pointing it at any of these yields mojibake or a refusal; use this instead.\n'
      + '**Call it with probe: true first.** That answers, per file and cheaply: the real type (decided '
      + 'by magic bytes, not the extension — an .xls exported from 用友 is often an xlsx underneath), '
      + 'page or sheet count, whether it is encrypted, whether it is a scan with no text layer, and '
      + 'whether this machine can read it at all. Without probe you are guessing at all five.\n'
      + 'Then read: no flag for plain text plus Markdown tables, format: "json" for structure, '
      + 'pages: "1-5" to take a slice of a PDF, sheet: "明细" to take one worksheet.\n'
      + 'What it cannot do, and says so rather than failing silently: a scanned PDF has no text to '
      + 'extract (render it to an image and read that instead), and .doc/.xls/.ppt in the old binary '
      + 'format need converting first — this machine has no parser for them.\n'
      + 'Nothing here uses the network, and nothing is written to disk.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'The document to read, absolute or relative to the working directory.',
        },
        probe: {
          type: 'boolean',
          description: 'Report the file\'s real type, size, page/sheet count and readability instead of '
            + 'extracting text. Run this first — it is the cheap answer that decides everything else.',
        },
        format: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'text (default) is human-readable, with tables as Markdown; json is structured '
            + 'paragraph/table/cell data for when the answer has to be computed over.',
        },
        pages: {
          type: 'string',
          description: 'PDF only: a page range like "1-5" or a single page "3" (1-based, inclusive). '
            + 'Use it to read a long PDF in pieces.',
        },
        sheet: {
          type: 'string',
          description: 'xlsx only: read just this worksheet by name. Omit for every sheet.',
        },
        maxChars: {
          type: 'number',
          description: 'Truncate the result past this many characters; 0 means no truncation. '
            + 'Defaults to 50000, which keeps one document from crowding out the work that needed it.',
        },
      },
    },
    outputSchema: VALUE,
    async execute(args, signal) {
      const call = asCall(args)
      const subprocess = subprocessOf(ctx)
      if (subprocess === undefined) {
        throw new DocParseError('failed', '这个部署没有 subprocess 服务，无法运行文档解析脚本。')
      }
      const command = await subprocess.resolveExecutable(PYTHON_COMMAND)
      const run = await runParse(command, call, subprocess, signal)
      return run as unknown as { ok: boolean; output: string }
    },
    render(value) {
      const run = value as DocParseRun
      if (run.ok) return run.output === '' ? '解析完成（脚本没有输出）。' : run.output
      const hint = run.exitCode === null ? undefined : EXIT_HINTS[run.exitCode]
      return [
        run.error ?? run.output ?? '解析失败。',
        '',
        hint ?? '排查：确认 python 在 PATH 上、路径存在、文件未被其他程序占用。',
      ].join('\n')
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `文档解析：${describe(args)}`,
        // Read-only by construction: it opens files and writes nothing.
        kind: 'read',
        rawInput: args.path,
      }
    },
  })))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
