import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadLocalEnvIfNeeded } from './loadLocalEnv.js'

let admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient | null {
  loadLocalEnvIfNeeded()
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  if (!admin) {
    admin = createClient(url, key)
  }
  return admin
}
