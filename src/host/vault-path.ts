/**
 * 路径基准：**相对路径相对知识库根，绝对路径原样**。
 *
 * ## 为什么单独有这么一个东西
 *
 * 知识库里的页面用相对路径互相指——frontmatter 的 `sources: [raw/articles/x.md]`、
 * 索引里的 `wiki/topics/y.md`——写工具也照着这个形态把 `file` 交给调用者。可读工具
 * 要真去读盘就得有一个绝对路径，而 `path.resolve(p)` 给的基准是**进程的工作目录**：
 * 那是宿主进程自己的目录，与知识库毫无关系。
 *
 * 实测：`wiki_page_write` 返回 `wiki/topics/x.md`，render 里明说「把它交给
 * digest_audit 的 product」，而 `digest_audit` 直接拿它去 `stat`，于是报
 * `ENOENT … \.dsh\profiles\desktop\wiki\topics\x.md`——一个谁也没写过的路径。
 *
 * 同一个基准错误还会**静默**发作。对账用的键（这份产物排掉了没有、这一组验过没有）
 * 若两边各按各的基准取绝对值，就永远配不上：不报错，只是把「已排除」算成没排除、
 * 把「验过」算成从没验过，而报告照样理直气壮地给结论。
 *
 * ## 两条规矩
 *
 * 1. **只为读盘解析，绝不把结果留存。** `resolveInVault` 的结果只喂给
 *    `stat`/`readFile`。写进知识库的、记进流水账的，一律保留调用者给的原写法
 *    （也就是库内相对形态）——知识库本身是设计成能整体搬走的（索引在库内、
 *    frontmatter 里全是相对路径），里面留一个绝对路径就是搬机器那天坏掉的
 *    定时炸弹。
 * 2. **对账一律先归一到同一基准。** `vaultPathKey` 把「库内相对」与「同一个库
 *    下的绝对」折成同一个键，于是日志里两种写法混着也不会配错。
 *
 * 相对路径**不会**退回工作目录去猜：没有基准就返回 undefined，由调用者报错。
 * 双基准猜测正是上面那串 ENOENT 的成因——猜错的时候它一声不吭。
 */

import path from 'node:path'

/** 是否已经是绝对路径：Windows 盘符、UNC、前导斜杠或反斜杠都认。 */
export function isAbsolutePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')
}

/**
 * 解析成读盘用的绝对路径。
 *
 * @param root - 知识库根；未给时相对路径无从解析。
 * @param p - 调用者给的写法：绝对路径，或相对知识库根的库内路径。
 * @returns 绝对路径；`p` 是相对路径而 `root` 未给时返回 undefined。
 */
export function resolveInVault(root: string | undefined, p: string): string | undefined {
  const trimmed = p.trim()
  if (trimmed === '') return undefined
  if (isAbsolutePath(trimmed)) return path.resolve(trimmed)
  if (root === undefined) return undefined
  return path.resolve(root, trimmed)
}

/** 分隔符、重复斜杠与大小写归一，供对账比较。 */
function normalizePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/(.)\/+$/, '$1')
    .toLowerCase()
}

/**
 * 对账用的键：同一个文件的「库内相对」与「该库下的绝对」写法折成同一个键。
 *
 * 库外的绝对路径老实保留绝对形态，不伪装成库内相对——它本来就不在库里，
 * 配不上任何库内路径才是对的。
 *
 * @param root - 知识库根；未给时只能按原样归一。
 * @param p - 调用者给的写法。
 * @returns 归一化后的键。
 */
export function vaultPathKey(root: string | undefined, p: string): string {
  const abs = resolveInVault(root, p)
  if (abs === undefined) return normalizePath(p.trim())
  if (root === undefined) return normalizePath(abs)
  const rootKey = normalizePath(root)
  const key = normalizePath(abs)
  if (rootKey === '') return key
  if (key === rootKey) return ''
  return key.startsWith(`${rootKey}/`) ? key.slice(rootKey.length + 1) : key
}
