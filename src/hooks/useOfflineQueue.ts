import { useCallback, useEffect, useRef, useState } from 'react'
import { flushOfflineQueue } from '../lib/flushOfflineQueue'
import { getOfflineQueueCount, subscribeOfflineQueue } from '../lib/offlineQueue'

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
  const syncingRef = useRef(false)

  const refreshCount = useCallback(async () => {
    setPendingCount(await getOfflineQueueCount())
  }, [])

  const sync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      await flushOfflineQueue()
      await refreshCount()
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [refreshCount])

  useEffect(() => {
    void refreshCount()
    return subscribeOfflineQueue(() => {
      void refreshCount()
    })
  }, [refreshCount])

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void sync()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    if (navigator.onLine) void sync()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [sync])

  return { pendingCount, syncing, online, sync, refreshCount }
}
