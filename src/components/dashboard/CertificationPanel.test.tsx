// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CertificationPanel, { describeEvent } from './CertificationPanel'

const ev = (over = {}) => ({ gameSessions: 12, avgAccuracy: 80, voiceSessions: 6, winRate: 70, adaptationAvg: null, adaptationSessions: 0, windowDays: 90, measuredAt: '2026-11-05T00:00:00Z', ...over })
const overview = (extra = {}) => ({
  windowDays: 90,
  reps: [{ id: 'r1', name: 'Rana', evidence: ev() }, { id: 'r2', name: 'Omar', evidence: ev({ gameSessions: 2, avgAccuracy: 40, voiceSessions: 1, winRate: 0 }) }],
  certificates: [], audit: [], ...extra,
})
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('CertificationPanel', () => {
  it('shows who is eligible and who is not yet, with the numbers behind it', () => {
    render(<CertificationPanel initial={overview()} />)
    expect(screen.getByText('Eligible')).toBeTruthy()
    expect(screen.getByText('Not yet')).toBeTruthy()
    expect(screen.getAllByText('Game accuracy (%): 40 / 70').length).toBe(1)
  })

  it('re-judges live when a requirement changes', () => {
    render(<CertificationPanel initial={overview()} />)
    fireEvent.change(screen.getByLabelText('Game accuracy (%)'), { target: { value: '90' } })
    expect(screen.queryByText('Eligible')).toBeNull()
    expect(screen.getAllByText('Not yet').length).toBe(2)
  })

  it('refuses to issue when every requirement is switched off', () => {
    render(<CertificationPanel initial={overview()} />)
    for (const l of ['Game sessions', 'Game accuracy (%)', 'Voice sessions (last 90 days)', 'Voice win rate (%)', 'Adaptation score'])
      fireEvent.change(screen.getByLabelText(l), { target: { value: '0' } })
    expect(screen.getByText(/Set at least one requirement/)).toBeTruthy()
    expect(screen.queryByText('Issue certificate')).toBeNull()
  })

  it('issues to an eligible rep with the name and requirements, never the evidence', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? json({ certificate: {} }, 201) : json(overview()))
    vi.stubGlobal('fetch', fetchMock)
    render(<CertificationPanel initial={overview()} />)
    fireEvent.click(screen.getByText('Issue certificate'))
    await screen.findByText('Certificate issued to Rana.')
    const post = fetchMock.mock.calls.find(c => c[1]?.method === 'POST')!
    expect(bodyOf(post)).toEqual({ repId: 'r1', programName: 'Field Ready', criteria: { minGameSessions: 10, minAccuracy: 70, minVoiceSessions: 5, minWinRate: 60, minAdaptation: 0 } })
  })

  it('needs a written reason before an exception can be issued', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? json({ certificate: {} }, 201) : json(overview()))
    vi.stubGlobal('fetch', fetchMock)
    render(<CertificationPanel initial={overview()} />)
    fireEvent.click(screen.getByText('Issue as exception…'))
    const send = screen.getByText('Issue as exception') as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Exception reason for Omar'), { target: { value: 'Strong field results' } })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    await waitFor(() => expect(fetchMock.mock.calls.some(c => c[1]?.method === 'POST')).toBe(true))
    expect(bodyOf(fetchMock.mock.calls.find(c => c[1]?.method === 'POST')!)).toMatchObject({ repId: 'r2', exceptionReason: 'Strong field results' })
  })

  it('shows a held certificate instead of an issue button, and withdraws only with a reason', async () => {
    const cert = { id: 'c1', repId: 'r1', repName: 'Rana', program: 'Field Ready', criteriaMet: true, exceptionReason: null, verifyCode: 'ABCDEFGHJKMN', issuedAt: '2026-11-01T00:00:00Z', revokedAt: null, revokeReason: null }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'PATCH' ? json({ certificate: {} }) : json(overview({ certificates: [cert] })))
    vi.stubGlobal('fetch', fetchMock)
    render(<CertificationPanel initial={overview({ certificates: [cert] })} />)
    expect(screen.getByText(/Certified/)).toBeTruthy()
    expect(screen.queryByText('Issue certificate')).toBeNull()
    expect(screen.getByText('Open certificate').getAttribute('href')).toBe('/verify/ABCDEFGHJKMN')
    const withdraw = screen.getByText('Withdraw') as HTMLButtonElement
    expect(withdraw.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Reason to withdraw Rana's certificate"), { target: { value: 'Left the company' } })
    fireEvent.click(withdraw)
    await screen.findByText('Certificate withdrawn.')
    expect(bodyOf(fetchMock.mock.calls.find(c => c[1]?.method === 'PATCH')!)).toEqual({ id: 'c1', reason: 'Left the company' })
  })

  it('says why when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => init?.method === 'POST' ? json({ error: 'already_certified' }, 409) : json(overview())))
    render(<CertificationPanel initial={overview()} />)
    fireEvent.click(screen.getByText('Issue certificate'))
    await screen.findByText('This rep already holds that certificate.')
  })

  it('lists the audit trail in plain words', () => {
    render(<CertificationPanel initial={overview({ audit: [
      { id: 2, actor: 'Shadi', action: 'certification.revoked', details: { program: 'Field Ready', rep_name: 'Rana', reason: 'Left' }, at: '2026-11-04T10:00:00Z' },
      { id: 1, actor: 'Shadi', action: 'certification.issued', details: { program: 'Field Ready', rep_name: 'Rana', exception_reason: null }, at: '2026-11-01T10:00:00Z' },
    ] })} />)
    expect(screen.getByText('Withdrew “Field Ready” from Rana: Left')).toBeTruthy()
    expect(screen.getByText('Issued “Field Ready” to Rana')).toBeTruthy()
  })

  it('describes an exception issue with its reason', () => {
    expect(describeEvent({ id: 1, actor: null, action: 'certification.issued', details: { program: 'P', rep_name: 'R', exception_reason: 'because' }, at: '' }))
      .toBe('Issued “P” to R as an exception: because')
  })

  it('loads on its own and reports a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)))
    render(<CertificationPanel />)
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load')
  })
})
