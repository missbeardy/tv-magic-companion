import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface Org {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  support_phone: string | null;
  support_email: string | null;
  subscription_tier: 'basic' | 'pro' | 'enterprise';
  subscription_expires_at: string | null;
  lead_count_this_month: number;
}

interface OrgContextType {
  org: Org | null;
  loading: boolean;
  refreshOrg: () => Promise<void>;
  canAccessFeature: (feature: string) => boolean;
  getRemainingLeads: () => number;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  loading: true,
  refreshOrg: async () => {},
  canAccessFeature: () => false,
  getRemainingLeads: () => 0,
});

// Feature availability by tier
const TIER_FEATURES: Record<string, string[]> = {
  basic: ['leads', 'calendar', 'notifications', 'profile'],
  pro: ['leads', 'calendar', 'notifications', 'profile', 'ai_parsing', 'social_posting', 'reports', 'task_board'],
  enterprise: ['leads', 'calendar', 'notifications', 'profile', 'ai_parsing', 'social_posting', 'reports', 'task_board', 'api_access', 'unlimited_leads'],
};

const TIER_LIMITS: Record<string, { maxEmployees: number; maxLeadsPerMonth: number }> = {
  basic: { maxEmployees: 3, maxLeadsPerMonth: 100 },
  pro: { maxEmployees: 15, maxLeadsPerMonth: 1000 },
  enterprise: { maxEmployees: 9999, maxLeadsPerMonth: 999999 },
};

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshOrg() {
    if (!profile?.org_id) {
      setOrg(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('orgs')
      .select('*')
      .eq('id', profile.org_id)
      .single();

    if (error) {
      console.error('Failed to fetch org:', error);
    } else {
      setOrg(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    refreshOrg();
  }, [profile?.org_id]);

  function canAccessFeature(feature: string): boolean {
    if (!org) return false;
    const features = TIER_FEATURES[org.subscription_tier] || TIER_FEATURES.basic;
    return features.includes(feature);
  }

  function getRemainingLeads(): number {
    if (!org) return 0;
    const limit = TIER_LIMITS[org.subscription_tier]?.maxLeadsPerMonth || 100;
    return Math.max(0, limit - (org.lead_count_this_month || 0));
  }

  return (
    <OrgContext.Provider value={{ org, loading, refreshOrg, canAccessFeature, getRemainingLeads }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);