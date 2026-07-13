import type { LucideIcon } from 'lucide-react'
import {
  UserPlus,
  RefreshCw,
  Phone,
  MessageSquare,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  XCircle,
  Clock,
  UserMinus,
  Star,
  Inbox,
  Ban,
  PhoneMissed,
  CircleDot,
  Receipt,
  Trash2,
} from 'lucide-react'
import type { LeadEventType } from './leadEventPayload'

export interface FormattedLeadEvent {
  text: string
  icon: LucideIcon
  iconColour: string
}

export interface FormatLeadEventInput {
  eventType: string
  note?: string | null
  payload?: Record<string, unknown> | null
  actorName?: string | null
  leadName?: string | null
}

const EVENT_META: Record<
  LeadEventType,
  { icon: LucideIcon; iconColour: string; template: (who: string, lead: string) => string }
> = {
  created: {
    icon: Inbox,
    iconColour: 'bg-blue-500',
    template: (who, lead) => `${who} created ${lead}`,
  },
  duplicate_blocked: {
    icon: Ban,
    iconColour: 'bg-gray-500',
    template: (_who, lead) => `Duplicate blocked for ${lead}`,
  },
  missed_call_again: {
    icon: PhoneMissed,
    iconColour: 'bg-amber-500',
    template: (_who, lead) => `Missed call again — ${lead}`,
  },
  assigned: {
    icon: UserPlus,
    iconColour: 'bg-indigo-500',
    template: (who, lead) => `${who} assigned ${lead}`,
  },
  status_change: {
    icon: RefreshCw,
    iconColour: 'bg-slate-500',
    template: (who, lead) => `${who} updated ${lead}`,
  },
  contact_attempted: {
    icon: Phone,
    iconColour: 'bg-teal-500',
    template: (who, lead) => `${who} contacted ${lead}`,
  },
  contact_note: {
    icon: MessageSquare,
    iconColour: 'bg-amber-600',
    template: (who, lead) => `${who} noted on ${lead}`,
  },
  call_attempted: {
    icon: Phone,
    iconColour: 'bg-teal-500',
    template: (who, lead) => `${who} called ${lead}`,
  },
  sms_attempted: {
    icon: MessageSquare,
    iconColour: 'bg-cyan-500',
    template: (who, lead) => `${who} texted ${lead}`,
  },
  second_attempt_started: {
    icon: Clock,
    iconColour: 'bg-red-500',
    template: (_who, lead) => `${lead} — second contact attempt`,
  },
  third_attempt_started: {
    icon: Clock,
    iconColour: 'bg-red-600',
    template: (_who, lead) => `${lead} — third contact attempt`,
  },
  fourth_attempt_started: {
    icon: Clock,
    iconColour: 'bg-red-600',
    template: (_who, lead) => `${lead} — fourth contact attempt`,
  },
  fifth_attempt_started: {
    icon: Clock,
    iconColour: 'bg-red-700',
    template: (_who, lead) => `${lead} — fifth contact attempt`,
  },
  sixth_attempt_started: {
    icon: Clock,
    iconColour: 'bg-red-800',
    template: (_who, lead) => `${lead} — sixth contact attempt`,
  },
  booked: {
    icon: CalendarCheck,
    iconColour: 'bg-green-500',
    template: (who, lead) => `${who} booked ${lead}`,
  },
  booking_cancelled: {
    icon: CalendarX,
    iconColour: 'bg-red-400',
    template: (who, lead) => `${who} cancelled booking for ${lead}`,
  },
  completed: {
    icon: CheckCircle2,
    iconColour: 'bg-emerald-500',
    template: (who, lead) => `${who} completed ${lead}`,
  },
  lost: {
    icon: XCircle,
    iconColour: 'bg-red-500',
    template: (who, lead) => `${who} marked ${lead} as lost`,
  },
  expired: {
    icon: Clock,
    iconColour: 'bg-orange-500',
    template: (_who, lead) => `${lead} expired`,
  },
  unassigned: {
    icon: UserMinus,
    iconColour: 'bg-amber-500',
    template: (who, lead) => `${who} unassigned ${lead}`,
  },
  review_request: {
    icon: Star,
    iconColour: 'bg-yellow-500',
    template: (who, lead) => `${who} sent review request for ${lead}`,
  },
  sms_sent: {
    icon: MessageSquare,
    iconColour: 'bg-cyan-500',
    template: (_who, lead) => `SMS sent to ${lead}`,
  },
  invoice_sent: {
    icon: Receipt,
    iconColour: 'bg-violet-500',
    template: (who, lead) => `${who} emailed invoice to ${lead}`,
  },
  invoice_paid_manual: {
    icon: Receipt,
    iconColour: 'bg-green-600',
    template: (who, lead) => `${who} marked invoice paid for ${lead}`,
  },
  deleted: {
    icon: Trash2,
    iconColour: 'bg-red-500',
    template: (who, lead) => `${who} removed ${lead}`,
  },
}

function leadLabel(leadName?: string | null): string {
  return leadName?.trim() ? leadName.trim() : 'a lead'
}

function actorLabel(actorName?: string | null): string {
  return actorName?.trim() ? actorName.trim() : 'Someone'
}

function statusChangeText(
  who: string,
  lead: string,
  payload?: Record<string, unknown> | null
): string {
  const to = payload?.to_status
  if (typeof to === 'string' && to) {
    return `${who} moved ${lead} to ${to.replace(/_/g, ' ')}`
  }
  return `${who} updated ${lead}`
}

export function formatLeadEventDisplay(input: FormatLeadEventInput): FormattedLeadEvent {
  const who = actorLabel(input.actorName)
  const lead = leadLabel(input.leadName)
  const eventType = input.eventType as LeadEventType
  const meta = EVENT_META[eventType] ?? {
    icon: CircleDot,
    iconColour: 'bg-gray-400',
    template: (w: string, l: string) => `${w} updated ${l}`,
  }

  if (input.note?.trim()) {
    return {
      text: `${who}: ${input.note.trim()}`,
      icon: meta.icon,
      iconColour: meta.iconColour,
    }
  }

  if (eventType === 'status_change') {
    return {
      text: statusChangeText(who, lead, input.payload),
      icon: meta.icon,
      iconColour: meta.iconColour,
    }
  }

  if (eventType === 'expired') {
    const assigneeName = input.payload?.previous_assignee_name
    const assignee =
      typeof assigneeName === 'string' && assigneeName.trim() ? assigneeName.trim() : null
    return {
      text: assignee
        ? `${lead} assign timer expired (${assignee} did not act in time)`
        : meta.template(who, lead),
      icon: meta.icon,
      iconColour: meta.iconColour,
    }
  }

  return {
    text: meta.template(who, lead),
    icon: meta.icon,
    iconColour: meta.iconColour,
  }
}
