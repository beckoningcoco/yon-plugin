// @vitest-environment jsdom
/**
 * What is ACTUALLY under the pointer, and whether it is the element that was aimed at.
 *
 * This file exists because the failure it guards against is not an error message. A press
 * swallowed by an overlay, a drop that landed on the wrong cell, the seventh `.row` taken when
 * the caller meant the first: in every one of those cases the gesture is played for real, the
 * page does nothing, and the tool used to answer "done". The only thing that separates "it says
 * it dragged" from "it dragged" is reading the page back, so these are the readings:
 *
 * - `hitRelation` compares the hit to the AIMED-FOR element structurally rather than by tag
 *   name, because the element that receives a gesture is usually a child of the one located.
 * - `matchTargetInfo` says how many candidates matched, which one was taken, and whether a text
 *   locator landed on a text-only leaf — the three facts that decide whether the fix is a better
 *   selector or a different mode.
 *
 * jsdom lays nothing out and implements no hit testing, so geometry and the point→element map
 * are supplied by hand — which is the point: what is under test is the rule, not the browser.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  describeHitBrief, describeHitRelation, describeUnclickableIssue, isAstrayHit, reportDrag,
  PAGE_HELPERS,
  type DragOutcome, type HitRelation, type HitReport,
} from '../src/host/browser-interact.ts'

/** The page helpers this file exercises, as the injected script exposes them. */
interface Helpers {
  readonly hitRelation: (target: Element | null, hit: Element | null) => string
  readonly describeHit: (x: number, y: number, target: Element | null) => {
    x: number
    y: number
    tag: string
    text: string
    relation: string
    onTarget: boolean | null
  }
  readonly matchTargetInfo: (spec: { by: string, value: string, index: number }) => {
    element: Element | null
    matched: number
    matchedVisible: number
    index: number
    textMatch: string | null
    textHitIsLeaf: boolean
  }
  readonly visibleText: (el: Element, limit: number) => string
  readonly pointOnTarget: (target: Element | null, x: number, y: number) => boolean | null
  readonly matchesTarget: (spec: { by: string, value: string, index: number }) => Element | null
}

function helpers(): Helpers {
  const evaluate = eval as (source: string) => unknown
  return evaluate(
    `(() => { ${PAGE_HELPERS}; return { hitRelation, describeHit, matchTargetInfo, matchesTarget, `
    + 'visibleText, pointOnTarget } })()',
  ) as Helpers
}

/** Give an element the geometry jsdom would not. */
function visible(el: Element): void {
  Object.defineProperty(el, 'offsetWidth', { value: 10, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 10, configurable: true })
  Object.defineProperty(el, 'getClientRects', { value: () => ({ length: 1 }), configurable: true })
}

function hidden(el: Element): void {
  Object.defineProperty(el, 'offsetWidth', { value: 0, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 0, configurable: true })
  Object.defineProperty(el, 'getClientRects', { value: () => ({ length: 0 }), configurable: true })
}

/**
 * Give an element a box. jsdom lays nothing out, so every rect is 0×0 — and a geometry question
 * with no geometry has no answer, which is exactly what these tests must not settle for.
 */
function box(el: Element, left: number, top: number, width: number, height: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
    }),
    configurable: true,
  })
}

/** Append a div, optionally with markup inside. */
function add(className: string, html?: string): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  if (html !== undefined) el.innerHTML = html
  document.body.appendChild(el)
  return el
}

/**
 * Make one point resolve to one element, the way a real hit test would.
 *
 * jsdom has no layout and no `elementFromPoint`, so the point→element map is the test's own
 * input: without it there would be nothing to say about a hit at all.
 */
function atPoint(x: number, y: number, el: Element): void {
  ;(document as unknown as { elementFromPoint: (x: number, y: number) => Element | null })
    .elementFromPoint = (px, py) => (px === x && py === y ? el : null)
}

afterEach(() => { document.body.innerHTML = '' })

