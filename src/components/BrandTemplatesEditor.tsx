import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  EDITABLE_SMS_TEMPLATE_KEYS,
  LEAD_ACK_EMAIL_HTML_KEY,
  LEAD_ACK_EMAIL_SUBJECT_KEY,
  QUOTE_EMAIL_TEMPLATE_KEY_HTML,
  QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT,
  SMS_TEMPLATE_META,
  buildLeadAckEmailPreview,
  buildQuoteEmailPreview,
  buildSmsTemplatePreview,
  getDefaultEmailTemplates,
  getDefaultSmsTemplates,
  isSmsTemplatesCustom,
  resolveSmsTemplateDefault,
  type EditableSmsTemplateKey,
} from '../lib/brandTemplates'

const QUOTE_PLACEHOLDER_HINTS = [
  '{{org.name}}',
  '{{customerName}}',
  '{{acceptanceUrl}}',
  '{{totalAmount}}',
  '{{serviceTypeLine}}',
  '{{scopeHtml}}',
  '{{termsBlock}}',
  '{{senderBlock}}',
  '{{primaryColor}}',
]

const LEAD_ACK_EMAIL_PLACEHOLDERS = [
  '{{org.name}}',
  '{{customerName}}',
  '{{callbackWindow}}',
  '{{orgPhoneBlock}}',
]

interface BrandTemplatesEditorProps {
  brandId: string
  brandName: string
  slug: string
  vertical: string
  primaryColor: string
  emailTemplates: Record<string, string>
  smsTemplates: Record<string, string>
  onSaved: (message: string) => void
  onError: (message: string) => void
}

function initialSmsState(
  smsTemplates: Record<string, string>,
  brandName: string
): Record<EditableSmsTemplateKey, string> {
  const defaults = getDefaultSmsTemplates(brandName)
  return Object.fromEntries(
    EDITABLE_SMS_TEMPLATE_KEYS.map((key) => [key, smsTemplates[key] ?? defaults[key] ?? ''])
  ) as Record<EditableSmsTemplateKey, string>
}

