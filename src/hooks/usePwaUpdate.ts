import { useCallback, useEffect, useRef, useState } from 'react'

const SW_URL = '/sw.js'
const UPDATE_CHECK_MS = 60 * 60 * 1000

export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)

  const trackWaitingWorker = useCallback((reg: ServiceWorkerRegistration) => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      waitingWorkerRef.current = reg.waiting
      setUpdateAvailable(true)
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let intervalId: ReturnType<typeof setInterval> | undefined
    let reloaded = false

    const onControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker
      .register(SW_URL)
      .then((reg) => {
        registrationRef.current = reg
        trackWaitingWorker(reg)

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              waitingWorkerRef.current = reg.waiting
              setUpdateAvailable(true)
            }
          })
        })

        reg.update().catch(() => {})

        intervalId = setInterval(() => {
          reg.update().catch(() => {})
        }, UPDATE_CHECK_MS)
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err)
      })

    return () => {
      if (intervalId) clearInterval(intervalId)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [trackWaitingWorker])

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current ?? registrationRef.current?.waiting
    if (!waiting) {
      window.location.reload()
      return
    }
    setUpdating(true)
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }, [])

  const checkForUpdate = useCallback(() => {
    registrationRef.current?.update().catch(() => {})
  }, [])

  return {
    updateAvailable,
    updating,
    applyUpdate,
    checkForUpdate,
    supported: 'serviceWorker' in navigator,
  }
}
