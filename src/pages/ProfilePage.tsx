// src/pages/ProfilePage.tsx
import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import CreateEmployeeModal from '../components/CreateEmployeeModal'
import { promptForNotifications } from '../lib/oneSignal'

function ChangePassword() {
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleChange() {
    if (newPassword.length < 6) {
      setMsg('Password must be at least 6 characters.')
      return
    }
    setSaving(true)
    setMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMsg('Error: ' + error.message)
    } else {
      setMsg('✅ Password updated!')
      setNewPassword('')
    }
    setSaving(false)
    setTimeout(() => setMsg(''), 4000)
  }

  return (
    <div className="space-y-3">
      {msg && (
        <p className={`text-sm ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="Min 6 characters"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
        />
      </div>
      <button
        onClick={handleChange}
        disabled={saving}
        className="w-full bg-gray-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
      >
        {saving ? 'Updating...' : 'Update Password'}
      </button>
    </div>
  )
}

function InfoBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-block align-middle ml-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center hover:bg-[#004B93] hover:text-white transition"
        aria-label="More info"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-6 top-0 z-20 w-64 bg-gray-800 text-white text-xs rounded-xl p-3 shadow-lg leading-relaxed">
            {text}
          </div>
        </>
      )}
    </span>
  )
}

export default function ProfilePage() {
  const { profile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [suburb, setSuburb] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [locationEnabled, setLocationEnabled] = useState(false)
  const [locationSaving, setLocationSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showCreateEmployee, setShowCreateEmployee] = useState(false)
  const [notifStatus, setNotifStatus] = useState<'idle' | 'success' | 'denied'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')

    supabase
      .from('profiles')
      .select('suburb, phone, avatar_url, location_enabled')
      .eq('id', profile.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSuburb(data.suburb ?? '')
          setPhone(data.phone ?? '')
          setAvatarUrl(data.avatar_url ?? '')
          setLocationEnabled(data.location_enabled ?? false)
        }
      })
  }, [profile])

  async function handleEnableNotifications() {
    try {
      await promptForNotifications()
      const permission = Notification.permission
      if (permission === 'granted') {
        setNotifStatus('success')
      } else {
        setNotifStatus('denied')
      }
    } catch (err) {
      console.error('Notification prompt error:', err)
      setNotifStatus('denied')
    }
  }

  async function handleLocationToggle(enabled: boolean) {
    if (!profile) return
    setLocationSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ location_enabled: enabled })
      .eq('id', profile.id)
    if (!error) setLocationEnabled(enabled)
    setLocationSaving(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    setUploading(true)
    setError('')

    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)

    const newUrl = urlData.publicUrl + '?t=' + Date.now()
    setAvatarUrl(newUrl)

    await supabase
      .from('profiles')
      .update({ avatar_url: urlData.publicUrl })
      .eq('id', profile.id)

    setUploading(false)
  }

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setError('')
    setSaved(false)

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        suburb,
        phone,
      })
      .eq('id', profile.id)

    if (error) {
      setError('Failed to save: ' + error.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }

    setSaving(false)
  }

  const notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default'

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">My Profile</h2>
          <p className="text-gray-500 text-sm">Update your details and photo.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
        )}
        {saved && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">✅ Profile saved!</div>
        )}

        {/* Avatar */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-4">
          <div className="w-24 h-24 rounded-full bg-[#004B93] flex items-center justify-center text-white text-4xl font-bold overflow-hidden">
            {avatarUrl
              ? <img src={avatarUrl} className="w-full h-full object-cover" />
              : fullName.charAt(0) || '?'
            }
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm bg-[#004B93] text-white px-4 py-2 rounded-lg hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : '📷 Change Photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <p className="text-xs text-gray-400">Tap to upload a photo from your camera or gallery</p>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <p className="text-sm font-semibold text-gray-700">🔔 Job Notifications</p>
          <p className="text-xs text-gray-500">
            Enable push notifications to get alerted on your phone when a lead is assigned to you.
          </p>

          {notifPermission === 'granted' || notifStatus === 'success' ? (
            <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg font-medium">
              ✅ Notifications are enabled on this device
            </div>
          ) : notifStatus === 'denied' || notifPermission === 'denied' ? (
            <div className="bg-amber-50 text-amber-700 text-sm p-3 rounded-lg">
              ⚠️ Notifications are blocked. Go to your browser settings and allow notifications for this site, then come back and tap the button again.
            </div>
          ) : (
            <button
              onClick={handleEnableNotifications}
              className="w-full bg-[#00B4C5] text-white py-3 rounded-lg text-sm font-semibold hover:bg-[#009aaa] transition"
            >
              🔔 Enable Notifications on This Device
            </button>
          )}
        </div>

        {/* Location Sharing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-gray-700">📍 Location Sharing</p>
            <InfoBubble text="We use your GPS location to recommend the nearest available technician when a new job comes in. This helps you get leads that are close to you. Your location is only shared with your manager and updated every 10 minutes while the app is open. You can turn this off at any time." />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              {locationEnabled ? (
                <p className="text-xs text-green-600 font-medium">✅ Location sharing is on — you may be prioritised for nearby jobs</p>
              ) : (
                <p className="text-xs text-gray-500">Off — your location won't be used for job allocation</p>
              )}
            </div>
            <button
              onClick={() => handleLocationToggle(!locationEnabled)}
              disabled={locationSaving}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                locationEnabled ? 'bg-[#004B93]' : 'bg-gray-300'
              }`}
              aria-label="Toggle location sharing"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  locationEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Your Details</p>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 0412 345 678"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Suburb</label>
            <input
              type="text"
              value={suburb}
              onChange={e => setSuburb(e.target.value)}
              placeholder="e.g. Chermside"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
            <p className="text-xs text-gray-400 mt-1">Used for smart lead assignment recommendations</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Change Password</p>
          <ChangePassword />
        </div>

        {profile?.role === 'manager' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm font-semibold text-gray-700 mb-3">Team Management</p>
            <button
              onClick={() => setShowCreateEmployee(true)}
              className="w-full bg-[#00B4C5] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#009aaa] transition"
            >
              + Create New Employee Account
            </button>
          </div>
        )}

        {showCreateEmployee && (
          <CreateEmployeeModal
            onClose={() => setShowCreateEmployee(false)}
            onCreated={() => setShowCreateEmployee(false)}
          />
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 text-center">
            Logged in as <span className="font-medium text-gray-600">{profile?.email}</span>
          </p>
          <p className="text-xs text-gray-400 text-center mt-1 capitalize">
            Role: <span className="font-medium text-gray-600">{profile?.role}</span>
          </p>
        </div>
      </main>
    </div>
  )
}