describe('hitRelation：命中与目标是什么关系', () => {
  it('同一个元素是 same', () => {
    const el = add('row')
    expect(helpers().hitRelation(el, el)).toBe('same')
  })

  it('命中的是目标内部的子元素，仍算落对了地方', () => {
    // 真实页面上收到事件的通常就是这个子元素，所以这是「对」，不是「偏」。
    const row = add('row', '<span class="cell"><font>值</font></span>')
    const cell = row.querySelector('.cell') as Element
    expect(helpers().hitRelation(row, cell)).toBe('hit-inside-target')
  })

  it('命中的是包着目标的外层元素，也报成关系而不是「不相干」', () => {
    const wrapper = add('wrapper', '<div class="target"></div>')
    const target = wrapper.querySelector('.target') as Element
    expect(helpers().hitRelation(target, wrapper)).toBe('target-inside-hit')
  })

  it('两个不相干的元素是 unrelated', () => {
    const a = add('a')
    const b = add('b')
    expect(helpers().hitRelation(a, b)).toBe('unrelated')
  })

  it('目标已被页面重绘换掉时说是它没了，而不是说落点不对', () => {
    const gone = add('gone')
    gone.remove()
    const other = add('other')
    expect(helpers().hitRelation(gone, other)).toBe('target-is-detached')
  })

  it('没读到就是 unavailable，不猜', () => {
    const el = add('row')
    expect(helpers().hitRelation(el, null)).toBe('unavailable')
    expect(helpers().hitRelation(null, el)).toBe('unavailable')
  })
})

describe('describeHit：指针底下到底是谁', () => {
  it('报出元素、它的文字与它和目标的关系', () => {
    const row = add('row', '<span class="cell">销售订单</span>')
    const cell = row.querySelector('.cell') as Element
    atPoint(30, 40, cell)
    const hit = helpers().describeHit(30, 40, row)
    expect(hit).toMatchObject({ x: 30, y: 40, tag: 'span', text: '销售订单', relation: 'hit-inside-target' })
  })

  it('坐标上什么都没有时不编一个元素出来', () => {
    const row = add('row')
    const hit = helpers().describeHit(10, 10, row)
    expect(hit).toMatchObject({ tag: '', text: '', relation: 'unavailable' })
  })
})

describe('onTarget：指针在不在目标自己的框里（与「谁接到了事件」分开问）', () => {
  it('透明探针：elementFromPoint 穿过去了，但这一点就在探针的框里', () => {
    const probe = add('probe')
    box(probe, 700, 300, 8, 8)
    const canvas = add('canvas')
    atPoint(704, 304, canvas)
    const hit = helpers().describeHit(704, 304, probe)
    // 命中的确实不是探针——关系照实说「不相干」，但指针就在探针身上，不能因此报「落偏了」。
    expect(hit.relation).toBe('unrelated')
    expect(hit.onTarget).toBe(true)
    expect(isAstrayHit(hit as HitReport)).toBe(false)
  })

  it('1px 锚点被外层容器接住：关系是 unrelated，指针仍在锚点的框里', () => {
    const wrapper = add('wrapper')
    box(wrapper, 100, 100, 400, 300)
    const port = document.createElement('div')
    box(port, 100, 100, 1, 1)
    wrapper.appendChild(port)
    atPoint(100, 100, wrapper)
    const hit = helpers().describeHit(100, 100, port)
    expect(hit.onTarget).toBe(true)
    expect(isAstrayHit(hit as HitReport)).toBe(false)
  })

  it('目标被重绘换掉时几何无从判断，说不知道，而不是说落偏了', () => {
    const gone = add('node')
    box(gone, 400, 200, 120, 40)
    gone.remove()
    const other = add('other')
    atPoint(460, 220, other)
    const hit = helpers().describeHit(460, 220, gone)
    expect(hit.relation).toBe('target-is-detached')
    expect(hit.onTarget).toBeNull()
    expect(isAstrayHit(hit as HitReport)).toBe(false)
  })

  it('指针真的在目标的框外时才算偏', () => {
    const node = add('node')
    box(node, 400, 200, 120, 40)
    const elsewhere = add('elsewhere')
    atPoint(10, 10, elsewhere)
    const hit = helpers().describeHit(10, 10, node)
    expect(hit.onTarget).toBe(false)
    expect(isAstrayHit(hit as HitReport)).toBe(true)
  })
})

