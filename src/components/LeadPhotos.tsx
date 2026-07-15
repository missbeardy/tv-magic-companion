import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { signLeadPhotoPath, signLeadPhotoPaths } from '../lib/leadPhotoStorage'
import {
  enqueueLeadPhoto,
  listPendingPhotosForLead,
  subscribeOfflineQueue,
  type OfflineLeadPhotoItem,
} from '../lib/offlineQueue'

interface Photo {
  id: string
  storage_path: string
  created_at: string
}

interface Props {
  leadId: string
  canUpload?: boolean
  onShare?: (photoUrl: string) => void
}

export default function LeadPhotos({ leadId, canUpload = true, onShare }: Props) {
  const { profile } = useAuth()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map())
  const [pending, setPending] = useState<OfflineLeadPhotoItem[]>([])
  const [pendingUrls, setPendingUrls] = useState<Map<string, string>>(new Map())
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchPending() {
    const rows = await listPendingPhotosForLead(leadId)
    setPending(rows)
    const urls = new Map<string, string>()
    for (const row of rows) {
      urls.set(row.id, URL.createObjectURL(row.blob))
    }
    setPendingUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url))
      return urls
    })
  }

  async function fetchPhotos() {
    const { data } = await supabase
      .from('lead_photos')
      .select('id, storage_path, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })

    if (!data) return

    setPhotos(data)
    const paths = data.map((p) => p.storage_path).filter(Boolean)
    const urls = await signLeadPhotoPaths(paths)
    setSignedUrls(urls)
  }

  useEffect(() => {
    void fetchPhotos()
    void fetchPending()
    return subscribeOfflineQueue(() => {
      void fetchPending()
      if (navigator.onLine) void fetchPhotos()
    })
  }, [leadId])

  useEffect(() => {
    return () => {
      pendingUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [pendingUrls])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !profile?.org_id || !profile.id) return
    setError('')

    const remaining = 3 - photos.length - pending.length
    if (remaining <= 0) return

    const toUpload = files.slice(0, remaining)
    setUploading(true)

    if (!navigator.onLine) {
      try {
        for (const file of toUpload) {
          await enqueueLeadPhoto({
            leadId,
            orgId: profile.org_id,
            actorId: profile.id,
            fileName: file.name || 'photo.jpg',
            mimeType: file.type || 'image/jpeg',
            blob: file,
          })
        }
        await fetchPending()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to queue photo')
      }
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    for (const file of toUpload) {
      const ext = file.name.split('.').pop()
      const path = `${profile.org_id}/leads/${leadId}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('lead-photos')
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      await supabase.from('lead_photos').insert({
        lead_id: leadId,
        org_id: profile.org_id,
        uploaded_by: profile.id,
        storage_path: path,
      })
    }

    await fetchPhotos()
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(photo: Photo) {
    await supabase.storage.from('lead-photos').remove([photo.storage_path || ''])
    await supabase.from('lead_photos').delete().eq('id', photo.id)
    fetchPhotos()
  }

  async function openLightbox(storagePath: string) {
    const signed = signedUrls.get(storagePath) ?? (await signLeadPhotoPath(storagePath))
    if (signed) setLightbox(signed)
  }

  async function sharePhoto(storagePath: string) {
    if (!onShare) return
    const signed = signedUrls.get(storagePath) ?? (await signLeadPhotoPath(storagePath))
    if (signed) onShare(signed)
  }

  return (
    <div className="mt-3">
      {lightbox && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} className="max-w-full max-h-full rounded-xl" alt="" />
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex gap-2 flex-wrap">
        {photos.map((photo) => {
          const src = signedUrls.get(photo.storage_path)
          if (!src) return null

          return (
            <div key={photo.id} className="relative group">
              <img
                src={src}
                onClick={() => openLightbox(photo.storage_path)}
                className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-90 transition border border-gray-200"
                alt=""
              />
              {onShare && (
                <button
                  onClick={() => sharePhoto(photo.storage_path)}
                  className="absolute bottom-0 left-0 right-0 bg-[#004B93] text-white text-xs py-0.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition"
                >
                  Share
                </button>
              )}
              {canUpload && (
                <button
                  onClick={() => handleDelete(photo)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs items-center justify-center hidden group-hover:flex"
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {pending.map((row) => {
          const src = pendingUrls.get(row.id)
          if (!src) return null
          return (
            <div key={row.id} className="relative">
              <img
                src={src}
                className="w-20 h-20 object-cover rounded-lg border border-amber-300 opacity-90"
                alt=""
              />
              <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-white text-[10px] font-semibold text-center py-0.5 rounded-b-lg">
                Queued
              </span>
            </div>
          )
        })}

        {canUpload && photos.length + pending.length < 3 && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-[#00B4C5] hover:text-[#00B4C5] transition text-xs gap-1"
          >
            {uploading ? (
              <span className="text-xs">...</span>
            ) : (
              <>
                <span className="text-2xl leading-none">+</span>
                <span>Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  )
}
