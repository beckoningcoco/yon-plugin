// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { en, zh } from '../src/client/locales.ts'
import { ProjectItem, type ProjectItemProps } from '../src/client/ProjectItem.tsx'

afterEach(cleanup)

/** The only share this entry reads: its copy. The owner's panel state is unused. */
type HarnessProps = Pick<ProjectItemProps, 't'>

const Item = ProjectItem as unknown as (props: HarnessProps) => ReactElement

/** Translate through one dictionary, falling back to the key (as the `t` seat does). */
const seatOver = (dict: Record<string, string>) => (key: string): string => dict[key] ?? key

describe('project management entry', () => {
  it('renders one glyph cell named by its full description', () => {
    render(<Item t={seatOver(zh)} />)

    const button = screen.getByRole('button', { name: '项目管理面板' })

    // The class's own text stays empty: the icon carries the meaning, the
    // description arrives through the accessible name and the hover tooltip.
    expect(button.textContent).toBe('')
  })

  it('carries the English description when that dictionary is active', () => {
    render(<Item t={seatOver(en)} />)

    expect(screen.getByRole('button', { name: 'Project management panel' })).toBeTruthy()
  })
})

// The baseline UI kit is supplied by the DSH page at runtime, and its published
// client half is a loader artifact rather than source. The specs stub it, so the
// unit under test is this plugin's own surface.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tooltip: ({ children }: { children: ReactElement }) => children,
  useAnchoredPosition: () => ({ left: 12, top: 12 }),
  useDismissOnOutsidePointer: () => {},
}))
