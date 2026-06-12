// src/hooks/useTechLocation.ts
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useTechLocation(userId: string | null, locationEnabled: boolean) {
  useEffect(() => {
    if (!userId || !locationEnabled || !navigator.geolocation) return

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

    const opts: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }

    navigator.geolocation.getCurrentPosition(update, fail, opts)

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(update, fail, opts)
    }, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [userId, locationEnabled])
}