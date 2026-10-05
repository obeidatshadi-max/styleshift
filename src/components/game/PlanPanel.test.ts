// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('@/lib/i18n', () => ({ useT: () => (key: string) => key }))
import PlanPanel from './PlanPanel'

const doctor = { id: 'd1', name: 'Dr. X' } as never
beforeEach(() => { vi.stubGlobal('React', React) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PlanPanel', () => {
  it('saves an objective and measure, and needs an objective to save', async () => {
    const onSave = vi.fn(async () => true)
    render(React.createElement(PlanPanel, { doctor, onSave }))
    const save = screen.getByText('plan.save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('plan.objectiveHint'), { target: { value: 'Agree a trial' } })
    fireEvent.change(screen.getByPlaceholderText('plan.measureHint'), { target: { value: 'Date agreed' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await screen.findByText('plan.saved')
    expect(onSave).toHaveBeenCalledWith({ objective: 'Agree a trial', successMeasure: 'Date agreed' })
  })
  it('shows an error when saving fails, and clears an existing plan', async () => {
    const onSave = vi.fn(async () => false)
    render(React.createElement(PlanPanel, { doctor: { ...(doctor as object), plan_objective: 'Old goal', plan_success_measure: 'Old measure' } as never, onSave }))
    fireEvent.click(screen.getByText('plan.clear'))
    await screen.findByText('plan.error')
    expect(onSave).toHaveBeenCalledWith(null)
    await waitFor(() => expect((screen.getByPlaceholderText('plan.objectiveHint') as HTMLTextAreaElement).value).toBe('Old goal'))
  })
})
