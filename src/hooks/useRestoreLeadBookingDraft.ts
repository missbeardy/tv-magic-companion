import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { hasLeadBookingDraft, loadEventModalDraft } from '../lib/eventModalDraft'

interface LeadLike {
  id: string
}

export function useRestoreLeadBookingDraft<T extends LeadLike>(
  userId: string | undefined,
  orgId: string | undefined,
  leads: T[],
  setBookingLead: (lead: T | null) => void,
  bookingLead: T | null,
) {
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (attemptedRef.current || !userId || !orgId || bookingLead) return
    if (!hasLeadBookingDraft(userId)) return

    const draft = loadEventModalDraft(userId)
    const leadId = draft?.leadId
    if (!leadId) return

    const found = leads.find((lead) => lead.id === leadId)
    if (found) {
      attemptedRef.current = true
      setBookingLead(found)
      return
    }

    let cancelled = false
    supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        attemptedRef.current = true
        setBookingLead(data as T)
      })

    return () => {
      cancelled = true
    }
  }, [userId, orgId, leads, bookingLead, setBookingLead])
}
