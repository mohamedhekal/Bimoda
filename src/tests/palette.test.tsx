import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CommandPalette } from '../app/CommandPalette'

const mk = () => {
  const lab = vi.fn()
  const reset = vi.fn()
  return {
    lab,
    reset,
    commands: [
      { id: 'lab', label: 'Go to Hybrid AI Lab', hint: 'Navigate', run: lab },
      { id: 'reset', label: 'Reset demo data', run: reset },
      { id: 'tour', label: 'Start demo tour', run: () => {} },
    ],
  }
}

afterEach(cleanup)

describe('command palette', () => {
  it('renders nothing when closed', () => {
    const { commands } = mk()
    const { container } = render(<CommandPalette open={false} onClose={() => {}} commands={commands} />)
    expect(container.innerHTML).toBe('')
  })
  it('filters by typed text and runs the highlighted command on Enter', () => {
    const { commands, lab } = mk()
    render(<CommandPalette open onClose={() => {}} commands={commands} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'lab' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(lab).toHaveBeenCalledOnce()
  })
  it('supports arrow navigation, shows an empty state and closes on Escape', () => {
    const { commands, reset } = mk()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={commands} />)
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(reset).toHaveBeenCalledOnce()
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(screen.getByText('No matching commands.')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
