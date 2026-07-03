import { useCallback, useEffect, useState } from 'react'
import ChangelogOverlay from './ChangelogOverlay'
import {
  getCurrentReleaseWeekId,
  getUnseenChangelogEntries,
  markChangelogSeen,
  shouldShowChangelog,
} from '../lib/changelog'
import { usePwaUpdate } from '../hooks/usePwaUpdate'

export default function PwaUpdateLayer({ children }: { children: React.ReactNode }) {
  const { updateAvailable, updating, applyUpdate, acknowledgeUpdate, checkForUpdate } = usePwaUpdate()
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState(getUnseenChangelogEntries())

  const refreshVisibility = useCallback(() => {
    const unseen = getUnseenChangelogEntries()
    setEntries(unseen)
    const showForChangelog = shouldShowChangelog() && unseen.length > 0
    const showForUpdate = updateAvailable
    setIsOpen(showForChangelog || showForUpdate)
  }, [updateAvailable])

  useEffect(() => {
    refreshVisibility()
  }, [refreshVisibility])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [checkForUpdate])

  const handleClose = () => {
    if (shouldShowChangelog()) {
      markChangelogSeen(getCurrentReleaseWeekId())
    }
    if (updateAvailable) {
      acknowledgeUpdate()
    }
    setIsOpen(false)
  }

  const handleUpdate = () => {
    markChangelogSeen(getCurrentReleaseWeekId())
    acknowledgeUpdate()
    applyUpdate()
  }

  return (
    <>
      {children}
      <ChangelogOverlay
        isOpen={isOpen}
        entries={entries}
        updateAvailable={updateAvailable}
        updating={updating}
        onClose={handleClose}
        onUpdate={handleUpdate}
      />
    </>
  )
}
