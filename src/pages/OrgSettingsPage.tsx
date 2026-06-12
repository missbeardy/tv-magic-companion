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

      const supabaseUrl = 'https://abnheynzugpicikxwwmv.supabase.co';
      
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
      <main className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Franchise Settings</h2>
          <p className="text-gray-500 text-sm">Manage your brand and contact information</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
        )}
        
        {saved && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">✅ Settings saved!</div>
        )}

        {/* Brand Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">🏢 Franchise Name</p>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="e.g., TVMagic Brisbane"
              required
            />
            <p className="text-xs text-gray-400 mt-1">This appears throughout the app and on customer communications</p>
          </div>
        </div>

        {/* Brand Colors */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">🎨 Brand Colors</p>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Primary Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="#004B93"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Secondary Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="#00B4C5"
              />
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">📞 Contact Information</p>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Support Phone</label>
            <input
              type="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="1300 000 000"
            />
            <p className="text-xs text-gray-400 mt-1">Shown to customers for support inquiries</p>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Support Email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="support@yourfranchise.com"
            />
            <p className="text-xs text-gray-400 mt-1">Used for customer support and notifications</p>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full bg-[#004B93] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#003d7a] transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </main>
    </div>
  );
}