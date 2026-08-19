import { useCallback, useEffect, useState } from 'react'
import ChangelogOverlay from './ChangelogOverlay'
import { PwaUpdateProvider, usePwaUpdateContext } from '../context/PwaUpdateContext'
import { useAuth } from '../context/AuthContext'
import {
  getCurrentReleaseWeekId,
  getUnseenChangelogEntries,
  markChangelogSeen,
  shouldShowChangelog,
} from '../lib/changelog'

function ChangelogGate({ children }: { children: React.ReactNode }) {
  const { checkForUpdate } = usePwaUpdateContext()
  const { user, loading: authLoading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState(getUnseenChangelogEntries())

  // Release notes are for our own users, and this layer wraps every route — including
  // `/quote/:token` and `/invoice/:token`, which are opened by the tradie's *customer*
  // from a link we SMS or email them. Those people were being shown a full-screen
  // "What's New" about background job scheduling and the technician leaderboard, in
  // front of the invoice they came to pay. A session is the boundary: a customer never
  // has one. Also covers /login, /privacy and /terms, where it simply blocks the page.
  const signedIn = !authLoading && Boolean(user)

  const refreshVisibility = useCallback(() => {
    if (!signedIn) {
      setIsOpen(false)
      return
    }
    const unseen = getUnseenChangelogEntries()
    setEntries(unseen)
    setIsOpen(shouldShowChangelog() && unseen.length > 0)
  }, [signedIn])

  useEffect(() => {
    refreshVisibility()
  }, [refreshVisibility])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate()
        refreshVisibility()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkForUpdate, refreshVisibility])

  const handleClose = () => {
    if (shouldShowChangelog()) {
      markChangelogSeen(getCurrentReleaseWeekId())
    }
    setIsOpen(false)
  }

  return (
    <>
      {children}
      <ChangelogOverlay isOpen={isOpen} entries={entries} onClose={handleClose} />
    </>
  )
}

export default function PwaUpdateLayer({ children }: { children: React.ReactNode }) {
  return (
    <PwaUpdateProvider>
      <ChangelogGate>{children}</ChangelogGate>
    </PwaUpdateProvider>
  )
}
