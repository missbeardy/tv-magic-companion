import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

interface Photo {
  id: string
  public_url: string
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
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchPhotos() {
    const { data } = await supabase
      .from('lead_photos')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
    if (data) setPhotos(data)
  }

  useEffect(() => { fetchPhotos() }, [leadId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const remaining = 3 - photos.length
    if (remaining <= 0) return

    const toUpload = files.slice(0, remaining)
    setUploading(true)

    for (const file of toUpload) {
      const ext = file.name.split('.').pop()
      const path = `${profile?.id}/${leadId}-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('lead-photos')
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      const { data: urlData } = supabase.storage
        .from('lead-photos')
        .getPublicUrl(path)

      await supabase.from('lead_photos').insert({
        lead_id: leadId,
        uploaded_by: profile?.id,
        storage_path: path,
        public_url: urlData.publicUrl,
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

  return (
    <div className="mt-3">
      {lightbox && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} className="max-w-full max-h-full rounded-xl" />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {photos.map(photo => (
          <div key={photo.id} className="relative group">
            <img
                  src={photo.public_url}
                  onClick={() => setLightbox(photo.public_url)}
                  className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-90 transition border border-gray-200"
                />
                {onShare && (
                  <button
                    onClick={() => onShare(photo.public_url)}
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
        ))}

        {canUpload && photos.length < 3 && (
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