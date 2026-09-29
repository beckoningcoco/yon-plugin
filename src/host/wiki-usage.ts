/**
 * A log of what the knowledge base was asked, and what it could not answer.
 *
 * ## Why a log, when the vault already measures itself
 *
 * Every other signal about a vault is static: how many pages carry a field list,
 * how many entities they cite, which sections they have. Those answer "what is in
 * here". They cannot answer "what was needed and not found", and that is the
 * question that decides what to write next.
 *
 * A miss is the strongest evidence this plugin can produce. When a lookup for
 * `clm_contract` returns nothing, that is not an estimate of usefulness — it is a
 * recorded failure with a timestamp, from a caller who wanted something. The
 * static gap report (`wiki_gaps`) covers the other half: entities the pages
 * already cite and none of them covers. Neither replaces the other, because a
 * vault can be missing a page nobody has needed yet and a page nobody can find.
 *
 * ## Why it is appended and never rewritten
 *
 * The file is JSON Lines, one object per line. Appending needs no
 * read-modify-write, so two calls racing cannot lose each other's entry, and a
 * crash mid-write costs one line rather than the file. Recording is best-effort
 * by construction: a query must never fail because its log could not be written,
 * so every write swallows its error rather than propagating it.
 */
import { appendFile, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** One question put to the knowledge base. */
export interface WikiUsageEntry {
  /** ISO timestamp of the call. */
  readonly at: string
  /** Which tool was called. */
  readonly tool: string
  /** The term or page name it was called with. */
  readonly term: string
  /** Vault the caller restricted to, when it restricted. */
  readonly vault?: string
  /** How many pages came back; zero is the interesting value. */
  readonly hits: number
  /** The first page returned, when there was one. */
  readonly top?: string
}

/** A term the knowledge base was asked for and could not answer. */
export interface WikiUsageMiss {
  readonly term: string
  /** How many times it was asked. */
  readonly count: number
  /** The most recent time it was asked, ISO. */
  readonly last: string
}

/** What the log says once it is folded. */
export interface WikiUsageSummary {
  /** How many questions the log holds. */
  readonly total: number
  /** Terms that came back empty, most-asked first. */
  readonly misses: readonly WikiUsageMiss[]
  /** Terms asked most often, whatever the answer was. */
  readonly popular: readonly { readonly term: string, readonly count: number }[]
  /** The oldest entry the log still holds, ISO; absent when it holds none. */
  readonly since?: string
}

/** The log, as the service uses it. */
export interface WikiUsageLog {
  /**
   * Append one question; never throws.
   * @param entry - the entry, without its timestamp.
   */
  record(entry: Omit<WikiUsageEntry, 'at'>): Promise<void>
  /**
   * The tail of the log, oldest first.
   * @param limit - how many entries to keep; 5000 when omitted.
   */
  read(limit?: number): Promise<readonly WikiUsageEntry[]>
  /**
   * Fold the log into what it is for: what could not be answered.
   * @param limit - how many rows to report per list; 15 when omitted.
   */
  summary(limit?: number): Promise<WikiUsageSummary>
}

/** Where the log lives. */
export function usageLogPath(): string {
  return join(homedir(), '.dsh', 'yon-panel', 'wiki-usage.jsonl')
}

/**
 * How many lines are folded at most.
 *
 * A cap on the read rather than on the write: truncating the file would need a
 * rewrite, and a rewrite is what this format exists to avoid. A log that outgrows
 * this is still complete on disk; only the report narrows.
 */
const READ_LIMIT = 5000

/**
 * Build the usage log.
 * @param target - the file to append to; the default path when omitted.
 * @returns the log.
 */
export function createWikiUsageLog(target: string = usageLogPath()): WikiUsageLog {
  const read = async (limit: number = READ_LIMIT): Promise<readonly WikiUsageEntry[]> => {
    const raw = await readFile(target, 'utf8').catch(() => undefined)
    if (raw === undefined) return []
    const lines = raw.split('\n').filter(line => line.trim() !== '')
    const tail = lines.slice(Math.max(0, lines.length - limit))
    const entries: WikiUsageEntry[] = []
    for (const line of lines.length > limit ? tail : lines) {
      try {
        const parsed = JSON.parse(line) as Partial<WikiUsageEntry>
        if (typeof parsed.term === 'string' && typeof parsed.hits === 'number') {
          entries.push({
            at: typeof parsed.at === 'string' ? parsed.at : '',
            tool: typeof parsed.tool === 'string' ? parsed.tool : '',
            term: parsed.term,
            hits: parsed.hits,
            ...(typeof parsed.vault === 'string' ? { vault: parsed.vault } : {}),
            ...(typeof parsed.top === 'string' ? { top: parsed.top } : {}),
          })
        }
      } catch {
        // One half-written line is not worth failing a whole report over.
      }
    }
    return entries
  }

  return {
    async record(entry) {
      const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
      await appendFile(target, `${line}\n`, 'utf8').catch(() => undefined)
    },

    read,

    async summary(limit = 15) {
      const entries = await read()
      const counts = new Map<string, number>()
      const misses = new Map<string, WikiUsageMiss>()
      for (const entry of entries) {
        const key = entry.term.trim().toLowerCase()
        counts.set(key, (counts.get(key) ?? 0) + 1)
        if (entry.hits > 0) continue
        const seen = misses.get(key)
        misses.set(key, {
          term: entry.term.trim(),
          count: (seen?.count ?? 0) + 1,
          // Entries are appended in time order, so the last one written wins.
          last: entry.at,
        })
      }
      const since = entries[0]?.at
      return {
        total: entries.length,
        misses: [...misses.values()]
          .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
          .slice(0, limit),
        popular: [...counts]
          .map(([term, count]) => ({ term, count }))
          .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
          .slice(0, limit),
        ...(since === undefined || since === '' ? {} : { since }),
      }
    },
  }
}
