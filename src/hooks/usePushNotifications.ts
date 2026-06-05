import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// This converts the VAPID key to a format browsers understand
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

  // Check if browser supports push
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window
    setIsSupported(supported)
    
    if (supported) {
      checkSubscription()
    }
  }, [])

  // Check if already subscribed
  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setIsSubscribed(!!sub)
      if (sub) saveSubscription(sub)
    } catch (err) {
      console.log('No existing subscription')
    }
  }

  // Ask user for permission and subscribe
  const subscribe = async () => {
    if (!isSupported) return
    
    setLoading(true)
    try {
      // Ask browser for permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('You need to allow notifications to use this feature')
        setLoading(false)
        return
      }

      // Get the service worker
      const reg = await navigator.serviceWorker.ready
      
      // Get VAPID key from .env
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        alert('Push notifications not configured yet')
        setLoading(false)
        return
      }

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })

      // Save to Supabase
      await saveSubscription(sub)
      
      // Update profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ push_enabled: true }).eq('id', user.id)
      }

      setIsSubscribed(true)
      alert('Push notifications enabled!')
    } catch (err) {
      console.error('Subscribe failed:', err)
      alert('Failed to enable notifications')
    } finally {
      setLoading(false)
    }
  }

  // Unsubscribe
  const unsubscribe = async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        // Remove from Supabase
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('push_subscriptions').delete().eq('user_id', user.id)
          await supabase.from('profiles').update({ push_enabled: false }).eq('id', user.id)
        }
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('Unsubscribe failed:', err)
    } finally {
      setLoading(false)
    }
  }

  // Save subscription to Supabase
  const saveSubscription = async (sub: PushSubscription) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const subJson = sub.toJSON()
    await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth
    }, { onConflict: 'endpoint' })
  }

  return { isSupported, isSubscribed, subscribe, unsubscribe, loading }
}