// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import WeeklyDigestPanel from './WeeklyDigestPanel'

const digest = {
  practiceThisWeek: 7, practiceLastWeek: 10, activeReps: 2, totalReps: 3, quietReps: ['Bassam'],
  topFocus: { label: 'Listen step', count: 2 }, summary: 'StyleShift weekly summary - Acme',
}
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('WeeklyDigestPanel', () => {
  it('shows the week at a glance, who was quiet and the shared focus', () => {
    render(React.createElement(WeeklyDigestPanel, { digest }))
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getByText('-3 vs last week')).toBeTruthy()
    expect(screen.getByText('2/3')).toBeTruthy()
    expect(screen.getByText('Bassam')).toBeTruthy()
    expect(screen.getByText(/Listen step \(2 reps\)/)).toBeTruthy()
  })
  it('copies the summary, and shows it for manual copying when the clipboard is blocked', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(React.createElement(WeeklyDigestPanel, { digest }))
    fireEvent.click(screen.getByText('Copy summary'))
    await screen.findByText(/Copied/)
    expect(writeText).toHaveBeenCalledWith(digest.summary)
    cleanup()
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('blocked') }) } })
    render(React.createElement(WeeklyDigestPanel, { digest }))
    fireEvent.click(screen.getByText('Copy summary'))
    await screen.findByText(/Could not copy/)
    expect(screen.getByText(digest.summary)).toBeTruthy()
  })
})
