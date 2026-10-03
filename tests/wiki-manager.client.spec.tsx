// @vitest-environment jsdom
/**
 * The knowledge-base surface driven through its injected API, with the three
 * registration verbs this batch added in focus.
 *
 * The cases are chosen around the places a panel can lie about a write:
 *
 *   · a create that quietly carried an id would edit a row instead of adding one
 *     (and an edit that carried none would add a second row over one directory);
 *   · 移除登记 answering to one press on a registration the operator has to
 *     re-enter by hand to get back;
 *   · the removal report being rendered where the row it names no longer exists;
 *   · the path field being anything but a readout of what the host's chooser said,
 *     including the two answers that are not a path — a cancelled dialog, and a
 *     host with no chooser at all.
 *
 * The framework atoms are stubbed, as the sibling surface specs do: their published
 * half is a loader artifact this suite cannot execute.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  WIKI_ENTITY_DIRS, type DirectoryPickResult, type WikiHealthPayload, type WikiListPayload,
  type WikiLogEntry, type WikiVaultView,
} from '../src/shared/types.ts'
import type { WikiApi } from '../src/client/wiki/api.ts'
import { WikiManager, type WikiManagerProps } from '../src/client/wiki/WikiManager.tsx'
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

/** Copy for one key, as the zh dictionary spells it. */
const at = (key: keyof typeof zh): string => zh[key]

/** Translate through one dictionary, substituting `{name}` params as the seat does. */
const seatOver = (dict: Record<string, string>) =>
  (key: string, params?: Record<string, unknown>): string => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
  }

/** The directory the stand-in chooser returns. */
const PICKED = 'D:/yon-ncc-obsidian/yon-ncc-obsidian'

/** One registered vault with everything a case does not care about filled in. */
function vault(overrides: Partial<WikiVaultView> & { readonly id: string }): WikiVaultView {
  return {
    label: overrides.id.toUpperCase(),
    path: `D:/${overrides.id}/vault`,
    pages: 0,
    ready: false,
    ...overrides,
  }
}

/**
 * A stand-in for the host: the reads answer, the writes are recorded.
 *
 * The list it hands back is its own — `removeVault` drops a row from it — because a
 * stub that kept answering with the removed row would leave the pane describing a
 * registration the operator has just unlisted, and the case about the removal report
 * would be asserting against a state that cannot happen.
 *
 * @param rows - the registered vaults.
 * @param pick - what the host's chooser answers; `native` with {@link PICKED} by default.
 * @returns the API face.
 */
function stubApi(
  rows: readonly WikiVaultView[],
  pick: () => Promise<DirectoryPickResult> = async () => ({ kind: 'native', path: PICKED }),
) {
  /** A member no case here exercises, present so the stand-in is the whole face. */
  const unused = <T,>(): T => vi.fn(async () => { throw new Error('this case does not call it') }) as T
  let left = [...rows]

  const api: WikiApi = {
    listVaults: vi.fn(async (): Promise<WikiListPayload> => ({ vaults: left })),
    rebuildVault: vi.fn(async (): Promise<WikiListPayload> => ({ vaults: left })),
    // The pane asks these two for a row that is ready, and every case below uses a
    // row that is not — so a refusal here is the honest stub, and it stays loud if a
    // case ever starts reaching them.
    recentWrites: unused<(vault?: string, limit?: number) => Promise<readonly WikiLogEntry[]>>(),
    health: unused<(vault?: string, gaps?: number) => Promise<WikiHealthPayload>>(),
    search: unused(),
    pageCard: unused(),
    citers: unused(),
    saveVault: vi.fn(async (_id, input) => vault({ id: 'saved', label: input.label, path: input.path, ready: true })),
    removeVault: vi.fn(async (id: string) => { left = left.filter(row => row.id !== id) }),
    pickPath: vi.fn(pick),
  }
  return api
}

const Manager = WikiManager as unknown as (props: WikiManagerProps) => ReactElement

/**
 * Render the surface over a fresh stand-in.
 * @param rows - the registered vaults; one BIP vault by default.
 * @param pick - what the host's chooser answers.
 * @returns the render result and the recorded API.
 */
function bench(
  rows: readonly WikiVaultView[] = [vault({ id: 'bip', label: 'BIP 知识库', path: 'D:/yon-bip-obsidian/yon-bip-obsidian' })],
  pick?: () => Promise<DirectoryPickResult>,
) {
  const api = pick === undefined ? stubApi(rows) : stubApi(rows, pick)
  const view = render(<Manager {...api} t={seatOver(zh)} onClose={vi.fn()} />)
  return { ...view, api }
}

/** Open the create form. */
async function openCreate(): Promise<void> {
  fireEvent.click(await screen.findByText(at('wiki.new')))
  await screen.findByText(at('wiki.newTitle'))
}

/** The path readout, which is the only input the chooser writes to. */
const pathField = (): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>('#yon-wiki-path')
  if (found === null) throw new Error('no path field on screen')
  return found
}

/** Submit the open form, since the payload is what these cases are about. */
function submitForm(): void {
  const form = document.querySelector('form')
  if (form === null) throw new Error('no form on screen')
  fireEvent.submit(form)
}

