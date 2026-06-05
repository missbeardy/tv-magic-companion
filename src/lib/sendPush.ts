// src/lib/sendPush.ts
import { supabase } from './supabase'

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = '/leads'
) {
  try {
    const { error } = await supabase.functions.invoke('push-notify', {
      body: {
        user_id: userId,
        title,
        body,
        url
      }
    })
    
    if (error) {
      console.error('Push function error:', error)
      return false
    }
    
    console.log('Push sent successfully to user:', userId)
    return true
  } catch (err) {
    console.error('Push failed:', err)
    return false
  }
}