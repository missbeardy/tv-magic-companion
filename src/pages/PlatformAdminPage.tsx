import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'
import { buildBrandTransferPayload } from '../lib/brandTransfer'
import NavBar from '../components/NavBar'
import BrandQuoteEmailEditor from '../components/BrandQuoteEmailEditor'
import PlatformFeatureSwitches from '../components/platform/PlatformFeatureSwitches'
import { Building2, Plus, RefreshCw, ArrowRightLeft } from 'lucide-react'
import {
  FEATURE_SWITCH_DEFINITIONS,
  FEATURE_SWITCH_KEYS,
  FEATURE_SWITCH_MIN_TIERS,
  type FeatureSwitchKey,
} from '../lib/features'

interface BrandRow {
  id: string
  name: string
  slug: string
  vertical: string
  is_active: boolean
  primary_color: string
  secondary_color: string
  email_templates: Record<string, string>
}

interface OrgRow {
  id: string
  name: string
  slug: string
  subscription_tier: string
  brand_id: string | null
}

interface FeatureCatalogRow {
  feature_key: FeatureSwitchKey
  label: string
  description: string | null
  default_enabled: boolean
  min_tier: string
  category?: string | null
}

interface FeatureSwitchRow {
  feature_key: FeatureSwitchKey
  enabled: boolean
}

