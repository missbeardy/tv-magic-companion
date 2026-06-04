import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface ExtractedLead {
  name: string
  phone: string
  address: string
  email: string
  service_type: string
  details: string
}

// Dynamic model selection — falls back gracefully if env var is missing
function getClaudeModel(): string {
  const envModel = import.meta.env.VITE_CLAUDE_MODEL
  if (envModel && envModel.trim().length > 0) {
    return envModel.trim()
  }
  // Fallback chain: try known valid models in order of preference
  return 'claude-sonnet-4-6'  // Update this as Anthropic releases new models
}

export default function EmailParser() {
  const [rawEmail, setRawEmail] = useState('')
  const [extracted, setExtracted] = useState<ExtractedLead | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleParse() {
    setParsing(true)
    setError('')
    setExtracted(null)
    setSaved(false)

    const model = getClaudeModel()

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: `Extract the following fields from this email and respond ONLY with a JSON object, no markdown, no explanation:
{
  "name": "customer full name or empty string",
  "phone": "phone number or empty string",
  "email": "email address or empty string",
  "address": "full street address of the customer if mentioned, or null",
  "service_type": "type of TV/aerial/satellite service needed or empty string",
  "details": "brief summary of the job details or empty string"
}

Email:
${rawEmail}`,
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message = (errorData as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`
        throw new Error(`Anthropic API error: ${message}`)
      }

      const data = await response.json()

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Unexpected response format from Anthropic API')
      }

      const text = data.content[0].text.trim()
      // Strip markdown code fences if present
      const clean = text.replace(/^```json[\s\S]*?|^```[\s\S]*?|```$/g, '').trim()

      let parsed: ExtractedLead
      try {
        parsed = JSON.parse(clean)
      } catch {
        // Try once more with the raw text if cleaned version failed
        parsed = JSON.parse(text)
      }

      // Validate required fields exist
      const requiredFields: (keyof ExtractedLead)[] = ['name', 'phone', 'email', 'address', 'service_type', 'details']
      const missingFields = requiredFields.filter(f => !(f in parsed))

      if (missingFields.length > 0) {
        throw new Error(`Missing fields in response: ${missingFields.join(', ')}`)
      }

      setExtracted(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse email'
      setError(message)
      console.error('Email parsing error:', err)
    }

    setParsing(false)
  }

  async function handleSave() {
    if (!extracted) return
    setSaving(true)
    setError('')

    const { error: dbError } = await supabase.from('leads').insert({
      name: extracted.name,
      phone: extracted.phone,
      email: extracted.email,
      address: extracted.address,
      service_type: extracted.service_type,
      details: extracted.details,
      raw_email: rawEmail,
      status: 'unassigned',
    })

    if (dbError) {
      setError('Failed to save lead: ' + dbError.message)
    } else {
      setSaved(true)
      setRawEmail('')
      setExtracted(null)
      setTimeout(() => setSaved(false), 4000)
    }

    setSaving(false)
  }

  const canParse = rawEmail.trim().length > 0 && !parsing
  const canSave = extracted !== null && !saving

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-1">
        Email Lead Parser
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Paste a raw customer email below and AI will extract the lead details.
      </p>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
          ✅ Lead saved to unassigned pool!
        </div>
      )}

      <textarea
        value={rawEmail}
        onChange={e => setRawEmail(e.target.value)}
        placeholder="Paste customer email here..."
        rows={6}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93] mb-3"
      />

      <button
        onClick={handleParse}
        disabled={!canParse}
        className="bg-[#004B93] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {parsing ? 'Parsing...' : 'Parse Email with AI'}
      </button>

      {extracted && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Extracted Lead Details
          </h4>
          <div className="space-y-3">
            {[
              { label: 'Name', key: 'name' as const },
              { label: 'Phone', key: 'phone' as const },
              { label: 'Email', key: 'email' as const },
              { label: 'Address', key: 'address' as const },
              { label: 'Service Type', key: 'service_type' as const },
              { label: 'Details', key: 'details' as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={extracted[key] ?? ''}
                  onChange={e =>
                    setExtracted({ ...extracted, [key]: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="mt-4 bg-[#00B4C5] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#009aaa] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save to Unassigned Pool'}
          </button>
        </div>
      )}
    </div>
  )
}