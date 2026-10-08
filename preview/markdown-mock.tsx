/**
 * 预览页用的 markdown 渲染器替身。
 *
 * 技能面板的正文现在是宿主的 `MarkdownText` 渲染的，而真实那个装不进 vitest：
 * 它所在的包在顶层 import 了 `shiki`、`@shikijs/langs/*`、`simple-icons` 和一堆
 * 未发布的 `@deepseek-ai/dsh-*`，本仓库一个都没有；解析链路上的
 * `mdast-util-from-markdown` / `micromark-extension-gfm` / `katex` 同样装不全。
 * 所以预览页渲染不了原件。
 *
 * 不渲染的代价不是"少看一点"，而是**看到的是假的**：正文占了详情区七成的高度，
 * 一张把 1877 字 markdown 当纯文本铺开的截图，会让人以为面板里就是一坨源码。
 * 这份替身按行做块级解析，只为把**块结构**还原对——标题是标题、引用有左边线、
 * 表格是表格——样式仍然引宿主的真件（`MarkdownText.module.css`，见 ATOMS）。
 *
 * 两处已知偏离，都是"改了看得出来、但要真渲染才知道差多少"的：
 *   1. 围栏代码块渲染成 `<pre><code>`。宿主那边走 `CodeBlock`，外面多一层带
 *      复制按钮的卡片头，块本身有语法高亮。这里只给等宽的代码块。
 *   2. 没实现脚注、链接引用定义、katex、任务列表、纯文本文件提及。
 * 这两条不影响面板布局的判断，也正是这份替身存在的目的。
 *
 * 行内标记（`` `code` `` / `**粗体**` / `~~删除线~~`）**都实现了**，因为本仓库的面板真的
 * 在用它们，而且用在了要看的地方（删除线是需求条目那一屏「追溯」的全部意义）。
 */
import type { ReactNode } from 'react'

const cx = (...names: readonly (string | false | undefined)[]): string =>
  names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')

/**
 * 行内代码，`**` 里面也走这一层。
 * @param text - 一段纯文本。
 * @param key - 生成 React key 用的前缀。
 * @returns 片段数组。
 */
function code(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /`([^`]+)`/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    out.push(<code key={`${key}-${String(match.index)}`}>{match[1]}</code>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * 行内：`` `code` ``、`**粗体**` 与 `~~删除线~~`，三者可以互相嵌套。
 *
 * 先切粗体、再在每段里切行内代码，而不是一条正则同时认两种：一条正则会让先
 * 命中的那种吃掉另一种——正文里的 `**本 skill 是 \`ncc-dev\`（…）的子技能**`
 * 会整段变成粗体，反引号原样显示，而宿主那边渲染出来的是粗体里嵌一个代码段。
 * 删除线按同一道理先切一层，再交给粗体那一层。
 *
 * **删除线这一层是需求条目面板逼出来的**：那一屏的「追溯」把过时的旧说法划掉留着
 * （`requirement-doc.ts` 剥掉它给模型、留着它给人），`~~…~~` 是它最想让人看见的一处
 * 标记。替身原先不认 `~~`，于是那段在每一张预览图上都是**两个波浪号夹着一句话**——
 * 看着像正文里混进了 markdown 源码，而真宿主渲染的是 `<del>`
 * （`ui-primitives/src/markdown/render.tsx:241`）。这是"改了看得出来、但要真渲染才知道
 * 差多少"的那一类，正是这份替身最怕的东西。
 * @param text - 一行文本。
 * @param key - 生成 React key 用的前缀。
 * @returns 片段数组。
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /~~([^~]+)~~/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(...bold(text.slice(last, match.index), `${key}-t${String(match.index)}`))
    out.push(<del key={`${key}-d${String(match.index)}`}>{bold(match[1] ?? '', `${key}-d${String(match.index)}`)}</del>)
    last = match.index + match[0].length
  }
  out.push(...bold(text.slice(last), `${key}-end`))
  return out
}

/**
 * 粗体那一层：`**…**` 里面再切行内代码。
 * @param text - 一段还没有删除线的文本。
 * @param key - 生成 React key 用的前缀。
 * @returns 片段数组。
 */
