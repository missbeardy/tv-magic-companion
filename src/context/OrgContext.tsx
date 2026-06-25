import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  canAccessFeature as checkFeature,
  canAccessFeatureSwitch,
  FEATURE_SWITCH_KEYS,
  getDefaultFeatureSwitchState,
  resolveFeatureSwitchValue,
  type FeatureKey,
  type FeatureSwitchKey,
  type FeatureSwitchState,
} from '../lib/features';
import { isPlatformAdminRole } from '../lib/roles';
import type { Brand, Org } from '../types/org';

interface OrgContextType {
  org: Org | null;
  brand: Brand | null;
  loading: boolean;
  featureSwitchesLoading: boolean;
  featureSwitches: FeatureSwitchState;
  refreshOrg: () => Promise<void>;
  refreshFeatureSwitches: () => Promise<void>;
  canAccessFeature: (feature: string) => boolean;
  isFeatureEnabled: (feature: FeatureSwitchKey) => boolean;
  getRemainingLeads: () => number;
}

const OrgContext = createContext<OrgContextType>({
  org: null,
  brand: null,
  loading: true,
  featureSwitchesLoading: true,
  featureSwitches: getDefaultFeatureSwitchState(),
  refreshOrg: async () => {},
  refreshFeatureSwitches: async () => {},
  canAccessFeature: () => false,
  isFeatureEnabled: () => false,
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
  const [featureSwitchesLoading, setFeatureSwitchesLoading] = useState(true);
  const [featureSwitches, setFeatureSwitches] = useState<FeatureSwitchState>(getDefaultFeatureSwitchState());

  async function refreshFeatureSwitches(targetOrgId?: string | null, targetBrandId?: string | null) {
    const orgId = targetOrgId ?? org?.id ?? profile?.org_id ?? null;
    const brandId = targetBrandId ?? org?.brand_id ?? brand?.id ?? null;

    if (!orgId) {
      setFeatureSwitches(getDefaultFeatureSwitchState());
      setFeatureSwitchesLoading(false);
      return;
    }

    setFeatureSwitchesLoading(true);

    const catalogPromise = supabase
      .from('feature_flag_catalog')
      .select('feature_key, default_enabled')
      .in('feature_key', [...FEATURE_SWITCH_KEYS]);

    const brandPromise = brandId
      ? supabase
          .from('brand_feature_switches')
          .select('feature_key, enabled')
          .eq('brand_id', brandId)
          .in('feature_key', [...FEATURE_SWITCH_KEYS])
      : Promise.resolve({ data: [], error: null });

    const orgPromise = supabase
      .from('org_feature_switch_overrides')
      .select('feature_key, enabled')
      .eq('org_id', orgId)
      .in('feature_key', [...FEATURE_SWITCH_KEYS]);

    const [catalogRes, brandRes, orgRes] = await Promise.all([catalogPromise, brandPromise, orgPromise]);

    if (catalogRes.error || brandRes.error || orgRes.error) {
      console.warn('Feature switches unavailable; using defaults.', {
        catalogError: catalogRes.error?.message,
        brandError: brandRes.error?.message,
        orgError: orgRes.error?.message,
      });
      setFeatureSwitches(getDefaultFeatureSwitchState());
      setFeatureSwitchesLoading(false);
      return;
    }

    const catalogMap: Partial<Record<FeatureSwitchKey, boolean>> = {}
    for (const row of (catalogRes.data ?? []) as Array<{ feature_key: string; default_enabled: boolean }>) {
      if ((FEATURE_SWITCH_KEYS as readonly string[]).includes(row.feature_key)) {
        catalogMap[row.feature_key as FeatureSwitchKey] = row.default_enabled === true
      }
    }
    const brandMap: Partial<Record<FeatureSwitchKey, boolean>> = {}
    for (const row of (brandRes.data ?? []) as Array<{ feature_key: string; enabled: boolean }>) {
      if ((FEATURE_SWITCH_KEYS as readonly string[]).includes(row.feature_key)) {
        brandMap[row.feature_key as FeatureSwitchKey] = row.enabled === true
      }
    }
    const orgMap: Partial<Record<FeatureSwitchKey, boolean>> = {}
    for (const row of (orgRes.data ?? []) as Array<{ feature_key: string; enabled: boolean }>) {
      if ((FEATURE_SWITCH_KEYS as readonly string[]).includes(row.feature_key)) {
        orgMap[row.feature_key as FeatureSwitchKey] = row.enabled === true
      }
    }

    const next = getDefaultFeatureSwitchState();
    for (const key of FEATURE_SWITCH_KEYS) {
      next[key] = resolveFeatureSwitchValue(key, {
        catalogDefault: catalogMap[key],
        brandValue: brandMap[key],
        orgOverride: orgMap[key],
      })
    }

    setFeatureSwitches(next);
    setFeatureSwitchesLoading(false);
  }

  async function refreshOrg() {
    if (!profile?.org_id) {
      setOrg(null);
      setBrand(null);
      setFeatureSwitches(getDefaultFeatureSwitchState());
      setFeatureSwitchesLoading(false);
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
      setFeatureSwitches(getDefaultFeatureSwitchState());
      setFeatureSwitchesLoading(false);
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
      await refreshFeatureSwitches(data.id, data.brand_id ?? null);
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

  function isFeatureEnabled(feature: FeatureSwitchKey): boolean {
    return canAccessFeatureSwitch(feature, org?.subscription_tier, featureSwitches);
  }

  function getRemainingLeads(): number {
    if (!org) return 0;
    const limit = TIER_LIMITS[org.subscription_tier]?.maxLeadsPerMonth || 100;
    return Math.max(0, limit - (org.lead_count_this_month || 0));
  }

  return (
    <OrgContext.Provider
      value={{
        org,
        brand,
        loading,
        featureSwitchesLoading,
        featureSwitches,
        refreshOrg,
        refreshFeatureSwitches,
        canAccessFeature,
        isFeatureEnabled,
        getRemainingLeads,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export const useOrg = () => useContext(OrgContext);
export type { Org, Brand };
