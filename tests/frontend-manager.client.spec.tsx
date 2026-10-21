// @vitest-environment jsdom
/**
 * The front-end source surface driven through its injected API.
 *
 * The cases follow `home-manager.client.spec.tsx`'s shape on purpose: the face
 * arrives as a spread, so the member the load effect depends on is taken by name —
 * listing the rest object would re-run the effect on every render. The framework
 * atoms are stubbed the same way, keeping the contract the surface relies on: a
 * dialog renders its children labelled by its title, a button carries its click
 * handler.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { FrontendListPayload, FrontendView } from '../src/shared/types.ts'
import type { FrontendApi } from '../src/client/frontend/api.ts'
import { FrontendManager, type FrontendManagerProps } from '../src/client/frontend/FrontendManager.tsx'
import { zh } from '../src/client/locales.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _variant, size: _size, icon: _icon, children, ...rest }: Record<string, unknown>) =>
    <button type="button" {...rest}>{children as ReactElement}</button>,
  Input: ({ icon: _icon, ...rest }: Record<string, unknown>) => <input {...rest} />,
  Modal: ({ title, closeLabel, onClose, children, footer }: Record<string, unknown>) => (
    <div role="dialog" aria-label={String(title)}>
      <button type="button" aria-label={String(closeLabel)} onClick={onClose as () => void} />
      {children as ReactElement}
      {footer as ReactElement}
    </div>
  ),
  writeClipboard: vi.fn(async () => true),
}))

afterEach(cleanup)

// jsdom implements no scrolling, and the surface scrolls the selected row into view.
Element.prototype.scrollIntoView = () => {}

/** Copy for one key, as the zh dictionary spells it. */
const at = (key: keyof typeof zh): string => zh[key]

/** Translate through the zh dictionary, substituting `{name}` params as the seat does. */
const t = (key: string, params?: Record<string, unknown>): string => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
}

/** One registered project with everything a case does not care about filled in. */
function frontend(overrides: Partial<FrontendView> & { readonly version: string }): FrontendView {
  const version = overrides.version
  return {
    id: `fe-ncc-${version}`,
    label: `NCC${version}`,
    path: `E:/NCProject/NCC${version}/touziwuye/hotwebs`,
    product: 'ncc',
    isDefault: false,
    ready: true,
    profile: {
      probedAt: '2026-10-18T10:20:00.000Z',
      shape: 'scaffold',
      nodes: 252,
      pages: 491,
      pageTypes: ['card', 'list', 'main'],
      domains: [
        { name: 'cmp', pages: 41, bytes: 8_400_000 },
        { name: 'platform', pages: 0, bytes: 64_900_000 },
      ],
      files: 8831,
      bytes: 158_000_000,
      capped: false,
      hasNodeModules: true,
      hasDist: true,
      buildEntry: ['./src/cmp/bank/bankcontrast_tzwy/*/index.js'],
      proxy: 'http://127.0.0.1:8083',
      packageName: 'nc-multipage-demo',
      warnings: ['config.json 的 buildEntryPath 只列了 1 个入口'],
    },
    ...overrides,
  } as FrontendView
}

/** An in-memory stand-in for the host. */
function stubApi(rows: readonly FrontendView[], pagesBuilt = false) {
  const payload: FrontendListPayload = {
    frontends: rows,
    configPath: 'C:/Users/99558/.dsh/yon-panel/frontend_config.json',
    complete: true,
  }
  const status = {
    builtAt: '2026-10-18T10:30:00.000Z',
    nodes: 252,
    pages: 491,
    stale: false,
    path: 'C:/Users/99558/.dsh/yon-panel/frontend_index/fe-ncc-2005.json',
  }
  const tree = {
    frontend: 'fe-ncc-2005',
    builtAt: status.builtAt,
    totalNodes: 252,
    totalPages: 491,
    matched: 1,
    nodes: [{
      domain: 'cmp',
      module: 'bank',
      node: 'bankcontrast_tzwy',
      dir: 'src/cmp/bank/bankcontrast_tzwy',
      entries: [{
        kind: 'list',
        rel: 'src/cmp/bank/bankcontrast_tzwy/list/index.js',
        bytes: 18_162,
      }],
      files: 12,
      bytes: 98_000,
    }],
  }
  const api: FrontendApi = {
    listFrontends: vi.fn(async () => payload),
    saveFrontend: vi.fn(async () => frontend({ version: '2005' })),
    removeFrontend: vi.fn(async () => {}),
    probeFrontend: vi.fn(async () => frontend({ version: '2005' })),
    setDefaultFrontend: vi.fn(async () => frontend({ version: '2005' })),
    pickPath: vi.fn(async () => ({ kind: 'native', path: 'E:/NCProject/NCC2005/touziwuye/hotwebs' })),
    pages: vi.fn(async () => tree),
    pageStatus: vi.fn(async () => pagesBuilt ? status : undefined),
    rebuildPages: vi.fn(async () => status),
    listDir: vi.fn(async () => ({
      frontend: 'fe-ncc-2005',
      dir: 'src/cmp/bank/bankcontrast_tzwy',
      entries: [
        { name: 'list', rel: 'src/cmp/bank/bankcontrast_tzwy/list', directory: true, bytes: 0 },
        { name: 'index.js', rel: 'src/cmp/bank/bankcontrast_tzwy/index.js', directory: false, bytes: 512 },
      ],
    })),
    readFile: vi.fn(async () => ({
      frontend: 'fe-ncc-2005',
      rel: 'src/cmp/bank/bankcontrast_tzwy/list/index.js',
      encoding: 'utf-8',
      bytes: 18_162,
      totalLines: 520,
      from: 1,
      to: 200,
      truncated: false,
      masked: [],
      text: '// 银行对账列表页\n',
    })),
  }
  return api
}

