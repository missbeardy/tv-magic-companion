import { supabase } from './supabase'
import { logLeadEvent } from './leadEvents'

export interface CancelBookingParams {
  eventId: string
  leadId?: string | null
  orgId: string
  actorId: string
  actorRole?: string | null
  title?: string
  reason?: string
  appointmentDate?: string
}

async function notifyManagerOfCancellation(
  actorId: string,
  orgId: string,
  title: string
) {
  try {
    const { data: empProfile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, manager_id')
      .eq('id', actorId)
      .single()

    if (profileError || !empProfile?.manager_id) return

    const employeeName = `${empProfile.first_name || 'An employee'} ${empProfile.last_name || ''}`.trim()

    await supabase.from('notifications').insert([{
      user_id: empProfile.manager_id,
      title: 'Booking Cancelled',
      message: `${employeeName} cancelled an appointment: "${title}"`,
      type: 'calendar',
      read: false,
      org_id: orgId,
    }])
  } catch (err) {
    console.warn('Manager cancellation notification failed (non-fatal):', err)
  }
}

export async function cancelBooking(params: CancelBookingParams): Promise<{ error?: string }> {
  const {
    eventId,
    leadId,
    orgId,
    actorId,
    actorRole,
    title,
    reason,
    appointmentDate,
  } = params

  const { error: deleteError } = await supabase.from('events').delete().eq('id', eventId)
  if (deleteError) return { error: deleteError.message }

  if (leadId) {
    const { error: leadError } = await supabase
      .from('leads')
      .update({ status: 'booking_cancelled' })
      .eq('id', leadId)
    if (leadError) return { error: leadError.message }

    const noteParts = [
      title ? `Cancelled booking: "${title}"` : 'Booking cancelled',
      appointmentDate ? `(${appointmentDate})` : null,
      reason?.trim() ? `Reason: ${reason.trim()}` : null,
    ].filter(Boolean)

    await logLeadEvent({
      leadId,
      orgId,
      eventType: 'booking_cancelled',
      note: noteParts.join(' — '),
      actorId,
      payload: {
        event_id: eventId,
        reason: reason?.trim() || null,
        appointment_date: appointmentDate ?? null,
      },
    })
  }

  if (actorRole === 'employee' && title) {
    await notifyManagerOfCancellation(actorId, orgId, title)
  }

  return {}
}
