/**
 * Weekly "up for grabs" prize — the leaderboard's manager-authored spotlight. One row
 * per (org, week), off by default, with an optional photo.
 *
 * Kept separate from src/lib/leaderboard.ts (which owns the leaderboard's own week
 * maths and roster logic) rather than growing that file further, but reuses its week
 * helpers so the two features never disagree about which day a week starts on.
 */
import { supabase } from './supabase'
import { toDateKey } from './leaderboard'
import type { Database } from '../types/database.types'

export type WeeklyPrizeRow = Database['public']['Tables']['weekly_prizes']['Row']
type WeeklyPrizeInsert = Database['public']['Tables']['weekly_prizes']['Insert']

const PRIZE_PHOTO_BUCKET = 'org-assets'

export async function fetchWeekPrize(
  orgId: string,
  weekStart: Date
): Promise<WeeklyPrizeRow | null> {
  const { data, error } = await supabase
    .from('weekly_prizes')
    .select('*')
    .eq('org_id', orgId)
    .eq('week_start', toDateKey(weekStart))
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

/** One upsert per week. The `(org_id, week_start)` unique key makes this idempotent. */
export async function saveWeekPrize(input: {
  orgId: string
  weekStart: Date
  editorId: string
  title: string
  description: string
  photoUrl: string | null
  isVisible: boolean
}): Promise<void> {
  const payload: WeeklyPrizeInsert = {
    org_id: input.orgId,
    week_start: toDateKey(input.weekStart),
    title: input.title,
    description: input.description,
    photo_url: input.photoUrl,
    is_visible: input.isVisible,
    created_by: input.editorId,
    updated_by: input.editorId,
  }

  const { error } = await supabase
    .from('weekly_prizes')
    .upsert(payload, { onConflict: 'org_id,week_start' })

  if (error) throw new Error(error.message)
}

/**
 * Uploads to the existing `org-assets` bucket (already public, image-only, org-scoped
 * by path prefix) rather than a new bucket — a prize photo is low-sensitivity marketing
 * content, the same trust level as a business logo.
 */
export async function uploadPrizePhoto(
  orgId: string,
  weekStart: Date,
  file: File
): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const filePath = `${orgId}/weekly-prize-${toDateKey(weekStart)}-${Math.random().toString(36).substring(2)}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from(PRIZE_PHOTO_BUCKET)
    .upload(filePath, file, { upsert: true })

  if (uploadError) throw new Error(uploadError.message)

  const { data } = supabase.storage.from(PRIZE_PHOTO_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}
