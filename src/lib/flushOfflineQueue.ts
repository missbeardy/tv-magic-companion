import { supabase } from './supabase'
import { asLeadUpdate } from './dbTypes'
import { buildContactAttemptUpdate } from './contactFollowUp'
import { buildPoolPickupUpdate, shouldPoolPickup } from './leadPoolPickup'
import { logLeadEvent } from './leadEvents'
import { LEAD_PHOTOS_BUCKET } from './leadPhotoStorage'
import { shouldApplyQueuedCompletion } from './offlineWrites'
import {
  listOfflineQueue,
  removeOfflineQueueItem,
  type OfflineContactAttemptItem,
  type OfflineCompletionItem,
  type OfflineLeadNoteItem,
  type OfflineLeadPhotoItem,
  type OfflineQueueItem,
} from './offlineQueue'

export interface FlushResult {
  processed: number
  failed: number
  remaining: number
}

async function flushContactAttempt(item: OfflineContactAttemptItem): Promise<void> {
  const leadLike = {
    id: item.leadId,
    status: item.leadStatus,
    contact_attempt_round: item.contactAttemptRound,
  }
  const attempt = buildContactAttemptUpdate(leadLike)
  const toStatus = 'contact_attempted'
  const poolPickup = shouldPoolPickup(item.leadStatus, toStatus, item.actorId)

  if (attempt.kind === 'unable_to_contact') {
    await supabase.from('leads').update(asLeadUpdate(attempt.update)).eq('id', item.leadId)
    await logLeadEvent({
      leadId: item.leadId,
      orgId: item.orgId,
      eventType: 'lost',
      note: 'Unable to contact (synced from offline queue)',
      actorId: item.actorId,
      payload: { source: 'offline_queue', kind: item.kind },
    })
    return
  }

  const updatePayload = {
    ...attempt.update,
    ...(poolPickup ? buildPoolPickupUpdate(item.leadStatus, toStatus, item.actorId) : {}),
  }

  await supabase.from('leads').update(asLeadUpdate(updatePayload)).eq('id', item.leadId)

  if (poolPickup) {
    await logLeadEvent({
      leadId: item.leadId,
      orgId: item.orgId,
      eventType: 'assigned',
      note: 'Lead picked up from pool (offline sync)',
      actorId: item.actorId,
      payload: { assigned_to: item.actorId, source: 'offline_queue' },
    })
  }

  await logLeadEvent({
    leadId: item.leadId,
    orgId: item.orgId,
    eventType: item.kind === 'call' ? 'call_attempted' : 'sms_attempted',
    note:
      item.kind === 'call'
        ? `Called ${item.leadPhone ?? ''} (synced offline)`.trim()
        : `SMS attempt logged offline for ${item.leadPhone ?? ''}`.trim(),
    actorId: item.actorId,
    payload: {
      from_status: item.leadStatus,
      to_status: toStatus,
      channel: item.kind === 'call' ? 'phone' : 'sms',
      source: 'offline_queue',
    },
  })
}

async function flushLeadPhoto(item: OfflineLeadPhotoItem): Promise<void> {
  const ext = item.fileName.includes('.') ? item.fileName.split('.').pop() : 'jpg'
  const path = `${item.orgId}/leads/${item.leadId}/${Date.now()}-${item.id.slice(0, 8)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(LEAD_PHOTOS_BUCKET)
    .upload(path, item.blob, { upsert: false, contentType: item.mimeType || 'image/jpeg' })

  if (uploadError) throw new Error(uploadError.message)

  const { error: insertError } = await supabase.from('lead_photos').insert({
    lead_id: item.leadId,
    org_id: item.orgId,
    uploaded_by: item.actorId,
    storage_path: path,
  })

  if (insertError) throw new Error(insertError.message)
}

async function flushCompletion(item: OfflineCompletionItem): Promise<void> {
  // Conflict guard: re-read the lead's current status before replaying, so a
  // completion queued offline can't overwrite a lead that was already completed
  // or lost from another device in the meantime.
  const { data, error } = await supabase
    .from('leads')
    .select('status')
    .eq('id', item.leadId)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const currentStatus = (data?.status as string | undefined) ?? ''
  if (!shouldApplyQueuedCompletion(currentStatus)) {
    console.warn(
      `Skipping queued completion for lead ${item.leadId}: already "${currentStatus}"`
    )
    return
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update(asLeadUpdate({ status: 'completed' }))
    .eq('id', item.leadId)

  if (updateError) throw new Error(updateError.message)

  await logLeadEvent({
    leadId: item.leadId,
    orgId: item.orgId,
    eventType: 'completed',
    note: 'Job marked complete via checklist (synced offline)',
    actorId: item.actorId,
    payload: {
      from_status: item.fromStatus,
      to_status: 'completed',
      source: 'offline_queue',
    },
  })
}

async function flushLeadNote(item: OfflineLeadNoteItem): Promise<void> {
  const { error } = await logLeadEvent({
    leadId: item.leadId,
    orgId: item.orgId,
    eventType: 'contact_note',
    note: item.note,
    actorId: item.actorId,
    payload: { source: 'offline_queue', original_created_at: item.createdAt },
  })
  if (error) throw new Error(error.message)
}

async function flushOne(item: OfflineQueueItem): Promise<void> {
  switch (item.type) {
    case 'contact_attempt':
      await flushContactAttempt(item)
      break
    case 'lead_photo':
      await flushLeadPhoto(item)
      break
    case 'completion':
      await flushCompletion(item)
      break
    case 'lead_note':
      await flushLeadNote(item)
      break
  }
  await removeOfflineQueueItem(item.id)
}

/** Process offline queue FIFO. Stops on first failure of an item (keeps it). */
export async function flushOfflineQueue(): Promise<FlushResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const remaining = (await listOfflineQueue()).length
    return { processed: 0, failed: 0, remaining }
  }

  const items = await listOfflineQueue()
  let processed = 0
  let failed = 0

  for (const item of items) {
    try {
      await flushOne(item)
      processed++
    } catch (err) {
      console.error('Offline flush failed for', item.id, err)
      failed++
      // Keep going so one bad photo doesn't block contact attempts
    }
  }

  const remaining = (await listOfflineQueue()).length
  return { processed, failed, remaining }
}