describe('visibleText：一个元素看上去写着什么', () => {
  it('隐藏的候选下拉不算这个节点的文字（实测报过「ERP销售合同」这种名字）', () => {
    const node = add('node', '<span class="label">销售订单</span>'
      + '<div class="select-list"><span>ERP销售合同</span><span>项目销售合同</span></div>')
    const label = node.querySelector('.label') as Element
    const list = node.querySelector('.select-list') as Element
    visible(node)
    visible(label)
    hidden(list)
    hidden(list.querySelector('span') as Element)
    expect(helpers().visibleText(node, 60)).toBe('销售订单')
  })

  it('只取落在元素自己框里的文字——绝对定位跑到别处的部分不算', () => {
    const card = add('card', '<span class="in">在框里</span><span class="out">在框外</span>')
    const inside = card.querySelector('.in') as Element
    const outside = card.querySelector('.out') as Element
    visible(card)
    visible(inside)
    visible(outside)
    box(card, 0, 0, 200, 100)
    box(inside, 10, 10, 80, 20)
    box(outside, 900, 900, 80, 20)
    expect(helpers().visibleText(card, 60)).toBe('在框里')
  })

  it('一条可见文字都读不到时交白卷，不拿隐藏的文字凑一个名字出来', () => {
    const node = add('node', '<div class="select-list"><span>ERP销售合同</span></div>')
    const list = node.querySelector('.select-list') as Element
    visible(node)
    hidden(list)
    hidden(list.querySelector('span') as Element)
    expect(helpers().visibleText(node, 60)).toBe('')
  })

  it('容器里几个子件各写着字时交白卷——画布不该有一个名字（实测报过「- 100% + 销售订单 销售发货单 +」）', () => {
    const canvas = add('canvas', '<div class="zoom">- 100% +</div>'
      + '<div class="node"><span class="name">销售订单</span></div>'
      + '<div class="node"><span class="name">销售发货单</span></div>')
    visible(canvas)
    for (const el of Array.from(canvas.querySelectorAll('*'))) {
      visible(el)
      box(el, 40, 40, 100, 20)
    }
    box(canvas, 0, 0, 800, 600)
    expect(helpers().visibleText(canvas, 80)).toBe('')
  })

  it('元素自己的直属文字与一个子分支算同一支，照样读得出来', () => {
    const row = add('row', '销售订单<span class="suffix">（共 2 条）</span>')
    visible(row)
    const suffix = row.querySelector('.suffix') as Element
    visible(suffix)
    box(row, 0, 0, 200, 40)
    box(suffix, 60, 10, 80, 20)
    expect(helpers().visibleText(row, 60)).toBe('销售订单 （共 2 条）')
  })
})

describe('matchTargetInfo：定位到几个、取了第几个、文字是怎么匹配上的', () => {
  it('数出全部匹配，并优先取可见的那个——隐藏空壳是 NCC 的常态', () => {
    const shell = add('thing')
    const real = add('thing')
    hidden(shell)
    visible(real)
    const info = helpers().matchTargetInfo({ by: 'css', value: '.thing', index: 0 })
    expect(info.matched).toBe(2)
    expect(info.matchedVisible).toBe(1)
    expect(info.element).toBe(real)
  })

  it('index 数的是排序后的第几个，取第 2 个就是那个隐藏空壳', () => {
    const shell = add('thing')
    const real = add('thing')
    hidden(shell)
    visible(real)
    const info = helpers().matchTargetInfo({ by: 'css', value: '.thing', index: 1 })
    expect(info.element).toBe(shell)
    expect(info.index).toBe(1)
  })

  it('文字精确命中时说明是 exact；只因为「包含」而命中时说 contains', () => {
    const btn = add('btn', '<font>保存</font>')
    visible(btn)
    visible(btn.querySelector('font') as Element)
    const h = helpers()
    expect(h.matchTargetInfo({ by: 'text', value: '保存', index: 0 }).textMatch).toBe('exact')
    // 「存」不是任何元素的整串文字，只能靠包含命中——按文字定位的人需要知道这一点。
    expect(h.matchTargetInfo({ by: 'text', value: '存', index: 0 }).textMatch).toBe('contains')
  })

  it('文字定位落到只有文字的最内层元素上时，把这件事报出来', () => {
    const btn = add('btn', '<font>保存</font>')
    visible(btn)
    visible(btn.querySelector('font') as Element)
    const info = helpers().matchTargetInfo({ by: 'text', value: '保存', index: 0 })
    expect((info.element as Element).tagName.toLowerCase()).toBe('font')
    expect(info.textHitIsLeaf).toBe(true)
  })

  it('文字定位落到的节点自己还有子元素时，不算叶子', () => {
    const btn = add('btn', '保存 <span></span>')
    visible(btn)
    const info = helpers().matchTargetInfo({ by: 'text', value: '保存', index: 0 })
    expect(info.textHitIsLeaf).toBe(false)
  })

  it('css 定位不编 textMatch', () => {
    add('thing')
    expect(helpers().matchTargetInfo({ by: 'css', value: '.thing', index: 0 }).textMatch).toBeNull()
  })

  it('matchesTarget 仍然只是取元素，旧行为不变', () => {
    const real = add('thing')
    visible(real)
    expect(helpers().matchesTarget({ by: 'css', value: '.thing', index: 0 })).toBe(real)
  })
})

