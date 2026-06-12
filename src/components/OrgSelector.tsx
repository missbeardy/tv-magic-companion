import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';

interface Org {
  id: string;
  name: string;
  slug: string;
}

export default function OrgSelector() {
  const { profile } = useAuth();
  const { org, refreshOrg } = useOrg();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Only show if user is super-admin (you can add a super_admin role)
  const isSuperAdmin = profile?.role === 'manager'; // Expand this later

  useEffect(() => {
    if (!isSuperAdmin) return;
    
    async function fetchOrgs() {
      const { data } = await supabase.from('orgs').select('id, name, slug');
      if (data) setOrgs(data);
    }
    fetchOrgs();
  }, [isSuperAdmin]);

  async function switchOrg(orgId: string) {
    setSwitching(true);
    
    // Update user's profile to new org
    const { error } = await supabase
      .from('profiles')
      .update({ org_id: orgId })
      .eq('id', profile?.id);

    if (!error) {
      await refreshOrg();
      // Reload page to refresh all data
      window.location.reload();
    }
    setSwitching(false);
    setShowDropdown(false);
  }

  if (!isSuperAdmin || !org) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={switching}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-sm"
      >
        <span>🏢</span>
        <span>{org.name}</span>
        <span className="text-xs">▼</span>
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          {orgs.map(o => (
            <button
              key={o.id}
              onClick={() => switchOrg(o.id)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition flex items-center justify-between ${
                o.id === org.id ? 'bg-blue-50 text-[#004B93] font-medium' : 'text-gray-700'
              }`}
            >
              {o.name}
              {o.id === org.id && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}