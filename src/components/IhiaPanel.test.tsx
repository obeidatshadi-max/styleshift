// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import IhiaPanel from './IhiaPanel'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const approved = { id: 'e', expression: 'ما عندي وكت', literal_meaning: 'No time', contextual_meaning: 'ضيق الوقت',
  region: 'baghdad', specialty: 'general', kind: 'workflow', uncertainty: 'Confirm context', source_reference: 'Synthetic review', status: 'draft', version: 1, review_note: '' }
describe('Iraqi knowledge interface', () => {
  it('discovers expressions from one starter click and saves only a draft', async () => {
    const suggestion = { ...approved, review_status: 'unverified', example: 'ما عندي وكت هسه.', source_reference: 'AI-generated suggestion; needs review' }
    const fetch = vi.fn().mockImplementation(async (url, init) => {
      if (url === '/api/ihia/suggest') return Response.json({ suggestions: [suggestion], status: 'unverified' })
      if (init?.method === 'POST') return Response.json({ ...approved, status: 'draft' })
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetch)
    render(<IhiaPanel reviewer />)
    fireEvent.click(screen.getByText('Busy doctor', { selector: 'button' }))
    await screen.findByText('AI suggestion · unverified')
    expect(fetch.mock.calls.some(c => c[1]?.method === 'POST' && c[0] === '/api/ihia/knowledge')).toBe(false)
    const call = fetch.mock.calls.find(c => c[0] === '/api/ihia/suggest')!
    expect(JSON.parse(call[1].body)).toEqual({ situation: 'Busy doctor', region: 'baghdad' })
    fireEvent.click(screen.getByText('Save as draft for review'))
    await screen.findByText('Saved as draft')
    const save = fetch.mock.calls.find(c => c[0] === '/api/ihia/knowledge' && c[1]?.method === 'POST')!
    expect(JSON.parse(save[1].body).source_reference).toContain('AI-generated')
    expect(fetch.mock.calls.some(c => c[1]?.method === 'PATCH')).toBe(false)
  })
  it('shows generation failure without making up expressions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'AI unavailable' }, { status: 502 })))
    render(<IhiaPanel reviewer={false} />)
    fireEvent.click(screen.getByText('Suggest Iraqi expressions'))
    await screen.findByText('Error: AI unavailable')
    expect(screen.queryByText('AI suggestion · unverified')).toBeNull()
  })
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
  it('turns a phrase reps corrected into a draft and marks the proposals as drafted', async () => {
    const proposal = { heard: 'وكت', meant: 'وقت', ids: ['p1', 'p2'], times: 2, reps: 2, latest: '2026-11-05T10:00:00Z' }
    const fetch = vi.fn().mockImplementation(async (url, init) => {
      if (url === '/api/ihia/proposals' && !init?.method) return Response.json({ proposals: [proposal] })
      if (url === '/api/ihia/proposals') return Response.json({ ok: true })
      if (url === '/api/ihia/knowledge' && init?.method === 'POST') return Response.json({ ...approved, id: 'new-entry' }, { status: 201 })
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetch)
    render(<IhiaPanel reviewer />)
    await screen.findByText('Phrases reps corrected in recordings')
    expect(screen.getByText('2 time(s) by 2 rep(s)')).toBeTruthy()
    fireEvent.click(screen.getByText('Start a draft'))
    expect((screen.getByLabelText('expression') as HTMLInputElement).value).toBe('وقت')
    fireEvent.change(screen.getByLabelText('literal meaning'), { target: { value: 'Time' } })
    fireEvent.change(screen.getByLabelText('contextual meaning'), { target: { value: 'Asking for time' } })
    fireEvent.click(screen.getByText('Save draft'))
    await screen.findByText('Saved as draft. Approval is required.')
    const patch = fetch.mock.calls.find(c => c[0] === '/api/ihia/proposals' && c[1]?.method === 'PATCH')!
    expect(JSON.parse(patch[1].body)).toEqual({ ids: ['p1', 'p2'], action: 'drafted', entryId: 'new-entry' })
  })
  it('dismisses a proposed phrase without creating an entry', async () => {
    const proposal = { heard: 'وكت', meant: 'وقت', ids: ['p1'], times: 1, reps: 1, latest: '2026-11-05T10:00:00Z' }
    const fetch = vi.fn().mockImplementation(async (url, init) => {
      if (url === '/api/ihia/proposals' && !init?.method) return Response.json({ proposals: [proposal] })
      if (url === '/api/ihia/proposals') return Response.json({ ok: true })
      return Response.json([])
    })
    vi.stubGlobal('fetch', fetch)
    render(<IhiaPanel reviewer />)
    await screen.findByText('Phrases reps corrected in recordings')
    fireEvent.click(screen.getByText('Dismiss'))
    await waitFor(() => expect(fetch.mock.calls.some(c => c[1]?.method === 'PATCH')).toBe(true))
    expect(JSON.parse(fetch.mock.calls.find(c => c[1]?.method === 'PATCH')![1].body)).toEqual({ ids: ['p1'], action: 'dismissed' })
    expect(fetch.mock.calls.some(c => c[0] === '/api/ihia/knowledge' && c[1]?.method === 'POST')).toBe(false)
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