describe('把关系写成话', () => {
  it('每种关系都有一句自己的说法，不会漏成 undefined', () => {
    const all = ['same', 'hit-inside-target', 'target-inside-hit', 'unrelated', 'unavailable',
      'target-is-detached'] as const
    for (const relation of all) {
      const text = describeHitRelation(relation)
      expect(text).toBeTruthy()
      expect(text).not.toContain('undefined')
    }
    // 「落到了别处」和「落到了目标里面」必须读起来不一样——否则这句报告毫无用处。
    expect(describeHitRelation('unrelated')).not.toBe(describeHitRelation('hit-inside-target'))
  })

  it('命中的元素带上它的文字；什么都没读到就直说', () => {
    expect(describeHitBrief({
      x: 0, y: 0, tag: 'span', text: '销售订单', relation: 'same', onTarget: true,
    })).toContain('span「销售订单」')
    expect(describeHitBrief({
      x: 0, y: 0, tag: '', text: '', relation: 'unavailable', onTarget: null,
    })).toContain('没读到')
  })

  it('指针确实在目标的框外时，那句话里也带上这一事实', () => {
    expect(describeHitBrief({
      x: 0, y: 0, tag: 'div', text: '别的东西', relation: 'unrelated', onTarget: false,
    })).toContain('不在它的框里')
  })

  it('只有「指针确实落在目标的框外」才算偏，命中子元素或透明探针都不算', () => {
    const hitOf = (relation: HitRelation, onTarget: boolean | null): HitReport =>
      ({ x: 0, y: 0, tag: 'div', text: '', relation, onTarget })
    const astray: HitReport[] = [
      hitOf('unrelated', false), hitOf('unavailable', false), hitOf('target-is-detached', false),
    ]
    const fine: HitReport[] = [
      hitOf('same', true),
      // 收到手势的通常正是子元素，把它报成「偏了」会让每一次正常拖拽都带一个假警报。
      hitOf('hit-inside-target', true), hitOf('target-inside-hit', true),
      // 透明探针（pointer-events:none）会被 elementFromPoint 穿过去，但这一点就在它自己的框里。
      hitOf('unrelated', true),
      // 目标被页面重绘换掉、几何无从判断时说「不知道」，不是「偏了」。
      hitOf('target-is-detached', null), hitOf('unrelated', null),
    ]
    for (const hit of astray) expect(isAstrayHit(hit)).toBe(true)
    for (const hit of fine) expect(isAstrayHit(hit)).toBe(false)
  })
})

