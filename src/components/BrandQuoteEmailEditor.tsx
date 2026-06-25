import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  QUOTE_EMAIL_TEMPLATE_KEY_HTML,
  QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT,
  buildQuoteEmailPreview,
  getDefaultEmailTemplates,
} from '../lib/brandTemplates'

const PLACEHOLDER_HINTS = [
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

interface BrandQuoteEmailEditorProps {
  brandId: string
  brandName: string
  slug: string
  vertical: string
  primaryColor: string
  emailTemplates: Record<string, string>
  onSaved: (message: string) => void
  onError: (message: string) => void
}

export default function BrandQuoteEmailEditor({
  brandId,
  brandName,
  slug,
  vertical,
  primaryColor,
  emailTemplates,
  onSaved,
  onError,
}: BrandQuoteEmailEditorProps) {
  const defaults = getDefaultEmailTemplates()
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(
    () => emailTemplates[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT] ?? defaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT]
  )
  const [html, setHtml] = useState(
    () => emailTemplates[QUOTE_EMAIL_TEMPLATE_KEY_HTML] ?? defaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML]
  )
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const preview = useMemo(
    () => buildQuoteEmailPreview(subject, html, primaryColor),
    [subject, html, primaryColor]
  )

  const isCustom =
    subject !== defaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT] ||
    html !== defaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML]

  async function handleSave() {
    if (!subject.trim() || !html.trim()) {
      onError('Subject and HTML body are required.')
      return
    }
    setSaving(true)
    const merged = {
      ...emailTemplates,
      [QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT]: subject.trim(),
      [QUOTE_EMAIL_TEMPLATE_KEY_HTML]: html.trim(),
    }
    const { error } = await supabase.from('brands').update({ email_templates: merged }).eq('id', brandId)
    setSaving(false)
    if (error) {
      onError(error.message)
    } else {
      onSaved(`Quote email template saved for ${brandName}.`)
    }
  }

  function handleReset() {
    setSubject(defaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT])
    setHtml(defaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML])
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
        <div className="mt-4 pl-6 space-y-4 border-l-2 border-gray-100">
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Sent when a manager creates a quote with a customer email. Use placeholders — they are filled at send
              time.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PLACEHOLDER_HINTS.map((token) => (
                <code
                  key={token}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"
                >
                  {token}
                </code>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Subject line</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder={defaults[QUOTE_EMAIL_TEMPLATE_KEY_SUBJECT]}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">HTML body</label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={12}
              spellCheck={false}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono leading-relaxed"
              placeholder={defaults[QUOTE_EMAIL_TEMPLATE_KEY_HTML]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              {showPreview ? 'Hide preview' : 'Preview with sample data'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
            >
              <RotateCcw size={12} /> Reset to default
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Save size={12} /> {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>

          {showPreview && (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
                <span className="font-semibold text-gray-700">Subject:</span> {preview.subject}
              </div>
              <iframe
                title={`Quote email preview — ${brandName}`}
                srcDoc={preview.html}
                sandbox=""
                className="w-full min-h-[280px] border-0 bg-white"
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}
