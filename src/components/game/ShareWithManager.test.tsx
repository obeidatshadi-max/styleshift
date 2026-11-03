// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import ShareWithManager from './ShareWithManager'

const id = '11111111-1111-4111-8111-111111111111'
const view = (props: React.ComponentProps<typeof ShareWithManager>) =>
  render(React.createElement(LanguageProvider, null, React.createElement(ShareWithManager, props)))
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ShareWithManager', () => {
  it('starts private and says what a manager would see', () => {
    view({ kind: 'debrief', id, initialSharedAt: null })
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.getByText(/Private for now\./)).toBeTruthy()
    expect(screen.getByText(/not what you wrote yourself/)).toBeTruthy()
  })
  it('explains that a simulation shares the summary, not the transcript', () => {
    view({ kind: 'simulation', id, initialSharedAt: null })
    expect(screen.getByText(/not the conversation transcript/)).toBeTruthy()
  })
  it('shares when ticked and un-shares when unticked, sending the right request', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    view({ kind: 'debrief', id, initialSharedAt: null })
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true))
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({ kind: 'debrief', id, shared: true })
    expect(screen.getByText(/Shared\. You can stop sharing any time\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false))
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, { body: string }])[1].body).shared).toBe(false)
  })
  it('stays private and shows an error when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'share_failed' }, false)))
    view({ kind: 'debrief', id, initialSharedAt: null })
    fireEvent.click(screen.getByRole('checkbox'))
    await screen.findByRole('alert')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })
  it('loads the real state when the caller does not know it, and never shows private for a shared item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ sharedAt: '2026-11-03T09:00:00Z' })))
    view({ kind: 'simulation', id })
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
    await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true))
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false)
  })
})
