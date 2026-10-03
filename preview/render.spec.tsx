/**
 * 把六个面板各渲染成一张可以直接看的静态页（亮色 + 暗色各一份）。
 *
 * 为什么要这么绕：DSH Web 需要运行时签发的 token 才能打开，裸访问拿到的是
 * "authentication required"；而真实的 primitives 包 import 了 .css 与
 * @shikijs/langs/*，插件仓库里装不全，没法在测试里直接加载。
 *
 * 所以这里的做法是：**DOM 结构照抄真实的 atoms，样式直接引真实文件**。
 * 两处人为改动：
 *
 * 1. 每个 atom 的类名加一个只属于它的前缀（见 {@link ATOMS}）。CSS Modules 在
 *    真实环境靠 hash 隔离，预览页没有 hash，而 Modal 的 `.body` / `.title` 会和
 *    插件共享样式表里的同名类撞车。前缀只改名字，样式一个字没动。
 * 2. 每个面板单独一页，只挂它自己那份 panel.module.css。六个面板的模块里
 *    大量重名（`.title`、`.body`、`.badge`…），拼进同一页会互相覆盖——那样看到的
 *    就不是任何真实状态，而是六份样式表打架的结果。
 *
 * 覆盖范围是这一版的重点：**六个面板都要能看，亮暗两种主题都要能看**。此前只有
 * 消化面板有预览，另外四个（含最大的知识库面板）没有任何渲染途径，于是"它们视觉
 * 上一致吗"这个问题从来没有答案，只能靠读 CSS 猜。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { zh } from '../src/client/locales.ts'
import type { YonPanelItemRow } from '../src/client/slots.ts'
import type { YonPanelRootProps } from '../src/client/YonPanelRoot.tsx'
import type { DigestSummaryPayload } from '../src/shared/types.ts'

/** 宿主的真实原子与主题：预览页引的是这两个目录下的原件，不是复制品。 */
const HARNESS = 'E:/gitproject/deepseek-harness-neuron/packages/client'
const PRIMITIVES = `${HARNESS}/ui-primitives/src`

/**
 * 宿主的主题样式表，**顺序即真实客户端的注入顺序**（`ui-theme/src/client/styles.ts`
 * 里那六条 `?inline` import）。
 *
 * 只挂 `design-platform.css` 是不够的，而且不够的方式很隐蔽：
 *   - `base.css` 是 reset 与字体栈；
 *   - 所有阴影 token 躺在 `gradient-shadow-text.css` 里，而 `Modal` 的 `.dialog`
 *     写的是 `box-shadow: var(--dsw-elevation-prominent)`。少这一张，每个对话框的
 *     computed box-shadow 都是 `none`——于是「每个面板的对话框都是平的」这件事
 *     看起来像设计问题，实际是预览少了一张表。**截图比读代码更容易骗人，正是
 *     因为它看起来像证据。**
 */
const THEME_SHEETS = [
  'base.css',
  'corner-shape.css',
  'design-platform.css',
  'scrollbar.css',
  'gradient-shadow-text.css',
  'shiki.css',
].map(name => `${HARNESS}/ui-theme/src/styles/${name}`)

/**
 * 要镜像的 atom 样式表，以及各自的类名前缀。
 *
 * 前缀是按**文件**分的，不是按公共前缀分的：Button 和 Input 都定义了 `.icon`，
 * 一个前缀会让后加载的那份静默改写前一份，而这正是"看到的东西不是真实状态"。
 */
const ATOMS: readonly { readonly file: string, readonly prefix: string, readonly classes: readonly string[] }[] = [
  {
    file: 'Modal.module.css',
    prefix: 'pm-',
    classes: ['root', 'mask', 'dialog', 'content', 'header', 'title', 'close', 'description', 'body', 'footer'],
  },
  {
    file: 'Button.module.css',
    prefix: 'pb-',
    classes: ['button', 'md', 'sm', 'primary', 'ghost', 'outline', 'toolbar', 'icon'],
  },
  {
    file: 'Input.module.css',
    prefix: 'pi-',
    classes: ['wrap', 'icon', 'input'],
  },
  {
    file: 'Pill.module.css',
    prefix: 'pp-',
    classes: ['pill', 'interactive', 'active'],
  },
  {
    file: 'RiskConfirmation.module.css',
    prefix: 'pr-',
    classes: ['confirmation', 'confirmationContent', 'warning', 'warningIcon', 'acknowledgement', 'modalAction', 'confirmAction'],
  },
  {
    // 技能面板的正文用宿主的 markdown 渲染器，所以这页要挂它的样式表。
    // 类名是它自己的（`markdown` / `tableScroll` / `tableFill`），和上面几份不撞，
    // 但还是按文件加前缀——同一份前缀规则少一个例外就少一次踩坑。
    file: 'markdown/MarkdownText.module.css',
    prefix: 'pmd-',
    classes: ['markdown', 'tableScroll', 'tableFill'],
  },
]

/** 把一份 atom 样式表读出来并把类名按前缀改写。 */
function atomCss(atom: (typeof ATOMS)[number]): string {
  let text = readFileSync(`${PRIMITIVES}/${atom.file}`, 'utf8')
  for (const name of atom.classes) text = text.replaceAll(`.${name}`, `.${atom.prefix}${name}`)
  return text
}

/** 拼类名，空值丢掉。 */
const cx = (...names: readonly (string | undefined | false)[]): string =>
  names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')

/**
 * 一份样式表声明了哪些类名。
 *
 * 先剥注释：注释里提到某个类名是**说明**，不是声明——这一条是有来由的，共享表那条
 * 讲 `.foldToggle` 合并的注释里就写着 `.gapToggle`，不剥掉的话会报出一个早已删掉的
 * 重名。只取 `{` 之前那一段的选择器，避免把 `xx.ts` 这种正文里的点也算进来。
 * @param file - 样式表路径。
 * @returns 类名集合。
 */
function declaredClasses(file: string): Set<string> {
  const raw = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const out = new Set<string>()
  for (const chunk of raw.split('}')) {
    const brace = chunk.indexOf('{')
    if (brace < 0) continue
    for (const hit of chunk.slice(0, brace).matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      if (hit[1] !== undefined) out.add(hit[1])
    }
  }
  return out
}

// ── 被 mock 的 primitives ─────────────────────────────────────────────────────
// 结构与 packages/client/ui-primitives/src/*.tsx 逐一对应，类名换成本文件的前缀。
// Button 与 Input 此前是手写的一个 `.pv-btn`，那等于**丢掉 variant/size 两档**：
// 面板里的主按钮、危险按钮、28px 紧凑按钮在预览里长成了同一个样子，而截图正是
// 用来判断"按钮层级对不对"的。现在走真实样式表。
//
// 三个不能想当然的地方，都是照源码核过的：
//   - `footer` 是 `.content` 的**兄弟**、`.dialog` 的子节点，不是 `.content` 里的
//     最后一项。放进 content 里会让动作行吃到 content 的滚动区与内边距，看起来
//     "按钮行贴着内容"——而真实客户端不会；
//   - `description` 渲染在 header 与 body 之间，漏掉它 ProjectManager 的
//     「名称必填；编码可以留空…」就整句不见；
//   - `RiskConfirmation` 的 warning 图标把类名挂在 **svg 上**（`flex:none;
//     margin-top:2px; color:error`），包一层 span 就等于把这三条全丢掉。

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  // 技能面板的正文走宿主的 `MarkdownText`，而真实那个装不进来（顶层 import 了
  // shiki / @shikijs/langs / simple-icons，本仓库一个都没有）。替身与它的偏离写在
  // 那份文件自己的头部。合成它的是动态 import，因为 vi.mock 的工厂会被提升到
  // 文件顶部，够不着普通的 import 绑定。
  const { MockMarkdown } = await import('./markdown-mock.tsx')

  /** IconCloseOutline16，path 抄自 icons/index.tsx。 */
  const CloseIcon = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z" fill="currentColor" />
      <path d="M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z" fill="currentColor" />
    </svg>
  )

  /** IconWarningOutline16，同上；`className` 落在 svg 上才和真实一致。 */
  const WarningIcon = ({ size = 14, className }: { size?: number, className?: string }) => (
    <svg width={size} height={size} className={className} viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z" fill="currentColor" />
      <path d="M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z" fill="currentColor" />
      <path d="M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z" fill="currentColor" />
    </svg>
  )

  // `onClick` 与 `disabled` 必须显式透传：它们在解构参数里被拿走，就不会落进
  // `...rest`，于是这个 mock 画出来的每个按钮都是一块哑的装饰。两处后果都是假
  // 证据，而且方向相反：只有点按钮才能进入的状态（新增/编辑表单、删除确认、
  // 无连接器那行、测试连接结果）在这个渲染器里从来没有页面，看起来像"面板压根
  // 没实现"；而该禁用的按钮画成可点，让截图里"禁用态确实禁用了"变成一句空话。
  // `Pill` 从一开始就传了 `onClick`，所以只有走 Button 的那条路是死的。
  const Button = ({ variant = 'ghost', size = 'md', icon, className, children, onClick, disabled, ...rest }: {
    variant?: string, size?: string, icon?: ReactNode, className?: string, children?: ReactNode,
    onClick?: () => void, disabled?: boolean,
  }) => (
    <button
      type="button"
      className={cx('pb-button', `pb-${variant}`, `pb-${size}`, className)}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {icon != null && <span className="pb-icon">{icon}</span>}
      {children}
    </button>
  )

  // `className` 落在 wrapper 上而不是 input 上——面板的 `.inputFill{display:flex}`
  // 就是冲着这个 wrapper 写的，挂错地方会让整行塌掉，而那看起来像"CSS 没生效"。
  const Input = ({ icon, className, ...rest }: {
    icon?: ReactNode, className?: string,
  }) => (
    <span className={cx('pi-wrap', className)}>
      {icon != null && <span className="pi-icon">{icon}</span>}
      <input className="pi-input" {...rest} />
    </span>
  )

  // 有 onClick 时是 <button class="pill interactive">，没有时是 <span class="pill">。
  // 这个区别对项目面板是可见的：`panel.module.css` 里有
  // `.statusGroup > button:disabled{opacity:.5}`——直接子元素选择器只认 button。
  const Pill = ({ active = false, className, children, onClick, ...rest }: {
    active?: boolean, className?: string, children?: ReactNode, onClick?: () => void,
  }) => (
    onClick === undefined
      ? <span className={cx('pp-pill', active && 'pp-active', className)}>{children}</span>
      : (
        <button
          type="button"
          className={cx('pp-pill', 'pp-interactive', active && 'pp-active', className)}
          onClick={onClick}
          {...rest}
        >
          {children}
        </button>
      )
  )

  const Modal = ({ open = false, onClose, title, closeLabel, description, children, className, contentClassName,
    footer, headless = false }: {
    open?: boolean, onClose(): void, title: string, closeLabel?: string, description?: string,
    children?: ReactNode, className?: string, contentClassName?: string, footer?: ReactNode, headless?: boolean,
  }) => (
    // `open` 必须真的判：ProjectManager 同时挂四个 Modal（本体 / 新建 / 删除字段 /
    // 彻底删除），后三个默认关着。不判就会一次画出四个对话框，截图里的标题是假的。
    //
    // 真实 Modal 走 `createPortal(document.body)`，这份 mock **不挂 portal**：宿主与
    // 面板的 `.pm-root` / `.pm-mask` 都是 `position: fixed`，挂在哪个父节点下都不改变
    // 它们的定位与 `backdrop-filter` 的作用对象，所以可见结果一样。换来的是这个文件
    // 不必 import `react-dom`——它的类型声明不在 devDependencies 里（只有 @types/node
    // 和 @types/react），为一行 mock 去装一个包不划算。这是这份镜像唯一一处结构性
    // 偏离，也是唯一一处"改了也看不出来"的偏离。
    open
      ? (
        <div className="pm-root" role="presentation">
          <div className="pm-mask" aria-hidden="true" onClick={onClose} />
          <div className={cx('pm-dialog', className)} role="dialog" aria-modal="true" aria-label={title}>
            {headless
              ? children
              : (
                <>
                  <div className={cx('pm-content', contentClassName)}>
                    <div className="pm-header">
                      <h2 className="pm-title">{title}</h2>
                      <button type="button" className="pm-close" aria-label={closeLabel} onClick={onClose}>
                        <CloseIcon size={14} />
                      </button>
                    </div>
                    {description !== undefined && description !== '' && (
                      <p className="pm-description">{description}</p>
                    )}
                    {children !== undefined && <div className="pm-body">{children}</div>}
                  </div>
                  {footer !== undefined && <div className="pm-footer">{footer}</div>}
                </>
              )}
          </div>
        </div>
      )
      : null
  )

  // 它自己就是一层 Modal（连 className/contentClassName 都是传给 Modal 的），
  // 所以这里也这么搭——嵌套关系一致，动作行才会落在同一个位置上。
  const RiskConfirmation = ({ open, title, description, acknowledgeLabel, cancelLabel, closeLabel, confirmLabel,
    acknowledged, disabled = false, onAcknowledgedChange, onCancel, onConfirm }: {
    open: boolean, title: string, description: string, acknowledgeLabel: string, cancelLabel: string,
    closeLabel: string, confirmLabel: string, acknowledged: boolean, disabled?: boolean,
    onAcknowledgedChange(acknowledged: boolean): void, onCancel(): void, onConfirm(): void,
  }) => (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      closeLabel={closeLabel}
      className="pr-confirmation"
      contentClassName="pr-confirmationContent"
      footer={(
        <>
          <Button variant="outline" className="pr-modalAction" onClick={onCancel}>{cancelLabel}</Button>
          <Button
            variant="primary"
            className="pr-confirmAction"
            disabled={disabled || !acknowledged}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div className="pr-warning">
        <WarningIcon size={18} className="pr-warningIcon" />
        <p>{description}</p>
      </div>
      <label className="pr-acknowledgement">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={disabled}
          onChange={(event) => { onAcknowledgedChange(event.currentTarget.checked) }}
        />
        <span>{acknowledgeLabel}</span>
      </label>
    </Modal>
  )

  return {
    Button,
    Input,
    Pill,
    Modal,
    RiskConfirmation,
    MarkdownText: MockMarkdown,
    // 面板的条目与外壳都用 Tooltip，Manager 不用；留着以防某个面板改了用法。
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    // 外壳（sidebar.footer.action）用的两个 hook。**`useAnchoredPosition` 非给不可**：
    // 拿不到坐标时 `YonPanelRoot` 会让面板带着 `visibility:hidden` 渲染，于是那一页
    // 截图里什么都没有——而"什么都没有"看起来像"面板没渲染"，不像"少 mock 了一个
    // hook"，属于本文件开头警告的那一类假证据。
    //
    // 返回的是替身坐标：真实值要量触发器的 rect（`top = anchorTop - gap - height`），
    // 预览页里没有侧边栏可量，所以这一页看的是**行本身**，不是面板相对触发器的位置。
    useAnchoredPosition: () => ({ left: 0, top: 44 }),
    useDismissOnOutsidePointer: () => {},
    // FieldTable 直接 import 这个函数，缺了只在点复制时才崩——很隐蔽，所以要给。
    writeClipboard: () => Promise.resolve(true),
  }
})

