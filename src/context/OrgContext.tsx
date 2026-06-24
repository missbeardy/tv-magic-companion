import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { canAccessFeature as checkFeature, type FeatureKey } from '../lib/features';
import { isPlatformAdminRole } from '../lib/roles';
import type { Brand, Org } from '../types/org';

interface OrgContextType {
  org: Org | null;
  brand: Brand | null;
  loading: boolean;
  refreshOrg: () => Promise<void>;
  canAccessFeature: (feature: string) => boolean;
  getRemainingLeads: () => number;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  brand: null,
  loading: true,
  refreshOrg: async () => {},
  canAccessFeature: () => false,
  getRemainingLeads: () => 0,
});

const TIER_LIMITS: Record<string, { maxEmployees: number; maxLeadsPerMonth: number }> = {
  basic: { maxEmployees: 3, maxLeadsPerMonth: 100 },
  pro: { maxEmployees: 15, maxLeadsPerMonth: 1000 },
  enterprise: { maxEmployees: 9999, maxLeadsPerMonth: 999999 },
};

function mapBrand(row: Record<string, unknown> | null): Brand | null {
  if (!row) return null;
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    vertical: (row.vertical as string) || 'general',
    logo_url: (row.logo_url as string | null) ?? null,
    primary_color: (row.primary_color as string) || '#004B93',
    secondary_color: (row.secondary_color as string) || '#00B4C5',
    sms_templates: (row.sms_templates as Record<string, string>) || {},
    ai_config: (row.ai_config as Record<string, unknown>) || {},
    upsell_items: (row.upsell_items as Brand['upsell_items']) || [],
    is_active: row.is_active !== false,
  };
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshOrg() {
    if (!profile?.org_id) {
      setOrg(null);
      setBrand(null);
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
      setOrg(null);
      setBrand(null);
    } else {
      setOrg(data as Org);
      if (data?.brand_id) {
        const { data: brandData } = await supabase
          .from('brands')
          .select('*')
          .eq('id', data.brand_id)
          .maybeSingle();
        setBrand(mapBrand(brandData));
      } else {
        setBrand(null);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    refreshOrg();
  }, [profile?.org_id]);

  function canAccessFeature(feature: string): boolean {
    if (isPlatformAdminRole(profile?.role)) return true
    return checkFeature(feature as FeatureKey, org?.subscription_tier)
  }

  function getRemainingLeads(): number {
    if (!org) return 0;
    const limit = TIER_LIMITS[org.subscription_tier]?.maxLeadsPerMonth || 100;
    return Math.max(0, limit - (org.lead_count_this_month || 0));
  }

  return (
    <OrgContext.Provider value={{ org, brand, loading, refreshOrg, canAccessFeature, getRemainingLeads }}>
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
export type { Org, Brand };
