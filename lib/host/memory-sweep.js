/**
 * 记忆库的体检：它现在健康不健康，以及烂在哪。
 *
 * ## 为什么需要它
 *
 * 一份不体检的库，半年就会烂——不是突然烂，是每一处都还看得过去：一条过期的结论、
 * 两条说同一件事的记录、一个挂到已删项目上的条目。它们单看都不刺眼，合起来就是这个
 * 库不再可信。`digest_sweep.ts` 对知识库做的事，这里对记忆库做同一件事。
 *
 * ## 六项里，只有一项能自动修
 *
 * | 检查 | 报什么 | 谁能修 |
 * |---|---|---|
 * | `index-drift` | 索引与文件对不上（见下） | **它自己**（`repair`） |
 * | `orphan` | 挂在已不存在/已归档的项目上 | 人 |
 * | `no-source` | 没有出处 | 模型补 |
 * | `too-long` | 正文超过软上限 | 模型拆 |
 * | `overlap` | 同项目内两条可能说的是同一件事 | 人 |
 * | `stale` | 很久没复核过 | 看情况 |
 *
 * ## 第一项是这套存储自己的代价
 *
 * `index.json` 是**派生缓存**：`memory_read` 与 `memory_recall` 都从 `.md` 读，索引只服务
 * 注入路径（一次 `project_read` 不该为了带一行标题去开五个文件）。这个选择有一个必然的
 * 代价——手工改了文件、或一次删除只成功了一半，索引就落后了，而**落后的表现是注入里出现
 * 一个读不到正文的标题**：下一个会话拿到死引用，`memory_read` 告诉它「没有这一条」。
 *
 * 所以体检最先看它，而且它是六项里唯一能自动修的：**从目录里的 `.md` 重建 `index.json`**。
 * 重建是幂等的、只动那一个文件，且方向永远是「以文件为准」——文件在而索引没有的，找回来；
 * 索引有而文件没有的，只能丢掉（那条记录指向的内容已经不在了，留着它就是一个死引用）。
 *
 * ## 「冲突」为什么和「重复」合成了一项
 *
 * 设计稿把它们列成两项，实现合成了一项 `overlap`：判定「两条说法相反」需要语义理解，
 * 机械做不出来；而「重复」与「矛盾」在数据上留下的是**同一个信号**——同一个项目里两条
 * 讲得差不多的标题。报告写「可能重复，也可能互相矛盾」，把这两种可能都交给看的人，
 * 不假装已经分清了它们。
 *
 * 这不是偷懒：vault 自己的 Lint 规则遇到同一件事也是这么处理的——`.wiki-schema.md` 把
 * 「矛盾」的判据缩到「同版本下才算」，因为它也判不准，只能把条件写死成一个能机械执行的
 * 范围。这里把范围缩到「同一个项目内」。
 */
import { BODY_SOFT_MAX } from "./memory-doc.js";
import { recordOfDoc } from "./memory-store.js";
/** 多久没动过算「久未复核」。半年：与知识库那道「随机抽查十个页面」的节奏同一量级。 */
const STALE_DAYS = 180;
/** 两条标题的字符二元组重叠到多少算「可能是同一件事」。偏低是有意的：宁可多捞。 */
const OVERLAP_THRESHOLD = 0.5;
/** 一个项目最多报几对可疑的重叠，免得一屏全是它。 */
const OVERLAP_PER_PROJECT = 10;
/** 一个标题的字符二元组。中文标题没有词边界，按字切比按空白切可靠。 */
function bigrams(text) {
    const flat = text.replace(/\s+/g, '').toLowerCase();
    const out = new Set();
    for (let at = 0; at + 1 < flat.length; at += 1)
        out.add(flat.slice(at, at + 2));
    return out;
}
/**
 * 两个标题有多像：字符二元组的 Jaccard 重叠。
 *
 * 刻意是最笨的一种：模糊匹配需要一个没人能论证的阈值，而这里错了的代价只是「多出一行
 * 让人多看一眼」——比漏掉真正重复的一对便宜得多。
 * @param a - one title.
 * @param b - the other.
 * @returns 0 … 1.
 */