// 必须在 mock 之后 import
const { DigestManager } = await import('../src/client/digest/DigestManager.tsx')
const { ProjectManager } = await import('../src/client/project/ProjectManager.tsx')
const { SkillManager } = await import('../src/client/skill/SkillManager.tsx')
const { DataSourceManager } = await import('../src/client/datasource/DataSourceManager.tsx')
const { WikiManager } = await import('../src/client/wiki/WikiManager.tsx')
const { archivedFixture, projectFixture, valueShapeFixture } = await import('./fixtures/project.ts')
const { SKILL_API } = await import('./fixtures/skill.ts')
const { DATASOURCE_FIXTURE } = await import('./fixtures/datasource.ts')
const { wikiApi, wikiFixture, wikiWithoutPicker, WIKI_NONE, WIKI_PICKED_PATH } =
  await import('./fixtures/wiki.ts')
const { HomeManager } = await import('../src/client/home/HomeManager.tsx')
const {
  HOME_FIXTURE, HOME_EMPTY, HOME_PICKED_PATH, homesFixture, homesWithoutPicker,
  homesWithClassFailure, homesWithVanishedIndex,
} = await import('./fixtures/homes.ts')
// 外壳与六个条目：面板的"行"这一层（批 1 重做的对象）。原先预览只画 Manager，
// 于是"面板打开时长什么样"根本没有渲染途径，而它是最常被看到的那一屏。
const { YonPanelRoot } = await import('../src/client/YonPanelRoot.tsx')
const { ProjectItem } = await import('../src/client/ProjectItem.tsx')
const { SkillItem } = await import('../src/client/SkillItem.tsx')
const { DataSourceItem } = await import('../src/client/DataSourceItem.tsx')
const { WikiItem } = await import('../src/client/WikiItem.tsx')
const { DigestItem } = await import('../src/client/DigestItem.tsx')
const { HomeItem } = await import('../src/client/HomeItem.tsx')

const t = ((key: string, params?: Record<string, unknown>): string => {
  let out = (zh as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) out = out.replace(`{${name}}`, String(value))
  return out
}) as never

const noop = (): void => {}

/** 一条消化记录。 */
function entry(over: Record<string, unknown> = {}): never {
  return {
    at: '2026-09-30T03:20:14.000Z',
    tool: 'digest_audit',
    outcome: 'fail',
    label: 'iuap-消息开发红皮书',
    source: 'raw/articles/2026-06-14-iuap-消息开发红皮书.md',
    product: 'wiki/topics/消息-RPC发送接口.md',
    pages: 1,
    failed: ['terms', 'provenance', 'addressable'],
    metrics: {
      terms: 0.012, identifiers: 0.003, level1: 0, level2: 0,
      constraints: 0, fidelity: 1, provenance: 0, overlap: null, addressable: 0.05,
    },
    sourceBytes: 112009, productBytes: 746, ms: 24,
    ...over,
  } as never
}

const FULL: DigestSummaryPayload = {
  path: '/home/operator/.dsh/yon-panel/digest-log.jsonl',
  summary: {
    total: 27,
    since: '2026-09-29T02:10:00.000Z',
    averagedOver: 24,
    byOutcome: { pass: 3, fail: 15, gate: 4, plan: 3, sweep: 2 },
    byTool: [{ tool: 'digest_audit', count: 22 }],
    averages: {
      terms: 0.824, identifiers: 0.71, level1: 0.667, level2: 0.582,
      constraints: 0.415, fidelity: 0.961, provenance: 0.333,
      overlap: 0.775, addressable: 0.81,
    },
    recent: [
      entry({
        outcome: 'pass', label: 'iuap-MDD后端编程模型红皮书',
        product: 'MDD单据开发.md 等 6 页', pages: 6, failed: [],
        metrics: {
          terms: 0.98, identifiers: 0.99, level1: null, level2: 1,
          constraints: 0.889, fidelity: 0.982, provenance: 1, overlap: 0.667, addressable: 1,
        },
        sourceBytes: 135900, productBytes: 157696, ms: 41,
      }),
      entry({ at: '2026-09-30T03:05:11.000Z', label: '业务流开发红皮书', product: 'wiki/topics/业务流开发.md' }),
      entry({
        at: '2026-09-30T02:58:44.000Z', outcome: 'sweep', tool: 'digest_sweep',
        label: 'D:/yon-bip-obsidian / wiki', source: 'D:/yon-bip-obsidian/yon-bip-obsidian',
        product: '', pages: 0, failed: [], metrics: {},
        sourceBytes: 0, productBytes: 0, ms: 12054,
        scanned: 13100, passing: 1, failing: 11, neverAudited: 11,
      }),
      entry({
        at: '2026-09-30T02:41:02.000Z', label: '容器云技术红皮书',
        source: 'raw/articles/2026-06-14-iuap-容器云红皮书.md',
        product: 'wiki/topics/bip-platform/container-cloud.md',
        failed: ['structure', 'coverage', 'level2', 'terms', 'provenance', 'addressable'],
        metrics: {
          terms: 0.002, identifiers: 0.003, level1: 0, level2: 0,
          constraints: 0, fidelity: 0.889, provenance: 0, overlap: null, addressable: 0.05,
        },
        sourceBytes: 98000, productBytes: 461, ms: 18,
      }),
      entry({
        at: '2026-09-30T02:20:30.000Z', outcome: 'pass', label: '消息开发红皮书',
        product: '消息-RPC发送接口.md 等 10 页', pages: 10, failed: [],
        metrics: {
          terms: 0.987, identifiers: 1, level1: 1, level2: 0.688,
          constraints: 0.75, fidelity: 0.986, provenance: 0.5, overlap: 0.775, addressable: 1,
        },
        sourceBytes: 112009, productBytes: 137527, ms: 55,
      }),
    ],
  },
} as never

/** 真实的「第一天」：只跑过一次门禁和一次摸底，还没有任何带判定的验收。
 *
 *  这是每个使用者看到的第一屏，而第一版预览只用「有判定的完整数据」当样本——
 *  于是「摸底 3 章摸底」「门禁 · 术语 100.0%」这类问题一直没被看到，直到用户
 *  截了一张真实截图过来。**预览的样本必须覆盖真实的第一天。** */
const DAY_ONE: DigestSummaryPayload = {
  path: 'C:/Users/operator/.dsh/yon-panel/digest-log.jsonl',
  summary: {
    total: 2,
    since: '2026-09-29T13:44:29.000Z',
    averagedOver: 0,
    byOutcome: { plan: 1, gate: 1 },
    byTool: [{ tool: 'digest_plan', count: 1 }, { tool: 'digest_audit', count: 1 }],
    averages: {
      terms: null, identifiers: null, level1: null, level2: null,
      constraints: null, fidelity: null, provenance: null,
      overlap: null, addressable: null,
    },
    recent: [
      entry({
        at: '2026-09-29T13:44:29.000Z', tool: 'digest_audit', outcome: 'gate',
        label: 'iuap-元数据及业务对象红皮书（门禁）',
        source: 'raw/articles/2026-06-14-iuap-元数据及业务对象红皮书.md',
        product: '', pages: 1, failed: [],
        metrics: { terms: 1, identifiers: 1, overlap: 0.334 },
        sourceBytes: 77274, productBytes: 77274, ms: 1204,
      }),
      entry({
        at: '2026-09-29T13:44:29.000Z', tool: 'digest_plan', outcome: 'plan',
        label: '2026-06-14-iuap-元数据及业务对象红皮书.md',
        source: 'raw/articles/2026-06-14-iuap-元数据及业务对象红皮书.md',
        product: '', pages: 0, failed: [], metrics: {},
        sourceBytes: 77274, productBytes: 0, ms: 7, chapters: 6,
      }),
    ],
  },
} as never

// ── 面板外壳与它的行（批 1）────────────────────────────────────────────────────
//
// 上面五页画的都是 Manager：对话框打开以后的样子。而使用者先看到的是**面板本身**——
// 侧边栏底部那个 Y 按钮弹出来的五行。批 1 改的正是这一层（行从"图标格"变成"整行
// 带名字"），所以预览必须补上它，否则这一批的成果没有渲染途径可看。

/**
 * 外壳读的四个座位。真实环境里框架按 `hooks` 合成（每个来源一个选择器 hook），
 * 这里用替身喂饱：外壳要的就是开合快照、行列表、两个手势、一次派发。
 *
 * 用 `Pick` 而不是重写一份，是为了让"这一页喂的是外壳真有的那个座位"这件事由类型
 * 记住——`renderSlot` 的 owner 参数在本仓库的发布类型下会退化成 `{}`（见
 * `tests/yon-panel.client.spec.tsx` 的同款处理），所以下面那个派发替身要 cast。
 */
type ShellProps = Pick<
  YonPanelRootProps,
  'wide' | 'usePanel' | 'useItems' | 'onToggle' | 'onSetOpen' | 'renderSlot' | 't'
>

const Shell = YonPanelRoot as unknown as (props: ShellProps) => ReactElement

/** 面板行的名字。外壳从席位里取名字，预览里直接从字典取——取到的是同一个串。 */
const name = (key: string): string => (zh as Record<string, string>)[key] ?? key

/** {@link name} 的带参版本：面板里 `t(key, {…})` 渲染出来的那一句，逐字拿到这里比对。
 *
 *  `t` 自己声明成了 `never`（它要当 props 递给面板，类型随便它），所以断言里调不动它；
 *  而带参的那几句恰恰是**最值得断言的**——`removeConfirm`/`noConnector` 都含变量，不会
 *  和别的文案撞车，而不带参的按钮文案撞得厉害（两个 key 都是「删除」）。 */
const filled = (key: string, params: Record<string, string>): string => {
  let out = name(key)
  for (const [slot, value] of Object.entries(params)) out = out.replace(`{${slot}}`, value)
  return out
}

/** 层释放：条目在打开自己的面板时会喊一声，预览里没人听。 */
const releaseStub = (): (() => void) => noop

/**
 * 六个内置条目的 inject face。与上面六页用的是同一份 fixtures，所以行里点开的东西
 * 和面板页看到的是同一套数据——预览里造两份样本就等于给自己留一个对不上的机会。
 */
const FACES: Record<string, Record<string, unknown>> = {
  project: { ...projectFixture, pushOverlay: releaseStub },
  skills: { ...SKILL_API, pushOverlay: releaseStub },
  datasources: { ...DATASOURCE_FIXTURE, pushOverlay: releaseStub },
  wiki: { ...wikiApi, pushOverlay: releaseStub },
  digest: { summary: () => Promise.resolve(FULL), pushOverlay: releaseStub },
  home: { ...HOME_FIXTURE, pushOverlay: releaseStub },
}

/**
 * 条目的 props：预览只用得到三样——copy、面板给的名字、它自己的 face。框架另发的那
 * 几份全局座位不驱动，所以照 `tests/` 的做法收窄成结构类型再 cast。
 */
type ItemProps = Record<string, unknown> & { readonly open: boolean; readonly label: string }

