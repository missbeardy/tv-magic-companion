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
import { isPublicSitePath } from '../lib/publicSite'

function ChangelogGate({ children }: { children: React.ReactNode }) {
  const { checkForUpdate } = usePwaUpdateContext()
  const { user, loading: authLoading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState(getUnseenChangelogEntries())

  // Release notes are for our own users, and this layer wraps every route — including
  // `/quote/:token`, `/invoice/:token` and `/visualise`, which customers open from a
  // link. Those people were being shown a full-screen "What's New" about background
  // job scheduling and the technician leaderboard, in front of the invoice they came
  // to pay. A session is the boundary: a customer never has one. Public landings also
  // skip it when a signed-in staff member has the PWA, so the campaign page does not
  // look like FieldBourne. Also covers /login, /privacy and /terms.
  const signedIn = !authLoading && Boolean(user)
  const publicSite =
    typeof window !== 'undefined' && isPublicSitePath(window.location.pathname)

  const refreshVisibility = useCallback(() => {
    if (!signedIn || publicSite) {
      setIsOpen(false)
      return
    }
    const unseen = getUnseenChangelogEntries()
    setEntries(unseen)
    setIsOpen(shouldShowChangelog() && unseen.length > 0)
  }, [signedIn, publicSite])

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
