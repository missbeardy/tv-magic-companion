import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import NavBar from '../components/NavBar';

export default function OrgSettingsPage() {
  const { profile } = useAuth();
  const { org, refreshOrg } = useOrg();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    primary_color: '#004B93',
    secondary_color: '#00B4C5',
    support_phone: '',
    support_email: '',
  });

  useEffect(() => {
    if (org) {
      setFormData({
        name: org.name || '',
        logo_url: org.logo_url || '',
        primary_color: org.primary_color || '#004B93',
        secondary_color: org.secondary_color || '#00B4C5',
        support_phone: org.support_phone || '',
        support_email: org.support_email || '',
      });
    }
  }, [org]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSaved(false);

    const { error: updateError } = await supabase
      .from('orgs')
      .update({
        name: formData.name,
        logo_url: formData.logo_url,
        primary_color: formData.primary_color,
        secondary_color: formData.secondary_color,
        support_phone: formData.support_phone,
        support_email: formData.support_email,
      })
      .eq('id', org?.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      await refreshOrg();
      setTimeout(() => setSaved(false), 3000);
    }
    setLoading(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !org) return;

    const ext = file.name.split('.').pop();
    const path = `org-logos/${org.id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('org-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError('Logo upload failed: ' + uploadError.message);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('org-assets')
      .getPublicUrl(path);

    setFormData(prev => ({ ...prev, logo_url: urlData.publicUrl }));
  }

  // Only managers can access org settings
  if (profile?.role !== 'manager') {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <div className="p-6 text-center text-gray-500">
          Only franchise owners can access this page.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Franchise Settings</h1>
          <p className="text-gray-500 text-sm">Manage your brand and contact information</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {saved && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
            ✅ Settings saved successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Logo Upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Brand Logo
            </label>
            <div className="flex items-center gap-4">
              {formData.logo_url ? (
                <img src={formData.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                  📷
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="text-sm"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">Recommended: 200x200px PNG with transparent background</p>
          </div>

          {/* Brand Name */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Franchise Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              required
            />
            <p className="text-xs text-gray-400 mt-1">This appears throughout the app and on customer communications</p>
          </div>

          {/* Colors */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Brand Colors
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.primary_color}
                    onChange={e => setFormData(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primary_color}
                    onChange={e => setFormData(prev => ({ ...prev, primary_color: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.secondary_color}
                    onChange={e => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.secondary_color}
                    onChange={e => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Contact Information
            </label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Support Phone</label>
                <input
                  type="tel"
                  value={formData.support_phone}
                  onChange={e => setFormData(prev => ({ ...prev, support_phone: e.target.value }))}
                  placeholder="1300 000 000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Support Email</label>
                <input
                  type="email"
                  value={formData.support_email}
                  onChange={e => setFormData(prev => ({ ...prev, support_email: e.target.value }))}
                  placeholder="support@yourfranchise.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#004B93] text-white py-3 rounded-lg font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </main>
    </div>
  );
}