export default function PlatformAdminPage() {
  const { profile } = useAuth()
  const { refreshOrg } = useOrg()
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [featureCatalog, setFeatureCatalog] = useState<FeatureCatalogRow[]>([])
  const [brandSwitchRows, setBrandSwitchRows] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [switchesError, setSwitchesError] = useState('')
  const [switchesLoading, setSwitchesLoading] = useState(true)
  const [savingSwitchKey, setSavingSwitchKey] = useState<string | null>(null)
  const [selectedBrandId, setSelectedBrandId] = useState('')
  const [transferringOrgId, setTransferringOrgId] = useState<string | null>(null)

  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSlug, setNewOrgSlug] = useState('')
  const [newOrgBrandId, setNewOrgBrandId] = useState('')
  const [newOrgTier, setNewOrgTier] = useState<'basic' | 'pro' | 'enterprise'>('basic')
  const [newOrgOperationMode, setNewOrgOperationMode] = useState<'solo' | 'team'>('team')
  const [creating, setCreating] = useState(false)

  async function loadData() {
    setLoading(true)
    setSwitchesLoading(true)
    setError('')
    setSwitchesError('')
    const [brandsRes, orgsRes] = await Promise.all([
      supabase
        .from('brands')
        .select('id, name, slug, vertical, is_active, primary_color, secondary_color, email_templates')
        .order('name'),
      supabase.from('orgs').select('id, name, slug, subscription_tier, brand_id').order('name'),
    ])
    if (brandsRes.error) setError(brandsRes.error.message)
    else {
      setBrands(
        (brandsRes.data ?? []).map((row) => ({
          ...row,
          primary_color: (row.primary_color as string) || '#004B93',
          secondary_color: (row.secondary_color as string) || '#00B4C5',
          email_templates: (row.email_templates as Record<string, string>) ?? {},
        }))
      )
    }
    if (orgsRes.error) setError(orgsRes.error.message)
    else setOrgs(orgsRes.data ?? [])

    const [catalogRes, brandSwitchRes] = await Promise.all([
      supabase
        .from('feature_flag_catalog')
        .select('feature_key, label, description, default_enabled, min_tier, category')
        .in('feature_key', [...FEATURE_SWITCH_KEYS]),
      supabase
        .from('brand_feature_switches')
        .select('brand_id, feature_key, enabled')
        .in('feature_key', [...FEATURE_SWITCH_KEYS]),
    ])

    if (catalogRes.error || brandSwitchRes.error) {
      setSwitchesError(
        'Feature switches are unavailable. Run migrations 20250701110000 and 20250701140000_feature_switches_simplify.sql and reload.'
      )
      setFeatureCatalog(
        FEATURE_SWITCH_KEYS.map((key) => ({
          feature_key: key,
          label: FEATURE_SWITCH_DEFINITIONS[key].label,
          description: FEATURE_SWITCH_DEFINITIONS[key].description,
          default_enabled: false,
          min_tier: FEATURE_SWITCH_MIN_TIERS[key],
        }))
      )
      setBrandSwitchRows({})
    } else {
      const catalog = (catalogRes.data as FeatureCatalogRow[]) ?? []
      setFeatureCatalog(
        catalog.length > 0
          ? catalog.map((row) => ({
              ...row,
              min_tier: row.min_tier || FEATURE_SWITCH_MIN_TIERS[row.feature_key] || 'basic',
            }))
          : FEATURE_SWITCH_KEYS.map((key) => ({
              feature_key: key,
              label: FEATURE_SWITCH_DEFINITIONS[key].label,
              description: FEATURE_SWITCH_DEFINITIONS[key].description,
              default_enabled: false,
              min_tier: FEATURE_SWITCH_MIN_TIERS[key],
            }))
      )

      const brandMap: Record<string, boolean> = {}
      for (const row of (brandSwitchRes.data ?? []) as Array<FeatureSwitchRow & { brand_id: string }>) {
        brandMap[`${row.brand_id}:${row.feature_key}`] = row.enabled
      }
      setBrandSwitchRows(brandMap)
    }

    setLoading(false)
    setSwitchesLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (brands.length && !newOrgBrandId) {
      setNewOrgBrandId(brands[0].id)
    }
  }, [brands, newOrgBrandId])

  useEffect(() => {
    if (brands.length && !selectedBrandId) {
      setSelectedBrandId(brands[0].id)
    }
  }, [brands, selectedBrandId])

  async function fetchBrandTemplate(brandId: string) {
    const { data, error: fetchError } = await supabase
      .from('brands')
      .select('id, primary_color, secondary_color, upsell_items')
      .eq('id', brandId)
      .single()
    if (fetchError || !data) throw new Error(fetchError?.message ?? 'Brand not found')
    return data
  }

  async function applyBrandToOrg(orgId: string, brandId: string, orgName: string) {
    setTransferringOrgId(orgId)
    setError('')
    setSuccess('')
    try {
      const brand = await fetchBrandTemplate(brandId)
      const payload = buildBrandTransferPayload(brand)
      const { error: updateError } = await supabase
        .from('orgs')
        .update(payload)
        .eq('id', orgId)
      if (updateError) throw updateError
      setSuccess(`Applied brand template to "${orgName}".`)
      await loadData()
      await refreshOrg()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Brand transfer failed')
    } finally {
      setTransferringOrgId(null)
    }
  }

  async function handleChangeOrgBrand(orgId: string, brandId: string, orgName: string) {
    await applyBrandToOrg(orgId, brandId, orgName)
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!newOrgName.trim() || !newOrgSlug.trim() || !newOrgBrandId) return
    setCreating(true)
    setError('')
    setSuccess('')

    const brand = brands.find((b) => b.id === newOrgBrandId)
    try {
      const brandFull = await fetchBrandTemplate(newOrgBrandId)
      const payload = buildBrandTransferPayload(brandFull)

      const { error: insertError } = await supabase.from('orgs').insert({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim().toLowerCase().replace(/\s+/g, '-'),
        subscription_tier: newOrgTier,
        operation_mode: newOrgOperationMode,
        ...payload,
      })

      if (insertError) throw insertError

      setSuccess(`Created franchisee "${newOrgName}" under ${brand?.name ?? 'brand'} with brand template applied.`)
      setNewOrgName('')
      setNewOrgSlug('')
      await loadData()
      await refreshOrg()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create org')
    }
    setCreating(false)
  }

  function brandName(brandId: string | null) {
    if (!brandId) return 'No brand'
    return brands.find((b) => b.id === brandId)?.name ?? 'Unknown'
  }

  const featureKeys = useMemo(
    () =>
      (featureCatalog.length > 0
        ? featureCatalog.map((f) => f.feature_key)
        : [...FEATURE_SWITCH_KEYS]) as FeatureSwitchKey[],
    [featureCatalog]
  )

  const catalogByKey = useMemo(() => {
    const map: Partial<Record<FeatureSwitchKey, FeatureCatalogRow>> = {}
    for (const row of featureCatalog) map[row.feature_key] = row
    return map
  }, [featureCatalog])

  const missingFeaturesForSelectedBrand = useMemo(() => {
    if (!selectedBrandId) return [] as FeatureSwitchKey[]
    return featureKeys.filter((feature) => !(`${selectedBrandId}:${feature}` in brandSwitchRows))
  }, [selectedBrandId, featureKeys, brandSwitchRows])

  function brandSwitchValue(brandId: string, feature: FeatureSwitchKey): boolean {
    const key = `${brandId}:${feature}`
    if (key in brandSwitchRows) return brandSwitchRows[key]
    return catalogByKey[feature]?.default_enabled ?? false
  }

  async function updateBrandSwitch(brandId: string, feature: FeatureSwitchKey, enabled: boolean) {
    setSavingSwitchKey(`brand:${brandId}:${feature}`)
    setSwitchesError('')
    const { error: saveError } = await supabase
      .from('brand_feature_switches')
      .upsert(
        {
          brand_id: brandId,
          feature_key: feature,
          enabled,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'brand_id,feature_key' }
      )
    if (saveError) {
      setSwitchesError(saveError.message)
    } else {
      setBrandSwitchRows((prev) => ({ ...prev, [`${brandId}:${feature}`]: enabled }))
      setSuccess('Feature defaults updated.')
    }
    setSavingSwitchKey(null)
  }

  function handleBrandColorsUpdated(brandId: string, primaryColor: string, secondaryColor: string) {
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId ? { ...b, primary_color: primaryColor, secondary_color: secondaryColor } : b
      )
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 size={24} className="text-[var(--color-primary)]" />
              Platform Admin
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              FieldBourne Digital — provision brands and transfer brand templates to franchisees.
            </p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-3 rounded-xl">{success}</div>
        )}

        <section className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Brand templates</h2>
          <p className="text-xs text-gray-500">
            SMS and email templates live on the brand and are used at runtime (quote emails use{' '}
            <code className="text-[10px]">customer_quote_request_subject</code> /{' '}
            <code className="text-[10px]">customer_quote_request_html</code>). Colors and upsells are copied to each
            franchisee on transfer.
          </p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {brands.map((b) => (
                <BrandQuoteEmailEditor
                  key={b.id}
                  brandId={b.id}
                  brandName={b.name}
                  slug={b.slug}
                  vertical={b.vertical}
                  primaryColor={b.primary_color}
                  emailTemplates={b.email_templates}
                  onSaved={async (message) => {
                    setSuccess(message)
                    setError('')
                    await loadData()
                    await refreshOrg()
                  }}
                  onError={(message) => {
                    setError(message)
                    setSuccess('')
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Feature switches</h2>
          <p className="text-xs text-gray-500">
            Tier features (Tasks, Social, Reports, AI parsing) turn on automatically when a franchise upgrades.
            Feature switches below are manual rollout controls per brand — all franchises under a brand share the same
            setting.
          </p>
          {switchesError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs p-3 rounded-xl">
              {switchesError}
            </div>
          )}
          {switchesLoading ? (
            <p className="text-sm text-gray-400">Loading feature switches…</p>
          ) : (
            <PlatformFeatureSwitches
              brands={brands}
              selectedBrandId={selectedBrandId}
              onBrandChange={setSelectedBrandId}
              catalogByKey={catalogByKey}
              brandSwitchValue={brandSwitchValue}
              onToggle={updateBrandSwitch}
              savingSwitchKey={savingSwitchKey}
              missingFeaturesForBrand={missingFeaturesForSelectedBrand}
              onBrandColorsUpdated={handleBrandColorsUpdated}
            />
          )}
        </section>

        <section className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Plus size={18} /> Provision franchisee org
          </h2>
          <form onSubmit={handleCreateOrg} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Franchisee name</label>
              <input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="TV Magic South Brisbane"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Slug</label>
              <input
                value={newOrgSlug}
                onChange={(e) => setNewOrgSlug(e.target.value)}
                placeholder="tv-magic-south-brisbane"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Brand</label>
              <select
                value={newOrgBrandId}
                onChange={(e) => setNewOrgBrandId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Operation mode</label>
              <select
                value={newOrgOperationMode}
                onChange={(e) => setNewOrgOperationMode(e.target.value as 'solo' | 'team')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="team">Team (manager assigns)</option>
                <option value="solo">Solo (owner-operator)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tier</label>
              <select
                value={newOrgTier}
                onChange={(e) => setNewOrgTier(e.target.value as typeof newOrgTier)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create franchisee org'}
              </button>
            </div>
          </form>
        </section>

        <section className="card p-6 space-y-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <ArrowRightLeft size={18} /> Brand transfer — all franchisee orgs
          </h2>
          <p className="text-xs text-gray-500">
            Assign a brand and apply its template (colors + upsells). Tier is set manually here — no payment integration.
          </p>
          <ul className="divide-y divide-gray-100 text-sm space-y-0">
            {orgs.map((o) => (
              <li key={o.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-medium">{o.name}</span>
                  <span className="text-gray-400 ml-2">{o.slug} · {o.subscription_tier}</span>
                  <p className="text-xs text-gray-400 mt-0.5">Brand: {brandName(o.brand_id)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={o.brand_id ?? ''}
                    onChange={(e) => {
                      if (e.target.value) handleChangeOrgBrand(o.id, e.target.value, o.name)
                    }}
                    disabled={transferringOrgId === o.id || brands.length === 0}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <option value="" disabled>Select brand…</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  {o.brand_id && (
                    <button
                      type="button"
                      onClick={() => applyBrandToOrg(o.id, o.brand_id!, o.name)}
                      disabled={transferringOrgId === o.id}
                      className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {transferringOrgId === o.id ? 'Applying…' : 'Re-apply template'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
