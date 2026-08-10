import { getAuthHeaders } from './apiAuth'

/** Deletes the current user's own profile PII + auth login. Org business data is untouched — see api/_lib/accountDeletion.ts for the documented deletion matrix. */
export async function deleteMyAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  const headers = await getAuthHeaders()
  const res = await fetch('/api/create-user?action=delete-account', { method: 'POST', headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: (data as { error?: string }).error ?? `HTTP ${res.status}` }
  }
  return { ok: true }
}

/** Public, unauthenticated request path — queued for manual processing (see DeleteAccountPage). */
export async function requestAccountDeletion(input: {
  email: string
  orgHint?: string
  note?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch('/api/send-sms?action=request-account-deletion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: (data as { error?: string }).error ?? `HTTP ${res.status}` }
  }
  return { ok: true }
}
