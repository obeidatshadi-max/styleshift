// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import IhiaPanel from './IhiaPanel'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const approved = { id: 'e', expression: 'ما عندي وكت', literal_meaning: 'No time', contextual_meaning: 'ضيق الوقت',
  region: 'baghdad', specialty: 'general', kind: 'workflow', uncertainty: 'Confirm context', source_reference: 'Synthetic review', status: 'draft', version: 1, review_note: '' }
describe('Iraqi knowledge interface', () => {
  it('lets ordinary users interpret text without exposing reviewer controls', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ original: approved.expression, response: 'هذا قصدك؟', uncertainty: 'Clarify context' }))
    vi.stubGlobal('fetch', fetch)
    render(<IhiaPanel reviewer={false} />)
    expect(screen.queryByText('Save draft')).toBeNull()
    fireEvent.change(screen.getByLabelText('Original utterance'), { target: { value: approved.expression } })
    fireEvent.click(screen.getByText('Interpret', { selector: 'button' }))
    await screen.findByText('هذا قصدك؟')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ text: approved.expression, region: 'baghdad' })
  })
  it('supports approval and version history with explicit review reasons', async () => {
    const fetch = vi.fn().mockImplementation(async (url, init) => {
      if (String(url).includes('?history=')) return Response.json([{ version: 1, snapshot: approved }])
      if (init?.method === 'PATCH') return Response.json({ ...approved, status: 'approved', version: 2 })
      return Response.json([approved])
    })
    vi.stubGlobal('fetch', fetch)
    render(<IhiaPanel reviewer />)
    await screen.findByText(approved.expression)
    fireEvent.change(screen.getByLabelText('Review reason'), { target: { value: 'Expert verified synthetic meaning' } })
    fireEvent.click(screen.getByText('Save review', { selector: 'button' }))
    await waitFor(() => expect(fetch.mock.calls.some(c => c[1]?.method === 'PATCH')).toBe(true))
    const patch = fetch.mock.calls.find(c => c[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toMatchObject({ id: 'e', action: 'approved', version: 1, review_note: 'Expert verified synthetic meaning' })
    await screen.findByText(/Review saved/)
    fireEvent.click(screen.getByText('View history'))
    await screen.findByText('Version history')
  })
  it('shows permission errors rather than displaying fabricated knowledge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'forbidden' }, { status: 403 })))
    render(<IhiaPanel reviewer />)
    await screen.findByText('Error: forbidden')
  })
})
