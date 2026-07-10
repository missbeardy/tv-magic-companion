// src/lib/uploadMedia.ts
import { supabase } from './supabase'

/** Uploads to lead-photos bucket; returns storage path (not a public URL). */
export async function uploadMedia(file: File, orgId: string): Promise<string> {
  if (!orgId) throw new Error('Organisation context required for upload')

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${orgId}/social-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('lead-photos')
    .upload(path, file, { upsert: false })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  return path
}
