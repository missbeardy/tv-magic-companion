// src/pages/SocialPage.tsx
import { useEffect, useRef, useState } from 'react'
import NavBar from '../components/NavBar'
import { supabase } from '../lib/supabase'
import { generateCaption } from '../lib/generateCaption'
import { postToSocial } from '../hooks/useSocialPost'
import { uploadMedia } from '../lib/uploadMedia'

interface JobPhoto {
  url: string
  name: string
}

type MediaType = 'image' | 'video'

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/')
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(url)
}

export default function SocialPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 state
  const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [selectedMediaType, setSelectedMediaType] = useState<MediaType>('image')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 2 state
  const [notes, setNotes] = useState('')
  const [caption, setCaption] = useState('')
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [captionError, setCaptionError] = useState('')

  // Step 3 state
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')
  const [posted, setPosted] = useState(false)

  // Load completed job photos from Supabase Storage
  useEffect(() => {
    async function loadPhotos() {
      setLoadingPhotos(true)
      const { data, error } = await supabase.storage
        .from('lead-photos')
        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })

      if (error || !data) {
        setLoadingPhotos(false)
        return
      }

      // Filter out the social-uploads folder and get public URLs
      const photos: JobPhoto[] = data
        .filter(item => item.name !== 'social-uploads' && !item.id?.includes('/'))
        .map(item => ({
          name: item.name,
          url: supabase.storage.from('lead-photos').getPublicUrl(item.name).data.publicUrl,
        }))

      setJobPhotos(photos)
      setLoadingPhotos(false)
    }
    loadPhotos()
  }, [])

  function handleSelectJobPhoto(photo: JobPhoto) {
    setSelectedUrl(photo.url)
    setSelectedMediaType(isVideoUrl(photo.url) ? 'video' : 'image')
    setUploadedFile(null)
    setUploadPreview(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setSelectedUrl(null)
    setSelectedMediaType(isVideoFile(file) ? 'video' : 'image')
    const objectUrl = URL.createObjectURL(file)
    setUploadPreview(objectUrl)
  }

  async function handleNext() {
    // If they picked an uploaded file, upload it now before moving to step 2
    if (uploadedFile) {
      setUploading(true)
      try {
        const publicUrl = await uploadMedia(uploadedFile)
        setSelectedUrl(publicUrl)
      } catch (err) {
        alert('Upload failed. Please try again.')
        setUploading(false)
        return
      }
      setUploading(false)
    }
    setStep(2)
  }

  async function handleGenerateCaption() {
    if (!notes.trim()) {
      setCaptionError('Please add some notes about the job first.')
      return
    }
    setCaptionError('')
    setGeneratingCaption(true)
    try {
      const result = await generateCaption(notes, 'TV aerial and satellite installation job')
      setCaption(result)
    } catch {
      setCaptionError('Caption generation failed. Check your Anthropic API key.')
    }
    setGeneratingCaption(false)
  }

  async function handlePost() {
    if (!selectedUrl || !caption.trim()) return
    setPosting(true)
    setPostError('')
    const result = await postToSocial({
      caption,
      mediaUrl: selectedUrl,
      mediaType: selectedMediaType,
    })
    setPosting(false)
    if (result.success) {
      setPosted(true)
      setStep(3)
    } else {
      setPostError(result.error ?? 'Unknown error.')
    }
  }

  function handleReset() {
    setStep(1)
    setSelectedUrl(null)
    setUploadedFile(null)
    setUploadPreview(null)
    setNotes('')
    setCaption('')
    setPostError('')
    setPosted(false)
  }

  const hasMedia = selectedUrl !== null || uploadPreview !== null
  const previewUrl = uploadPreview ?? selectedUrl

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#004B93]">📲 Social Media</h1>
          <p className="text-sm text-gray-500 mt-1">
            Share completed job photos and videos to Instagram and Facebook
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step === n
                    ? 'bg-[#004B93] text-white'
                    : step > n
                    ? 'bg-[#00B4C5] text-white'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {step > n ? '✓' : n}
              </div>
              {n < 3 && <div className={`h-0.5 w-8 ${step > n ? 'bg-[#00B4C5]' : 'bg-gray-200'}`} />}
            </div>
          ))}
          <span className="ml-2 text-sm text-gray-500">
            {step === 1 && 'Choose media'}
            {step === 2 && 'Write & generate caption'}
            {step === 3 && 'Posted!'}
          </span>
        </div>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div className="space-y-5">

            {/* Upload new file */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Upload a new photo or video</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 text-gray-400 hover:border-[#00B4C5] hover:text-[#00B4C5] transition"
              >
                <span className="text-3xl">📁</span>
                <span className="text-sm font-medium">Tap to choose a file</span>
                <span className="text-xs">Photos or videos supported</span>
              </button>

              {uploadPreview && (
                <div className="mt-3 rounded-xl overflow-hidden border border-gray-100">
                  {selectedMediaType === 'video' ? (
                    <video
                      src={uploadPreview}
                      className="w-full max-h-48 object-cover"
                      controls
                    />
                  ) : (
                    <img
                      src={uploadPreview}
                      className="w-full max-h-48 object-cover"
                      alt="Preview"
                    />
                  )}
                  <p className="text-xs text-center text-gray-400 py-2">
                    {uploadedFile?.name}
                  </p>
                </div>
              )}
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">or pick from completed jobs</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Job photo gallery */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Completed job photos</p>

              {loadingPhotos && (
                <p className="text-sm text-gray-400 text-center py-6">Loading photos…</p>
              )}

              {!loadingPhotos && jobPhotos.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No completed job photos yet.
                </p>
              )}

              {!loadingPhotos && jobPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {jobPhotos.map(photo => (
                    <button
                      key={photo.name}
                      onClick={() => handleSelectJobPhoto(photo)}
                      className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all ${
                        selectedUrl === photo.url
                          ? 'border-[#004B93] shadow-md'
                          : 'border-transparent hover:border-[#00B4C5]'
                      }`}
                    >
                      {isVideoUrl(photo.url) ? (
                        <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                          <span className="text-2xl">▶️</span>
                        </div>
                      ) : (
                        <img
                          src={photo.url}
                          alt={photo.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {selectedUrl === photo.url && (
                        <div className="absolute inset-0 bg-[#004B93] bg-opacity-20 flex items-center justify-center">
                          <span className="text-white text-xl">✓</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Next button */}
            <button
              onClick={handleNext}
              disabled={!hasMedia || uploading}
              className={`w-full py-4 rounded-2xl font-semibold text-white transition-all ${
                hasMedia && !uploading
                  ? 'bg-[#004B93] hover:bg-[#003a7a] shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {uploading ? 'Uploading…' : 'Next — Write Caption →'}
            </button>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div className="space-y-4">

            {/* Media preview */}
            {previewUrl && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {selectedMediaType === 'video' ? (
                  <video src={previewUrl} className="w-full max-h-52 object-cover" controls />
                ) : (
                  <img src={previewUrl} alt="Selected" className="w-full max-h-52 object-cover" />
                )}
              </div>
            )}

            {/* Notes */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <label className="text-sm font-semibold text-gray-700 block mb-2">
                Job notes (what did you install or fix?)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Installed a new aerial in the loft, replaced old coax cable, TV signal now perfect on all 5 rooms."
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00B4C5] resize-none"
              />
              {captionError && (
                <p className="text-red-500 text-xs mt-1">{captionError}</p>
              )}
              <button
                onClick={handleGenerateCaption}
                disabled={generatingCaption}
                className="mt-3 w-full py-3 rounded-xl font-semibold text-white bg-[#00B4C5] hover:bg-[#009aaa] transition disabled:opacity-50"
              >
                {generatingCaption ? '✨ Generating…' : '✨ Generate Caption with AI'}
              </button>
            </div>

            {/* Caption editor */}
            {caption && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <label className="text-sm font-semibold text-gray-700 block mb-2">
                  Caption — edit if needed
                </label>
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={5}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#004B93] resize-none"
                />
              </div>
            )}

            {postError && (
              <p className="text-red-500 text-sm text-center">{postError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-2xl font-semibold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition"
              >
                ← Back
              </button>
              <button
                onClick={handlePost}
                disabled={!caption.trim() || posting}
                className={`flex-2 flex-grow py-4 rounded-2xl font-semibold text-white transition-all ${
                  caption.trim() && !posting
                    ? 'bg-[#004B93] hover:bg-[#003a7a] shadow-md'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {posting ? 'Posting…' : '📲 Post to Instagram & Facebook'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {step === 3 && posted && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h2 className="text-xl font-bold text-[#004B93]">Posted successfully!</h2>
            <p className="text-sm text-gray-500">
              Your post has been sent to Instagram and Facebook via Zernio.
            </p>
            <button
              onClick={handleReset}
              className="mt-4 w-full py-4 rounded-2xl font-semibold text-white bg-[#00B4C5] hover:bg-[#009aaa] transition"
            >
              Post another
            </button>
          </div>
        )}

      </div>
    </div>
  )
}