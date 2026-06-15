// src/pages/SupportPage.tsx
import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import NavBar from '../components/NavBar';
import { supabase } from '../lib/supabase';
import { HelpCircle, Lightbulb, Bug, Paperclip, Send, X, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';

type RequestType = 'feature' | 'issue';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function SupportPage() {
  const { profile, user } = useAuth();
  const [requestType, setRequestType] = useState<RequestType>('feature');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (files.length + selected.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} images.`);
      return;
    }
    const validFiles: File[] = [];
    const validPreviews: string[] = [];
    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Unsupported file type: ${file.name}. Only JPEG, PNG, GIF, WEBP allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds 5MB limit.`);
        continue;
      }
      validFiles.push(file);
      validPreviews.push(URL.createObjectURL(file));
    }
    if (validFiles.length) {
      setFiles(prev => [...prev, ...validFiles]);
      setPreviews(prev => [...prev, ...validPreviews]);
      setError('');
    }
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (files.length === 0) return [];
    const uploadedUrls: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `support/${profile?.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(path, file, { upsert: false });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from('support-attachments').getPublicUrl(path);
      uploadedUrls.push(urlData.publicUrl);
    }
    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Please fill in both title and description.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      let imageUrls: string[] = [];
      if (files.length) {
        imageUrls = await uploadFiles();
      }

      const response = await fetch('/api/send-support-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: requestType,
          title: title.trim(),
          description: description.trim(),
          imageUrls,
          userName: profile?.full_name || user?.email?.split('@')[0] || 'Anonymous',
          userEmail: user?.email || 'no-email@example.com',
          orgName: profile?.org_id || 'Unknown organization',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send request');

      setSuccess(true);
      // Reset form
      setTitle('');
      setDescription('');
      setFiles([]);
      setPreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#004B93]">Support & Feedback</h1>
          <p className="text-sm text-gray-500 mt-1">
            Request a new feature or report an issue – we'll get back to you promptly.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">What type of request is this?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRequestType('feature')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  requestType === 'feature'
                    ? 'border-[#00B4C5] bg-[#00B4C5]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Lightbulb size={28} className={requestType === 'feature' ? 'text-[#00B4C5]' : 'text-gray-400'} />
                <span className="font-semibold text-gray-800">Feature Request</span>
                <span className="text-xs text-gray-500 text-center">Suggest an improvement or new capability</span>
              </button>
              <button
                type="button"
                onClick={() => setRequestType('issue')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  requestType === 'issue'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Bug size={28} className={requestType === 'issue' ? 'text-orange-500' : 'text-gray-400'} />
                <span className="font-semibold text-gray-800">Support Issue</span>
                <span className="text-xs text-gray-500 text-center">Report a bug or problem you're facing</span>
              </button>
            </div>
          </div>

          {/* Title */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Short title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Ability to export leads to CSV"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              required
            />
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Detailed description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="Please describe the feature or issue in detail. Include steps to reproduce if applicable."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93] resize-none"
              required
            />
          </div>

          {/* File attachments */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                <Paperclip size={14} /> Screenshots (optional, up to 5)
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[#004B93] font-medium hover:underline"
              >
                + Add image
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-2">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                    <img src={src} alt="preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">JPEG, PNG, GIF, WEBP up to 5MB each</p>
          </div>

          {/* Error & success messages */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-600 p-3 rounded-xl text-sm">
              <CheckCircle size={16} />
              Request submitted! Our team will review it shortly.
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#004B93] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#003d7a] transition disabled:opacity-60"
          >
            {loading ? <HelpCircle size={16} className="animate-spin" /> : <Send size={16} />}
            {loading ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
      </main>
    </div>
  );
}