export function titleOverlap(a, b) {
    const left = bigrams(a);
    const right = bigrams(b);
    if (left.size === 0 || right.size === 0)
        return 0;
    let shared = 0;
    for (const gram of left)
        if (right.has(gram))
            shared += 1;
    return shared / (left.size + right.size - shared);
}
/** 一条记忆今天多大岁数，按天算。 */
function ageInDays(stamp, now) {
    const created = Date.parse(stamp);
    if (Number.isNaN(created))
        return 0;
    return (now.getTime() - created) / 86_400_000;
}
/** 按项目分组，保持原顺序。 */
function groupBy(items, projectOf) {
    const groups = new Map();
    for (const item of items) {
        const key = projectOf(item);
        const list = groups.get(key);
        if (list === undefined)
            groups.set(key, [item]);
        else
            list.push(item);
    }
    return groups;
}
/**
 * 体检一整个记忆库。
 *
 * @param store - the bank. Reading it is all this does, unless `repair` is asked for.
 * @param projects - the operator's projects, for naming and for spotting orphans.
 * @param options - `repair` to rebuild `index.json` from the files; `now` for the age checks.
 * @returns the report. A broken index is reported, never thrown: seeing the report is how
 *   somebody learns the index is broken, so failing to produce one would hide the finding.
 */