function bold(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(...code(text.slice(last, match.index), `${key}-t${String(match.index)}`))
    out.push(<strong key={`${key}-b${String(match.index)}`}>{code(match[1] ?? '', `${key}-b${String(match.index)}`)}</strong>)
    last = match.index + match[0].length
  }
  out.push(...code(text.slice(last), `${key}-end`))
  return out
}

/** 表格行 `| a | b |` → 单元格文本数组。 */
function cells(line: string): string[] {
  const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  return parts.map(cell => cell.trim())
}

/** `| --- | :--: |` 这种对齐行。 */
const isAlign = (line: string): boolean => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line.trim())

/**
 * 把一段 markdown 拆成块。
 * @param src - 正文。
 * @returns 块级 React 节点。
 */
function blocks(src: string): ReactNode[] {
  const lines = src.split('\n')
  const out: ReactNode[] = []
  const starts = (line: string): boolean =>
    /^```/.test(line) || /^#{1,6} /.test(line) || /^> ?/.test(line) || /^\|/.test(line)
    || /^---\s*$/.test(line) || /^\s*[-*] /.test(line) || /^\s*\d+\. /.test(line)

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') { i += 1; continue }

    if (/^```/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) { body.push(lines[i] ?? ''); i += 1 }
      i += 1
      out.push(<pre key={`c${String(i)}`}><code>{body.join('\n')}</code></pre>)
      continue
    }

    const head = /^(#{1,6}) (.*)$/.exec(line)
    if (head !== null) {
      const level = head[1] ?? '#'
      const Tag = `h${String(level.length)}` as 'h1'
      out.push(<Tag key={`h${String(i)}`}>{inline(head[2] ?? '', `h${String(i)}`)}</Tag>)
      i += 1
      continue
    }

    if (/^> ?/.test(line)) {
      const paras: string[][] = [[]]
      while (i < lines.length && /^> ?/.test(lines[i] ?? '')) {
        const text = (lines[i] ?? '').replace(/^> ?/, '')
        if (text.trim() === '') paras.push([])
        else paras[paras.length - 1]?.push(text)
        i += 1
      }
      out.push(
        <blockquote key={`q${String(i)}`}>
          {paras.filter(para => para.length > 0).map((para, n) => (
            <p key={n}>{inline(para.join(' '), `q${String(i)}-${String(n)}`)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    if (/^\|/.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && /^\|/.test(lines[i] ?? '')) {
        if (!isAlign(lines[i] ?? '')) rows.push(cells(lines[i] ?? ''))
        i += 1
      }
      const [first, ...rest] = rows
      out.push(
        <div key={`t${String(i)}`} className={cx('pmd-tableScroll', 'pmd-tableFill')}>
          <table>
            {first !== undefined && (
              <thead>
                <tr>{first.map((cell, n) => <th key={n}>{inline(cell, `th${String(n)}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rest.map((row, r) => (
                <tr key={r}>{row.map((cell, n) => <td key={n}>{inline(cell, `td${String(r)}-${String(n)}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (/^---\s*$/.test(line)) { out.push(<hr key={`r${String(i)}`} />); i += 1; continue }

    const list = /^(\s*)([-*]|\d+\.) /.exec(line)
    if (list !== null) {
      const ordered = /\d/.test(list[2] ?? '-')
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        if (/^\s*[-*] /.test(current) || /^\s*\d+\. /.test(current)) {
          items.push(current.replace(/^\s*([-*]|\d+\.) /, ''))
          i += 1
        } else if (current.trim() !== '' && !starts(current)) {
          items[items.length - 1] = `${items[items.length - 1] ?? ''} ${current.trim()}`
          i += 1
        } else break
      }
      const rendered = items.map((item, n) => <li key={n}>{inline(item, `li${String(n)}`)}</li>)
      out.push(ordered
        ? <ol key={`l${String(i)}`}>{rendered}</ol>
        : <ul key={`l${String(i)}`}>{rendered}</ul>)
      continue
    }

    const para: string[] = []
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !starts(lines[i] ?? '')) {
      para.push(lines[i] ?? '')
      i += 1
    }
    out.push(<p key={`p${String(i)}`}>{inline(para.join(' '), `p${String(i)}`)}</p>)
  }
  return out
}

/** `MarkdownText` 的替身；只用到 `text`，其余 props 接受后丢弃。 */
export function MockMarkdown({ text }: { text: string, labels?: unknown, streaming?: boolean }) {
  return <div className="pmd-markdown">{blocks(text)}</div>
}
