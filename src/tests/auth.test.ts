import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from '../firebase/auth'

describe('friendlyAuthError', () => {
  it.each([
    ['auth/configuration-not-found', /Get started/],
    ['auth/operation-not-allowed', /Sign-in method/],
    ['auth/invalid-credential', /incorrect/],
    ['auth/email-already-in-use', /already exists/],
    ['auth/popup-blocked', /popups/],
  ])('maps %s to an actionable message', (code, re) => {
    expect(friendlyAuthError({ code })).toMatch(re)
  })
  it('falls back to the error message, then to a generic one', () => {
    expect(friendlyAuthError(new Error('boom'))).toBe('boom')
    expect(friendlyAuthError({})).toBe('Sign-in failed.')
  })
})
