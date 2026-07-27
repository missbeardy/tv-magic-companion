import { useMemo, useRef } from 'react'
import {
  EMAIL_TEMPLATE_PLACEHOLDERS,
  compileEmailDoc,
  defaultButtonHref,
  type EmailTemplateDoc,
  type EmailTemplateId,
} from '../../../shared/emailTemplateDocs'
import { interpolateTemplate } from '../../lib/brandTemplates'

interface Props {
  templateId: EmailTemplateId
  doc: EmailTemplateDoc
  onChange: (doc: EmailTemplateDoc) => void
  primaryColor: string
  logoUrl?: string | null
  previewVars: Record<string, string>
  orgName?: string
}

export default function EmailTemplateBuilder({
  templateId,
  doc,
  onChange,
  primaryColor,
  logoUrl,
  previewVars,
  orgName,
}: Props) {
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const placeholders = EMAIL_TEMPLATE_PLACEHOLDERS[templateId]
  const showButtonFields = templateId === 'quote' || doc.buttonLabel.trim().length > 0

  const compiled = useMemo(
    () => compileEmailDoc(doc, { primaryColor, logoUrl, templateId }),
    [doc, primaryColor, logoUrl, templateId]
  )

  const preview = useMemo(() => {
    const vars = {
      ...previewVars,
      primaryColor,
      'org.name': orgName ?? previewVars['org.name'] ?? 'Sample Franchise',
    }
    return {
      subject: interpolateTemplate(compiled.subject, vars),
      html: interpolateTemplate(compiled.html, vars),
    }
  }, [compiled, previewVars, primaryColor, orgName])

  function insertPlaceholder(tag: string) {
    const el = bodyRef.current
    if (!el) {
      onChange({ ...doc, body: `${doc.body}${doc.body ? ' ' : ''}${tag}` })
      return
    }
    const start = el.selectionStart ?? doc.body.length
    const end = el.selectionEnd ?? start
    const next = `${doc.body.slice(0, start)}${tag}${doc.body.slice(end)}`
    onChange({ ...doc, body: next })
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + tag.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
        <input
          type="text"
          value={doc.subject}
          onChange={(e) => onChange({ ...doc, subject: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-3">
        {/* Edit window */}
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-600">Edit</span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={doc.showLogo}
                onChange={(e) => onChange({ ...doc, showLogo: e.target.checked })}
                className="rounded border-gray-300"
              />
              Show logo
            </label>
          </div>

          <div className="p-3 border-b border-gray-100 space-y-2">
            <input
              type="text"
              value={doc.heading}
              onChange={(e) => onChange({ ...doc, heading: e.target.value })}
              placeholder="Heading (optional)"
              className="w-full border-0 border-b border-transparent focus:border-gray-200 rounded-none px-0 py-1 text-lg font-semibold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-0"
              style={{ color: doc.heading ? primaryColor : undefined }}
            />
          </div>

          <textarea
            ref={bodyRef}
            value={doc.body}
            onChange={(e) => onChange({ ...doc, body: e.target.value })}
            placeholder="Write your email…"
            rows={12}
            className="w-full min-h-[240px] px-3 py-3 text-sm leading-relaxed text-gray-800 border-0 resize-y focus:outline-none focus:ring-0"
          />

          {showButtonFields && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/80 space-y-2">
              <input
                type="text"
                value={doc.buttonLabel}
                onChange={(e) => {
                  const label = e.target.value
                  onChange({
                    ...doc,
                    buttonLabel: label,
                    buttonHref: label.trim()
                      ? doc.buttonHref || defaultButtonHref(templateId)
                      : '',
                  })
                }}
                placeholder="Button label (optional)"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white"
              />
              {doc.buttonLabel.trim() && (
                <input
                  type="text"
                  value={doc.buttonHref}
                  onChange={(e) => onChange({ ...doc, buttonHref: e.target.value })}
                  placeholder="Button link — e.g. {{acceptanceUrl}}"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white"
                />
              )}
            </div>
          )}

          <div className="px-3 py-2 border-t border-gray-100 bg-white">
            <p className="text-[10px] text-gray-400 mb-1.5">Tap to insert into body</p>
            <div className="flex flex-wrap gap-1">
              {placeholders.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertPlaceholder(tag)}
                  className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live preview — full width below edit */}
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-600">Live preview</span>
          </div>
          <p className="text-xs text-gray-500 px-3 py-2 border-b border-gray-100 truncate">
            <span className="font-medium text-gray-600">Subject:</span> {preview.subject}
          </p>
          <iframe
            title={`${templateId} email preview`}
            srcDoc={preview.html}
            className="w-full h-[420px] bg-white"
            sandbox=""
          />
        </div>
      </div>
    </div>
  )
}
