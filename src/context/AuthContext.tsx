import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { normalizeRole } from '../lib/roles'

export type UserRole = 'manager' | 'employee' | 'platform_admin'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  org_id: string
  avatar_url?: string
  phone?: string
  suburb?: string
  lat?: number | null
  lng?: number | null
  location_updated_at?: string | null
  location_enabled?: boolean
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>
  establishSession: (user: User, profile: Profile) => void
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  setProfile: () => {},
  establishSession: () => {},
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  function applyProfileRow(row: Profile) {
    const role = normalizeRole(row.role) ?? row.role
    setProfile({ ...row, role: role as UserRole })
  }

  function establishSession(user: User, profile: Profile) {
    setUser(user)
    applyProfileRow(profile)
    setLoading(false)
  }

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch profile:', error)
      return false
    }

    if (data) {
      applyProfileRow(data as Profile)
      return true
    }

    // RLS can return empty without error — don't wipe a profile Login just loaded
    setProfile((prev) => (prev?.id === userId ? prev : null))
    return false
  }

  useEffect(() => {
    let cancelled = false

    async function initAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id)
      }
      if (!cancelled) setLoading(false)
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        if (session?.user) {
          setLoading(true)
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }
        if (!cancelled) setLoading(false)
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, establishSession, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export type { Profile, UserRole }
export const useAuth = () => useContext(AuthContext)