export default function BrandTemplatesEditor({
  brandId,
  brandName,
  slug,
  vertical,
  primaryColor,
  emailTemplates,
  smsTemplates,
  onSaved,
  onError,
}: BrandTemplatesEditorProps) {
  const emailDefaults = getDefaultEmailTemplates()
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(
    () => emailTemplates[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT] ?? emailDefaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT]
  )
  const [html, setHtml] = useState(
    () => emailTemplates[QUOTE_EMAIL_TEMPLATE_KEY_HTML] ?? emailDefaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML]
  )
  const [ackEmailSubject, setAckEmailSubject] = useState(
    () => emailTemplates[LEAD_ACK_EMAIL_SUBJECT_KEY] ?? emailDefaults[LEAD_ACK_EMAIL_SUBJECT_KEY]
  )
  const [ackEmailHtml, setAckEmailHtml] = useState(
    () => emailTemplates[LEAD_ACK_EMAIL_HTML_KEY] ?? emailDefaults[LEAD_ACK_EMAIL_HTML_KEY]
  )
  const [smsDraft, setSmsDraft] = useState(() => initialSmsState(smsTemplates, brandName))
  const [savingEmail, setSavingEmail] = useState(false)
  const [savingSms, setSavingSms] = useState(false)
  const [showQuotePreview, setShowQuotePreview] = useState(false)
  const [showAckEmailPreview, setShowAckEmailPreview] = useState(false)
  const [previewSmsKey, setPreviewSmsKey] = useState<EditableSmsTemplateKey | null>(null)

  const quotePreview = useMemo(
    () => buildQuoteEmailPreview(subject, html, primaryColor),
    [subject, html, primaryColor]
  )

  const ackEmailPreview = useMemo(
    () => buildLeadAckEmailPreview(ackEmailSubject, ackEmailHtml, brandName),
    [ackEmailSubject, ackEmailHtml, brandName]
  )

  const isQuoteCustom =
    subject !== emailDefaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT] ||
    html !== emailDefaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML]

  const isAckEmailCustom =
    ackEmailSubject !== emailDefaults[LEAD_ACK_EMAIL_SUBJECT_KEY] ||
    ackEmailHtml !== emailDefaults[LEAD_ACK_EMAIL_HTML_KEY]

  const isSmsCustom = isSmsTemplatesCustom(
    Object.fromEntries(EDITABLE_SMS_TEMPLATE_KEYS.map((key) => [key, smsDraft[key]])),
    brandName
  )

  const isCustom = isQuoteCustom || isAckEmailCustom || isSmsCustom

  async function handleSaveEmail() {
    if (!subject.trim() || !html.trim() || !ackEmailSubject.trim() || !ackEmailHtml.trim()) {
      onError('All email template fields are required.')
      return
    }
    setSavingEmail(true)
    const merged = {
      ...emailTemplates,
      [QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT]: subject.trim(),
      [QUOTE_EMAIL_TEMPLATE_KEY_HTML]: html.trim(),
      [LEAD_ACK_EMAIL_SUBJECT_KEY]: ackEmailSubject.trim(),
      [LEAD_ACK_EMAIL_HTML_KEY]: ackEmailHtml.trim(),
    }
    const { error } = await supabase.from('brands').update({ email_templates: merged }).eq('id', brandId)
    setSavingEmail(false)
    if (error) onError(error.message)
    else onSaved(`Email templates saved for ${brandName}.`)
  }

  async function handleSaveSms() {
    for (const key of EDITABLE_SMS_TEMPLATE_KEYS) {
      if (!smsDraft[key]?.trim()) {
        onError(`SMS template "${SMS_TEMPLATE_META[key].label}" cannot be empty.`)
        return
      }
    }
    setSavingSms(true)
    const merged = {
      ...smsTemplates,
      ...Object.fromEntries(
        EDITABLE_SMS_TEMPLATE_KEYS.map((key) => [key, smsDraft[key].trim()])
      ),
    }
    const { error } = await supabase.from('brands').update({ sms_templates: merged }).eq('id', brandId)
    setSavingSms(false)
    if (error) onError(error.message)
    else onSaved(`SMS templates saved for ${brandName}.`)
  }

  function handleResetQuote() {
    setSubject(emailDefaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT])
    setHtml(emailDefaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML])
  }

  function handleResetAckEmail() {
    setAckEmailSubject(emailDefaults[LEAD_ACK_EMAIL_SUBJECT_KEY])
    setAckEmailHtml(emailDefaults[LEAD_ACK_EMAIL_HTML_KEY])
  }

  function handleResetSms(key: EditableSmsTemplateKey) {
    setSmsDraft((prev) => ({
      ...prev,
      [key]: resolveSmsTemplateDefault(key, brandName),
    }))
  }

  function handleResetAllSms() {
    setSmsDraft(initialSmsState({}, brandName))
  }

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left text-sm group"
      >
        <span className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <ChevronDown size={16} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          )}
          <span className="font-medium text-gray-800 truncate">{brandName}</span>
          {isCustom && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 shrink-0">
              Custom
            </span>
          )}
        </span>
        <span className="text-gray-400 text-xs shrink-0">
          {slug} · {vertical}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 pl-6 space-y-8 border-l-2 border-gray-100">
          {/* Quote email */}
          <section className="space-y-4">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Quote email</h4>
            <p className="text-xs text-gray-500">
              Sent when a manager creates a quote with a customer email.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUOTE_PLACEHOLDER_HINTS.map((token) => (
                <code key={token} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {token}
                </code>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Subject line</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">HTML body</label>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={10}
                spellCheck={false}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQuotePreview((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                {showQuotePreview ? 'Hide preview' : 'Preview quote email'}
              </button>
              <button
                type="button"
                onClick={handleResetQuote}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> Reset quote email
              </button>
            </div>
            {showQuotePreview && (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">Subject:</span> {quotePreview.subject}
                </div>
                <iframe
                  title={`Quote email preview — ${brandName}`}
                  srcDoc={quotePreview.html}
                  sandbox=""
                  className="w-full min-h-[240px] border-0 bg-white"
                />
              </div>
            )}
          </section>

          {/* Lead ack email */}
          <section className="space-y-4 border-t border-gray-100 pt-6">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Lead acknowledgement email</h4>
            <p className="text-xs text-gray-500">
              Sent for email-only inbound leads when Lead Acknowledgement Email is enabled. Set your SLA in{' '}
              <code className="text-[10px]">{'{{callbackWindow}}'}</code> or write it directly in the body.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_ACK_EMAIL_PLACEHOLDERS.map((token) => (
                <code key={token} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                  {token}
                </code>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Subject line</label>
              <input
                value={ackEmailSubject}
                onChange={(e) => setAckEmailSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">HTML body</label>
              <textarea
                value={ackEmailHtml}
                onChange={(e) => setAckEmailHtml(e.target.value)}
                rows={8}
                spellCheck={false}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAckEmailPreview((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                {showAckEmailPreview ? 'Hide preview' : 'Preview ack email'}
              </button>
              <button
                type="button"
                onClick={handleResetAckEmail}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> Reset ack email
              </button>
              <button
                type="button"
                onClick={handleSaveEmail}
                disabled={savingEmail}
                className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Save size={12} /> {savingEmail ? 'Saving…' : 'Save email templates'}
              </button>
            </div>
            {showAckEmailPreview && (
              <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
                  <span className="font-semibold text-gray-700">Subject:</span> {ackEmailPreview.subject}
                </div>
                <iframe
                  title={`Ack email preview — ${brandName}`}
                  srcDoc={ackEmailPreview.html}
                  sandbox=""
                  className="w-full min-h-[200px] border-0 bg-white"
                />
              </div>
            )}
          </section>

          {/* SMS templates */}
          <section className="space-y-4 border-t border-gray-100 pt-6">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">SMS templates</h4>
            <p className="text-xs text-gray-500">
              Per-brand customer and manager SMS copy. Use{' '}
              <code className="text-[10px]">{'{{callbackWindow}}'}</code> for
              SLA text on lead ack, or write your own wording (e.g. &quot;within 1 hour&quot;).{' '}
              <code className="text-[10px]">{'{{orgPhoneLine}}'}</code> is filled from each org&apos;s support phone in Org
              Settings.
            </p>

            {EDITABLE_SMS_TEMPLATE_KEYS.map((key) => {
              const meta = SMS_TEMPLATE_META[key]
              return (
                <div key={key} className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                    <p className="text-xs text-gray-500">{meta.description}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-1">{key}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.placeholders.map((token) => (
                      <code key={token} className="text-[10px] px-1.5 py-0.5 rounded bg-white text-gray-600 border border-gray-100">
                        {token}
                      </code>
                    ))}
                  </div>
                  <textarea
                    value={smsDraft[key]}
                    onChange={(e) => setSmsDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    rows={3}
                    spellCheck={false}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed bg-white"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewSmsKey((current) => (current === key ? null : key))}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-white"
                    >
                      {previewSmsKey === key ? 'Hide preview' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetSms(key)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-white inline-flex items-center gap-1"
                    >
                      <RotateCcw size={11} /> Reset
                    </button>
                  </div>
                  {previewSmsKey === key && (
                    <p className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {buildSmsTemplatePreview(key, smsDraft[key], brandName)}
                    </p>
                  )}
                </div>
              )
            })}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleResetAllSms}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
              >
                <RotateCcw size={12} /> Reset all SMS
              </button>
              <button
                type="button"
                onClick={handleSaveSms}
                disabled={savingSms}
                className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Save size={12} /> {savingSms ? 'Saving…' : 'Save SMS templates'}
              </button>
            </div>
          </section>
        </div>
      )}
    </li>
  )
}
