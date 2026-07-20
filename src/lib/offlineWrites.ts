import { supabase } from './supabase'
import { asLeadUpdate } from './dbTypes'
import { logLeadEvent } from './leadEvents'
import { enqueueCompletion, enqueueLeadNote } from './offlineQueue'
import { isNetworkError } from './fetchWithTimeout'

/** Whether a write reached the server ('online') or was stored for later sync ('queued'). */
export type OfflineWriteMode = 'online' | 'queued'

/**
 * Conflict guard for replaying a queued completion. A completion only applies if
 * the lead isn't already in a terminal state — protects against double-completion
 * when the same lead was completed (or lost) from another device while offline.
 */
export function shouldApplyQueuedCompletion(currentStatus: string | null | undefined): boolean {
  return currentStatus !== 'completed' && currentStatus !== 'lost'
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

/** Outcome of a checked lead write. `network` distinguishes "retry later" from a server rejection. */
export type LeadWriteOutcome =
  | { ok: true }
  | { ok: false; network: boolean; message: string }

/**
 * Run a `leads` update and report the outcome instead of discarding it. Callers
 * decide what to do with a failure — queue it, show a retry toast, etc. — so a
 * failed status write can never silently evaporate on weak signal.
 */
export async function runLeadUpdate(
  leadId: string,
  update: Record<string, unknown>
): Promise<LeadWriteOutcome> {
  try {
    const { error } = await supabase.from('leads').update(asLeadUpdate(update)).eq('id', leadId)
    if (error) return { ok: false, network: false, message: error.message }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      network: isNetworkError(err),
      message: err instanceof Error ? err.message : 'Update failed',
    }
  }
}

interface CompleteLeadParams {
  leadId: string
  orgId: string
  actorId: string | null
  fromStatus: string
  leadName: string
}

/**
 * Mark a lead completed, or queue the completion when offline / on connection loss.
 * Resolves to the mode used. Throws only when the write cannot even be queued
 * (so callers can withhold the success UI), or on a genuine server rejection.
 */
export async function completeLeadOrEnqueue(p: CompleteLeadParams): Promise<OfflineWriteMode> {
  if (isOffline()) {
    await enqueueCompletion({
      leadId: p.leadId,
      orgId: p.orgId,
      actorId: p.actorId ?? '',
      fromStatus: p.fromStatus,
      leadName: p.leadName,
    })
    return 'queued'
  }

  try {
    const { error } = await supabase
      .from('leads')
      .update(asLeadUpdate({ status: 'completed' }))
      .eq('id', p.leadId)
    if (error) throw new Error(error.message)
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueCompletion({
        leadId: p.leadId,
        orgId: p.orgId,
        actorId: p.actorId ?? '',
        fromStatus: p.fromStatus,
        leadName: p.leadName,
      })
      return 'queued'
    }
    throw err
  }

  // Best-effort audit event — mirrors the rest of the codebase (never blocks the write).
  await logLeadEvent({
    leadId: p.leadId,
    orgId: p.orgId,
    eventType: 'completed',
    note: 'Job marked complete via checklist',
    actorId: p.actorId,
    payload: { from_status: p.fromStatus, to_status: 'completed', source: 'completion_checklist' },
  })
  return 'online'
}

interface SaveLeadNoteParams {
  leadId: string
  orgId: string
  actorId: string | null
  note: string
}

/**
 * Save a contact note, or queue it when offline / on connection loss.
 * Throws on a genuine server rejection or when it cannot be queued.
 */
export async function saveLeadNoteOrEnqueue(p: SaveLeadNoteParams): Promise<OfflineWriteMode> {
  const trimmed = p.note.trim()

  if (isOffline()) {
    await enqueueLeadNote({
      leadId: p.leadId,
      orgId: p.orgId,
      actorId: p.actorId ?? '',
      note: trimmed,
    })
    return 'queued'
  }

  try {
    const { error } = await logLeadEvent({
      leadId: p.leadId,
      orgId: p.orgId,
      eventType: 'contact_note',
      note: trimmed,
      actorId: p.actorId,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueLeadNote({
        leadId: p.leadId,
        orgId: p.orgId,
        actorId: p.actorId ?? '',
        note: trimmed,
      })
      return 'queued'
    }
    throw err
  }

  return 'online'
}
