import { useState } from 'react'
import { generateCaption } from '../lib/generateCaption'
import { postToSocial } from '../hooks/useSocialPost'

interface Lead {
  id: string
  name: string
  service_type?: string
  address?: string
}

interface Props {
  lead: Lead
  photoUrl: string
  onClose: () => void
}

export default function LeadSocialModal({ lead, photoUrl, onClose }: Props) {
  const [userInput, setUserInput] = useState('')
  const [caption, setCaption] = useState('')
  const [generating, setGenerating] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const jobContext = `Service: ${lead.service_type ?? 'TV installation'}. Location: ${lead.address ?? 'local area'}. Customer: ${lead.name}.`

  async function handleGenerate() {
    if (!userInput.trim()) return
    setGenerating(true)
    setError('')
    try {
      const result = await generateCaption(userInput, jobContext)
      setCaption(result)
      setStep(2)
    } catch {
      setError('Failed to generate caption. Check your API key.')
    }
    setGenerating(false)
  }

  async function handlePost() {
    setPosting(true)
    setError('')
    const result = await postToSocial({ caption, mediaUrl: photoUrl })
    if (result.success) {
      setStep(3)
    } else {
      setError(result.error ?? 'Something went wrong.')
    }
    setPosting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#004B93]">
            {step === 1 && '📸 Share This Job'}
            {step === 2 && '✍️ Review Caption'}
            {step === 3 && '🎉 Posted!'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                n <= step ? 'bg-[#004B93]' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Step 1 — Write notes */}
        {step === 1 && (
          <div className="space-y-4">
            <img
              src={photoUrl}
              alt="Job photo"
              className="w-full h-48 object-cover rounded-xl border border-gray-200"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What did you do on this job? (one sentence is fine)
              </label>
              <textarea
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                rows={3}
                placeholder="e.g. Installed a new TV aerial and signal booster for a family home in Bondi"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !userInput.trim()}
              className="w-full py-4 rounded-xl bg-[#004B93] text-white font-semibold text-base disabled:opacity-40"
            >
              {generating ? '✨ Generating...' : 'Spice it up ✨'}
            </button>
          </div>
        )}

        {/* Step 2 — Review & post */}
        {step === 2 && (
          <div className="space-y-4">
            <img
              src={photoUrl}
              alt="Job photo"
              className="w-full h-36 object-cover rounded-xl border border-gray-200"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Caption — edit if you'd like
              </label>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={6}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              />
            </div>
            <p className="text-xs text-gray-400">
              Will post to Instagram Feed, Reel + Story, and Facebook Story simultaneously.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep(1); setCaption('') }}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold"
              >
                ← Redo
              </button>
              <button
                onClick={handlePost}
                disabled={posting || !caption.trim()}
                className="flex-1 py-4 rounded-xl bg-[#00B4C5] text-white font-bold text-base disabled:opacity-40"
              >
                {posting ? 'Posting...' : 'Looks good, post it! 🚀'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Success */}
        {step === 3 && (
          <div className="text-center space-y-4 py-4">
            <div className="text-6xl">🎉</div>
            <p className="text-lg font-bold text-gray-800">Posted successfully!</p>
            <p className="text-sm text-gray-500">
              Your job is now live on Instagram and Facebook.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#004B93] text-white font-semibold"
            >
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  )
}