const ITEMS: Record<string, (props: ItemProps) => ReactElement> = {
  project: ProjectItem as unknown as (props: ItemProps) => ReactElement,
  skills: SkillItem as unknown as (props: ItemProps) => ReactElement,
  datasources: DataSourceItem as unknown as (props: ItemProps) => ReactElement,
  wiki: WikiItem as unknown as (props: ItemProps) => ReactElement,
  digest: DigestItem as unknown as (props: ItemProps) => ReactElement,
  home: HomeItem as unknown as (props: ItemProps) => ReactElement,
}

/** 外壳的一次派发：按 `only` 找到那条目，把名字交给它，行由它自己画。 */
const dispatchRow: ShellProps['renderSlot'] = ((
  _key: string, owner: { open: boolean; label: string }, options?: { only?: string },
): ReactNode => {
  const id = options?.only ?? ''
  const Entry = ITEMS[id]
  if (Entry !== undefined) {
    return <Entry t={t} open={owner.open} label={owner.label} {...FACES[id] ?? {}} />
  }
  // 席位是开放的：第三方包也能注册。它们的行由各自的包画，预览里没有那些包，所以这一
  // 页用同一套类名的替身行示意——要看的是"席位变长以后面板怎么排、要不要滚"，不是那些
  // 包会画成什么样。
  return (
    <button type="button" className="item">
      <span className="label">{owner.label}</span>
    </button>
  )
}) as unknown as ShellProps['renderSlot']

/**
 * 面板外壳的一页。`open` 固定为真：关着的面板只有触发器，没什么可看的；
 * `overlayDepth` 为 0，因为这一页里没有层压在面板上。
 * @param props - 席位里的行。
 * @returns the shell with its panel open.
 */
function Popover({ rows }: { readonly rows: readonly YonPanelItemRow[] }): ReactNode {
  const props: ShellProps = {
    wide: true,
    usePanel: <T,>(select: (snapshot: { open: boolean; overlayDepth: number }) => T): T =>
      select({ open: true, overlayDepth: 0 }),
    useItems: <T,>(select: (projected: readonly YonPanelItemRow[]) => T): T => select(rows),
    onToggle: noop,
    onSetOpen: noop,
    renderSlot: dispatchRow,
    t,
  }
  return <Shell {...props} />
}

/** 面板给六个内置条目的名字，顺序即注册顺序。 */
const SIX_ROWS: readonly YonPanelItemRow[] = [
  { id: 'project', label: name('item.project') },
  { id: 'skills', label: name('item.skills') },
  { id: 'datasources', label: name('item.datasource') },
  { id: 'wiki', label: name('item.wiki') },
  { id: 'digest', label: name('item.digest') },
  { id: 'home', label: name('item.home') },
]

/**
 * 席位变长以后的样子：一个长到必须省略的名字、一个没有名字（面板拿注册 id 兜底）
 * 的条目，以及多到面板要自己滚的行数。
 *
 * 这一页是这一批的合同改动唯一会出问题的地方：席位从"几个内置"变成"谁都能注册"，
 * 而面板的行宽是固定的 280。
 */
const MANY_ROWS: readonly YonPanelItemRow[] = [
  ...SIX_ROWS,
  // 名字要长到**无论字体怎么回退都放不下**：第一版 20 个字，280 宽的面板里刚好
  // 卡在边界上，探针数出来的截断行数是 0——看着像"省略号没生效"，其实是名字还不够长。
  { id: 'third-party-connector', label: '第三方连接器：一个长到无论怎么排都放不下、必须走省略号的条目名称' },
  { id: 'no-label-entry', label: 'no-label-entry' },
  { id: 'audit-log', label: '审计日志' },
  // 撞上 `max-height: min(60vh, 480px)` 才看得见滚动条。
  ...Array.from({ length: 8 }, (_value, index): YonPanelItemRow => ({
    id: `third-party-${index + 1}`,
    label: `第三方条目 ${index + 1}`,
  })),
]

/** 把真实样式表拼成一份预览页。
 *  @param sheets - 除 atom 与主题外要挂的样式表，**顺序即层叠顺序**（见 {@link Panel.sheets}）。
 *  @param dark - 挂宿主的暗色主题。宿主用 `body[data-ds-dark-theme]` 整表覆盖 token，
 *                并按 `color-scheme` 告诉浏览器这是深色——两件都照做，
 *                所以这一页不需要为暗色改任何其它东西——**预览里的暗色与真实客户端同源**。 */
