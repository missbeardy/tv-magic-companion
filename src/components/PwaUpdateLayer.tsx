import { useCallback, useEffect, useState } from 'react'
import ChangelogOverlay from './ChangelogOverlay'
import { PwaUpdateProvider, usePwaUpdateContext } from '../context/PwaUpdateContext'
import {
  getCurrentReleaseWeekId,
  getUnseenChangelogEntries,
  markChangelogSeen,
  shouldShowChangelog,
} from '../lib/changelog'

function ChangelogGate({ children }: { children: React.ReactNode }) {
  const { checkForUpdate } = usePwaUpdateContext()
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState(getUnseenChangelogEntries())

  const refreshVisibility = useCallback(() => {
    const unseen = getUnseenChangelogEntries()
    setEntries(unseen)
    setIsOpen(shouldShowChangelog() && unseen.length > 0)
  }, [])

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
