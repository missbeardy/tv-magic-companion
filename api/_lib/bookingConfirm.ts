import { sendBrandedSms } from './sendBrandedSms.js'
import { getSupabaseAdmin } from './supabaseAdmin.js'
import { escapeHtml } from './emailTemplates.js'
import { sendTransactionalEmail } from './sendTransactionalEmail.js'

export interface BookingConfirmInput {
  orgId: string
  leadId?: string | null
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  serviceType?: string | null
  startTimeIso: string
  endTimeIso: string
  techName?: string | null
  address?: string | null
}

function formatAuDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function buildIcs(params: {
  uid: string
  summary: string
  description: string
  location: string
  startIso: string
  endIso: string
  orgName: string
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TV Magic Companion//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(params.startIso)}`,
    `DTEND:${toIcsUtc(params.endIso)}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
    `LOCATION:${escapeIcsText(params.location)}`,
    `ORGANIZER;CN=${escapeIcsText(params.orgName)}:MAILTO:noreply@example.com`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

export async function sendBookingConfirmations(
  input: BookingConfirmInput
): Promise<{ smsSent: boolean; smsMessage: string; emailSent: boolean; emailMessage: string }> {
  const supabase = getSupabaseAdmin()
  const { data: org } = supabase
    ? await supabase.from('orgs').select('name').eq('id', input.orgId).maybeSingle()
    : { data: null }

  const orgName = (org?.name as string) || 'Your organisation'
  const dateTime = formatAuDateTime(input.startTimeIso)
  const techName = input.techName?.trim() || ''
  const techLine = techName ? ` Your technician is ${techName}.` : ''
  const serviceType = input.serviceType?.trim() || 'Appointment'

  let smsSent = false
  let smsMessage = 'No customer phone; SMS skipped.'
  if (input.customerPhone?.trim()) {
    const result = await sendBrandedSms({
      orgId: input.orgId,
      toPhone: input.customerPhone.trim(),
      templateKey: 'customer_booking_confirm',
      vars: {
        customerName: input.customerName,
        dateTime,
        techLine,
        serviceType,
      },
      fallbackMessage: `Hi {{customerName}}, {{org.name}} booked you in for {{dateTime}}.{{techLine}} See you then!`,
      leadId: input.leadId ?? undefined,
      eventType: 'booking_confirm_sms',
      eventNote: 'Customer booking confirmation SMS sent',
      eventPayload: { start_time: input.startTimeIso },
    })
    smsSent = result.sent
    smsMessage = result.sent
      ? `Booking SMS sent to ${input.customerPhone.trim()}.`
      : result.error || result.skipped || 'Booking SMS failed.'
  }

  let emailSent = false
  let emailMessage = 'No customer email; email skipped.'
  if (input.customerEmail?.trim()) {
    const ics = buildIcs({
      uid: `${input.leadId || 'booking'}-${Date.parse(input.startTimeIso)}@tv-magic-companion`,
      summary: `${serviceType} — ${orgName}`,
      description: `Booking with ${orgName}.${techLine}`,
      location: input.address?.trim() || '',
      startIso: input.startTimeIso,
      endIso: input.endTimeIso,
      orgName,
    })
    const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px">
  <h2>Booking confirmed</h2>
  <p>Hi ${escapeHtml(input.customerName)},</p>
  <p>Your appointment with <strong>${escapeHtml(orgName)}</strong> is booked for <strong>${escapeHtml(dateTime)}</strong>.</p>
  ${techName ? `<p>Technician: ${escapeHtml(techName)}</p>` : ''}
  ${input.address?.trim() ? `<p>Address: ${escapeHtml(input.address.trim())}</p>` : ''}
  <p>A calendar invite (.ics) is attached.</p>
</div>`

    const emailResult = await sendTransactionalEmail({
      to: input.customerEmail.trim(),
      subject: `Booking confirmed — ${orgName}`,
      html,
      from: process.env.BOOKING_EMAIL_FROM || process.env.EMAIL_FROM,
      attachments: [
        {
          filename: 'booking.ics',
          content: Buffer.from(ics, 'utf8'),
        },
      ],
    })
    emailSent = emailResult.sent
    emailMessage = emailResult.message
  }

  return { smsSent, smsMessage, emailSent, emailMessage }
}
