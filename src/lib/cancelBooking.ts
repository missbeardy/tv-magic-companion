import { supabase } from './supabase'
import { logLeadEvent } from './leadEvents'
import { isManagerRole } from './roles'

export const SHARED_BOOKING_CANCEL_ERROR =
  'This booking includes other technicians. Ask a manager to cancel it.'

/**
 * A non-manager may only cancel a shared (booking_group_id) booking when every
 * event in it is their own. events_delete RLS would otherwise delete just their
 * rows and silently leave the other technicians' events on the calendar.
 */
export function isGroupCancelBlocked(
  ownerIds: ReadonlyArray<string | null>,
  actorId: string,
  actorRole?: string | null
): boolean {
  if (isManagerRole(actorRole)) return false
  return ownerIds.some((ownerId) => ownerId !== actorId)
}

export interface CancelBookingParams {
  eventId: string
  leadId?: string | null
  bookingGroupId?: string | null
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
    bookingGroupId,
    orgId,
    actorId,
    actorRole,
    title,
    reason,
    appointmentDate,
  } = params

  if (bookingGroupId) {
    const { data: groupRows, error: groupError } = await supabase
      .from('events')
      .select('user_id')
      .eq('booking_group_id', bookingGroupId)
    if (groupError) return { error: groupError.message }
    if (isGroupCancelBlocked((groupRows ?? []).map((row) => row.user_id), actorId, actorRole)) {
      return { error: SHARED_BOOKING_CANCEL_ERROR }
    }
  }

  const deleteQuery = bookingGroupId
    ? supabase.from('events').delete().eq('booking_group_id', bookingGroupId)
    : supabase.from('events').delete().eq('id', eventId)

  // RLS turns a disallowed delete into "0 rows", not an error — without this
  // check the lead would be marked booking_cancelled while the event stays put.
  const { data: deletedRows, error: deleteError } = await deleteQuery.select('id')
  if (deleteError) return { error: deleteError.message }
  if (!deletedRows?.length) return { error: 'You do not have permission to cancel this booking.' }

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
