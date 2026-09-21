import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface ThreadEvent {
  id: string
  event_type: string
  note: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

interface Props {
  leadId: string
  orgId: string
  twoWayEnabled: boolean
  sending?: boolean
  onSend: (text: string) => void
}

function isInbound(event: ThreadEvent): boolean {
  if (event.event_type === 'sms_received') return true
  return event.payload?.inbound === true
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function LeadSmsThread({
  leadId,
  orgId,
  twoWayEnabled,
  sending = false,
  onSend,
}: Props) {
  const [events, setEvents] = useState<ThreadEvent[]>([])
  const [draft, setDraft] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('lead_events')
      .select('id, event_type, note, payload, created_at')
      .eq('lead_id', leadId)
      .eq('org_id', orgId)
      .in('event_type', ['sms_sent', 'sms_received', 'sms_opt_out'])
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      setLoadError('Could not load messages.')
      return
    }
    setLoadError(null)
    setEvents((data ?? []) as ThreadEvent[])
  }, [leadId, orgId])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel(`lead-sms-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_events',
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          void load()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadId, load])

  const trimmed = draft.trim()

  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 bg-gray-50">
        Messages
      </p>
      <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-2">
        {loadError && <p className="text-xs text-red-600">{loadError}</p>}
        {!loadError && events.length === 0 && (
          <p className="text-xs text-gray-400">No SMS yet.</p>
        )}
        {events.map((event) => {
          const inbound = isInbound(event)
          const optOut = event.event_type === 'sms_opt_out'
          return (
            <div
              key={event.id}
              className={`flex ${inbound || optOut ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  optOut
                    ? 'bg-gray-100 text-gray-600'
                    : inbound
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-[var(--color-primary)] text-white'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {event.note || (optOut ? 'Customer opted out of SMS' : '')}
                </p>
                <p className={`text-[10px] mt-1 ${inbound || optOut ? 'text-gray-400' : 'text-white/70'}`}>
                  {formatTime(event.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {twoWayEnabled && (
        <form
          className="flex gap-2 p-2 border-t border-gray-100"
          onSubmit={(e) => {
            e.preventDefault()
            if (!trimmed || sending) return
            onSend(trimmed)
            setDraft('')
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply by SMS…"
            disabled={sending}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!trimmed || sending}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--color-primary)] disabled:opacity-40"
          >
            {sending ? 'Sending' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}
