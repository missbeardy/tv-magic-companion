import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface ExtractedLead {
  name: string
  phone: string
  address: string
  email: string
  service_type: string
  lead_source: string
  details: string
}

function getClaudeModel(): string {
  const envModel = import.meta.env.VITE_CLAUDE_MODEL
  if (envModel && envModel.trim().length > 0) {
    return envModel.trim()
  }
  return 'claude-sonnet-4-6'
}

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text.trim().toLowerCase())
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function upsertCustomer(extracted: ExtractedLead): Promise<string | null> {
  if (!extracted.email && !extracted.phone) return null

  if (extracted.email) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('email', extracted.email)
      .maybeSingle()

    if (existing) return existing.id
  }

  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      name: extracted.name,
      phone: extracted.phone,
      email: extracted.email,
      address: extracted.address,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create customer:', error)
    return null
  }

  return created.id
}

export default function EmailParser() {
  const navigate = useNavigate()
  const [rawEmail, setRawEmail] = useState('')
  const [extracted, setExtracted] = useState<ExtractedLead | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  async function handleParse() {
    setParsing(true)
    setError('')
    setExtracted(null)
    setSaved(false)
    setDuplicateWarning(null)

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
  "address": "full street address including suburb and postcode if present, or empty string",
  "service_type": "one of: TV Aerial, Satellite Dish, Home Automation, CCTV, General Repair, Other",
  "lead_source": "where the lead came from — one of: Website, Google, Facebook, Referral, Phone, Email, Unknown",
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
      const clean = text.replace(/^```json[\s\S]*?|^```[\s\S]*?|```$/g, '').trim()

      let parsed: ExtractedLead
      try {
        parsed = JSON.parse(clean)
      } catch {
        parsed = JSON.parse(text)
      }

      const requiredFields: (keyof ExtractedLead)[] = ['name', 'phone', 'email', 'address', 'service_type', 'lead_source', 'details']
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
    setDuplicateWarning(null)

    try {
      // Step 1 — hash the raw email for duplicate detection
      const hash = await hashText(rawEmail)

      // Step 2 — check for duplicate
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('email_hash', hash)
        .maybeSingle()

      if (existingLead) {
        // Duplicate found — block the insert, warn the user, log the event
        setDuplicateWarning(existingLead.id)

        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('lead_events').insert({
          lead_id: existingLead.id,
          event_type: 'duplicate_blocked',
          payload: { email_hash: hash },
          actor_id: user?.id ?? null,
        })

        setSaving(false)
        return
      }

      // Step 3 — upsert the customer record
      const customerId = await upsertCustomer(extracted)

      // Step 4 — insert the lead
      const { data: lead, error: dbError } = await supabase
        .from('leads')
        .insert({
          name: extracted.name,
          phone: extracted.phone,
          email: extracted.email,
          address: extracted.address,
          service_type: extracted.service_type,
          lead_source: extracted.lead_source,
          details: extracted.details,
          raw_email: rawEmail,
          email_hash: hash,
          customer_id: customerId,
          status: 'unassigned',
        })
        .select('id')
        .single()

      if (dbError || !lead) {
        throw new Error('Failed to save lead: ' + (dbError?.message ?? 'unknown error'))
      }

      // Step 5 — log the audit event
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: 'created',
        payload: {
          lead_source: extracted.lead_source,
          customer_id: customerId,
        },
        actor_id: user?.id ?? null,
      })

      setSaved(true)
      setRawEmail('')
      setExtracted(null)
      setTimeout(() => setSaved(false), 4000)

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save lead'
      setError(message)
      console.error('Save error:', err)
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

      {duplicateWarning && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <p className="font-medium">⚠️ Duplicate detected</p>
          <p className="mt-1">
            This email has already been submitted. The existing lead has been
            preserved. No new lead was created.
          </p>
          <button
            onClick={() => navigate(`/leads?highlight=${duplicateWarning}`)}
            className="mt-2 text-xs underline text-amber-700"
          >
            View existing lead →
          </button>
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
              { label: 'Lead Source', key: 'lead_source' as const },
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