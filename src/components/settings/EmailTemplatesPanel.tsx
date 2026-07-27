import { useEffect, useState, type ChangeEvent } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  EMAIL_TEMPLATE_IDS,
  EMAIL_TEMPLATE_LABELS,
  EMAIL_TEMPLATE_STORAGE_KEYS,
  compileEmailDoc,
  getDefaultEmailTemplateDoc,
  parseEmailTemplateDocsMap,
  type EmailTemplateDoc,
  type EmailTemplateDocsMap,
  type EmailTemplateId,
} from '../../../shared/emailTemplateDocs'
import {
  LEAD_ACK_EMAIL_PREVIEW_VARS,
  QUOTE_EMAIL_PREVIEW_VARS,
} from '../../lib/brandTemplates'
import { INVOICE_EMAIL_PREVIEW_VARS } from '../../lib/invoiceTemplates'
import type { Json } from '../../types/database.types'
import EmailTemplateBuilder from './EmailTemplateBuilder'
import SettingsAccordion from './SettingsAccordion'

interface Props {
  orgId: string
  orgName: string
  primaryColor: string
  logoUrl?: string | null
  showInvoiceExtras: boolean
}

const PREVIEW_VARS: Record<EmailTemplateId, Record<string, string>> = {
  quote: { ...QUOTE_EMAIL_PREVIEW_VARS },
  lead_ack: { ...LEAD_ACK_EMAIL_PREVIEW_VARS },
  invoice: { ...INVOICE_EMAIL_PREVIEW_VARS },
}

