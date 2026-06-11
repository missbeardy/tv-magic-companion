// src/components/LeadFilterBar.tsx
import { useState, useEffect, useRef } from 'react'

export interface FilterState {
  search: string
  source: string
  assignee: string
}

export interface SavedProfile {
  id: string
  name: string
  filters: FilterState
}

const EMPTY_FILTERS: FilterState = { search: '', source: '', assignee: '' }

interface LeadFilterBarProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  sources: string[]
  assignees: string[]
  userId: string
}

export default function LeadFilterBar({ filters, onChange, sources, assignees, userId }: LeadFilterBarProps) {
  const storageKey = `tvmagic_filter_profiles_${userId}`
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [showSave, setShowSave] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [showProfiles, setShowProfiles] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setProfiles(JSON.parse(raw))
    } catch {}
  }, [storageKey])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfiles(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isActive = filters.search || filters.source || filters.assignee

  function saveProfile() {
    if (!profileName.trim()) return
    const next: SavedProfile[] = [
      ...profiles.filter(p => p.name !== profileName.trim()),
      { id: Date.now().toString(), name: profileName.trim(), filters },
    ]
    setProfiles(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    setProfileName('')
    setShowSave(false)
  }

  function loadProfile(p: SavedProfile) {
    onChange(p.filters)
    setShowProfiles(false)
  }

  function deleteProfile(id: string) {
    const next = profiles.filter(p => p.id !== id)
    setProfiles(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  function clearAll() {
    onChange(EMPTY_FILTERS)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 space-y-2 shadow-sm">
      {/* Search row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search name, phone…"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004B93]/30"
          />
        </div>
        {isActive && (
          <button
            onClick={clearAll}
            className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter chips row */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filters.source}
          onChange={e => onChange({ ...filters, source: e.target.value })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#004B93]/30"
        >
          <option value="">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filters.assignee}
          onChange={e => onChange({ ...filters, assignee: e.target.value })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#004B93]/30"
        >
          <option value="">All Assignees</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* Saved profiles */}
        <div className="relative ml-auto" ref={profileRef}>
          <button
            onClick={() => { setShowProfiles(v => !v); setShowSave(false) }}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition flex items-center gap-1"
          >
            📋 {profiles.length > 0 ? `Profiles (${profiles.length})` : 'Profiles'}
          </button>

          {showProfiles && (
            <div className="absolute right-0 top-9 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-56 py-2">
              {profiles.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">No saved profiles yet</p>
              )}
              {profiles.map(p => (
                <div key={p.id} className="flex items-center px-3 py-2 hover:bg-gray-50 group">
                  <button
                    onClick={() => loadProfile(p)}
                    className="flex-1 text-left text-sm text-gray-700 truncate"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => deleteProfile(p.id)}
                    className="text-red-400 opacity-0 group-hover:opacity-100 text-xs ml-2 transition"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1 px-3">
                {showSave ? (
                  <div className="flex gap-1 mt-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Profile name…"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveProfile()}
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                    />
                    <button
                      onClick={saveProfile}
                      className="text-xs bg-[#004B93] text-white px-2 py-1 rounded"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSave(true)}
                    className="text-xs text-[#004B93] py-1 hover:underline"
                  >
                    + Save current filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}