export async function sweepMemories(store, projects, options = {}) {
    const now = options.now ?? new Date();
    const read = await store.readIndex();
    const records = read.error === undefined ? read.records : [];
    const recordIds = new Set(records.map(record => record.id));
    const ids = await store.listIds();
    const fileIds = new Set(ids);
    // The whole bank is read: a check that only sampled would report a healthy library
    // while the one broken entry sat in the part nobody looked at.
    const docs = [];
    const unreadable = [];
    for (const id of ids) {
        const entry = await store.readEntry(id);
        if (entry.doc === undefined)
            unreadable.push(id);
        else
            docs.push(entry.doc);
    }
    const docById = new Map(docs.map(doc => [doc.id, doc]));
    const projectNames = new Map();
    for (const project of projects.list({ includeArchived: true })) {
        projectNames.set(project.projectId, project.name);
    }
    /** 一个记得住的名字：项目没了就退回 id，见 `memory-service.ts` 的同一处取舍。 */
    const nameOf = (projectId) => projectNames.get(projectId) ?? projectId;
    const findings = [];
    // ── index-drift ────────────────────────────────────────────────────────────
    const missingFiles = records.filter(record => !fileIds.has(record.id));
    const strayFiles = docs.filter(doc => !recordIds.has(doc.id));
    const strayUnreadable = unreadable.filter(id => !recordIds.has(id));
    if (read.error !== undefined || missingFiles.length > 0 || strayFiles.length > 0
        || strayUnreadable.length > 0 || unreadable.length > 0) {
        const parts = [];
        if (read.error !== undefined)
            parts.push(`索引本身读不出来（${read.error}）`);
        if (missingFiles.length > 0)
            parts.push(`${missingFiles.length} 条记录找不到对应文件`);
        if (strayFiles.length > 0)
            parts.push(`${strayFiles.length} 个文件不在索引里（注入看不到它们）`);
        if (unreadable.length > 0)
            parts.push(`${unreadable.length} 个文件解析不了`);
        findings.push({
            check: 'index-drift',
            needsPerson: false,
            projectId: '',
            projectName: '',
            detail: `索引与文件对不上：${parts.join('；')}。索引是缓存、文件才是真相，所以这一项可以用 memory_sweep({ repair: true }) 从文件重建。`,
            items: [
                ...missingFiles.map(record => ({ id: record.id, title: record.title })),
                ...strayFiles.map(doc => ({ id: doc.id, title: doc.title })),
                ...unreadable.map(id => ({ id, title: docById.get(id)?.title ?? '' })),
            ],
        });
    }
    // ── 其余五项，按项目分组 ────────────────────────────────────────────────────
    const orphans = docs.filter(doc => !projectNames.has(doc.projectId));
    const sourceless = docs.filter(doc => doc.source.trim() === '');
    const tooLong = docs.filter(doc => doc.body.length > BODY_SOFT_MAX);
    const stale = docs.filter(doc => doc.updatedAt === doc.createdAt
        && ageInDays(doc.createdAt, now) > STALE_DAYS);
    for (const [projectId, group] of groupBy(orphans, doc => doc.projectId)) {
        findings.push({
            check: 'orphan',
            needsPerson: true,
            projectId,
            projectName: nameOf(projectId),
            detail: '这些记忆挂在一个已经不存在的项目上。项目还在、只是归档了的话不必动它；真要清，把它改挂到别的项目或删掉。',
            items: group.map(doc => ({ id: doc.id, title: doc.title })),
        });
    }
    for (const [projectId, group] of groupBy(sourceless, doc => doc.projectId)) {
        findings.push({
            check: 'no-source',
            needsPerson: true,
            projectId,
            projectName: nameOf(projectId),
            detail: '这些记忆没有写出处。出处是「这条要核实就去哪查」的线索——没有它的记忆，下次没人敢信也不敢删。用 memory_update 补上。',
            items: group.map(doc => ({ id: doc.id, title: doc.title })),
        });
    }
    for (const [projectId, group] of groupBy(tooLong, doc => doc.projectId)) {
        findings.push({
            check: 'too-long',
            needsPerson: true,
            projectId,
            projectName: nameOf(projectId),
            detail: `正文超过 ${BODY_SOFT_MAX} 字的软上限。不影响使用，但里面装两件事时拆成两条更好找。`,
            items: group.map(doc => ({ id: doc.id, title: doc.title })),
        });
    }
    for (const [projectId, group] of groupBy(stale, doc => doc.projectId)) {
        findings.push({
            check: 'stale',
            needsPerson: true,
            projectId,
            projectName: nameOf(projectId),
            detail: `记下超过 ${STALE_DAYS} 天、此后一个字没改过。**这不说明它错了**——只是值得有人回去看一眼，尤其是环境类的事实。`,
            items: group.map(doc => ({ id: doc.id, title: doc.title })),
        });
    }
    // 重叠按项目两两比：同一个项目里的两条才可能是在讲同一件事。
    for (const [projectId, group] of groupBy(docs, doc => doc.projectId)) {
        const pairs = [];
        for (let i = 0; i < group.length && pairs.length < OVERLAP_PER_PROJECT * 2; i += 1) {
            for (let j = i + 1; j < group.length && pairs.length < OVERLAP_PER_PROJECT * 2; j += 1) {
                const left = group[i];
                const right = group[j];
                if (left === undefined || right === undefined)
                    continue;
                if (titleOverlap(left.title, right.title) < OVERLAP_THRESHOLD)
                    continue;
                pairs.push({ id: left.id, title: left.title }, { id: right.id, title: right.title });
            }
        }
        if (pairs.length === 0)
            continue;
        findings.push({
            check: 'overlap',
            needsPerson: true,
            projectId,
            projectName: nameOf(projectId),
            detail: `这些记忆两两讲得很像（每条成对列出）。**可能重复，也可能互相矛盾**——这一层判不出来，得人看：重复的合成一条或删掉一条，矛盾的用 memory_update 留下对的那个说法。`,
            items: pairs,
        });
    }
    let repair;
    if (options.repair === true) {
        const rebuilt = docs.map(recordOfDoc);
        await store.writeIndex(rebuilt);
        const rebuiltIds = new Set(rebuilt.map(record => record.id));
        repair = {
            records: rebuilt.length,
            added: [...rebuiltIds].filter(id => !recordIds.has(id)).length,
            // 读不出来的文件不在重建结果里，所以这一项同时包含「文件没了」与「文件读不出来」。
            dropped: [...recordIds].filter(id => !rebuiltIds.has(id)).length,
        };
    }
    return {
        root: store.root,
        path: store.indexPath,
        total: docs.length,
        findings,
        ...repair === undefined ? {} : { repair },
    };
}