export default function EmailTemplatesPanel({
  orgId,
  orgName,
  primaryColor,
  logoUrl,
  showInvoiceExtras,
}: Props) {
  const [activeId, setActiveId] = useState<EmailTemplateId>('quote')
  const [docs, setDocs] = useState<EmailTemplateDocsMap>({})
  const [drafts, setDrafts] = useState<Record<EmailTemplateId, EmailTemplateDoc>>({
    quote: getDefaultEmailTemplateDoc('quote'),
    lead_ack: getDefaultEmailTemplateDoc('lead_ack'),
    invoice: getDefaultEmailTemplateDoc('invoice'),
  })
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [pdfTemplatePath, setPdfTemplatePath] = useState<string | null>(null)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      if (!orgId) return
      setLoading(true)
      setError('')
      const { data, error: loadError } = await supabase
        .from('orgs')
        .select('email_template_docs, email_templates, invoice_payment_instructions, invoice_pdf_template_path')
        .eq('id', orgId)
        .single()

      if (loadError) {
        setError('Could not load email templates.')
        setLoading(false)
        return
      }

      const loadedDocs = parseEmailTemplateDocsMap(data?.email_template_docs)
      setDocs(loadedDocs)
      setDrafts({
        quote: loadedDocs.quote ?? getDefaultEmailTemplateDoc('quote'),
        lead_ack: loadedDocs.lead_ack ?? getDefaultEmailTemplateDoc('lead_ack'),
        invoice: loadedDocs.invoice ?? getDefaultEmailTemplateDoc('invoice'),
      })
      setPaymentInstructions((data?.invoice_payment_instructions as string) ?? '')
      const path = (data?.invoice_pdf_template_path as string) ?? null
      setPdfTemplatePath(path)
      setPdfFileName(path ? path.split('/').pop() ?? 'template.pdf' : null)
      setLoading(false)
    }
    load()
  }, [orgId])

  const activeDraft = drafts[activeId]
  const isCustom = Boolean(docs[activeId])

  async function handleSave() {
    if (!orgId) return
    if (!activeDraft.subject.trim()) {
      setError('Subject is required.')
      return
    }
    setSaving(true)
    setError('')

    const compiled = compileEmailDoc(activeDraft, { primaryColor, logoUrl, templateId: activeId })
    const keys = EMAIL_TEMPLATE_STORAGE_KEYS[activeId]

    const { data: existing } = await supabase
      .from('orgs')
      .select('email_templates, email_template_docs')
      .eq('id', orgId)
      .single()

    const mergedTemplates = {
      ...((existing?.email_templates as Record<string, string>) ?? {}),
      [keys.subject]: compiled.subject,
      [keys.html]: compiled.html,
    }

    const nextDocs: EmailTemplateDocsMap = {
      ...parseEmailTemplateDocsMap(existing?.email_template_docs),
      [activeId]: activeDraft,
    }

    const updatePayload: {
      email_templates: Json
      email_template_docs: Json
      invoice_payment_instructions?: string | null
      invoice_pdf_template_path?: string | null
    } = {
      email_templates: mergedTemplates as unknown as Json,
      email_template_docs: nextDocs as unknown as Json,
    }

    if (activeId === 'invoice' && showInvoiceExtras) {
      updatePayload.invoice_payment_instructions = paymentInstructions.trim() || null
      updatePayload.invoice_pdf_template_path = pdfTemplatePath
    }

    const { error: saveError } = await supabase.from('orgs').update(updatePayload).eq('id', orgId)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setDocs(nextDocs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleReset() {
    if (!orgId) return
    const defaults = getDefaultEmailTemplateDoc(activeId)
    setDrafts((prev) => ({ ...prev, [activeId]: defaults }))

    const keys = EMAIL_TEMPLATE_STORAGE_KEYS[activeId]
    const { data: existing } = await supabase
      .from('orgs')
      .select('email_templates, email_template_docs')
      .eq('id', orgId)
      .single()

    const mergedTemplates = { ...((existing?.email_templates as Record<string, string>) ?? {}) }
    delete mergedTemplates[keys.subject]
    delete mergedTemplates[keys.html]

    const nextDocs = { ...parseEmailTemplateDocsMap(existing?.email_template_docs) }
    delete nextDocs[activeId]

    const { error: saveError } = await supabase
      .from('orgs')
      .update({
        email_templates: mergedTemplates as unknown as Json,
        email_template_docs: nextDocs as unknown as Json,
      })
      .eq('id', orgId)

    if (saveError) {
      setError(saveError.message)
      return
    }
    setDocs(nextDocs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handlePdfUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    if (file.type !== 'application/pdf') {
      setError('PDF template must be a .pdf file.')
      return
    }
    setUploadingPdf(true)
    setError('')
    try {
      const path = `${orgId}/invoice-template.pdf`
      const { error: uploadError } = await supabase.storage
        .from('org-invoice-templates')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      setPdfTemplatePath(path)
      setPdfFileName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF upload failed')
    } finally {
      setUploadingPdf(false)
      e.target.value = ''
    }
  }

  if (loading) {
    return (
      <SettingsAccordion title="Email templates">
        <p className="text-sm text-gray-400">Loading email templates…</p>
      </SettingsAccordion>
    )
  }

  return (
    <SettingsAccordion
      title="Email templates"
      badge={
        Object.keys(docs).length > 0 ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
            Customised
          </span>
        ) : undefined
      }
    >
      <p className="text-xs text-gray-500">
        Edit the message above — preview updates live below. Job details (scope, line items, pay
        button, etc.) are added automatically when the email is sent.
      </p>

      <div className="flex flex-wrap gap-2">
        {EMAIL_TEMPLATE_IDS.map((id) => {
          if (id === 'invoice' && !showInvoiceExtras) return null
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveId(id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${
                activeId === id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {EMAIL_TEMPLATE_LABELS[id]}
              {docs[id] ? ' ·' : ''}
            </button>
          )
        })}
      </div>

      {isCustom && (
        <p className="text-[11px] text-amber-700">
          This template is customised for your franchise. Reset restores the brand/default layout.
        </p>
      )}

      <EmailTemplateBuilder
        templateId={activeId}
        doc={activeDraft}
        onChange={(next) => setDrafts((prev) => ({ ...prev, [activeId]: next }))}
        primaryColor={primaryColor}
        logoUrl={logoUrl}
        previewVars={PREVIEW_VARS[activeId]}
        orgName={orgName}
      />

      {activeId === 'invoice' && showInvoiceExtras && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Payment instructions
            </label>
            <textarea
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              rows={3}
              placeholder={
                'Bank: BSB 000-000 Acc 12345678\nReference: invoice number\nOr call 1300…'
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Merged as {'{{paymentInstructions}}'} in the email body
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              PDF attachment (optional)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => document.getElementById('invoice-pdf-upload')?.click()}
                disabled={uploadingPdf}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                {uploadingPdf ? 'Uploading…' : 'Upload PDF template'}
              </button>
              {pdfFileName && (
                <span className="text-xs text-gray-500 truncate">{pdfFileName}</span>
              )}
              <input
                id="invoice-pdf-upload"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleReset}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
        >
          <RotateCcw size={12} /> Reset to brand default
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white font-semibold disabled:opacity-50 flex items-center gap-1"
        >
          <Save size={12} /> {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-green-600">Email template saved.</p>}
    </SettingsAccordion>
  )
}
