import { describe, it, expect, afterEach, vi } from 'vitest'
import { looksOffline } from './offline-queue'

describe('looksOffline', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('treats navigator.onLine === false as offline regardless of the error', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(looksOffline(new Error('some unrelated server error'))).toBe(true)
  })

  it('treats a "Failed to fetch" TypeError as offline even if onLine is true', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(looksOffline(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('does not treat a real validation/RLS error as offline', () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(looksOffline(new Error('new row violates row-level security policy'))).toBe(false)
  })
})
