import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setIsSupported(supported)
    if (supported) {
      checkSubscription()
    }
  }, [])

  // Only checks — does NOT save on load (that was causing unnecessary DB writes)
  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setIsSubscribed(!!sub)
    } catch {
      // No existing subscription — this is normal, not an error
    }
  }

  const subscribe = async (): Promise<boolean> => {
    if (!isSupported) return false

    setLoading(true)
    setError(null)

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Notification permission was denied. Please allow notifications in your browser settings.')
        setLoading(false)
        return false
      }

      const reg = await navigator.serviceWorker.ready

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setError('Push notifications are not configured yet.')
        setLoading(false)
        return false
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      await saveSubscription(sub)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ push_enabled: true }).eq('id', user.id)
      }

      setIsSubscribed(true)
      return true
    } catch (err) {
      console.error('Subscribe failed:', err)
      setError('Failed to enable push notifications. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const unsubscribe = async (): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
          await supabase.from('profiles').update({ push_enabled: false }).eq('id', user.id)
        }
      }
      setIsSubscribed(false)
      return true
    } catch (err) {
      console.error('Unsubscribe failed:', err)
      setError('Failed to disable push notifications. Please try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const saveSubscription = async (sub: PushSubscription) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const subJson = sub.toJSON()
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) return
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
      { onConflict: 'endpoint' }
    )
  }

  return { isSupported, isSubscribed, subscribe, unsubscribe, loading, error }
}