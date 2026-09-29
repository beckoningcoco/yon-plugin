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
import { appendFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
/** 计量项的名字，面板按这个顺序显示。 */
export const DIGEST_METRIC_KEYS = [
    'terms', 'identifiers', 'level1', 'level2', 'constraints',
    'fidelity', 'provenance', 'overlap', 'addressable',
];
/** 一条计量项的中文名。 */
export const DIGEST_METRIC_LABELS = {
    terms: '术语',
    identifiers: '标识符',
    level1: '一级章节',
    level2: '二级章节',
    constraints: '约束句',
    fidelity: '保真',
    provenance: '溯源',
    overlap: '重叠',
    addressable: '可寻址',
};
/** 日志文件的位置。 */
export function digestLogPath() {
    return join(homedir(), '.dsh', 'yon-panel', 'digest-log.jsonl');
}
/** 折叠时最多读多少行。上限加在读上而不是写上——这个格式的全部意义就是不改写文件。 */
const READ_LIMIT = 2000;
/** 把一行 JSON 解析成条目；不是条目就返回 undefined。 */
function parseEntry(line) {
    try {
        const raw = JSON.parse(line);
        if (typeof raw.source !== 'string' || typeof raw.tool !== 'string')
            return undefined;
        const metrics = {};
        for (const key of DIGEST_METRIC_KEYS) {
            const value = (raw.metrics ?? {})[key];
            metrics[key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
        }
        return {
            at: typeof raw.at === 'string' ? raw.at : '',
            tool: raw.tool,
            outcome: (raw.outcome ?? 'fail'),
            label: typeof raw.label === 'string' ? raw.label : '',
            source: raw.source,
            product: typeof raw.product === 'string' ? raw.product : '',
            pages: typeof raw.pages === 'number' ? raw.pages : 0,
            failed: Array.isArray(raw.failed) ? raw.failed.filter((x) => typeof x === 'string') : [],
            metrics,
            sourceBytes: typeof raw.sourceBytes === 'number' ? raw.sourceBytes : 0,
            productBytes: typeof raw.productBytes === 'number' ? raw.productBytes : 0,
            ms: typeof raw.ms === 'number' ? raw.ms : 0,
            ...(typeof raw.scanned === 'number' ? { scanned: raw.scanned } : {}),
            ...(typeof raw.passing === 'number' ? { passing: raw.passing } : {}),
            ...(typeof raw.failing === 'number' ? { failing: raw.failing } : {}),
            ...(typeof raw.chapters === 'number' ? { chapters: raw.chapters } : {}),
        };
    }
    catch {
        // 写了一半的行不值得让整份报告失败
        return undefined;
    }
}
/**
 * 建流水账。
 * @param target - 要追加的文件；省略时用默认路径。
 * @returns 流水账。
 */
export function createDigestLog(target = digestLogPath()) {
    const read = async (limit = READ_LIMIT) => {
        const raw = await readFile(target, 'utf8').catch(() => undefined);
        if (raw === undefined)
            return [];
        const lines = raw.split('\n').filter(line => line.trim() !== '');
        const tail = lines.slice(Math.max(0, lines.length - limit));
        const entries = [];
        for (const line of tail) {
            const entry = parseEntry(line);
            if (entry !== undefined)
                entries.push(entry);
        }
        return entries;
    };
    return {
        async record(entry) {
            const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
            await appendFile(target, `${line}\n`, 'utf8').catch(() => undefined);
        },
        read,
        async summary(recent = 50, window = 100) {
            const entries = await read();
            const byOutcome = {};
            const toolCounts = new Map();
            for (const entry of entries) {
                byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
                toolCounts.set(entry.tool, (toolCounts.get(entry.tool) ?? 0) + 1);
            }
            // 均值只在该项**有值**的条目上算：一次摸底（没有保真率）不该把保真率的
            // 均值往下拉——那会让面板上的「分数」变成一个没有意义的数。
            const measured = entries.filter(e => e.outcome === 'pass' || e.outcome === 'fail').slice(-window);
            const averages = {};
            for (const key of DIGEST_METRIC_KEYS) {
                const values = measured
                    .map(e => e.metrics[key])
                    .filter((v) => typeof v === 'number');
                averages[key] = values.length === 0
                    ? null
                    : values.reduce((sum, v) => sum + v, 0) / values.length;
            }
            const newestFirst = [...entries].reverse().slice(0, recent);
            const since = entries[0]?.at;
            return {
                total: entries.length,
                ...(since === undefined || since === '' ? {} : { since }),
                byOutcome,
                byTool: [...toolCounts]
                    .map(([tool, count]) => ({ tool, count }))
                    .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
                averages,
                recent: newestFirst,
            };
        },
    };
}
