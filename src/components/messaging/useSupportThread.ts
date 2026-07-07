import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { byCreatedAsc, type SupportMessage } from '../../lib/messaging'

/**
 * Loads one support thread (all messages for a given owner user_id), keeps it
 * live via Realtime, and provides optimistic send with rollback.
 *
 * Insert relies on RLS + the server-side org_id trigger: we send only
 * { user_id, sender_id, body } — never org_id.
 */
export function useSupportThread(ownerId: string | null, myUserId: string | null) {
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const merge = useCallback((row: SupportMessage) => {
    setMessages((prev) =>
      prev.some((m) => m.id === row.id) ? prev : [...prev, row].sort(byCreatedAsc)
    )
  }, [])

  useEffect(() => {
    if (!ownerId) {
      setMessages([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)

    supabase
      .from('support_messages')
      .select('*')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setMessages((data ?? []) as SupportMessage[])
        setLoading(false)
      })

    const channel = supabase
      .channel(`support-thread-${ownerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `user_id=eq.${ownerId}`,
        },
        (payload) => {
          if (active) merge(payload.new as SupportMessage)
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [ownerId, merge])

  const remove = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const send = useCallback(
    async (rawBody: string) => {
      if (!ownerId || !myUserId) return
      const body = rawBody.trim()
      if (!body) return

      const tempId = `temp-${crypto.randomUUID()}`
      const optimistic: SupportMessage = {
        id: tempId,
        org_id: '',
        user_id: ownerId,
        sender_id: myUserId,
        body,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])

      const { data, error } = await supabase
        .from('support_messages')
        .insert({ user_id: ownerId, sender_id: myUserId, body })
        .select()
        .single()

      if (error || !data) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, _failed: true } : m))
        )
        return
      }

      const row = data as SupportMessage
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId)
        return withoutTemp.some((m) => m.id === row.id)
          ? withoutTemp
          : [...withoutTemp, row].sort(byCreatedAsc)
      })
    },
    [ownerId, myUserId]
  )

  return { messages, loading, error, send, remove }
}
