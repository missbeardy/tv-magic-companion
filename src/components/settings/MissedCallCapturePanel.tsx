import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import SettingsAccordion from './SettingsAccordion'
import {
  buildCallForwardCodes,
  formatAuLineForDisplay,
} from '../../../shared/callForwardCodes'

interface Props {
  orgId: string
}

/**
 * T1.20 — shows the org's FieldBourne answering line and the one-time divert codes the
 * tradie dials so unanswered calls become leads. Read-only: lines are provisioned by ops.
 * Renders nothing until the org has a voice line, so orgs that never asked for this
 * (e.g. TV Magic on 3CX) see no change.
 */
export default function MissedCallCapturePanel({ orgId }: Props) {
  const [line, setLine] = useState<string | null>(null)
  const [lastCallAt, setLastCallAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: number }, { data: lastCall }] = await Promise.all([
        supabase
          .from('org_phone_numbers')
          .select('phone_number')
          .eq('org_id', orgId)
          .eq('kind', 'voice')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('lead_voicemails')
          .select('created_at')
          .eq('org_id', orgId)
          .eq('source', 'call_forward')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (cancelled) return
      setLine(number?.phone_number ?? null)
      setLastCallAt(lastCall?.created_at ?? null)
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500)
    } catch {
      // Clipboard can be blocked; the code is on screen to type by hand.
    }
  }

  if (!loaded || !line) return null

  return (
    <SettingsAccordion title="Missed-call capture">
      <>
        <p className="text-sm text-gray-600">
          Customers keep calling your usual number. When you don't answer, your phone
          company sends the call to your FieldBourne answering line (
          <span className="font-medium text-gray-800">{formatAuLineForDisplay(line)}</span>
          ) instead of normal voicemail. Don't give this number out. It works behind the
          scenes.
        </p>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            One-time setup: on your mobile, type each code into the phone keypad and press
            call.
          </p>
          <ul className="space-y-2">
            {buildCallForwardCodes(line).map((c) => (
              <li
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">{c.label}</p>
                  <code className="text-sm font-mono text-gray-900 break-all">{c.code}</code>
                </div>
                <button
                  type="button"
                  onClick={() => copy(c.code)}
                  aria-label={`Copy ${c.label} code`}
                  className="shrink-0 p-2 rounded-md text-gray-500 hover:bg-gray-100"
                >
                  {copied === c.code ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-gray-500">
          These replace your phone company's voicemail (e.g. Telstra MessageBank) for
          those cases. Your messages will show up here in the app instead. To test it,
          call your mobile from another phone, press decline, and leave a message.
        </p>
        <p className="text-xs text-gray-500">
          Last forwarded call:{' '}
          <span className="font-medium text-gray-700">
            {lastCallAt ? new Date(lastCallAt).toLocaleString('en-AU') : 'none yet'}
          </span>
        </p>
      </>
    </SettingsAccordion>
  )
}
