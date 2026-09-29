/**
 * 把面板渲染成一张可以直接看的静态页（临时，不进仓库）。
 *
 * 为什么要这么绕：DSH Web 需要运行时签发的 token 才能打开，裸访问拿到的是
 * "authentication required"；而真实的 primitives 包 import 了 .css 与
 * @shikijs/langs/*，插件仓库里装不全，没法在测试里直接加载。
 *
 * 所以这里的做法是：**DOM 结构照抄真实的 Modal.tsx，样式直接引真实文件**。
 * 唯一的人为改动是给 Modal 的类名加了 `m-` 前缀——CSS Modules 在真实环境靠 hash
 * 隔离，预览页没有 hash，而 Modal 的 `.body` / `.title` 会和插件共享样式表里的
 * 同名类撞车。前缀只改名字，样式一个字没动。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { zh } from '../src/client/locales.ts'
import type { DigestLogEntryView, DigestSummaryPayload } from '../src/shared/types.ts'

/** Modal 的类名，逐个加前缀。 */
const MODAL_CLASSES = [
  'root', 'mask', 'dialog', 'content', 'header', 'title', 'close', 'description', 'body', 'footer',
]

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, ...rest }: { children: ReactNode }) => (
    <button type="button" className="pv-btn" {...rest}>{children}</button>
  ),
  // 结构与 packages/client/ui-primitives/src/Modal.tsx 一致，类名加 m- 前缀。
  Modal: ({ onClose, title, closeLabel, children, className, contentClassName }: {
    onClose(): void, title: string, closeLabel: string, children: ReactNode,
    className?: string, contentClassName?: string,
  }) => (
    <div className="m-root" role="presentation">
      <div className="m-mask" aria-hidden="true" onClick={onClose} />
      <div className={`m-dialog ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className={`m-content ${contentClassName ?? ''}`}>
          <div className="m-header">
            <h2 className="m-title">{title}</h2>
            <button type="button" className="m-close" aria-label={closeLabel} onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="m-body">{children}</div>
        </div>
      </div>
    </div>
  ),
}))

// 必须在 mock 之后 import
const { DigestManager } = await import('../src/client/digest/DigestManager.tsx')

const t = ((key: string, params?: Record<string, unknown>): string => {
  let out = (zh as Record<string, string>)[key] ?? key
  for (const [name, value] of Object.entries(params ?? {})) out = out.replace(`{${name}}`, String(value))
  return out
}) as never

/** 一条记录。 */
function entry(over: Partial<DigestLogEntryView> = {}): DigestLogEntryView {
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
  }
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
        scanned: 13100, passing: 1, failing: 11,
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
}

/** 把真实样式表拼成一份预览页。 */
function page(inner: string, note: string): string {
  const theme = readFileSync(
    'E:/gitproject/deepseek-harness-neuron/packages/client/ui-theme/src/styles/design-platform.css', 'utf8',
  )
  let modal = readFileSync(
    'E:/gitproject/deepseek-harness-neuron/packages/client/ui-primitives/src/Modal.module.css', 'utf8',
  )
  for (const name of MODAL_CLASSES) modal = modal.replaceAll(`.${name}`, `.m-${name}`)
  const shared = readFileSync('src/client/panel.module.css', 'utf8')
  const digest = readFileSync('src/client/digest/panel.module.css', 'utf8')
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${note}</title>
<style>${theme}</style>
<style>${modal}</style>
<style>${shared}</style>
<style>${digest}</style>
<style>
  html, body { margin: 0; min-height: 100%; }
  body { font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .pv-btn { font: inherit; font-size: 12px; line-height: 20px; padding: 3px 10px; border: 1px solid var(--dsw-alias-border-l); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; }
  /* 遮罩用主题的真实值，不用自定义的浅色——预览页一旦改了它，我看到的层级感
     就比真实环境弱，而我正靠这张图判断层级。 */
</style>
</head>
<body>${inner}
<pre id="probe" style="display:none"></pre>
<script>
// 探针：把关键规则的实际计算值写进 #probe，由 CDP 读回（元素 display:none，
// 所以不会出现在截图里）。
// 截图看不出 1–2px 的线与浅色轨道究竟是"没画"还是"太淡"，只能问浏览器。
;(function () {
  var out = []
  function cs(el, pseudo) { return getComputedStyle(el, pseudo || null) }
  function box(el) { var r = el.getBoundingClientRect(); return Math.round(r.left) + '..' + Math.round(r.right) }
  var cell = document.querySelector('[class*="averageCell"]')
  if (cell) {
    var after = cs(cell, '::after')
    out.push('cell::after bg=' + after.backgroundColor + ' inset=' + after.insetInlineStart)
    var bar = cell.querySelector('[class*="averageBar"]')
    if (bar) out.push('bar w=' + cs(bar).inlineSize + ' left=' + cs(bar).insetInlineStart)
    out.push('cellBox=' + box(cell))
  }
  var badge = document.querySelector('[class*="logOutcome"]')
  if (badge) {
    var b = cs(badge)
    out.push('badge color=' + b.color + ' border=' + b.borderTopWidth + '/' + b.borderTopColor)
  }
  var badges = document.querySelectorAll('[class*="logOutcome"]')
  if (badges.length > 2) {
    var third = cs(badges[2])
    out.push('badge3(' + badges[2].textContent + ') border=' + third.borderTopWidth + '/' + third.borderTopColor + ' color=' + third.color)
  }
  var grid = document.querySelector('[class*="averageGrid"]')
  var bar0 = document.querySelector('[class*="toolbar"]')
  var dialog = document.querySelector('[class*="m-dialog"]')
  if (grid) out.push('gridBox=' + box(grid))
  if (bar0) out.push('toolbarBox=' + box(bar0))
  if (dialog) out.push('dialogBox=' + box(dialog))
  var actions = document.querySelector('[class*="actions"]')
  if (actions) out.push('actionsBox=' + box(actions))
  document.getElementById('probe').textContent = 'PROBE ' + out.join(' | ')
})()
</script>
</body></html>`
}

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
}

describe('预览导出', () => {
  const cases: readonly (readonly [string, DigestSummaryPayload | undefined])[] = [
    ['day-one', DAY_ONE],
    ['full', FULL],
    ['empty', { path: FULL.path, summary: { ...FULL.summary, total: 0, recent: [], byOutcome: {}, averagedOver: 0 } }],
  ]

  for (const [name, data] of cases) {
    it(`渲染 ${name}`, async () => {
      const view = render(
        <DigestManager summary={() => Promise.resolve(data as DigestSummaryPayload)} onClose={() => {}} t={t} />,
      )
      await new Promise(resolve => setTimeout(resolve, 0))
      const inner = view.container.ownerDocument.body.innerHTML
      writeFileSync(`preview/panel-${name}.html`, page(inner, name), 'utf8')
      cleanup()
      expect(inner.length).toBeGreaterThan(100)
    })
  }

  it('渲染帮助展开态', async () => {
    const { fireEvent } = await import('@testing-library/react')
    const view = render(
      <DigestManager summary={() => Promise.resolve(DAY_ONE)} onClose={() => {}} t={t} />,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    const toggle = view.container.ownerDocument.querySelector('[class*="helpToggle"]')
    expect(toggle).not.toBeNull()
    fireEvent.click(toggle as Element)
    await new Promise(resolve => setTimeout(resolve, 0))
    const inner = view.container.ownerDocument.body.innerHTML
    writeFileSync('preview/panel-day-one-help.html', page(inner, 'day-one-help'), 'utf8')
    cleanup()
    expect(inner).toContain('helpList')
  })
})
