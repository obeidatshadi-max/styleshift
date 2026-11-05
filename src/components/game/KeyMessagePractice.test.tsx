// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n'
import KeyMessagePractice from './KeyMessagePractice'

const VERSIONS = { driver: 'Driver version.', expressive: 'Expressive version.', amiable: 'Amiable version.', analytical: 'Analytical version.' }
const feedback = { styleFit: 'Fit text', faithful: 'Faithful text', strength: 'Strength text', tryNext: 'Next text' }
const msg = (over: Record<string, unknown> = {}) => ({ id: 'm1', text: 'Statin X lowers LDL.', mode: 'written', versions: VERSIONS, dueDate: null, doctorId: null, fromManager: true, completed: false, ...over })
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const view = () => render(React.createElement(LanguageProvider, null, React.createElement(KeyMessagePractice)))

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const load = (data: unknown, status = 200) => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && String(url).endsWith('/practice')) return res(200, { id: 'a1', feedback })
    return res(status, data)
  })
  vi.stubGlobal('fetch', fetchMock)
}

describe('KeyMessagePractice', () => {
  it('renders nothing when the feature is off or the caller is a manager', async () => {
    load({ error: 'not_found' }, 404)
    const off = view()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(off.container.innerHTML).toBe('')
    cleanup()
    load({ role: 'manager', messages: [], doctors: [] })
    const mgr = view()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 20))
    expect(mgr.container.innerHTML).toBe('')
  })

  it('shows the four versions, takes an attempt, shows feedback, and marks the message done', async () => {
    load({ role: 'rep', doctors: [], messages: [msg()] })
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Practise' }))
    for (const v of Object.values(VERSIONS)) expect(screen.getByText(v)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Write what you would say/), { target: { value: 'My version.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }))
    expect(await screen.findByText('Fit text')).toBeTruthy()
    const post = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/practice'))!
    expect(JSON.parse((post[1] as RequestInit).body as string)).toEqual({ style: 'driver', text: 'My version.', share: false })
    expect(screen.getByText(/Done/)).toBeTruthy()
  })

  it('offers sharing with the manager only for a manager message, and sends it only when ticked', async () => {
    load({ role: 'rep', doctors: [], messages: [msg(), msg({ id: 'm2', fromManager: false, text: 'My own.' })] })
    view()
    const [first, second] = await screen.findAllByRole('button', { name: 'Practise' })
    fireEvent.click(second)
    expect(screen.queryByLabelText(/Share this attempt/)).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
    fireEvent.click(first)
    const box = screen.getByLabelText(/Share this attempt/) as HTMLInputElement
    fireEvent.click(box)
    fireEvent.change(screen.getByPlaceholderText(/Write what you would say/), { target: { value: 'Shared one.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Get feedback' }))
    await screen.findByText('Fit text')
    const post = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/practice'))!
    expect(JSON.parse((post[1] as RequestInit).body as string).share).toBe(true)
  })

  it('preselects and highlights the customer\'s style when the message is for a known doctor', async () => {
    load({ role: 'rep', doctors: [{ id: 'd1', name: 'Dr Hana', style: 'analytical' }], messages: [msg({ doctorId: 'd1', fromManager: false })] })
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Practise' }))
    expect(screen.getByText(/Style of Dr Hana/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Analytical', checked: true })).toBeTruthy()
  })
})
