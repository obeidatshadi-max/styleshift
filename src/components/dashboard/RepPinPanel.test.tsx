// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RepPinPanel from './RepPinPanel'

const reps = [
  { id: 'r1', name: 'Ibrahim', kind: 'mobile' as const, mobile: '0780563731' },
  { id: 'r2', name: 'Rana', kind: 'email' as const, mobile: null },
]
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('RepPinPanel', () => {
  it('offers Reset PIN only to reps who sign in with a mobile number', () => {
    render(<RepPinPanel initial={reps} />)
    expect(screen.getAllByText('Reset PIN')).toHaveLength(1)
    expect(screen.getByText(/Signs in with email/)).toBeTruthy()
    expect(screen.getByText('0780563731', { exact: false })).toBeTruthy()
  })

  it('asks before resetting, and Cancel does nothing', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    render(<RepPinPanel initial={reps} />)
    fireEvent.click(screen.getByText('Reset PIN'))
    expect(screen.getByText(/The old PIN stops working now/)).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Reset PIN')).toBeTruthy()
  })

  it('resets after confirmation, shows the new PIN once with the rep and number, and Done clears it', async () => {
    const fetchMock = vi.fn(async () => json({ pin: '482913', repName: 'Ibrahim', mobile: '0780563731' }))
    vi.stubGlobal('fetch', fetchMock)
    render(<RepPinPanel initial={reps} />)
    fireEvent.click(screen.getByText('Reset PIN'))
    fireEvent.click(screen.getByText('Yes, reset'))
    expect((await screen.findByTestId('new-pin')).textContent).toBe('482913')
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ repId: 'r1' })
    expect(screen.getByText(/shown only now/)).toBeTruthy()
    fireEvent.click(screen.getByText('Done'))
    expect(screen.queryByTestId('new-pin')).toBeNull()
    expect(document.body.textContent).not.toContain('482913')
  })

  it('copies the PIN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ pin: '482913', repName: 'Ibrahim', mobile: '0780563731' })))
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<RepPinPanel initial={reps} />)
    fireEvent.click(screen.getByText('Reset PIN')); fireEvent.click(screen.getByText('Yes, reset'))
    fireEvent.click(await screen.findByText('Copy'))
    await screen.findByText('Copied')
    expect(writeText).toHaveBeenCalledWith('482913')
  })

  it('says nothing changed when the reset fails, and shows no PIN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'reset_failed' }, 503)))
    render(<RepPinPanel initial={reps} />)
    fireEvent.click(screen.getByText('Reset PIN')); fireEvent.click(screen.getByText('Yes, reset'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing was changed'))
    expect(screen.queryByTestId('new-pin')).toBeNull()
  })

  it('tells the manager when the hourly limit is reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Too many resets' }, 429)))
    render(<RepPinPanel initial={reps} />)
    fireEvent.click(screen.getByText('Reset PIN')); fireEvent.click(screen.getByText('Yes, reset'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Too many resets this hour'))
  })

  it('loads the reps on its own, and reports a load failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ reps })))
    render(<RepPinPanel />)
    expect(await screen.findByText('Ibrahim')).toBeTruthy()
    cleanup()
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)))
    render(<RepPinPanel />)
    expect((await screen.findByText('Could not load your reps.'))).toBeTruthy()
  })
})
