import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  EDITABLE_SMS_TEMPLATE_KEYS,
  SMS_TEMPLATE_META,
  buildSmsTemplatePreview,
  getDefaultSmsTemplates,
  isSmsTemplatesCustom,
  resolveSmsTemplateDefault,
  type EditableSmsTemplateKey,
} from '../lib/brandTemplates'

interface BrandTemplatesEditorProps {
  brandId: string
  brandName: string
  slug: string
  vertical: string
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
  smsTemplates,
  onSaved,
  onError,
}: BrandTemplatesEditorProps) {
  const [expanded, setExpanded] = useState(false)
  const [smsDraft, setSmsDraft] = useState(() => initialSmsState(smsTemplates, brandName))
  const [savingSms, setSavingSms] = useState(false)
  const [previewSmsKey, setPreviewSmsKey] = useState<EditableSmsTemplateKey | null>(null)

  const isCustom = isSmsTemplatesCustom(
    Object.fromEntries(EDITABLE_SMS_TEMPLATE_KEYS.map((key) => [key, smsDraft[key]])),
    brandName
  )

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
          {/* SMS templates */}
          <section className="space-y-4">
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