function page(inner: string, note: string, sheets: readonly string[], dark: boolean): string {
  const parts: string[] = THEME_SHEETS.map(sheet => readFileSync(sheet, 'utf8'))
  for (const atom of ATOMS) parts.push(atomCss(atom))
  for (const sheet of sheets) parts.push(readFileSync(sheet, 'utf8'))
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${note}</title>
${parts.map(css => `<style>${css}</style>`).join('\n')}
<style>
  html, body { margin: 0; min-height: 100%; }
  /* color-scheme 是真实客户端有、这个渲染器此前一直缺的一行，而它决定的是
     **浏览器初值** canvastext 的取值——也就是任何"没写 color"的元素拿到什么颜色。
     宿主 theme-presenter.ts 的 apply() 就是设它在 documentElement 上。

     少了这一行，预览里的默认前景色恒为黑，于是量出来一个不存在的问题：数据源面板的
     .propValue 那时没有自己的 color，暗色预览里读作 #000000 on #2c2c2e、对比度
     1.51，看着像"深色主题下属性值不可读"；把这一行补上再量是 #ffffff／13.94。真实
     客户端一直是对的，错的是这一页。**假证据比缺证据更难发现**，因为它看起来像面板
     的 bug——所以这里必须和宿主一样按主题给值，而不是一直让它留在 normal。

     （同一个坑的另一半：.propValue 那条规则这一版已经补上了自己的 token 色，
     所以现在量它两处都对。这一行仍然要有——下一个忘了写 color 的类还得靠它。） */
  html { color-scheme: ${dark ? 'dark' : 'light'}; }
  body { font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  body[data-ds-dark-theme] { background: var(--dsw-alias-bg-base, #1b1b1c); }
  /* mask 是 fixed 且半透明的，单独截一张 .dialog 才看得清圆角与阴影 */
  body.only-dialog .pm-mask { display: none; }
  body.only-dialog .pm-root { background: var(--dsw-alias-bg-base, #fff); }
</style>
</head>
<body${dark ? ' data-ds-dark-theme' : ''}>${inner}
<pre id="probe" style="display:none"></pre>
<script>
// 探针：把关键规则的实际计算值写进 #probe，由 --dump-dom 读回（元素 display:none，
// 所以不会出现在截图里）。
// 截图看不出 1–2px 的线与浅色轨道究竟是"没画"还是"太淡"，只能问浏览器。
;(function () {
  var out = []
  // 静态一页里既没有鼠标也没有键盘，focus-within 那一半揭示规则永远触发不了；标了
  // autofocus 的元素就当作它已经被 TAB 到（Chrome 对没有用户激活的文档不跑 autofocus，
  // 只写特性不够）。带这个特性的页面才有这一句，别的页面一点不受影响。
  var focused = document.querySelector('[autofocus]')
  if (focused) focused.focus()
  function cs(el, pseudo) { return getComputedStyle(el, pseudo || null) }
  function box(el) { var r = el.getBoundingClientRect(); return Math.round(r.left) + '..' + Math.round(r.right) }
  var cell = document.querySelector('[class*="averageCell"]')
  if (cell) {
    var after = cs(cell, '::after')
    out.push('cell::after bg=' + after.backgroundColor + ' inset=' + after.insetInlineStart)
    var bar = cell.querySelector('[class*="averageBar"]')
    if (bar) out.push('bar w=' + cs(bar).inlineSize + ' left=' + cs(bar).insetInlineStart)
  }
  var badges = document.querySelectorAll('[class*="logOutcome"]')
  if (badges.length > 2) {
    var b3 = cs(badges[2])
    out.push('badge3(' + badges[2].textContent + ') border=' + b3.borderTopWidth + '/' + b3.borderTopColor + ' color=' + b3.color)
  }
  // 六个面板共用同一套对话框几何，所以宽度/圆角/阴影要能一眼比出来。
  // 子对话框会叠加，所以按 aria-label 取本体那一层。
  var dialogs = document.querySelectorAll('.pm-dialog')
  out.push('dialogs=' + dialogs.length)
  for (var i = 0; i < dialogs.length; i++) {
    var d = cs(dialogs[i])
    out.push('dialog[' + i + '](' + dialogs[i].getAttribute('aria-label') + ') '
      + Math.round(dialogs[i].getBoundingClientRect().width) + 'x'
      + Math.round(dialogs[i].getBoundingClientRect().height)
      + ' r=' + d.borderTopLeftRadius + ' shadow=' + (d.boxShadow === 'none' ? 'none' : 'yes'))
  }
  var list = document.querySelector('[class*="listPane"], [class*="vaultPane"]')
  if (list) out.push('listPane w=' + Math.round(list.getBoundingClientRect().width))
  var foot = document.querySelector('.pm-footer')
  if (foot) out.push('footer parent=' + foot.parentElement.className)
  // 面板外壳那一页：行高、字号、省略号、以及行多了以后要不要滚。
  // 这些正是批 1 改掉的东西，而它们在图上只能"看着像"：32px 的行量出来是 32 还是
  // 33（行的 line-height:1 与 svg 谁高谁低），省略号是生效了还是名字本来就短，
  // 只有计算值能回答。整段由 Y 字标那个 .mark 把关：只有外壳那两页有它，别的页不进来。
  var mark = document.querySelector('[class*="mark"]')
  var panelEl = mark ? document.querySelector('[class*="panel"]') : null
  if (panelEl) {
    var pcs = cs(panelEl)
    out.push('panel ' + Math.round(panelEl.getBoundingClientRect().width) + 'x'
      + Math.round(panelEl.getBoundingClientRect().height)
      + ' r=' + pcs.borderTopLeftRadius + ' bg=' + pcs.backgroundColor
      + ' shadow=' + (pcs.boxShadow === 'none' ? 'none' : 'yes'))
    var bodyEl = panelEl.querySelector('[class*="body"]')
    if (bodyEl) {
      out.push('panelBody h=' + Math.round(bodyEl.getBoundingClientRect().height)
        + ' scrolls=' + (bodyEl.scrollHeight > bodyEl.clientHeight)
        + ' scrollH=' + bodyEl.scrollHeight + '/client=' + bodyEl.clientHeight)
    }
    var rows = panelEl.querySelectorAll('button[class*="item"]')
    if (rows.length) {
      var r0 = cs(rows[0])
      out.push('rows=' + rows.length
        + ' h=' + Math.round(rows[0].getBoundingClientRect().height)
        + ' w=' + Math.round(rows[0].getBoundingClientRect().width)
        + ' font=' + r0.fontSize + ' gap=' + r0.gap + ' color=' + r0.color)
      // 名字被截断的行数，而不是第一行：长名字未必在第一行，只看第一行会得到
      // "clipped=false"，读起来像"省略号没生效"。
      var clipped = 0
      var widest = ''
      for (var r = 0; r < rows.length; r++) {
        var lhs = rows[r].querySelector('[class*="label"]')
        if (lhs && lhs.scrollWidth > lhs.clientWidth) {
          clipped++
          if (widest === '') widest = lhs.textContent
        }
      }
      var first = rows[0].querySelector('[class*="label"]')
      out.push('label ellipsis=' + (first ? cs(first).textOverflow : 'none')
        + ' clipped=' + clipped + '/' + rows.length + (widest === '' ? '' : ' first=' + widest))
    }
  }
  // 字段值的读法（只有项目管理那一页有 .fieldKey）：这一格原来是常驻的单行输入框，
  // 长值被框遮住、结构化值把整串 JSON 糊在行里。量三件事：宽行（结构化值）有几条、
  // 有值换行了没有（长值真的整段露出来）、有没有横向溢出（0 才算没被遮住）。
  // 图上"看着没截断"和"真的没截断"是两回事，只有 scrollWidth 能回答。
  var fieldKey = document.querySelector('[class*="fieldKey"]')
  if (fieldKey) {
    var fieldRows = document.querySelectorAll('[class*="fieldRow"]')
    var tallest = 0
    for (var fr = 0; fr < fieldRows.length; fr++) {
      tallest = Math.max(tallest, fieldRows[fr].getBoundingClientRect().height)
    }
    var reads = document.querySelectorAll('[class*="fieldValueRead"]')
    var overflowing = 0
    var multiline = 0
    for (var ir = 0; ir < reads.length; ir++) {
      if (reads[ir].scrollWidth > reads[ir].clientWidth) overflowing++
      if (reads[ir].getBoundingClientRect().height > 24) multiline++
    }
    var pairValues = document.querySelectorAll('[class*="valueGridValue"]')
    for (var ip = 0; ip < pairValues.length; ip++) {
      if (pairValues[ip].scrollWidth > pairValues[ip].clientWidth) overflowing++
    }
    // 点开态那一页（只有它有点开的行）：输入框要跟着内容长高，而不是内部滚动——
    // "整段露出来"这条承诺，只有 scrollHeight 与 clientHeight 的关系能回答。
    var boxes = document.querySelectorAll('textarea')
    var editors = ''
    for (var ib = 0; ib < boxes.length; ib++) {
      editors += ' editor[' + ib + '] h=' + Math.round(boxes[ib].getBoundingClientRect().height)
        + ' scrollH=' + boxes[ib].scrollHeight
        + ' inner=' + (boxes[ib].scrollHeight > boxes[ib].clientHeight + 1)
    }
    out.push('fieldRows=' + fieldRows.length
      + ' wide=' + document.querySelectorAll('[class*="fieldRowWide"]').length
      + ' reads=' + reads.length + ' pairValues=' + pairValues.length
      + ' multiline=' + multiline + ' overflowing=' + overflowing
      + ' tallestRow=' + Math.round(tallest)
      + ' textareas=' + boxes.length + editors)
  }
  // Home 面板的几何。这一页的三个怀疑——左列表底部的脚注板、被塞进属性值里的
  // 「建索引」按钮、以及压住关键路径表的 sticky 动作条——在图上"看着像"，
  // 只有 rect 能回答它们各占多少、谁盖住谁。用 keyRole 把关：只有探到过结果的
  // Home 页有关键路径表（keyRole 是这份样式表独有的类名，不在共享表里）。
  var keyRole = document.querySelector('[class*="keyRole"]')
  if (keyRole) {
    var pane = keyRole.closest('[class*="detailPane"]')
    var paneRect = pane.getBoundingClientRect()
    out.push('detailPane ' + Math.round(paneRect.width) + 'x' + Math.round(paneRect.height)
      + ' content=' + pane.scrollHeight + ' belowFold=' + Math.max(0, pane.scrollHeight - pane.clientHeight))
    // 逐个子元素的高度：整列多高只是结论，钱花在哪里只有这一行能回答。
    var kids = pane.children
    var kidOut = ''
    for (var ic = 0; ic < kids.length; ic++) {
      var kcls = String(kids[ic].className || '').split(' ').pop()
      kidOut += ' | ' + ic + ':' + kids[ic].tagName.toLowerCase() + '.' + kcls
        + '=' + Math.round(kids[ic].getBoundingClientRect().height)
    }
    out.push('paneKids=' + kids.length + kidOut)
    var keys = document.querySelectorAll('[class*="keyRel"]')
    var acts = pane.querySelector('[class*="detailActions"]')
    if (acts !== null && keys.length > 0) {
      var band = acts.getBoundingClientRect()
      var under = 0
      var clear = 0
      for (var ik = 0; ik < keys.length; ik++) {
        var rb = keys[ik].getBoundingClientRect()
        if (rb.bottom > band.top + 0.5 && rb.top < band.bottom) under++
        else if (rb.bottom <= band.top + 0.5) clear++
      }
      out.push('keyRows=' + keys.length + ' clearOfBar=' + clear + ' underBar=' + under)
      out.push('actions top=' + Math.round(band.top) + ' h=' + Math.round(band.height)
        + ' pos=' + cs(acts).position + ' offsetTop=' + Math.round(acts.offsetTop)
        + ' paneBottom=' + Math.round(paneRect.bottom))
    }
    var keyBox = document.querySelector('[class*="keys"]')
    if (keyBox !== null) out.push('keys h=' + Math.round(keyBox.getBoundingClientRect().height))
    // 属性值那一格：四个 dd 各自多高，以及那个按钮有没有被挤到值列之外。
    var vals = document.querySelectorAll('[class*="propValue"]')
    var hs = []
    var vw = 0
    for (var iv = 0; iv < vals.length; iv++) {
      hs.push(Math.round(vals[iv].getBoundingClientRect().height))
      vw = Math.max(vw, Math.round(vals[iv].getBoundingClientRect().width))
    }
    var labels = document.querySelectorAll('[class*="propLabel"]')
    out.push('propValues=' + vals.length + ' heights=[' + hs.join(',') + '] w=' + vw
      + ' labelCol=' + (labels.length > 0 ? Math.round(labels[0].getBoundingClientRect().width) : '-'))
    var vbtns = document.querySelectorAll('[class*="propValue"] button')
    for (var ib2 = 0; ib2 < vbtns.length; ib2++) {
      var cell = vbtns[ib2].closest('[class*="propValue"]')
      var cellRect = cell.getBoundingClientRect()
      var btnRect = vbtns[ib2].getBoundingClientRect()
      out.push('valueBtn[' + ib2 + '] ' + Math.round(btnRect.width) + 'x' + Math.round(btnRect.height)
        + ' btnRight=' + Math.round(btnRect.right) + ' cellRight=' + Math.round(cellRect.right)
        + ' btnTop=' + Math.round(btnRect.top) + ' cellTop=' + Math.round(cellRect.top))
    }
    // 左列表：最后一行之下留了多少空、两条全局脚注吃掉多少高度。
    var listPane = document.querySelector('[class*="listPane"]')
    if (listPane !== null) {
      var projs = listPane.querySelector('[class*="projects"]')
      var rows2 = listPane.querySelectorAll('[role="option"]')
      var notes = listPane.querySelectorAll('[class*="note"]')
      var notesH = 0
      for (var n = 0; n < notes.length; n++) notesH += notes[n].getBoundingClientRect().height
      out.push('listPane h=' + Math.round(listPane.getBoundingClientRect().height)
        + ' rows=' + rows2.length
        + ' emptyTail=' + (projs !== null && rows2.length > 0
          ? Math.round(projs.getBoundingClientRect().bottom - rows2[rows2.length - 1].getBoundingClientRect().bottom)
          : '-')
        + ' notes=' + notes.length + ' notesH=' + Math.round(notesH))
    }
  }
  document.getElementById('probe').textContent = 'PROBE ' + out.join(' | ')
})()
</script>
</body></html>`
}

/** 一个面板：怎么渲染、挂哪几份样式表。 */
interface Panel {
  readonly id: string
  /**
   * 这一页要挂的**全部**样式表，顺序即层叠顺序。
   *
   * 共享的 `panel.module.css` 要自己列进来，不再由 {@link renderPanel} 代挂：
   * 外壳那一页不能挂它。真实环境里 CSS Modules 靠 hash 隔离，而预览页没有 hash，
   * 外壳自己的 `.body`（行的列）和共享表里的 `.body` 会撞车——撞出来的样子不属于
   * 任何真实状态。样式表进哪一页是这一页的性质，所以写在每一页的定义里。
   */
  readonly sheets: readonly string[]
  readonly node: () => ReactNode
}

/** 六个面板共用的那份样式表；面板页一律排在面板自己那份之前。 */
const SHARED = 'src/client/panel.module.css'

/**
 * 允许两份样式表声明同一个类名的例外。
 *
 * 只放**同一个元素上挂两个类名**这种用法：消化面板要改掉共享 `.body` 的固定高度，
 * 两个类同时落在一个元素上，靠层叠顺序分胜负。真实客户端里两个 hash 不同、机制也
 * 是这样，所以合法。同名类落到**不同**元素上的那种（技能面板曾经的 `<pre class="body">`）
 * 没有例外可言，那是 bug。
 */
const SAME_ELEMENT = new Set(['body'])

const PANELS: readonly Panel[] = [
  {
    id: 'project',
    // 项目面板没有自己那份样式表：ProjectManager 与 FieldTable 都用共享的。
    sheets: [SHARED],
    node: () => <ProjectManager t={t} onClose={noop} {...projectFixture} />,
  },
  {
    id: 'skill',
    sheets: [SHARED, 'src/client/skill/panel.module.css'],
    node: () => <SkillManager t={t} onClose={noop} {...SKILL_API} />,
  },
  {
    id: 'datasource',
    sheets: [SHARED, 'src/client/datasource/panel.module.css'],
    node: () => <DataSourceManager t={t} onClose={noop} {...DATASOURCE_FIXTURE} />,
  },
  {
    id: 'wiki',
    sheets: [SHARED, 'src/client/wiki/panel.module.css'],
    node: () => <WikiManager t={t} onClose={noop} {...wikiApi} />,
  },
  {
    id: 'digest',
    // 消化面板那份排在后面：它要改写共享 `.body` 的固定高度。
    sheets: [SHARED, 'src/client/digest/panel.module.css'],
    node: () => <DigestManager summary={() => Promise.resolve(FULL)} onClose={noop} t={t} />,
  },
  {
    id: 'home',
    sheets: [SHARED, 'src/client/home/panel.module.css'],
    node: () => <HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />,
  },
  {
    id: 'items',
    // 外壳与行，两份都是它自己的：**不挂共享表**，理由见上面 {@link Panel.sheets}。
    sheets: ['src/client/YonPanelRoot.module.css', 'src/client/panel-item.module.css'],
    node: () => <Popover rows={SIX_ROWS} />,
  },
]

/**
 * 等 React 把异步取数的结果画上去。
 *
 * 每个面板都是「挂载 → 发请求 → setData → 重画」，所以渲染完立刻截屏拍到的是
 * 空态：第一版就是这么拍出一整页「还没有检查记录」的。等一个固定毫秒数不行，
 * 快了对慢的机器不够、慢了白等，两种都会让截图时有时无地不可信——而截图一旦
 * 不可信，"看着图做的判断"就全都作废了。
 *
 * 所以等的是**连续三次采样完全一致**：还在变说明还在画，连续不变才是落定。
 *
 * 采样的节点是 `document.body` 而不是 RTL 的 container。真实客户端的 Modal 走
 * `createPortal(document.body)`，所以「面板画出来的东西」未必在 container 里；这份
 * mock 不挂 portal（见 Modal 处说明），container 就够用——但按 body 采样两种情况都
 * 成立，将来某个 mock 改用 portal 也不会悄悄漏采。
 *
 * 这条不是理论洁癖：盯 container 曾让每次渲染把 120 次循环跑满（11 张图 24 秒），
 * 因为空 container 的 innerHTML 恒为 ''，而"空"和"落定"在稳定性判断里长得一样——
 * 于是错误以"变慢了"而不是"拍错了"的形式出现。
 */
async function settle(body: HTMLElement): Promise<void> {
  let last = ''
  let stable = 0
  for (let tick = 0; tick < 120 && stable < 3; tick += 1) {
    await new Promise(resolve => setTimeout(resolve, 10))
    freezeSelects(body)
    const now = body.innerHTML
    stable = now === last && now !== '' ? stable + 1 : 0
    last = now
  }
}

/**
 * 把 `<select>` 当前选中的那一格写进标记里。
 *
 * 不这么做的话，**每一张静态页都可能显示成另一个值**：`selectedIndex` 是 DOM 属性，
 * `innerHTML` 里只反映 `selected` 属性，两者互不同步。页面被当成文件重新解析时，
 * 浏览器在"没有哪一格声明自己是选中的"的情况下会挑第一个**未被禁用**的项——于是
 * 「版本」那格（占位项 `选择版本…` 是禁用的）在活面板里显示「选择版本…」、在同一份
 * HTML 的截图里显示「NC65」。这不是样式问题，是图在撒谎，而"看着图做的判断"正是
 * 这套预览的全部价值（见 {@link settle} 上面那段）。
 *
 * 写在 settle 里而不是各个用例的落盘处：图不止一处出，改动只有一处，将来加的面板
 * 也自动带上。
 *
 * 安全性：改的是 `selected` **属性**（默认选中态），当前选中态由 `selected` 属性/
 * `selectedIndex` 决定，写属性不会挪动它；而且写进去的正是此刻选中的那一格，所以
 * 即便某个引擎挪了，挪到的也是同一格。重复执行无额外变化，`settle` 的稳定性判断
 * 只会多等一拍。
 *
 * @param body - 采样的根节点。
 */
function freezeSelects(body: HTMLElement): void {
  for (const select of body.querySelectorAll('select')) {
    for (const option of select.options) {
      option.toggleAttribute('selected', option.selected)
    }
  }
}

/** 渲染一份并落盘，返回落盘路径。
 *  @param note - 覆盖文件名里的状态段。同面板的多个状态必须各给一个名字：给成同一个
 *                的话后跑的那张会静默盖掉前一张，而"文件在、内容是别的状态"比缺文件
 *                更难发现。 */
async function renderPanel(panel: Panel, dark: boolean, data?: ReactNode | undefined, note?: string): Promise<string> {
  const name = note ?? panel.id
  const label = `${name}-${dark ? 'dark' : 'light'}`
  const view = render(<>{data ?? panel.node()}</>)
  await settle(view.container.ownerDocument.body)
  // 读 body 而不是 container：与 settle 同一理由——真实 Modal 是 portal 到 body 的，
  // 按 body 取数对"挂在 container 里"和"portal 到 body"两种 mock 都成立。
  const inner = view.container.ownerDocument.body.innerHTML
  const file = `preview/panel-${label}.html`
  writeFileSync(file, page(inner, label, panel.sheets, dark), 'utf8')
  cleanup()
  return file
}

afterEach(() => { cleanup() })

describe('预览导出', () => {
  for (const panel of PANELS) {
    for (const dark of [false, true]) {
      it(`渲染 ${panel.id}（${dark ? '暗色' : '亮色'}）`, async () => {
        const file = await renderPanel(panel, dark)
        // 只断言"确实画出了东西"：这个 harness 的产物是给人看的，不是给断言看的。
        expect(readFileSync(file, 'utf8').length).toBeGreaterThan(2000)
      })
    }
  }

  // 第一屏与空账本：内容边界，不是主题问题，所以只在亮色下出一份。
  it('渲染 digest 第一天（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'digest') as Panel
    await renderPanel(panel, false, <DigestManager summary={() => Promise.resolve(DAY_ONE)} onClose={noop} t={t} />, 'digest-dayone')
  })

  it('渲染 digest 空账本（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'digest') as Panel
    const empty: DigestSummaryPayload = {
      path: FULL.path,
      summary: { ...FULL.summary, total: 0, recent: [], byOutcome: {}, averagedOver: 0 },
    } as never
    await renderPanel(panel, false, <DigestManager summary={() => Promise.resolve(empty)} onClose={noop} t={t} />, 'digest-empty')
  })

  // 错误块（`base.error`）是六个面板共用的一条，却是唯一一件一张图都没有的状态——
  // 没有任何 fixture 会让面板失败。这里让摘要接口直接拒绝，把 role="alert" 那一块画出来。
  // 亮暗两份都要：这一块是靠**底色**表达的，而底色在两套主题里来自不同的取值，只出一份
  // 等于只验了一半。
  it('渲染面板的错误块（亮暗两份）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'digest') as Panel
    const failing = (): Promise<never> => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:8080'))
    for (const dark of [false, true]) {
      await renderPanel(panel, dark, <DigestManager summary={failing} onClose={noop} t={t} />, 'digest-error')
    }
  })

  // 一个值读出来长什么样：长文本要换行、JSON 文本要摊成键值列表、嵌套要退回 JSON，
  // 而默认选中那个项目的长值都落在折叠线以下。内容边界，不是主题问题，所以只出亮色。
  it('渲染项目面板的值的读法（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'project') as Panel
    await renderPanel(
      panel, false, <ProjectManager t={t} onClose={noop} {...valueShapeFixture} />, 'project-values')
  })

  // 行尾那两颗按钮（复制、删除）在面板上平时是收着的，悬停或焦点落在这一行时才显形——
  // 而预览页上没有鼠标，于是它们在每一张图里都是 opacity:0：批次 D 改的是什么，图上一
  // 点也看不到。这一页让第一行处于 `:focus-within`（同一套揭示规则的另一半），把那两颗
  // 按钮画出来。React 的 `autoFocus` 只调 `.focus()`、不落到 HTML 特性上，Chrome 重放
  // 这一页时焦点会丢——和归档那张的勾选框同一个坑，所以手工补一个 `autofocus`，由外壳
  // 那一段脚本照着它把焦点落回去。
  it('渲染项目面板行尾控件的显露态（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'project') as Panel
    const view = render(<ProjectManager t={t} onClose={noop} {...valueShapeFixture} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 挑第一颗**可用**的复制按钮：值空的那些行，复制按钮是 disabled，而被禁用的一颗
    // 本来就不受揭示规则管（`.rowIcon:disabled` 自己给了 0.4），拿它画不出这一页要说的事。
    const row = [...doc.querySelectorAll('[class*="fieldRow"]')].find(candidate => {
      const copy = candidate.querySelector('[class*="rowAction"]') as HTMLButtonElement | null
      return copy !== null && !copy.disabled
    })
    expect(row).toBeTruthy()
    const copy = (row as Element).querySelector('[class*="rowAction"]') as HTMLButtonElement
    copy.focus()
    expect(doc.activeElement).toBe(copy)
    copy.setAttribute('autofocus', '')

    const inner = doc.body.innerHTML
    writeFileSync('preview/panel-project-focus.html', page(inner, 'project-focus', panel.sheets, false), 'utf8')
  })

  // 归档行：默认列表里看不见（fixture 里那两条 archived 样本就是为它准备的），而两行式
  // 布局把「已归档」药丸挪到了第二行、和编码挤同一行——那一行放不放得下正是这张图要
  // 回答的问题。内容边界，不是主题问题，所以只出亮色。
  it('渲染项目面板的归档行（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'project') as Panel
    // 只装归档样本：全量样本里归档行排在最后、落在滚动区以下，静态页拍不到。
    const view = render(<ProjectManager t={t} onClose={noop} {...archivedFixture} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const toggle = doc.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle as HTMLInputElement)
    await settle(doc.body)
    // React 写的是 `checked` 属性（property），不落到 HTML 特性上，`innerHTML` 拍不到它，
    // Chrome 重放这一页时勾选框会还原成未勾——而这张图画的正是「勾上以后」的样子。
    toggle?.setAttribute('checked', '')

    const note = 'project-archived'
    const inner = doc.body.innerHTML
    writeFileSync(`preview/panel-${note}.html`, page(inner, note, panel.sheets, false), 'utf8')
    // 勾选框自己的文案里就有「已归档」，拿它当判据等于什么都没验；用一个只在归档行
    // 出现时才渲染的名字。
    expect(inner).toContain('华科 2024 遗留整改')
  })

  // 「点开才编辑」的另一半：读到的是文字，点开的是输入框。预览页本身是静态 HTML，
  // 点不动，所以在这里点开再落盘——与 digest 帮助展开那一张同一个做法。
  //
  // 两张分开出：长文本那张要看的是输入框跟着内容长高（整段露出来），JSON 文本那张
  // 要看的是点开后手里的仍然是原来那一串。而且一次只开得了一个——点第二个字段时，
  // 第一个字段的行被 blur，读到的与存着的一样，于是它自己收起来、什么都不写。
  it('渲染项目面板字段的点开态（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'project') as Panel
    const view = render(<ProjectManager t={t} onClose={noop} {...valueShapeFixture} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    /** 点开一个字段的值，回它开出来的输入框。按字段名每次重查：点开会换掉那一行的节点。 */
    const openEditor = (fieldName: string): Element => {
      const rows = [...doc.querySelectorAll('[class*="fieldRow"]')]
      const row = rows.find(candidate => candidate.querySelector('[class*="fieldKey"]')?.textContent === fieldName)
      expect(row).toBeTruthy()
      fireEvent.click((row as Element).querySelector('[class*="fieldValueRead"]') as Element)
      const box = (row as Element).querySelector('textarea')
      expect(box).not.toBeNull()
      return box as Element
    }

    const dump = async (note: string): Promise<string> => {
      await settle(doc.body)
      const inner = doc.body.innerHTML
      writeFileSync(`preview/panel-${note}.html`, page(inner, note, panel.sheets, false), 'utf8')
      return inner
    }

    // 值在编辑框里，而且是整串：长文本 110 字，JSON 那一行就是一整串 JSON。
    const longBox = openEditor('长文本')
    expect((longBox as HTMLTextAreaElement).value.length).toBeGreaterThan(100)
    await dump('project-values-edit')

    const jsonBox = openEditor('JSON文本')
    expect((jsonBox as HTMLTextAreaElement).value).toContain('"数据源key"')
    await dump('project-values-edit-json')
  })

  // 面板外壳的行由上面的循环出亮暗两份；这里补的是**席位变长以后**的样子——内容
  // 边界，不是主题问题，所以只出亮色（与 digest 那三张同一规矩）。
  it('渲染面板外壳的长席位（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'items') as Panel
    const file = await renderPanel(panel, false, <Popover rows={MANY_ROWS} />, 'items-many')

    // "席位里有多少条就画多少行"是面板的承诺，漏画在图上只表现为"面板比印象里短"，
    // 属于那种看着不像错的错。
    expect(readFileSync(file, 'utf8').match(/class="item"/g) ?? []).toHaveLength(MANY_ROWS.length)
  })

  // 面板自己解释自己的那一块，默认是收起的 —— 展开后有没有变丑，只有展开才知道。
  it('渲染 digest 帮助展开态（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'digest') as Panel
    const view = render(<DigestManager summary={() => Promise.resolve(DAY_ONE)} onClose={noop} t={t} />)
    await settle(view.container.ownerDocument.body)
    const toggle = view.container.ownerDocument.querySelector('[class*="helpToggle"]')
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle as Element)
    await settle(view.container.ownerDocument.body)
    const inner = view.container.ownerDocument.body.innerHTML
    writeFileSync('preview/panel-digest-help.html', page(inner, 'digest-help', panel.sheets, false), 'utf8')
    expect(inner).toContain('helpList')
  })

  // 展开的日志行里才有那九枚指标片，而折叠态是每页的默认长相 —— 只出折叠态的话，
  // 指标片就是这一页上唯一没有被任何一张图覆盖的元件。它和上面的判定徽章现在共用
  // 同一条 `.tag` 规则，改了名字却画不出来，正好是那种"看代码全对、看界面没动"的错。
  it('渲染 digest 展开一行日志（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'digest') as Panel
    const view = render(<DigestManager summary={() => Promise.resolve(FULL)} onClose={noop} t={t} />)
    await settle(view.container.ownerDocument.body)
    const head = view.container.ownerDocument.querySelector('[class*="logHead"]')
    expect(head).not.toBeNull()
    fireEvent.click(head as Element)
    await settle(view.container.ownerDocument.body)
    const inner = view.container.ownerDocument.body.innerHTML
    writeFileSync('preview/panel-digest-expanded.html', page(inner, 'digest-expanded', panel.sheets, false), 'utf8')
    // 展开确实发生了，否则这张图只是又一张折叠态，什么也没验证。
    expect(inner).toContain('metricStrip')
    expect(inner).toContain('detailGrid')
  })

  // 数据源面板有三个状态此前拍不到，原因不是没人拍，是**拍不出来**：渲染器的
  // Button mock 把 `onClick` 从解构参数里拿走了、没传给 `<button>`，面板上每一颗
  // 按钮在预览页里都是死的——而这三个状态全都只能靠点按钮进去。修掉 mock 之后
  // 它们才第一次可见，所以这三页本身也是那次修复的验收点：`onClick` 不生效时，
  // 每一页的第一个断言都会挂。
  //
  // 第一页：新增/编辑表单。它是这个面板**唯一的写入路径**，也是量出"动作行落在
  // 折叠线外 116px"的那个界面——没有这一页就没有那个数字。
  it('渲染数据源的新增表单（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'datasource') as Panel
    const view = render(<DataSourceManager t={t} onClose={noop} {...DATASOURCE_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const add = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('datasource.new'))
    expect(add).toBeTruthy()
    fireEvent.click(add as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 表单真的开出来了。断言落在类名和表单标题上，**不落在按钮文案上**：
    // 两个不同的 key 完全可以是同一个字面值（`datasource.remove` 和
    // `datasource.removeYes` 都是「删除」），而「保存」甚至只是密码框占位符
    // 「留空表示不修改已保存的密码」的子串——拿文案当断言，等于什么都没断言。
    expect(inner).toContain('formRow')
    expect(inner).toContain(name('datasource.createTitle'))
    writeFileSync('preview/panel-datasource-form.html', page(inner, 'datasource-form', panel.sheets, false), 'utf8')
  })

  // 第二页：删除确认。它把动作行整行换成一句说明加两颗按钮，是 `.detailActions`
  // 在同一个面板里的第二种形态——此前只有第一种有图。
  it('渲染数据源的删除确认（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'datasource') as Panel
    const view = render(<DataSourceManager t={t} onClose={noop} {...DATASOURCE_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const remove = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('datasource.remove'))
    expect(remove).toBeTruthy()
    fireEvent.click(remove as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 断在确认行那句「删除「jxy-ncc-test::test」？」上，**不能断在确定按钮的文案上**：
    // `datasource.remove`（列表那颗）和 `datasource.removeYes`（确认里那颗）的取值
    // 都是「删除」，所以「inner 里有『删除』」这句话在确认行没打开时同样成立——
    // 那是一条永远为真的断言。第一版就是这么写的，把它改回不修 mock 的状态跑一遍
    // 才暴露出来：另外两页挂了，这一页照样绿。
    expect(inner).toContain(filled('datasource.removeConfirm', { key: 'jxy-ncc-test::test' }))
    writeFileSync('preview/panel-datasource-confirm.html', page(inner, 'datasource-confirm', panel.sheets, false), 'utf8')
  })

  // 第三页：无连接器那一行。压暗的行（`.rowUnsupported`）选中后，详情页多一句
  // 「查询脚本没有 mssql 的连接器」，而且**测试连接是禁用的**——那个禁用态正是
  // mock 修复前画不出来的另一半：`disabled` 同样被解构拿走，一颗该禁用的按钮被
  // 画成可点，于是"禁用态确实禁用了"这句话此前没有任何一张图能支持。
  it('渲染数据源的无连接器行（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'datasource') as Panel
    const view = render(<DataSourceManager t={t} onClose={noop} {...DATASOURCE_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const row = [...doc.querySelectorAll<HTMLButtonElement>('button[role="option"]')]
      .find(button => button.className.includes('rowUnsupported'))
    expect(row).toBeTruthy()
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const test = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('datasource.test'))
    expect(test).toBeTruthy()
    expect((test as HTMLButtonElement).disabled).toBe(true)

    const inner = doc.body.innerHTML
    expect(inner).toContain(filled('datasource.noConnector', { type: 'mssql' }))
    writeFileSync('preview/panel-datasource-unsupported.html', page(inner, 'datasource-unsupported', panel.sheets, false), 'utf8')
  })

  // 「缺口」页签下的展开控件（`.foldToggle`）在这一版里被改到了，却是**唯一一件
  // 一张图都拍不到的元件**：它藏在页签后面，而默认页签是「概览」，此前所有 wiki
  // 预览页画的都是概览。
  //
  // 这张图同时是"两份样式表合并"这件事的验收点。合并前 wiki 用的是它自己那份
  // `.gapToggle`，比共享那条少了 `font-family: inherit` —— 而 `<button>` 不继承
  // 字体（浏览器给它 `font: 400 13.333px Arial`，宿主的六张主题表里没有一张把它
  // 改回来），于是这条链接在 wiki 面板里是 Arial，在技能面板里是系统字体，两个
  // 面板里同一个控件是两种字形。断言落在类名上，因为"字体会不会继承"只有真浏览器
  // 答得了，而这里跑的是 jsdom。
  it('渲染 wiki 的缺口页签（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'wiki') as Panel
    const view = render(<WikiManager t={t} onClose={noop} {...wikiApi} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const gapsTab = [...doc.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find(tab => tab.textContent?.includes(name('wiki.tab.gaps')) === true)
    expect(gapsTab).toBeTruthy()
    fireEvent.click(gapsTab as HTMLElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 页签真的切过去了，否则这张图只是又一张概览。
    expect(inner).toContain('gapList')
    // 而且那个开关读的是共享表那条规则——这正是这一版改的东西。
    expect(doc.querySelector('[class*="foldToggle"]')).not.toBeNull()
    writeFileSync('preview/panel-wiki-gaps.html', page(inner, 'wiki-gaps', panel.sheets, false), 'utf8')
  })

  // ── wiki 剩下的六个状态 ──────────────────────────────────────────────────────
  //
  // 上面三张（亮、暗、缺口）是 wiki 此前全部的渲染途径，而这个面有九个可表达的
  // 状态：概览、缺口、活动、搜索命中、实体卡、引用者展开、未就绪的 vault、错误条、
  // 空列表。缺的不是"少几张图"——是**每一张图背后那条规则都没有被看过**：卡片那种
  // 带边框的盒子、活动页签里两块词表和一段日志、引用者那 46 条链接的换行、以及
  // 一个没索引的 vault 会让对话框长什么样，此前都只能读 CSS 猜。而这一版要做的
  // 美化，动的大半正是这些地方。
  //
  // fixture 早就为它们备好了数据（`WIKI_USAGE`、`CITERS`、12 张卡、以及一个会按
  // 宿主的原话拒绝的 `pageCard`），所以这里不需要造数据，只需要把状态点出来。
  // 内容边界而非主题问题，所以都只出亮色（错误块那张的暗色版在消化面板那边已有，
  // 两处用的是同一条共享规则）。

  /** 按可见文字找元素：静态页没有测试 id，而面板的可见文字就是它的接口。 */
  function byText<T extends Element>(doc: Document, selector: string, text: string): T {
    const hit = [...doc.querySelectorAll<T>(selector)].find(el => el.textContent?.includes(text) === true)
    expect(hit, `这一页上没有「${text}」`).toBeTruthy()
    return hit as T
  }

  /** 开一个 wiki 面板并等它落定——下面几页的起手式都一样。 */
  async function openWiki(): Promise<Document> {
    const view = render(<WikiManager t={t} onClose={noop} {...wikiApi} />)
    await settle(view.container.ownerDocument.body)
    return view.container.ownerDocument
  }

  /**
   * 在搜索框里打一个词，等到结果画出来。
   *
   * 必须显式等过防抖：面板的搜索是 300ms 防抖（`SEARCH_DEBOUNCE_MS`），而 `settle`
   * 等的是"连续三次采样不变"（约 30ms）——防抖还没到点它就宣布落定了，拍到的是一张
   * 只有搜索框、没有结果的面板，而那种图和"搜索坏了"在静态页上分不开。
   */
  async function typeSearch(doc: Document, term: string): Promise<void> {
    const box = doc.querySelector<HTMLInputElement>('input[type="search"]')
    expect(box, '这一页上没有搜索框').not.toBeNull()
    fireEvent.change(box as HTMLInputElement, { target: { value: term } })
    await new Promise(resolve => { setTimeout(resolve, 400) })
    await settle(doc.body)
  }

  function wikiPanel(): Panel {
    return PANELS.find(candidate => candidate.id === 'wiki') as Panel
  }

  // 活动的页签：两块词表（查了没命中的 / 查得最多的）加一段写入日志。三块的高度
  // 差别很大——最长的查询词是 60 多个字符（`overflow-wrap: anywhere` 就是给它写的），
  // 而日志那八条里有三条要折成两三行。这一页回答的是"这三块摞在一起是什么节奏"。
  it('渲染 wiki 的活动页签（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()
    fireEvent.click(byText<HTMLElement>(doc, '[role="tab"]', name('wiki.tab.activity')))
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 三块都在，否则这张图只是又一个概览。
    expect(inner).toContain('termList')
    expect(inner).toContain('logList')
    expect(inner).toContain(name('wiki.missedTerms'))
    expect(inner).toContain(name('wiki.topTerms'))
    expect(inner).toContain(name('wiki.recent'))
    writeFileSync('preview/panel-wiki-activity.html', page(inner, 'wiki-activity', panel.sheets, false), 'utf8')
  })

  // 搜索命中：结果列表替掉页签，一行一条（名字、URI、级别标签、字段数、表名）。
  // 用「订单」是因为它在样本里命中五条——一条命中看不出行与行之间对不对得齐。
  it('渲染 wiki 的搜索命中（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()
    await typeSearch(doc, '订单')

    const rows = doc.querySelectorAll('[class*="resultRow"]')
    expect(rows.length).toBeGreaterThan(2)
    const inner = doc.body.innerHTML
    expect(inner).toContain('resultFacts')
    // 命中行的级别标签用的是共享 `.tag`，这一页是它唯一一次出现在 wiki 上。
    expect(inner).toContain('tag')
    writeFileSync('preview/panel-wiki-search.html', page(inner, 'wiki-search', panel.sheets, false), 'utf8')
  })

  // 实体卡：从搜索命中点开，画在命中列表**下面**。
  //
  // 查询词必须只命中一条，这不是讲究：对话框高度是封顶的，而卡片排在命中列表之后——
  // 三条命中就能把卡片推到折叠线以下，静态页拍到的就只有那张列表。查「业务单元」正好
  // 命中样本里那一个枢纽页（出链三组、入链一组、未解析 21 条），四种关系行都在。
  it('渲染 wiki 的实体卡（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()
    await typeSearch(doc, '业务单元')
    expect(doc.querySelectorAll('[class*="resultRow"]').length).toBe(1)

    fireEvent.click(doc.querySelector<HTMLElement>('[class*="resultRow"]') as HTMLElement)
    await settle(doc.body)

    expect(doc.querySelector('[class*="cardTitle"]'), '卡片没画出来').not.toBeNull()
    expect(doc.querySelectorAll('[class*="relRow"]').length).toBeGreaterThan(2)
    expect(doc.body.innerHTML).toContain(name('wiki.cardOutgoing'))
    expect(doc.body.innerHTML).toContain(name('wiki.cardIncoming'))
    writeFileSync('preview/panel-wiki-card.html', page(doc.body.innerHTML, 'wiki-card', panel.sheets, false), 'utf8')
  })

  // 同一张卡的另一种样子：只有概念、没有物理表的页面（整本索引里这样的页面只有 256
  // 个）。它没有出链、没有字段数、没有表名，只有一条 `.lacks` 和一条入链——`.tagMuted`
  // 与那张"连表名都没有"的说明只在这里出现。
  it('渲染 wiki 的概念级实体卡（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()
    await typeSearch(doc, '采购订单主表')
    expect(doc.querySelectorAll('[class*="resultRow"]').length).toBe(1)

    fireEvent.click(doc.querySelector<HTMLElement>('[class*="resultRow"]') as HTMLElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    expect(inner).toContain('lacks')
    expect(inner).toContain(name('wiki.cardNoTable'))
    expect(inner).toContain('tagMuted')
    writeFileSync('preview/panel-wiki-card-concept.html',
      page(inner, 'wiki-card-concept', panel.sheets, false), 'utf8')
  })

  // 缺口行的「看谁引用它」展开态：46 条页面名在一个 124px 高的滚动框里换行排，
  // 后面跟着「还有 6 个页面」。这是这份面板里唯一一处**展开**（不是跳转），而它此前
  // 也没有图。
  it('渲染 wiki 的引用者展开（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()
    fireEvent.click(byText<HTMLElement>(doc, '[role="tab"]', name('wiki.tab.gaps')))
    await settle(doc.body)

    fireEvent.click(doc.querySelector<HTMLElement>('[class*="foldToggle"]') as HTMLElement)
    await settle(doc.body)

    // 面板把这一串截在 40 条（`slice(0, 40)`），剩下的用一句话报数。所以这里钉的是
    // 这个契约的两半：正好 40 条链接，加「还有 6 个页面」。样本里存了 46 条。
    expect(doc.querySelectorAll('[class*="citerLink"]').length).toBe(40)
    expect(doc.body.innerHTML).toContain(filled('wiki.citersMore', { count: '6' }))
    writeFileSync('preview/panel-wiki-citers.html', page(doc.body.innerHTML, 'wiki-citers', panel.sheets, false), 'utf8')
  })

  // 未就绪的 vault。列表里那行已经暗着（`.rowNotReady`，前两张图里就有），但**点它
  // 之后**的详情区此前没有图：三个页签都在，页签下面什么都没有，唯一的动作按钮是禁用
  // 的（`!current.ready`）——这是这个面板看起来最"空"的一屏，而它正是新装一个 vault
  // 目录还没建索引时会看到的。
  it('渲染 wiki 未就绪的 vault（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()

    const row = [...doc.querySelectorAll<HTMLButtonElement>('button[role="option"]')]
      .find(button => button.className.includes('rowNotReady'))
    expect(row, '列表里没有未就绪的那一行').toBeTruthy()
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    expect(doc.querySelectorAll('[role="tab"]').length).toBe(3)
    expect(doc.querySelectorAll('[class*="levelRow"]').length).toBe(0)
    writeFileSync('preview/panel-wiki-notready.html', page(doc.body.innerHTML, 'wiki-notready', panel.sheets, false), 'utf8')
  })

  // 错误块。点一个宿主没有预存卡片的引用者，`pageCard` 按宿主的原话拒绝，面板把
  // 它画成那条 role="alert" 的横幅加「重试」。六个面板共用这一条规则，但**接入得
  // 对不对**是每个面板自己的事：横幅画在 `.body` 之上，它不是面板正文的一部分。
  it('渲染 wiki 的错误条（亮色）', async () => {
    const panel = wikiPanel()
    const doc = await openWiki()
    fireEvent.click(byText<HTMLElement>(doc, '[role="tab"]', name('wiki.tab.gaps')))
    await settle(doc.body)
    fireEvent.click(doc.querySelector<HTMLElement>('[class*="foldToggle"]') as HTMLElement)
    await settle(doc.body)

    // 「报价历史物料表体」在索引里真实存在（它就是缺口第一名的一个引用者），
    // 但 fixture 只为「报价历史表头自定义项」存了卡——所以点它必然得到宿主的拒绝。
    fireEvent.click(byText<HTMLButtonElement>(doc, '[class*="citerLink"]', '报价历史物料表体'))
    await settle(doc.body)

    expect(doc.querySelector('[role="alert"]'), '错误条没画出来').not.toBeNull()
    expect(doc.body.innerHTML).toContain('没有名为')
    writeFileSync('preview/panel-wiki-error.html', page(doc.body.innerHTML, 'wiki-error', panel.sheets, false), 'utf8')
  })

  // ── wiki 的三个登记动词 ──────────────────────────────────────────────────────
  //
  // 上面九张图全是「读」的样子，因为这一批之前这个面确实是只读的。批 3b 给它加了
  // 新增 / 编辑 / 移除登记三个动词，而这三个状态**都要点一下才走得到**，静态页一个
  // 都拍不着——所以三张图各自还压着一条只看 CSS 猜不出来的规则：
  //
  //   · 表单里路径那一格是**只读的读出**，值只能从宿主的选择器来；而名称那一格
  //     反过来，是这条登记里唯一推导不出来的东西（id 从目录名派生），必须能打字；
  //   · 空名单那一屏是「谁都没登记过」的模样，它得指得出下一步，否则这一页只是
  //     一句陈述；
  //   · 两步确认把动作行换成「一句问话 + 两颗按钮」以后，那句问话**必须还在动作行
  //     里**——共享表的 `.detailActions:last-child` 是贴底吸住的，写在它上面一行的
  //     内容会滚出视野（安装目录面板第一版就是这么错的，那张图上只剩两颗按钮）。
  //
  // 内容边界而非主题问题，三张都只出亮色。

  /** 找一颗按钮按它的可见文字**全等**：这个面里「移除登记」与「移除」是两颗按钮。 */
  function verb(doc: Document, text: string): HTMLButtonElement {
    const hit = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === text)
    expect(hit, `这一页上没有「${text}」这颗按钮`).toBeTruthy()
    return hit as HTMLButtonElement
  }

  it('渲染 wiki 的登记表单（亮色）', async () => {
    const panel = wikiPanel()
    const view = render(<WikiManager t={t} onClose={noop} {...wikiApi} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    fireEvent.click(verb(doc, name('wiki.new')))
    await settle(doc.body)

    const inner = doc.body.innerHTML
    expect(inner).toContain(name('wiki.newTitle'))

    // 路径是**选出来的**，不是打出来的：框只读、空表单里它是空的。一个绝对路径错一个
    // 字符，面板不会报错，只会安静地列出一个空的知识库——这就是只读的理由。
    const field = doc.querySelector<HTMLInputElement>('#yon-wiki-path')
    expect(field?.readOnly).toBe(true)
    expect(field?.value).toBe('')
    // 名称反过来：它可写，因为它是唯一推导不出来的东西。断「可写」而不是断「有」——
    // 哪天它被改成只读或换成下拉，只有这条断言会响。
    const label = doc.querySelector<HTMLInputElement>('#yon-wiki-label')
    expect(label?.readOnly).toBe(false)
    // 而这个面里没有下拉：产品线和版本都不必使用者选（那是安装目录面板的事）。
    expect(doc.querySelector('select')).toBeNull()

    fireEvent.click(verb(doc, name('wiki.pickDir')))
    await settle(doc.body)
    expect(doc.querySelector<HTMLInputElement>('#yon-wiki-path')?.value).toBe(WIKI_PICKED_PATH)

    writeFileSync('preview/panel-wiki-form.html', page(doc.body.innerHTML, 'wiki-form', panel.sheets, false), 'utf8')
  })

  it('渲染 wiki 的空名单（亮色）', async () => {
    const panel = wikiPanel()
    const view = render(<WikiManager t={t} onClose={noop} {...wikiFixture(WIKI_NONE)} />)
    await settle(view.container.ownerDocument.body)

    const inner = view.container.ownerDocument.body.innerHTML
    // 这是**一次都没登记过的第一屏**，所以它自己得是一页图。断言落在那句指路的
    // 文案上：空态说得出下一步才算空态，只说「没有」就只是一句陈述。
    expect(inner).toContain(name('wiki.emptyHint'))
    expect(view.container.ownerDocument.querySelector('[class*="emptyTitle"]')).not.toBeNull()
    // 而且「新增」那颗按钮还在——空态里它是唯一的出路。
    expect(verb(view.container.ownerDocument, name('wiki.new'))).toBeTruthy()
    writeFileSync('preview/panel-wiki-empty.html', page(inner, 'wiki-empty', panel.sheets, false), 'utf8')
  })

  it('渲染 wiki 的移除确认（亮色）', async () => {
    const panel = wikiPanel()
    const view = render(<WikiManager t={t} onClose={noop} {...wikiApi} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    fireEvent.click(verb(doc, name('wiki.remove')))
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 断在问话上，**不能断在确认按钮的文案上**：`wiki.remove`（列表那颗）是「移除登记」，
    // 而 `wiki.removeYes` 是「移除」——后者是前者的子串，所以「inner 里有『移除』」在
    // 确认行没打开时同样成立。那句问话只出现在这一段分支里。
    expect(inner).toContain(name('wiki.removeAsk'))
    expect(inner).toContain(name('wiki.removeYes'))
    // 而且它必须在**动作行里面**，理由见上面那段注释。
    expect(doc.querySelector('[class*="detailActions"]')?.textContent).toContain(name('wiki.removeAsk'))
    // 那句说明（「vault 目录和里面的索引文件都不动」）是这一步的全部安抚，少了它
    // 使用者会以为点下去要删东西。
    expect(inner).toContain(name('wiki.removeAbout'))
    writeFileSync('preview/panel-wiki-confirm.html', page(inner, 'wiki-confirm', panel.sheets, false), 'utf8')
  })

  // 一台没有本地目录选择器的宿主：那颗按钮照旧画出来，点下去才知道"这台机器没有"。
  // 这条路径要点击才走到，静态页拍不到，所以验收只落在断言上（与安装目录面板同款）。
  // 它值得有一条，因为这里**没有**可手输的回退——使用者点半天是等不到一个输入框的。
  it('宿主没有目录选择器时，wiki 说明登记不了', async () => {
    const view = render(<WikiManager t={t} onClose={noop} {...wikiWithoutPicker()} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    fireEvent.click(verb(doc, name('wiki.new')))
    await settle(doc.body)

    // 说明只在问过之后才出现（宿主是懒问的）。
    expect(doc.body.innerHTML).not.toContain(name('wiki.pickUnavailable'))
    fireEvent.click(verb(doc, name('wiki.pickDir')))
    await settle(doc.body)

    expect(doc.body.innerHTML).toContain(name('wiki.pickUnavailable'))
    // 唯一的路径输入框仍然是只读的那一个：没有第二个可以打的框冒出来。
    expect(doc.querySelector<HTMLInputElement>('#yon-wiki-path')?.readOnly).toBe(true)
    expect([...doc.querySelectorAll<HTMLInputElement>('input')].filter(input => input.readOnly === false)
      .map(input => input.id)).toEqual(['yon-wiki-label'])
  })

  // ── 安装目录面板 ──────────────────────────────────────────────────────────────
  //
  // 这一页的四个状态都是**只有点一下才看得到**的，而它们各自压着一条只看 CSS 猜不出来
  // 的规则：空态那一块文案与图标的排布、表单里 28px 的下拉与三行格子摞在一起是什么
  // 节奏、两步删除确认把动作行换成"一句问话 + 两颗按钮"以后还放不放得下、以及一条登记
  // 的目录搬走以后压暗的行配上「路径读不出来」那句提示。亮暗两份已经在上面那个循环里
  // 出过了（面板页通用），所以这四张都只出亮色——内容边界，不是主题问题。
  it('渲染安装目录面板的空态（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...homesFixture(HOME_EMPTY)} />)
    await settle(view.container.ownerDocument.body)

    const inner = view.container.ownerDocument.body.innerHTML
    // 这是**每个使用者看到的第一屏**（今天谁都没登记过），所以它自己得是一页图。
    // 断言落在那两句解释上，不落在「还没有登记安装目录。」上：那句是标题，而标题在
    // 图里最显眼、最不容易出错，真正要盯的是"有没有说清路径该填哪一级"。
    expect(inner).toContain(name('home.emptyHow'))
    expect(inner).toContain('emptyTitle')
    writeFileSync('preview/panel-home-empty.html', page(inner, 'home-empty', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的登记表单（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const add = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('home.new'))
    expect(add).toBeTruthy()
    fireEvent.click(add as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    expect(inner).toContain('formRow')
    expect(inner).toContain(name('home.newTitle'))
    // 产品线是原生 select，不是共享表里的 Button：它长得像不像宿主自己的控件，只有
    // 图能回答。断言它画出来了（这一类控件在预览里没有别的痕迹可查）。
    expect(doc.querySelector('select')).not.toBeNull()

    // 版本一开始停在「选择版本…」那一格上，不是某个具体版本：目录里没有可信的版本串，
    // 探测不猜，所以空表单也不许替使用者预选一个。**这条只能在活的 DOM 上断**——静态
    // 页里 select 的选中态只是属性、不写进 innerHTML，浏览器重新解析时会跳过被禁用的
    // 占位项、落到第一个可选版本上，于是同一份 HTML 在两张图里显示的是两个版本。
    const version = doc.querySelector<HTMLSelectElement>('#yon-home-version')
    expect(version?.value).toBe('')
    expect(version?.selectedOptions[0]?.textContent).toBe(name('home.versionPick'))

    // 表单里**没有**名称那一格：名字由产品线和版本算出来（`homeLabelOf`），所以这一页
    // 少了一个要填的格子。断"没有"而不是断"有"，因为这是一个被拿掉的东西——它哪天
    // 回来了，只有这条断言会响。同一个版本的 Home 在两个项目间是互相通用的，名称本身
    // 就是多余的。
    expect(doc.querySelector('#yon-home-label')).toBeNull()

    // 路径是**选出来的**，不是打出来的：框只读，值来自那颗按钮。这两件事各自都只看图
    // 猜不出来——只读框照样长得像普通输入框，而"按钮接上了"更是图里看不出来的接线。
    // 所以断言分三步：钉住它不可手打、钉住空表单里它是空的、再点一下、钉住选出来的
    // 值真的进了框。中间那一步是这次新加的：框不再是可输入的回退手段以后，
    // "能不能打进去"就不再是一件可验的退路，值只能从按钮来。
    const field = doc.querySelector<HTMLInputElement>('#yon-home-path')
    expect(field?.readOnly).toBe(true)
    expect(field?.value).toBe('')
    const pick = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('home.pickDir'))
    expect(pick).toBeTruthy()
    fireEvent.click(pick as HTMLButtonElement)
    await settle(doc.body)
    expect(doc.querySelector<HTMLInputElement>('#yon-home-path')?.value).toBe(HOME_PICKED_PATH)

    writeFileSync('preview/panel-home-form.html',
      page(doc.body.innerHTML, 'home-form', panel.sheets, false), 'utf8')
  })

  // 一台没有本地目录选择器的宿主（面板从局域网地址或 SSH 打开）：那颗按钮照旧画出来
  // （按钮本身是有的，只是点下去问出来的答案说"这台机器没有"），所以这句话必须在，
  // 而且必须说清"在这里登记不了"——因为它背后**没有**可手输的回退，使用者点半天按钮
  // 是等不到一个输入框的。这条路径静态页拍不到（要点击才走到），验收只落在断言上。
  it('宿主没有目录选择器时说明登记不了，且不给手输回退', async () => {
    const view = render(<HomeManager t={t} onClose={noop} {...homesWithoutPicker()} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const add = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('home.new'))
    fireEvent.click(add as HTMLButtonElement)
    await settle(doc.body)

    // 说明只在问过之后才出现（宿主是懒问的：不问就不知道它是哪一种）。
    expect(doc.body.innerHTML).not.toContain(name('home.pickUnavailable'))
    const pick = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('home.pickDir'))
    fireEvent.click(pick as HTMLButtonElement)
    await settle(doc.body)

    expect(doc.body.innerHTML).toContain(name('home.pickUnavailable'))
    // 唯一的路径输入框仍然是只读的那一个：没有第二个可以打的框冒出来。
    const fields = [...doc.querySelectorAll<HTMLInputElement>('input')]
      .filter(input => input.id === 'yon-home-path' || input.type === 'text')
    expect(fields.every(input => input.readOnly)).toBe(true)
  })

  it('渲染安装目录面板的删除确认（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const remove = [...doc.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === name('home.remove'))
    expect(remove).toBeTruthy()
    fireEvent.click(remove as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 断在问话上，**不能断在确认按钮的文案上**：`home.remove`（列表那颗）是「删除」，
    // 而 `home.removeYes` 是「确认删除」——后者是前者的子串，所以「inner 里有『删除』」
    // 在确认行没打开时同样成立。这里那句 `home.removeAsk`（「删掉这条登记？<…>」）只
    // 出现在这一段分支里，拿它当判据才真的在验"点开了"。
    expect(inner).toContain(name('home.removeAsk'))
    expect(inner).toContain(name('home.removeYes'))
    // 而且那句话必须在**动作行里面**。共享表的 `.detailActions:last-child` 是贴底
    // 吸住的，写在它上面一行的内容会滚出视野——第一版就是这么写的，这张图上只有两颗
    // 按钮、一句问话都没有。断言落在"它在动作行内"上，就是冲着那个失败去的。
    expect(doc.querySelector('[class*="detailActions"]')?.textContent).toContain(name('home.removeAsk'))
    writeFileSync('preview/panel-home-confirm.html', page(inner, 'home-confirm', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的失效路径行（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 压暗的行在 fixture 里是第五条（`ncc-2105`），默认选中的是第一条健康的。
    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2105"]')
    expect(row).toBeTruthy()
    // 压暗不是"没选中"：这一条样式挂在行自己身上，点开它也不变。
    expect((row as HTMLButtonElement).className).toContain('rowNotReady')
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 详情页多出来的那句，只有 `ready:false` 的行才画——所以这张图验的是"压暗的行
    // 选中以后说了什么"，不是"它是不是暗的"。
    expect(inner).toContain(name('home.notReady'))
    expect(inner).toContain(name('home.shape.not-found'))
    writeFileSync('preview/panel-home-notready.html', page(inner, 'home-notready', panel.sheets, false), 'utf8')
  })

  // 警告列表（`.warnList`）此前**一张图都拍不到**，而且不是没人拍，是拍不出来：共享表
  // 的 `.body{height:min(62vh,520px)}` 把详情栏定死，警告排在 11 行关键路径表格之后，
  // 而 62vh 被 520px 截住——窗口开得再高也露不出来。所以这一页的验收落在**断言**上：
  // 图和 HTML 照出，但看图的人要知道自己看的是滚动区的上半截，警告在这张图上不存在。
  //
  // 挑 jar 集合那一行是因为它同时是另一种状态：五条里**唯一没有截断**的那条（走查到底，
  // 3517 个 jar 是数准的），所以它身上必须既有警告、又不许挂 `≥`。这两件事一条断言
  // 一种，正好把"截断就挂 `≥`、没截断就不挂"钉在同一个用例里。
  it('渲染安装目录面板的 jar 集合行（亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2207"]')
    expect(row).toBeTruthy()
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 半可用那条的警告原文在 fixture 里，这里是它唯一被验的地方。
    expect(inner).toContain('能用来按版本建类索引，读不到 .bmf 和模块配置')
    expect(doc.querySelector('[class*="warnList"]')).not.toBeNull()
    // 精确计数带上 `≥` 就是把"至少"说成了"正好"，所以这里断的是**不含**。用
    // `home.atLeast` 这个词条而不是字面量 `≥`：词条被改成空串时这条断言才会挂，
    // 而它挂的时候正是"两个数字看起来都精确"这个错误回来了的时候。
    expect(inner).toContain('3517')
    expect(inner).not.toContain(`${name('home.atLeast')}3517`)
    writeFileSync('preview/panel-home-jars.html', page(inner, 'home-jars', panel.sheets, false), 'utf8')
  })

  // ── 元数据索引那一段（批 A） ────────────────────────────────────────────────
  //
  // 这一段是**先有数据、后有图**：`homesFixture()` 里的 `META_SETTLED` 与
  // `buildingView()` 都是照真机量到的数字造的（3600 个文件 / 5573 个实体 / 217140 个
  // 字段），但一条用例都没画过它——于是"索引与安装目录一致"和"不一致、答案可能过时"
  // 这两句话长得一样，谁都没在图上见过。四个状态各一页。
  it('渲染安装目录面板的元数据索引行（新鲜，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const inner = view.container.ownerDocument.body.innerHTML

    // 默认选中的第一条（`ncc-2111`）已经建过一次索引、且与目录一致，所以按钮必须改口
    // 叫"重建"——`metaRebuild` 只在这里出现，`metaBuild` 在没索引的那条上出现。
    expect(inner).toContain(name('home.metaFresh'))
    expect(inner).toContain(name('home.metaRebuild'))
    // 一句里三个数字，逐个断：它们直接来自索引，写错一位就是给使用者一份错的规模感。
    expect(inner).toContain('5573 个实体')
    expect(inner).toContain('217140 个字段')
    expect(inner).toContain('2947 个枚举')
    writeFileSync('preview/panel-home-meta-fresh.html', page(inner, 'home-meta-fresh', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的元数据索引行（过时，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 第二条（`ncc-2312`）的版本在 fixture 里是"目录动过"的那种：2 改 1 增。
    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2312"]')
    expect(row).toBeTruthy()
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 带参的那一句逐字比对：三个数字是这次改动量的全部信息，缺一个都读不出"过时了多少"。
    expect(inner).toContain(filled('home.metaStale', { changed: '2', added: '1', removed: '0' }))
    // 过时的索引仍然是索引：还是那一行数字 + 重建，不是"没有索引"。
    expect(inner).toContain(name('home.metaRebuild'))
    expect(inner).not.toContain(name('home.metaFresh'))
    writeFileSync('preview/panel-home-meta-stale.html', page(inner, 'home-meta-stale', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的元数据索引行（没有，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 第三条（`ncc-2207`）的版本没有索引——这是**升级后第一次打开面板**的状态，
    // 也是模型为什么还调不动 `ncc_meta_find` 的答案。
    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2207"]')
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    expect(inner).toContain(name('home.metaNone'))
    expect(inner).toContain(name('home.metaBuild'))
    expect(inner).not.toContain(name('home.metaRebuild'))
    // 没有索引就**不该**有"与安装目录一致"这种话：没东西可比。
    expect(inner).not.toContain(name('home.metaFresh'))
    writeFileSync('preview/panel-home-meta-none.html', page(inner, 'home-meta-none', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的元数据索引（建立中，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 先选那条**没有**索引的（默认选中的第一条已经有索引了，按钮写的是"重建"）。
    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2207"]')
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    // 点"建立元数据索引"：fixture 的 `buildMeta` 与真机一样回 `{started:true}`，
    // 面板据此开始轮询并立刻画进度（`HomeManager.tsx` 里那条 `watchMeta`）。
    const build = [...doc.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === name('home.metaBuild')) as HTMLButtonElement
    expect(build).toBeTruthy()
    fireEvent.click(build)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 进度是 `role="status"` 的那一条：建立中要有可读的数字，而不是一个转圈。
    const progress = doc.querySelector('[role="status"]')
    expect(progress?.textContent).toBe(filled('home.metaProgress', { parsed: '1240', total: '3600', files: '3600' }))
    // 按钮自己也要说"正在建"，否则点第二次的人不知道第一次生效了。
    expect(inner).toContain(name('home.metaBuilding'))
    writeFileSync('preview/panel-home-meta-building.html', page(inner, 'home-meta-building', panel.sheets, false), 'utf8')
  })

  // ── 类索引那一段（批 3a） ────────────────────────────────────────────────────
  //
  // 这一段和上面元数据那段的来路不同：它是**先有这一批，后有图**——两个按钮和三种
  // 结论（没有 / 已有 / 建立失败）就是这一批加的东西，所以每一屏都要有一页。批 3a 之
  // 前这一格是详情栏 `<dl>` 里的一行「类索引」，只读；现在它是一个会动的块。
  //
  // 数清按钮是这一段的重点：`home.classRemove` 只该在**有文件**的时候出现，画多了就
  // 是一个必然报「本来就没有」的按钮。
  it('渲染安装目录面板的类索引行（已建，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 默认选中的 `ncc-2111` 建过索引——和列表行上的 `index` 是同一份（fixture 里两个
    // 数共用一组常量），所以这一页同时是"列表与详情说的是同一件事"的证据。
    const inner = doc.body.innerHTML
    expect(inner).toContain(filled('home.indexLine', {
      classes: '143908', size: '12.3 MB', at: '2026-09-28 16:02:41',
    }))
    expect(inner).toContain(name('home.classRebuild'))
    expect(inner).not.toContain(name('home.classBuild'))
    // 有索引才画删除；没有索引那一页必须一个都找不到。
    expect([...doc.querySelectorAll('button')]
      .filter(button => button.textContent?.trim() === name('home.classRemove'))).toHaveLength(1)
    // 已经有索引就**不该**再讲一遍这索引是什么：那句话是给还没建的人看的。
    expect(inner).not.toContain(name('home.classWhy'))
    writeFileSync('preview/panel-home-class-built.html', page(inner, 'home-class-built', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的类索引行（没有，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2207"]')
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    expect(inner).toContain(name('home.indexNone'))
    expect(inner).toContain(name('home.classBuild'))
    expect(inner).not.toContain(name('home.classRebuild'))
    // 还没建的时候要讲清这索引是什么、要多久——它是这一页唯一需要做决定的地方。
    expect(inner).toContain(name('home.classWhy'))
    // 没文件就**没有**删除可点。
    expect([...doc.querySelectorAll('button')]
      .filter(button => button.textContent?.trim() === name('home.classRemove'))).toHaveLength(0)
    writeFileSync('preview/panel-home-class-none.html', page(inner, 'home-class-none', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的类索引（建立中，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2207"]')
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const build = [...doc.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === name('home.classBuild')) as HTMLButtonElement
    expect(build).toBeTruthy()
    fireEvent.click(build)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    // 进度那一条：两个数（扫过多少 jar、多少个类），没有分母——类索引边扫边记，扫之前
    // 不知道总数，真机就是这么答的。
    expect(inner).toContain(filled('home.classProgress', { jars: '3120', classes: '62400' }))
    expect(inner).toContain(name('home.classBuilding'))
    // 跑到一半就不再讲"这索引是什么"了：决定已经做过。
    expect(inner).not.toContain(name('home.classWhy'))
    writeFileSync('preview/panel-home-class-building.html', page(inner, 'home-class-building', panel.sheets, false), 'utf8')
  })

  it('渲染安装目录面板的类索引（建立失败，亮色）', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel
    const view = render(<HomeManager t={t} onClose={noop} {...homesWithClassFailure()} />)
    await settle(view.container.ownerDocument.body)
    const doc = view.container.ownerDocument

    // 夹具默认把失败挂在 `ncc-2105`（那条路径失效的登记）上——真机上失败的理由就是
    // 这个：指到了一个不是安装目录的地方。
    const row = doc.querySelector<HTMLButtonElement>('button[data-key="ncc-2105"]')
    fireEvent.click(row as HTMLButtonElement)
    await settle(doc.body)

    const inner = doc.body.innerHTML
    const alert = doc.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('建立失败')
    expect(alert?.textContent).toContain('modules/*/classes')
    // 失败不是"没有索引"：那一句仍然在，因为文件确实没建出来。
    expect(inner).toContain(name('home.indexNone'))
    writeFileSync('preview/panel-home-class-failed.html', page(inner, 'home-class-failed', panel.sheets, false), 'utf8')
  })

  it('删除索引后说清删掉了什么，两种答复各说各的', async () => {
    const panel = PANELS.find(candidate => candidate.id === 'home') as Panel

    // Two renders live side by side in one jsdom document (nothing unmounts them here),
    // so every query below is scoped to its own `container` — a document-wide
    // `querySelectorAll` would find the *other* render's button and click that one.
    const clickRemove = async (
      view: ReturnType<typeof render>,
    ): Promise<string> => {
      await settle(view.container.ownerDocument.body)
      const button = [...view.container.querySelectorAll('button')]
        .find(candidate => candidate.textContent?.trim() === name('home.classRemove')) as HTMLButtonElement
      expect(button).toBeTruthy()
      fireEvent.click(button)
      await settle(view.container.ownerDocument.body)
      return view.container.innerHTML
    }

    // 真删掉了一个文件。
    expect(await clickRemove(render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)))
      .toContain(name('home.classRemoved'))

    // 按下去的时候文件已经不在了。这句答复是这一批唯一"说不清就骗人"的地方：不说，
    // 使用者会以为删除成功了。
    const inner = await clickRemove(render(<HomeManager t={t} onClose={noop} {...homesWithVanishedIndex()} />))
    expect(inner).toContain(name('home.classRemoveNone'))
    expect(inner).not.toContain(name('home.classRemoved'))
    writeFileSync('preview/panel-home-class-removed.html', page(inner, 'home-class-removed', panel.sheets, false), 'utf8')
  })

  // 同一条规则的另一半：真机上正经安装目录**一定**是截断的（量出来的：462 483 个目录项、
  // 7941 个 jar，走查到底要 24～32 秒），所以被截断的那两个数字必须挂着 `≥`。第一版
  // fixture 画的是一条 4182 个 jar、不截断的"健康行"——那是一个真实机器上不会出现的
  // 状态，拿它当第一页等于把 `≥` 这条路径从图上抹掉。这条断言就是冲着那次修正去的。
  it('截断的探测结论把两个数字都标成下界', async () => {
    const view = render(<HomeManager t={t} onClose={noop} {...HOME_FIXTURE} />)
    await settle(view.container.ownerDocument.body)
    const inner = view.container.ownerDocument.body.innerHTML
    expect(inner).toContain(`${name('home.atLeast')}237`)
    expect(inner).toContain(`${name('home.atLeast')}681`)
  })

  // 预览页不给类名加哈希，所以**同一页上两份样式表里同名的类就是同一个类**。
  //
  // 这不是理论洁癖：技能面板曾经用 `.body` 装正文（`<pre class="body">`），而共享
  // 表里的 `.body` 是两栏容器，于是共享那条 `overflow: auto` 落到了 `<pre>` 上，
  // 量出来的"共享 body 溢出 280px"其实是两个 `.body` 撞出来的假象。真实客户端有
  // hash 隔离，永远不会发生；只有这一页会。所以让这一页自己盯着它。
  //
  // 查的是**名字**，不是元素：同名类落到不同元素上（这次的 `.body`）和落到同一个
  // 元素上（下面那个例外）静态上分不开，而后者是合法用法。名字级的检查拦不住全部，
  // 但拦得住这一次，而且不需要跑浏览器。
  it('同一页上的两份样式表不撞类名', () => {
    let pairs = 0
    for (const panel of PANELS) {
      const sheets = panel.sheets
      for (let i = 0; i + 1 < sheets.length; i += 1) {
        for (let j = i + 1; j < sheets.length; j += 1) {
          const left = sheets[i]
          const right = sheets[j]
          if (left === undefined || right === undefined) continue
          const a = declaredClasses(left)
          const clash = [...declaredClasses(right)]
            .filter(name => a.has(name) && !SAME_ELEMENT.has(name))
          pairs += 1
          expect(clash, `${panel.id}：${left} 与 ${right} 撞了 ${clash.join('、')}`).toEqual([])
        }
      }
    }
    // 一条都没跑到的话，"没报错"会被读成"没问题"，而这正是这一页最怕的那类结论。
    expect(pairs).toBeGreaterThan(0)
  })

  // 那份豁免名单是会烂的：`.body` 这一对哪天不撞了，例外就该删掉，否则下一个人会
  // 以为这里有意为之。刚删掉一条 dead rule，同一个毛病不想再来一次。
  it('撞名豁免名单里的每一条都还在用', () => {
    const shared = declaredClasses(SHARED)
    for (const name of SAME_ELEMENT) {
      expect(shared.has(name), `豁免了 \`${name}\`，但共享表已经不再声明它`).toBe(true)
      const still = PANELS.some(panel => panel.sheets.some(
        sheet => sheet !== SHARED && declaredClasses(sheet).has(name),
      ))
      expect(still, `豁免了 \`${name}\`，但已经没有任何面板声明它`).toBe(true)
    }
  })
})
