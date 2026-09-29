/**
 * 消化检查的流水账：每一次验收的结果都留一条，可以在面板上看。
 *
 * ## 为什么需要它
 *
 * `digest_audit` 把结论**说完就没了**。模型跑一次验收，看到一个「不合格」，
 * 返工，再跑一次，这次「合格」——然后交付。整个过程在会话结束后不留痕迹：
 *
 * - **看不见趋势**：同一份文档前后两次验收的分数变化，只有当时在场的人知道；
 * - **看不见失败**：一次不合格的验收和一盘没跑过的验收，事后一模一样；
 * - **看不见依据**：报告里那几行数字是当时算的，事后无法复算、无法比对。
 *
 * 实测里正是靠翻这些数字才发现问题的：27 份摘要的覆盖率从 0.2% 到 42.5%，
 * 而合格线是 85%——**但那些数字只在跑的那一次存在过**。
 *
 * ## 为什么是 JSON Lines，为什么只追加
 *
 * 与 `wiki-usage.ts` 同一个理由：追加不需要读-改-写，两次调用并发也不会互相
 * 覆盖，写到一半崩掉只损失一行而不是整个文件。记录是**尽力而为**——验收绝不能
 * 因为日志写不进去而失败，所以每次写入都吞掉自己的错误。
 *
 * ## 它不记什么
 *
 * 不记源文档与产物的内容，只记路径、分数与判定。日志要能安心留在
 * `~/.dsh/yon-panel/` 下，不能变成知识库的第二份副本。
 */
import { appendFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 一次检查的结局。 */
export type DigestOutcome =
  /** 全部通过。 */
  | 'pass'
  /** 有项目不合格。 */
  | 'fail'
  /** 只跑门禁，不作判定。 */
  | 'gate'
  /** 摸底，没有合格与否可言。 */
  | 'plan'
  /** 批量体检的汇总行。 */
  | 'sweep'

/** 流水账里的一行。 */
export interface DigestLogEntry {
  /** ISO 时间戳。 */
  readonly at: string
  /** 哪个工具：`digest_plan` / `digest_audit` / `digest_sweep`。 */
  readonly tool: string
  readonly outcome: DigestOutcome
  /** 报告抬头用的名字。 */
  readonly label: string
  /** 源文档路径。 */
  readonly source: string
  /** 产物显示名；一组文件时是「首名 等 N 页」。 */
  readonly product: string
  /** 产物文件数。 */
  readonly pages: number
  /** 未通过的项目名，按报告顺序。 */
  readonly failed: readonly string[]
  /** 七项实测值，null 表示该项不适用。 */
  readonly metrics: Readonly<Record<string, number | null>>
  /** 源文档字节数。 */
  readonly sourceBytes: number
  /** 产物字节数。 */
  readonly productBytes: number
  /** 本次耗时毫秒。 */
  readonly ms: number
  /** 批量体检专用：扫了多少份。 */
  readonly scanned?: number
  /** 批量体检专用：多少组合格。 */
  readonly passing?: number
  /** 批量体检专用：多少组不合格。 */
  readonly failing?: number
  /**
   * 批量体检专用：能验收的组里，流水账**没有任何判定记录**的组数。
   *
   * 与 `failing` 并列而不是合并：没验过的既不是合格也不是不合格，混进任何一边
   * 都是替一份没人看过的消化下结论。
   */
  readonly neverAudited?: number
  /** 摸底专用：识别到几章。 */
  readonly chapters?: number
}

/** 计量项的名字，面板按这个顺序显示。 */
export const DIGEST_METRIC_KEYS = [
  'terms', 'identifiers', 'level1', 'level2', 'constraints',
  'fidelity', 'provenance', 'overlap', 'addressable',
] as const

/** 一条计量项的中文名。 */
export const DIGEST_METRIC_LABELS: Readonly<Record<string, string>> = {
  terms: '术语',
  identifiers: '标识符',
  level1: '一级章节',
  level2: '二级章节',
  constraints: '约束句',
  fidelity: '保真',
  provenance: '溯源',
  overlap: '重叠',
  addressable: '可寻址',
}

/** 折起来之后的流水账。 */
export interface DigestLogSummary {
  /** 一共多少条。 */
  readonly total: number
  /** 最早一条的时间；空日志时缺省。 */
  readonly since?: string
  /** 均值实际覆盖了多少次验收（有判定的那些）。面板用它写明依据。 */
  readonly averagedOver: number
  /** 按结局计数。 */
  readonly byOutcome: Readonly<Record<string, number>>
  /** 按工具计数。 */
  readonly byTool: readonly { readonly tool: string, readonly count: number }[]
  /**
   * 每条计量项的最近表现：最近 N 次里该有值的那些条目上算的均值。
   * 这是面板上「分数」那一栏的数据来源——**看趋势，不看单次**。
   */
  readonly averages: Readonly<Record<string, number | null>>
  /** 最近若干条，新的在前。 */
  readonly recent: readonly DigestLogEntry[]
}

/** 流水账，服务层看到的样子。 */
export interface DigestLog {
  /**
   * 追加一条；永不抛错。
   * @param entry - 条目，时间戳由这里补。
   */
  record(entry: Omit<DigestLogEntry, 'at'>): Promise<void>
  /**
   * 读日志尾部，旧的在先。
   * @param limit - 最多读多少条；默认 2000。
   */
  read(limit?: number): Promise<readonly DigestLogEntry[]>
  /**
   * 折成面板要的形状。
   * @param recent - 返回多少条明细；默认 50。
   * @param window - 均值在最近多少条上算；默认 100。
   */
  summary(recent?: number, window?: number): Promise<DigestLogSummary>
}

/** 日志文件的位置。 */
export function digestLogPath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'digest-log.jsonl')
}