describe('describeUnclickableIssue：这一按到底会不会落在目标身上', () => {
  const hitOf = (relation: HitRelation, onTarget: boolean | null): HitReport =>
    ({ x: 0, y: 0, tag: 'div', text: '遮罩', relation, onTarget })
  /** 还没问过「底下是谁」时宿主交给这一关的那个值（跨域帧读不到命中）。 */
  const unread = (x: number, y: number): HitReport =>
    ({ x, y, tag: '', text: '', relation: 'unavailable', onTarget: null })
  /** 金隅共享首页点「业务流设计」的实测形状：元素躺在被 CSS 平移出视口的折叠容器里。 */
  const offscreen = { x: 610, y: 40, inViewport: false, rect: { x: -967, y: 300, width: 120, height: 30 },
    viewport: { width: 1440, height: 900 } }

  it('元素整个被移出视口时拒绝，并指向不受视口限制的 mode', () => {
    const issue = describeUnclickableIssue({ ...offscreen, hit: unread(610, 40) })
    expect(issue).toBeDefined()
    expect(issue).toContain('不在视口里')
    expect(issue).toContain('没有发生')
    expect(issue).toContain('dom')
    expect(issue).toContain('x=-967')
  })

  it('元素报在视口里、但算出来的按点自己跑到视口外时也拒绝', () => {
    const issue = describeUnclickableIssue({ x: -5, y: 40, inViewport: true,
      viewport: { width: 1440, height: 900 }, hit: unread(-5, 40) })
    expect(issue).toContain('不在视口里')
  })

  it('目标在按下之前被页面重绘换掉时拒绝，并说清这不是「点偏了」', () => {
    const issue = describeUnclickableIssue({ x: 10, y: 10, hit: hitOf('target-is-detached', null) })
    expect(issue).toBeDefined()
    expect(issue).toContain('重绘')
    expect(issue).toContain('没有发生')
  })

  it('指针底下是别的元素、且这一点确实在目标框外时拒绝，并说出是谁挡的', () => {
    const issue = describeUnclickableIssue({ x: 10, y: 10, hit: hitOf('unrelated', false) })
    expect(issue).toBeDefined()
    expect(issue).toContain('遮罩')
    expect(issue).toContain('不在它的框里')
  })

  it('透明探针与被外层接住的 1px 锚点不拒绝：指针就在目标身上，只是别人收到了事件', () => {
    expect(describeUnclickableIssue({ x: 10, y: 10, hit: hitOf('unrelated', true) })).toBeUndefined()
    expect(describeUnclickableIssue({
      x: 10, y: 10, hit: { x: 10, y: 10, tag: 'span', text: '', relation: 'hit-inside-target', onTarget: true },
    })).toBeUndefined()
  })

  it('读不到命中时不替页面下结论：几何说不了话就放行', () => {
    expect(describeUnclickableIssue({ x: 10, y: 10, hit: unread(10, 10) })).toBeUndefined()
    expect(describeUnclickableIssue({ x: 10, y: 10, hit: hitOf('unavailable', null) })).toBeUndefined()
  })

  it('正常命中时什么都不说', () => {
    expect(describeUnclickableIssue({ x: 10, y: 10, hit: hitOf('same', true) })).toBeUndefined()
  })
})

