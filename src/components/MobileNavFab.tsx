import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { hasAddLeadDraft } from '../lib/addLeadDraft'
import AddLeadModal from './AddLeadModal'

export default function MobileNavFab() {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    if (hasAddLeadDraft(profile.id)) setOpen(true)
  }, [profile?.id])

  return (
    <>
      <button
        type="button"
        aria-label="Add lead"
        onClick={() => setOpen(true)}
        className="mobile-nav-fab absolute right-4 -top-7 z-50 flex h-14 w-14 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-brand-dark text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)] ring-4 ring-brand touch-manipulation"
      >
        <Plus size={24} strokeWidth={2.5} aria-hidden="true" />
      </button>
      {open && (
        <AddLeadModal
          onClose={() => setOpen(false)}
          onCreated={() => setOpen(false)}
        />
      )}
    </>
  )
}