const Manager = FrontendManager as unknown as (props: FrontendManagerProps) => ReactElement

/** Render the surface over a fresh stand-in. */
function bench(rows: readonly FrontendView[] = [frontend({ version: '2005' })], pagesBuilt = false) {
  const api = stubApi(rows, pagesBuilt)
  render(<Manager t={t as never} onClose={() => {}} {...api} />)
  return api
}

describe('front-end source surface', () => {
  it('says how to register one when the list is empty', async () => {
    bench([])
    expect(await screen.findByText(at('frontend.empty'))).toBeTruthy()
    expect(screen.getByText(at('frontend.emptyHow'))).toBeTruthy()
  })

  it('lists a registration by its derived name and marks the default one', async () => {
    bench([frontend({ version: '2005', isDefault: true })])
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-key="fe-ncc-2005"]')
      if (found === null) throw new Error('no row')
      return found
    })
    expect(row.textContent).toContain('NCC2005')
    expect(row.textContent).toContain(at('frontend.defaultTag'))
  })

  it('reads the probe back: kind, node and entry counts, domains, build switch', async () => {
    bench()
    expect(await screen.findByText(at('frontend.shape.scaffold'))).toBeTruthy()
    // Two entries can share one node, and the pane reports both numbers.
    expect(screen.getByText('252')).toBeTruthy()
    expect(screen.getByText('491')).toBeTruthy()
    expect(screen.getByText('cmp')).toBeTruthy()
    expect(screen.getByText('./src/cmp/bank/bankcontrast_tzwy/*/index.js')).toBeTruthy()
    expect(screen.getByText('config.json 的 buildEntryPath 只列了 1 个入口')).toBeTruthy()
  })

  it('picks a folder rather than letting a path be typed, then saves it', async () => {
    const api = bench([])
    fireEvent.click(await screen.findByText(at('frontend.new')))
    fireEvent.click(screen.getByText(at('frontend.pickDir')))

    await waitFor(() => {
      const field = document.querySelector<HTMLInputElement>('#yon-fe-path')
      expect(field?.value).toBe('E:/NCProject/NCC2005/touziwuye/hotwebs')
    })
    expect(api.pickPath).toHaveBeenCalledTimes(1)

    fireEvent.change(document.querySelector('#yon-fe-version') as HTMLSelectElement, {
      target: { value: '2005' },
    })
    fireEvent.click(screen.getByText(at('frontend.save')))

    await waitFor(() => { expect(api.saveFrontend).toHaveBeenCalledTimes(1) })
    expect(api.saveFrontend).toHaveBeenCalledWith(undefined, {
      path: 'E:/NCProject/NCC2005/touziwuye/hotwebs',
      product: 'ncc',
      version: '2005',
      isDefault: false,
    })
  })

  it('asks once before removing a registration', async () => {
    const api = bench()
    fireEvent.click(await screen.findByText(at('frontend.remove')))
    expect(screen.getByText(new RegExp(at('frontend.removeAsk').replace('？', '')))).toBeTruthy()
    fireEvent.click(screen.getByText(at('frontend.removeYes')))
    await waitFor(() => { expect(api.removeFrontend).toHaveBeenCalledWith('fe-ncc-2005') })
  })

  it('shows the page tree once an index exists, and previews a file', async () => {
    const api = bench([frontend({ version: '2005' })], true)

    // The status line is what the operator sees before the tree: how many nodes,
    // and how old the walk is.
    expect(await screen.findByText(/252 个页面节点/)).toBeTruthy()
    const row = await screen.findByText('cmp/bank/bankcontrast_tzwy')
    fireEvent.click(row)

    // Opening a node lists one level of its directory through the host.
    expect(await screen.findByText('index.js')).toBeTruthy()
    expect(api.listDir).toHaveBeenCalledWith('fe-ncc-2005', 'src/cmp/bank/bankcontrast_tzwy')

    fireEvent.click(screen.getByText('index.js'))
    expect(await screen.findByText('// 银行对账列表页')).toBeTruthy()
    expect(api.readFile).toHaveBeenCalledWith(
      'fe-ncc-2005', 'src/cmp/bank/bankcontrast_tzwy/index.js', 1, 200,
    )
  })

  it('builds the page index on request when none is stored', async () => {
    const api = bench()
    const build = await screen.findByText(at('frontend.pagesBuild'))
    fireEvent.click(build)
    await waitFor(() => { expect(api.rebuildPages).toHaveBeenCalledWith('fe-ncc-2005') })
    expect(await screen.findByText(/252 个页面节点/)).toBeTruthy()
  })
})