describe('reportDrag：一次拖拽到底发生了什么', () => {
  /** 一个各字段都正常的拖拽，用来只改动关心的那一项。 */
  function outcome(patch: Partial<DragOutcome> = {}): DragOutcome {
    const hit = (relation: HitRelation, onTarget: boolean | null = true): HitReport =>
      ({ x: 10, y: 20, tag: 'div', text: '格子', relation, onTarget })
    const end = (over: Record<string, unknown> = {}) => ({
      tag: 'div', text: '值', x: 1, y: 2, matched: 1, matchedVisible: 1, index: 0,
      textMatch: null, textHitIsLeaf: false, ...over,
    })
    return {
      mode: 'html5',
      delivery: 'html5-drop-dispatched',
      verification: 'drag-data-intercepted',
      intercepted: true,
      from: end() as DragOutcome['from'],
      to: end({ tag: 'td' }) as DragOutcome['to'],
      fromPressHit: hit('same'),
      toBeforeHit: hit('same'),
      toMidHit: hit('same'),
      toReleaseHit: hit('hit-inside-target'),
      ...patch,
    }
  }

  it('报出的四行都是「实际落点」，而不是「想拖到哪里」', () => {
    const text = reportDrag('销售订单页', outcome())
    expect(text).toContain('已在页面 销售订单页 上把')
    expect(text).toContain('按下时指针底下：')
    expect(text).toContain('拖动中（松手前）指针底下：')
    expect(text).toContain('松手后指针底下：')
    // 一次顺利的拖拽不该带任何警告——假警报会让真警报没人看。
    expect(text).not.toContain('⚠️')
  })

  it('按下被别的东西接住、而指针也没在起点框里时说清这一次白做了', () => {
    const text = reportDrag('页', outcome({
      fromPressHit: { x: 1, y: 2, tag: 'div', text: '遮罩层', relation: 'unrelated', onTarget: false },
    }))
    expect(text).toContain('⚠️')
    expect(text).toContain('遮罩层')
    expect(text).toContain('按下多半落在了别处')
  })

  it('指针底下不是起点本身，但这一点就在起点的框里时，不报警', () => {
    const text = reportDrag('页', outcome({
      fromPressHit: { x: 1, y: 2, tag: 'canvas', text: '', relation: 'unrelated', onTarget: true },
    }))
    expect(text).not.toContain('⚠️')
    expect(text).toContain('不等于按偏了')
  })

  it('起点是尺寸为零的隐藏空壳时，不把「不知道」说成「就在它的框里」', () => {
    const text = reportDrag('页', outcome({
      from: { ...outcome().from, matchedVisible: 0 },
      fromPressHit: { x: 0, y: 0, tag: 'img', text: '', relation: 'unrelated', onTarget: null },
    }))
    // 旧写法拿 !isAstrayHit() 当条件，onTarget 为 null（尺寸为零、或已脱离文档）时也会通过，
    // 于是同一份报告一边说「起点在页面上不可见」，一边断言「这一点就在起点的框里」。
    expect(text).not.toContain('不等于按偏了')
    expect(text).not.toContain('这一点确实不在起点的框里')
    expect(text).toContain('几何无从判断')
    expect(text).toContain('起点在页面上不可见')
  })

  it('松手时落点没有可用的框，也一样只报「无从判断」', () => {
    const text = reportDrag('页', outcome({
      toReleaseHit: { x: 0, y: 0, tag: 'div', text: '', relation: 'unrelated', onTarget: null },
    }))
    expect(text).not.toContain('不等于落偏了')
    expect(text).not.toContain('接收方多半没收到这次拖拽')
    expect(text).toContain('几何无从判断')
  })

  it('松手时落点的框已被页面重绘换掉时不报警：那不是「没落上」，只是无从判断', () => {
    const text = reportDrag('页', outcome({
      toReleaseHit: {
        x: 1, y: 2, tag: 'div', text: '销售发货单', relation: 'target-is-detached', onTarget: null,
      },
    }))
    expect(text).not.toContain('⚠️')
    expect(text).toContain('按坐标落')
  })

  it('松手没落在落点上、且指针确实在框外时说出来，而不是照样报「已拖到」', () => {
    const text = reportDrag('页', outcome({
      toReleaseHit: { x: 9, y: 9, tag: 'body', text: '', relation: 'unrelated', onTarget: false },
    }))
    expect(text).toContain('⚠️')
    expect(text).toContain('接收方多半没收到这次拖拽')
  })

  it('多个候选里取错了那个时把「取了第几个」说出来', () => {
    const text = reportDrag('页', outcome({
      from: { ...outcome().from, matched: 7, index: 0 },
    }))
    expect(text).toContain('起点定位到 7 个元素，这次取的是第 1 个')
    expect(text).toContain('起点 div「值」（定位到 7 个（取第 1 个））')
  })

  it('按文字取到最内层的 font 时说清这是为什么拖不动', () => {
    const text = reportDrag('页', outcome({
      from: { ...outcome().from, textMatch: 'contains', textHitIsLeaf: true },
    }))
    expect(text).toContain('按文字只是部分匹配')
    expect(text).toContain('最内层元素（如 font/span）')
  })

  it('元素在页面上不可见时提醒拖的是它自己的框', () => {
    const text = reportDrag('页', outcome({
      to: { ...outcome().to, matchedVisible: 0 },
    }))
    expect(text).toContain('落点在页面上不可见')
  })

  it('html5 没拿到拖拽数据时，指向另一种 mode', () => {
    const text = reportDrag('页', outcome({ intercepted: false, verification: 'unavailable' }))
    expect(text).toContain('没有交出 HTML5 拖拽数据')
    expect(text).toContain('mode: "mouse"')
  })

  it('mouse 模式明说浏览器这一侧无从核对', () => {
    const text = reportDrag('页', outcome({
      mode: 'mouse', delivery: 'mouse-events-sent', verification: 'unavailable', intercepted: false,
    }))
    expect(text).toContain('没有可核对的信号')
  })

  it('拖动中有别的东西压在落点上时，把「这可能是替身、也可能是被挡住」一并说出来', () => {
    const text = reportDrag('页', outcome({
      toMidHit: { x: 1, y: 2, tag: 'div', text: '拖拽替身', relation: 'unrelated', onTarget: true },
    }))
    expect(text).toContain('拖拽替身')
    expect(text).toContain('页面自己的拖拽替身出现在这里属于正常')
  })
})
