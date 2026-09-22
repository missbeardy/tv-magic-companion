import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'

export function useTechLocation(userId: string | null) {
  const { profile } = useAuth()
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg()
  const techLocationEnabled = !featureSwitchesLoading && isFeatureEnabled('tech_location')

  useEffect(() => {
    if (!techLocationEnabled) return
    if (!userId || !profile?.location_enabled || profile?.role !== 'employee') return
    if (!navigator.geolocation) return

    const update = (position: GeolocationPosition) => {
      supabase
        .from('profiles')
        .update({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          location_updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) console.warn('Could not save location:', error.message)
        })
    }

    const fail = (err: GeolocationPositionError) =>
      console.info('Geolocation not available:', err.message)

    const opts: PositionOptions = {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    }

    // A backgrounded tab still fires setInterval, spending battery and quota on a
    // location nobody's dashboard is showing. Poll only while the tab is visible.
    let interval: ReturnType<typeof setInterval> | null = null

    const poll = () => navigator.geolocation.getCurrentPosition(update, fail, opts)

    const startPolling = () => {
      if (interval) return
      poll()
      interval = setInterval(poll, 10 * 60 * 1000)
    }

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') startPolling()
      else stopPolling()
    }

    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopPolling()
    }
  }, [userId, profile?.location_enabled, profile?.role, techLocationEnabled])
}