/** 折叠时最多读多少行。上限加在读上而不是写上——这个格式的全部意义就是不改写文件。 */
const READ_LIMIT = 2000

/** 把一行 JSON 解析成条目；不是条目就返回 undefined。 */
function parseEntry(line: string): DigestLogEntry | undefined {
  try {
    const raw = JSON.parse(line) as Partial<DigestLogEntry>
    if (typeof raw.source !== 'string' || typeof raw.tool !== 'string') return undefined
    const metrics: Record<string, number | null> = {}
    for (const key of DIGEST_METRIC_KEYS) {
      const value = (raw.metrics ?? {})[key]
      metrics[key] = typeof value === 'number' && Number.isFinite(value) ? value : null
    }
    return {
      at: typeof raw.at === 'string' ? raw.at : '',
      tool: raw.tool,
      outcome: (raw.outcome ?? 'fail') as DigestOutcome,
      label: typeof raw.label === 'string' ? raw.label : '',
      source: raw.source,
      product: typeof raw.product === 'string' ? raw.product : '',
      pages: typeof raw.pages === 'number' ? raw.pages : 0,
      failed: Array.isArray(raw.failed) ? raw.failed.filter((x): x is string => typeof x === 'string') : [],
      metrics,
      sourceBytes: typeof raw.sourceBytes === 'number' ? raw.sourceBytes : 0,
      productBytes: typeof raw.productBytes === 'number' ? raw.productBytes : 0,
      ms: typeof raw.ms === 'number' ? raw.ms : 0,
      ...(typeof raw.scanned === 'number' ? { scanned: raw.scanned } : {}),
      ...(typeof raw.passing === 'number' ? { passing: raw.passing } : {}),
      ...(typeof raw.failing === 'number' ? { failing: raw.failing } : {}),
      ...(typeof raw.neverAudited === 'number' ? { neverAudited: raw.neverAudited } : {}),
      ...(typeof raw.chapters === 'number' ? { chapters: raw.chapters } : {}),
    }
  } catch {
    // 写了一半的行不值得让整份报告失败
    return undefined
  }
}

/**
 * 建流水账。
 * @param target - 要追加的文件；省略时用默认路径。
 * @returns 流水账。
 */
export function createDigestLog(target: string = digestLogPath()): DigestLog {
  const read = async (limit: number = READ_LIMIT): Promise<readonly DigestLogEntry[]> => {
    const raw = await readFile(target, 'utf8').catch(() => undefined)
    if (raw === undefined) return []
    const lines = raw.split('\n').filter(line => line.trim() !== '')
    const tail = lines.slice(Math.max(0, lines.length - limit))
    const entries: DigestLogEntry[] = []
    for (const line of tail) {
      const entry = parseEntry(line)
      if (entry !== undefined) entries.push(entry)
    }
    return entries
  }

  return {
    async record(entry) {
      const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
      await appendFile(target, `${line}\n`, 'utf8').catch(() => undefined)
    },

    read,

    async summary(recent = 50, window = 100) {
      const entries = await read()
      const byOutcome: Record<string, number> = {}
      const toolCounts = new Map<string, number>()
      for (const entry of entries) {
        byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1
        toolCounts.set(entry.tool, (toolCounts.get(entry.tool) ?? 0) + 1)
      }

      // 均值只在该项**有值**的条目上算：一次摸底（没有保真率）不该把保真率的
      // 均值往下拉——那会让面板上的「分数」变成一个没有意义的数。
      const measured = entries.filter(e => e.outcome === 'pass' || e.outcome === 'fail').slice(-window)
      const averages: Record<string, number | null> = {}
      for (const key of DIGEST_METRIC_KEYS) {
        const values = measured
          .map(e => e.metrics[key])
          .filter((v): v is number => typeof v === 'number')
        averages[key] = values.length === 0
          ? null
          : values.reduce((sum, v) => sum + v, 0) / values.length
      }

      const newestFirst = [...entries].reverse().slice(0, recent)
      const since = entries[0]?.at
      return {
        total: entries.length,
        ...(since === undefined || since === '' ? {} : { since }),
        averagedOver: measured.length,
        byOutcome,
        byTool: [...toolCounts]
          .map(([tool, count]) => ({ tool, count }))
          .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
        averages,
        recent: newestFirst,
      }
    },
  }
}
