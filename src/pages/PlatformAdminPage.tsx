import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'
import { buildBrandTransferPayload } from '../lib/brandTransfer'
import NavBar from '../components/NavBar'
import { Building2, Plus, RefreshCw, ArrowRightLeft } from 'lucide-react'
import {
  FEATURE_SWITCH_DEFINITIONS,
  FEATURE_SWITCH_KEYS,
  type FeatureSwitchKey,
} from '../lib/features'

interface BrandRow {
  id: string
  name: string
  slug: string
  vertical: string
  is_active: boolean
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
  const [orgOverrideRows, setOrgOverrideRows] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [switchesError, setSwitchesError] = useState('')
  const [switchesLoading, setSwitchesLoading] = useState(true)
  const [savingSwitchKey, setSavingSwitchKey] = useState<string | null>(null)
  const [orgFilter, setOrgFilter] = useState('')
  const [transferringOrgId, setTransferringOrgId] = useState<string | null>(null)

  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSlug, setNewOrgSlug] = useState('')
  const [newOrgBrandId, setNewOrgBrandId] = useState('')
  const [newOrgTier, setNewOrgTier] = useState<'basic' | 'pro' | 'enterprise'>('basic')
  const [creating, setCreating] = useState(false)

  async function loadData() {
    setLoading(true)
    setSwitchesLoading(true)
    setError('')
    setSwitchesError('')
    const [brandsRes, orgsRes] = await Promise.all([
      supabase.from('brands').select('id, name, slug, vertical, is_active').order('name'),
      supabase.from('orgs').select('id, name, slug, subscription_tier, brand_id').order('name'),
    ])
    if (brandsRes.error) setError(brandsRes.error.message)
    else setBrands(brandsRes.data ?? [])
    if (orgsRes.error) setError(orgsRes.error.message)
    else setOrgs(orgsRes.data ?? [])

    const [catalogRes, brandSwitchRes, orgSwitchRes] = await Promise.all([
      supabase
        .from('feature_flag_catalog')
        .select('feature_key, label, description, default_enabled')
        .in('feature_key', [...FEATURE_SWITCH_KEYS]),
      supabase
        .from('brand_feature_switches')
        .select('brand_id, feature_key, enabled')
        .in('feature_key', [...FEATURE_SWITCH_KEYS]),
      supabase
        .from('org_feature_switch_overrides')
        .select('org_id, feature_key, enabled')
        .in('feature_key', [...FEATURE_SWITCH_KEYS]),
    ])

    if (catalogRes.error || brandSwitchRes.error || orgSwitchRes.error) {
      setSwitchesError(
        'Feature switches are unavailable. Run migration 20250701110000_feature_kill_switches.sql and reload.'
      )
      setFeatureCatalog(
        FEATURE_SWITCH_KEYS.map((key) => ({
          feature_key: key,
          label: FEATURE_SWITCH_DEFINITIONS[key].label,
          description: FEATURE_SWITCH_DEFINITIONS[key].description,
          default_enabled: false,
        }))
      )
      setBrandSwitchRows({})
      setOrgOverrideRows({})
    } else {
      const catalog = (catalogRes.data as FeatureCatalogRow[]) ?? []
      setFeatureCatalog(
        catalog.length > 0
          ? catalog
          : FEATURE_SWITCH_KEYS.map((key) => ({
              feature_key: key,
              label: FEATURE_SWITCH_DEFINITIONS[key].label,
              description: FEATURE_SWITCH_DEFINITIONS[key].description,
              default_enabled: false,
            }))
      )

      const brandMap: Record<string, boolean> = {}
      for (const row of (brandSwitchRes.data ?? []) as Array<FeatureSwitchRow & { brand_id: string }>) {
        brandMap[`${row.brand_id}:${row.feature_key}`] = row.enabled
      }
      setBrandSwitchRows(brandMap)

      const orgMap: Record<string, boolean> = {}
      for (const row of (orgSwitchRes.data ?? []) as Array<FeatureSwitchRow & { org_id: string }>) {
        orgMap[`${row.org_id}:${row.feature_key}`] = row.enabled
      }
      setOrgOverrideRows(orgMap)
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

  const filteredOrgs = useMemo(() => {
    const q = orgFilter.trim().toLowerCase()
    if (!q) return orgs
    return orgs.filter((o) => `${o.name} ${o.slug}`.toLowerCase().includes(q))
  }, [orgFilter, orgs])

  const missingBrandDefaults = useMemo(() => {
    const missing: Array<{ brandName: string; feature: FeatureSwitchKey }> = []
    for (const b of brands) {
      for (const feature of featureKeys) {
        const key = `${b.id}:${feature}`
        if (!(key in brandSwitchRows)) {
          missing.push({ brandName: b.name, feature })
        }
      }
    }
    return missing
  }, [brands, featureKeys, brandSwitchRows])

  function brandSwitchValue(brandId: string, feature: FeatureSwitchKey): boolean {
    const key = `${brandId}:${feature}`
    if (key in brandSwitchRows) return brandSwitchRows[key]
    return catalogByKey[feature]?.default_enabled ?? false
  }

  function orgOverrideValue(orgId: string, feature: FeatureSwitchKey): boolean | null {
    const key = `${orgId}:${feature}`
    if (key in orgOverrideRows) return orgOverrideRows[key]
    return null
  }

  function effectiveSwitch(orgRow: OrgRow, feature: FeatureSwitchKey): boolean {
    const override = orgOverrideValue(orgRow.id, feature)
    if (override !== null) return override
    if (!orgRow.brand_id) return catalogByKey[feature]?.default_enabled ?? false
    return brandSwitchValue(orgRow.brand_id, feature)
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

  async function updateOrgOverride(orgId: string, feature: FeatureSwitchKey, mode: 'inherit' | 'on' | 'off') {
    setSavingSwitchKey(`org:${orgId}:${feature}`)
    setSwitchesError('')
    if (mode === 'inherit') {
      const { error: delError } = await supabase
        .from('org_feature_switch_overrides')
        .delete()
        .eq('org_id', orgId)
        .eq('feature_key', feature)
      if (delError) {
        setSwitchesError(delError.message)
      } else {
        setOrgOverrideRows((prev) => {
          const next = { ...prev }
          delete next[`${orgId}:${feature}`]
          return next
        })
        setSuccess('Org override cleared (inherited from brand).')
      }
      setSavingSwitchKey(null)
      return
    }

    const enabled = mode === 'on'
    const { error: saveError } = await supabase
      .from('org_feature_switch_overrides')
      .upsert(
        {
          org_id: orgId,
          feature_key: feature,
          enabled,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,feature_key' }
      )
    if (saveError) {
      setSwitchesError(saveError.message)
    } else {
      setOrgOverrideRows((prev) => ({ ...prev, [`${orgId}:${feature}`]: enabled }))
      setSuccess('Org override updated.')
    }
    setSavingSwitchKey(null)
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
            SMS templates and AI config live on the brand and are used at runtime. Colors and upsells are copied to each franchisee on transfer.
          </p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {brands.map((b) => (
                <li key={b.id} className="py-3 flex justify-between text-sm">
                  <span className="font-medium text-gray-800">{b.name}</span>
                  <span className="text-gray-400">{b.slug} · {b.vertical}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-800">Feature switches (kill switches)</h2>
          <p className="text-xs text-gray-500">
            Release reminder: before every preview/prod push, confirm effective ON/OFF state per franchise for new features.
          </p>
          {switchesError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs p-3 rounded-xl">
              {switchesError}
            </div>
          )}
          {!switchesError && missingBrandDefaults.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs p-3 rounded-xl">
              Missing explicit brand defaults: {missingBrandDefaults
                .slice(0, 6)
                .map((entry) => `${entry.brandName} → ${FEATURE_SWITCH_DEFINITIONS[entry.feature].label}`)
                .join(', ')}
              {missingBrandDefaults.length > 6 ? ` (+${missingBrandDefaults.length - 6} more)` : ''}
            </div>
          )}
          {switchesLoading ? (
            <p className="text-sm text-gray-400">Loading feature switches…</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-semibold">Brand default</th>
                      {featureKeys.map((feature) => (
                        <th key={feature} className="py-2 pr-3 font-semibold">
                          <div>{catalogByKey[feature]?.label ?? FEATURE_SWITCH_DEFINITIONS[feature].label}</div>
                          <div className="font-normal text-[10px] text-gray-400 mt-0.5">
                            {catalogByKey[feature]?.description ?? FEATURE_SWITCH_DEFINITIONS[feature].description}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {brands.map((b) => (
                      <tr key={b.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-gray-800">{b.name}</p>
                          <p className="text-[10px] text-gray-400">{b.slug}</p>
                        </td>
                        {featureKeys.map((feature) => {
                          const current = brandSwitchValue(b.id, feature)
                          const rowKey = `brand:${b.id}:${feature}`
                          return (
                            <td key={feature} className="py-2 pr-3">
                              <button
                                type="button"
                                disabled={savingSwitchKey === rowKey}
                                onClick={() => updateBrandSwitch(b.id, feature, !current)}
                                className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                                  current
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-gray-50 text-gray-500 border-gray-200'
                                } disabled:opacity-50`}
                              >
                                {savingSwitchKey === rowKey ? 'Saving…' : current ? 'ON' : 'OFF'}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Franchise overrides</h3>
                  <input
                    value={orgFilter}
                    onChange={(e) => setOrgFilter(e.target.value)}
                    placeholder="Filter franchise name…"
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs w-52"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3 font-semibold">Franchise</th>
                        {featureKeys.map((feature) => (
                          <th key={feature} className="py-2 pr-3 font-semibold">
                            {catalogByKey[feature]?.label ?? FEATURE_SWITCH_DEFINITIONS[feature].label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrgs.map((o) => (
                        <tr key={o.id} className="border-b border-gray-50">
                          <td className="py-2 pr-3">
                            <p className="font-medium text-gray-800">{o.name}</p>
                            <p className="text-[10px] text-gray-400">{o.slug} · {brandName(o.brand_id)}</p>
                          </td>
                          {featureKeys.map((feature) => {
                            const override = orgOverrideValue(o.id, feature)
                            const rowKey = `org:${o.id}:${feature}`
                            const effective = effectiveSwitch(o, feature)
                            const mode = override === null ? 'inherit' : override ? 'on' : 'off'
                            return (
                              <td key={feature} className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={mode}
                                    disabled={savingSwitchKey === rowKey}
                                    onChange={(e) =>
                                      updateOrgOverride(
                                        o.id,
                                        feature,
                                        e.target.value as 'inherit' | 'on' | 'off'
                                      )
                                    }
                                    className="border border-gray-200 rounded-md px-2 py-1 text-[11px]"
                                  >
                                    <option value="inherit">Inherited</option>
                                    <option value="on">Override ON</option>
                                    <option value="off">Override OFF</option>
                                  </select>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                      effective
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    Effective {effective ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
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
