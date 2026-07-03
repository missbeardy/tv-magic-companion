import { useCallback, useEffect, useRef, useState } from 'react'

const SW_URL = '/sw.js'
const UPDATE_CHECK_MS = 60 * 60 * 1000
const HANDLED_UPDATE_KEY = 'companion-pwa-update-handled'

function getHandledWorkerUrl(): string | null {
  try {
    return localStorage.getItem(HANDLED_UPDATE_KEY)
  } catch {
    return null
  }
}

function setHandledWorkerUrl(url: string): void {
  try {
    localStorage.setItem(HANDLED_UPDATE_KEY, url)
  } catch {
    // private browsing / storage blocked
  }
}

function clearHandledWorkerUrl(): void {
  try {
    localStorage.removeItem(HANDLED_UPDATE_KEY)
  } catch {
    // ignore
  }
}

export function usePwaUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)

  const trackWaitingWorker = useCallback((reg: ServiceWorkerRegistration) => {
    const waiting = reg.waiting
    if (!waiting || !navigator.serviceWorker.controller) {
      if (!waiting) clearHandledWorkerUrl()
      waitingWorkerRef.current = null
      setUpdateAvailable(false)
      return
    }

    if (getHandledWorkerUrl() === waiting.scriptURL) {
      waitingWorkerRef.current = waiting
      setUpdateAvailable(false)
      return
    }

    waitingWorkerRef.current = waiting
    setUpdateAvailable(true)
  }, [])

  const acknowledgeUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current ?? registrationRef.current?.waiting
    if (waiting) setHandledWorkerUrl(waiting.scriptURL)
    setUpdateAvailable(false)
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
    acknowledgeUpdate,
    checkForUpdate,
    supported: 'serviceWorker' in navigator,
  }
}