describe('wiki surface registration', () => {
  it('names the directory and the four layouts for a vault that is not one', async () => {
    bench([vault({ id: 'ncc', label: 'NCC 知识库', path: 'D:/yon-ncc-obsidian/yon-ncc-obsidian' })])

    await screen.findByText(at('wiki.notReady'))
    // The path belongs to the registration, not to the index, so it is printed for a
    // row with no index at all — which is the state where it is the one fact needed
    // to tell whether the operator picked the wrong directory.
    expect(screen.getByText('D:/yon-ncc-obsidian/yon-ncc-obsidian')).toBeTruthy()
    // Printed from the shared constant, so the list of layouts the reader searches and
    // the list this says cannot drift apart.
    expect(screen.getByText(at('wiki.notReadyHint').replace('{dirs}', WIKI_ENTITY_DIRS.join(' · '))))
      .toBeTruthy()
  })

  it('saves a new registration without an id, and with what the chooser returned', async () => {
    const { api } = bench()
    await openCreate()

    expect(pathField().readOnly).toBe(true)
    fireEvent.click(screen.getByText(at('wiki.pickDir')))
    await waitFor(() => { expect(pathField().value).toBe(PICKED) })

    fireEvent.change(document.querySelector('#yon-wiki-label') as HTMLInputElement,
      { target: { value: 'NCC 知识库' } })
    submitForm()

    // `undefined` is the whole difference between adding a row and editing one: the
    // service mints the id from the directory, and an id typed here could not be right.
    await waitFor(() => {
      expect(api.saveVault).toHaveBeenCalledWith(undefined, { label: 'NCC 知识库', path: PICKED })
    })
    // And the form closes, because the row it produced is what the pane shows next.
    await waitFor(() => { expect(screen.queryByText(at('wiki.newTitle'))).toBeNull() })
  })

  it('edits with the selected row\'s id, and offers the id as a fact the form cannot change', async () => {
    const { api } = bench([vault({ id: 'bip', label: 'BIP 知识库' })])
    fireEvent.click(await screen.findByText(at('wiki.edit')))
    await screen.findByText(at('wiki.editTitle'))

    // The id is not a field: the form holds the name and the path readout, and
    // nothing that would let the operator retype the identity of the row.
    expect([...document.querySelectorAll('input')].map(input => input.id))
      .toEqual(['yon-wiki-label', 'yon-wiki-path'])
    expect(screen.getByText(at('wiki.editHint'))).toBeTruthy()

    fireEvent.change(document.querySelector('#yon-wiki-label') as HTMLInputElement,
      { target: { value: '改过的名字' } })
    submitForm()

    await waitFor(() => {
      expect(api.saveVault).toHaveBeenCalledWith('bip', { label: '改过的名字', path: 'D:/bip/vault' })
    })
  })

  it('treats a cancelled dialog as nothing to change', async () => {
    // The chooser is passed in before the render, not swapped in afterwards: the
    // surface destructures its API by name on every render, so a member replaced
    // later is one it never sees.
    const { api } = bench(undefined, async () => ({ kind: 'native', path: null }))
    await openCreate()

    fireEvent.click(screen.getByText(at('wiki.pickDir')))

    // Cancelling is an answer, not a failure: no banner, and the field keeps what it had.
    await waitFor(() => { expect(api.pickPath).toHaveBeenCalledTimes(1) })
    expect(pathField().value).toBe('')
    expect(screen.queryByText(at('wiki.pickUnavailable'))).toBeNull()
  })

  it('says so when the host has no chooser, rather than offering a button that cannot answer', async () => {
    const { api } = bench(undefined, async () => ({ kind: 'unavailable' }))
    await openCreate()

    fireEvent.click(screen.getByText(at('wiki.pickDir')))

    expect(await screen.findByText(at('wiki.pickUnavailable'))).toBeTruthy()
    expect(pathField().value).toBe('')
    expect(api.saveVault).not.toHaveBeenCalled()
  })

  it('asks before unlisting, and a cancel touches nothing', async () => {
    const { api } = bench()

    fireEvent.click(await screen.findByText(at('wiki.remove')))
    expect(screen.getByText(`${at('wiki.removeAsk')} ${at('wiki.removeAbout')}`)).toBeTruthy()

    fireEvent.click(screen.getByText(at('wiki.cancel')))
    expect(api.removeVault).not.toHaveBeenCalled()
    expect(screen.queryByText(at('wiki.removeYes'))).toBeNull()
  })

  it('unlists the row and reports it after the row is gone', async () => {
    const { api } = bench([vault({ id: 'bip', label: 'BIP 知识库' })])
    fireEvent.click(await screen.findByText(at('wiki.remove')))
    fireEvent.click(screen.getByText(at('wiki.removeYes')))

    await waitFor(() => { expect(api.removeVault).toHaveBeenCalledWith('bip') })
    // The row it names is the one that just disappeared, and the note is rendered
    // above the pane's branch so that it survives into the empty state.
    expect(await screen.findByText(at('wiki.removed').replace('{label}', 'BIP 知识库'))).toBeTruthy()
    expect(screen.queryByText('BIP 知识库')).toBeNull()
  })
})
