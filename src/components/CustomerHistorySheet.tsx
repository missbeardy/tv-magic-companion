import { useEffect, useState } from 'react'
import BottomSheet from './BottomSheet'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/timeAgo'
import { formatLocalityLabelFromAddress } from '../lib/extractSuburb'
import { LEAD_STATUS_LABELS } from '../lib/leadsKanban'

interface HistoryRow {
  id: string
  service_type: string | null
  status: string
  created_at: string
  address: string | null
}

/** Badge styling per status, mirroring the kanban column badges. */
const STATUS_BADGE: Record<string, string> = {
  unassigned: 'bg-gray-100 text-gray-600',
  assigned: 'bg-violet-100 text-violet-700',
  contact_attempted: 'bg-amber-100 text-amber-700',
  booked: 'bg-indigo-100 text-indigo-700',
  booking_cancelled: 'bg-red-100 text-red-700',
  lost: 'bg-red-100 text-red-600',
  completed: 'bg-purple-100 text-purple-700',
  expired: 'bg-gray-100 text-gray-500',
}

interface Props {
  isOpen: boolean
  onClose: () => void
  customerId: string
  currentLeadId: string
}

export default function CustomerHistorySheet({ isOpen, onClose, customerId, currentLeadId }: Props) {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!isOpen || !customerId) return
    let cancelled = false
    setLoading(true)
    setError(false)

    supabase
      .from('leads')
      .select('id, service_type, status, created_at, address')
      .eq('customer_id', customerId)
      .neq('id', currentLeadId)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          console.error('CustomerHistorySheet fetch failed:', err.message)
          setError(true)
          setRows([])
        } else {
          setRows((data ?? []) as HistoryRow[])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, customerId, currentLeadId])

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Previous jobs">
      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-6 text-center">Could not load previous jobs.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">First job for this customer.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((row) => {
            const locality = formatLocalityLabelFromAddress(row.address)
            const badge = STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'
            const statusLabel = LEAD_STATUS_LABELS[row.status] ?? row.status
            return (
              <li key={row.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">
                    {row.service_type || 'No service type'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {timeAgo(row.created_at)}
                    {locality ? ` · ${locality}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge}`}
                >
                  {statusLabel}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </BottomSheet>
  )
}
