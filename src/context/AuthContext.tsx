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
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  setProfile: () => {},
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch profile:', error)
      // Keep existing profile on transient/RLS errors — avoids login bounce loop
      return
    }

    if (data) {
      const row = data as Profile
      const role = normalizeRole(row.role) ?? row.role
      setProfile({ ...row, role: role as UserRole })
    } else {
      setProfile(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id).finally(() => setLoading(false))
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export type { Profile, UserRole }
export const useAuth = () => useContext(AuthContext)