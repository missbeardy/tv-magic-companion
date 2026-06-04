// src/lib/uploadMedia.ts
import { supabase } from './supabase.ts'

export async function uploadMedia(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `social-uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('lead-photos')
    .upload(path, file, { upsert: false })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage
    .from('lead-photos')
    .getPublicUrl(path)

  return data.publicUrl
}