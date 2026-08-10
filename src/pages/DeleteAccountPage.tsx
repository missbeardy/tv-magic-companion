import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestAccountDeletion } from '../lib/accountDeletion'

/**
 * Web-accessible deletion path (Play Store requirement) for someone who isn't currently signed
 * in. Queues a request for manual processing rather than deleting instantly — see
 * api/_lib/accountDeletion.ts for why (org-level data has its own retention obligations that a
 * public, unauthenticated form can't safely resolve on its own).
 */
export default function DeleteAccountPage() {
  const [email, setEmail] = useState('')
  const [orgHint, setOrgHint] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }
    setSubmitting(true)
    setError('')
    const result = await requestAccountDeletion({ email, orgHint, note })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card p-6 space-y-4 bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <h1 className="font-display font-semibold text-gray-900 text-lg">
              Request account deletion
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Already signed in? It's faster to delete your account from your Profile page inside
              the app. Use this form if you can't sign in.
            </p>
          </div>

          {submitted ? (
            <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-xl text-sm">
              Request received. We'll process it and confirm by email — this isn't instant, since
              some business records need to be handled by the account holder's employer.
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Your email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Business/organisation name (optional, helps us find your account faster)
                </label>
                <input
                  type="text"
                  value={orgHint}
                  onChange={(e) => setOrgHint(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Anything else we should know? (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-brand transition-colors"
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </>
          )}

          <p className="text-center text-xs text-gray-400">
            <Link to="/privacy" className="underline">Privacy Policy</Link>
            {' · '}
            <Link to="/login" className="underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
