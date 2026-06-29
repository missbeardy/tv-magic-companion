import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Save, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  INVOICE_EMAIL_TEMPLATE_KEY_HTML,
  INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT,
  INVOICE_TEMPLATE_PLACEHOLDERS,
  buildInvoiceEmailPreview,
  getDefaultInvoiceEmailTemplates,
} from '../../lib/invoiceTemplates'

interface Props {
  orgId: string
  primaryColor: string
}

export default function InvoiceTemplateEditor({ orgId, primaryColor }: Props) {
  const defaults = getDefaultInvoiceEmailTemplates()
  const [expanded, setExpanded] = useState(false)
  const [subject, setSubject] = useState(defaults[INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT])
  const [html, setHtml] = useState(defaults[INVOICE_EMAIL_TEMPLATE_KEY_HTML])
  const [paymentInstructions, setPaymentInstructions] = useState('')
  const [pdfTemplatePath, setPdfTemplatePath] = useState<string | null>(null)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const htmlFileRef = useRef<HTMLInputElement>(null)
  const pdfFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      if (!orgId) return
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('orgs')
        .select('email_templates, invoice_payment_instructions, invoice_pdf_template_path')
        .eq('id', orgId)
        .single()

      if (loadError) {
        setError('Could not load invoice template settings.')
      } else if (data) {
        const templates = (data.email_templates as Record<string, string>) ?? {}
        setSubject(templates[INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT] ?? defaults[INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT])
        setHtml(templates[INVOICE_EMAIL_TEMPLATE_KEY_HTML] ?? defaults[INVOICE_EMAIL_TEMPLATE_KEY_HTML])
        setPaymentInstructions((data.invoice_payment_instructions as string) ?? '')
        const path = (data.invoice_pdf_template_path as string) ?? null
        setPdfTemplatePath(path)
        setPdfFileName(path ? path.split('/').pop() ?? 'template.pdf' : null)
      }
      setLoading(false)
    }
    load()
  }, [orgId])

  const preview = useMemo(
    () => buildInvoiceEmailPreview(subject, html, primaryColor),
    [subject, html, primaryColor]
  )

  const isCustom =
    subject !== defaults[INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT] ||
    html !== defaults[INVOICE_EMAIL_TEMPLATE_KEY_HTML]

  function handleHtmlFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setHtml(reader.result)
    }
    reader.readAsText(file)
    e.target.value = ''
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

  async function handleSave() {
    if (!orgId) return
    if (!subject.trim() || !html.trim()) {
      setError('Subject and HTML body are required.')
      return
    }
    setSaving(true)
    setError('')
    const { data: existing } = await supabase
      .from('orgs')
      .select('email_templates')
      .eq('id', orgId)
      .single()

    const mergedTemplates = {
      ...((existing?.email_templates as Record<string, string>) ?? {}),
      [INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT]: subject.trim(),
      [INVOICE_EMAIL_TEMPLATE_KEY_HTML]: html.trim(),
    }

    const { error: saveError } = await supabase
      .from('orgs')
      .update({
        email_templates: mergedTemplates,
        invoice_payment_instructions: paymentInstructions.trim() || null,
        invoice_pdf_template_path: pdfTemplatePath,
      })
      .eq('id', orgId)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    setSubject(defaults[INVOICE_EMAIL_TEMPLATE_KEY_SUBJECT])
    setHtml(defaults[INVOICE_EMAIL_TEMPLATE_KEY_HTML])
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading invoice templates…</p>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span className="text-sm font-semibold text-gray-700">🧾 Invoice Email Template</span>
          {isCustom && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
              Custom
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 pt-3">
            Used when you tap <strong>Send invoice</strong> at job completion. Paste HTML or upload a
            .html file. Optional PDF is attached to every invoice email.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {INVOICE_TEMPLATE_PLACEHOLDERS.map((tag) => (
              <code key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {tag}
              </code>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500">HTML body</label>
              <button
                type="button"
                onClick={() => htmlFileRef.current?.click()}
                className="text-xs text-[var(--color-primary)] font-medium flex items-center gap-1"
              >
                <Upload size={12} /> Upload .html
              </button>
              <input ref={htmlFileRef} type="file" accept=".html,text/html" className="hidden" onChange={handleHtmlFileUpload} />
            </div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Payment instructions</label>
            <textarea
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              rows={3}
              placeholder="Bank: BSB 000-000 Acc 12345678&#10;Reference: invoice number&#10;Or call 1300…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-400 mt-1">Merged as {'{{paymentInstructions}}'} in the email body</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">PDF attachment (optional)</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => pdfFileRef.current?.click()}
                disabled={uploadingPdf}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                {uploadingPdf ? 'Uploading…' : 'Upload PDF template'}
              </button>
              {pdfFileName && <span className="text-xs text-gray-500 truncate">{pdfFileName}</span>}
              <input ref={pdfFileRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              {showPreview ? 'Hide preview' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
            >
              <RotateCcw size={12} /> Reset to default
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              <Save size={12} /> {saving ? 'Saving…' : 'Save invoice template'}
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
          {saved && <p className="text-xs text-green-600">Invoice template saved.</p>}

          {showPreview && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <p className="text-xs font-semibold text-gray-500 px-3 py-2 bg-gray-50 border-b border-gray-200">
                Subject: {preview.subject}
              </p>
              <iframe
                title="Invoice email preview"
                srcDoc={preview.html}
                className="w-full h-64 bg-white"
                sandbox=""
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
