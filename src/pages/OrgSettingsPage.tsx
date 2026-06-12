import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NavBar from '../components/NavBar';

export default function OrgSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [orgName, setOrgName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#004B93');
  const [secondaryColor, setSecondaryColor] = useState('#00B4C5');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  // Load org data
  useEffect(() => {
    async function loadOrg() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Get user's profile to find org_id
        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', session.user.id)
          .single();

        if (profile?.org_id) {
          const { data: org } = await supabase
            .from('orgs')
            .select('*')
            .eq('id', profile.org_id)
            .single();
          
          if (org) {
            setOrgName(org.name || '');
            setPrimaryColor(org.primary_color || '#004B93');
            setSecondaryColor(org.secondary_color || '#00B4C5');
            setSupportPhone(org.support_phone || '');
            setSupportEmail(org.support_email || '');
          }
        }
      } catch (err) {
        console.error('Load error:', err);
      }
    }
    
    loadOrg();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('You must be logged in');
        setLoading(false);
        return;
      }

      // Your Supabase URL - replace with your actual URL if different
      const supabaseUrl = 'https://abnheynzugpicikxwwmv.supabase.co';
      
      // Call the edge function
      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-org`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: orgName,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            support_phone: supportPhone,
            support_email: supportEmail,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Franchise Settings</h1>
        
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        
        {saved && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4">
            ✅ Franchise settings saved successfully!
          </div>
        )}
        
        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Franchise Name *
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#004B93] focus:outline-none"
                placeholder="e.g., TVMagic Brisbane"
                required
              />
            </div>
          </div>
          
          {/* Brand Colors */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">Brand Colors</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Primary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#004B93] focus:outline-none"
                  placeholder="#004B93"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Secondary Color
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#004B93] focus:outline-none"
                  placeholder="#00B4C5"
                />
              </div>
            </div>
          </div>
          
          {/* Contact Info */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Support Phone
              </label>
              <input
                type="tel"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#004B93] focus:outline-none"
                placeholder="1300 000 000"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">
                Support Email
              </label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#004B93] focus:outline-none"
                placeholder="support@yourfranchise.com"
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#004B93] text-white py-3 rounded-lg font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Franchise Settings'}
          </button>
        </form>
      </main>
    </div>
  );
}