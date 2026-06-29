import {
  FEATURE_SWITCH_CATEGORIES,
  FEATURE_SWITCH_CATEGORY_LABELS,
  FEATURE_SWITCH_DEFINITIONS,
  FEATURE_SWITCH_MIN_TIERS,
  FEATURE_SWITCHES_BY_CATEGORY,
  type FeatureSwitchKey,
} from '../../lib/features'

interface BrandOption {
  id: string
  name: string
  slug: string
}

interface CatalogRow {
  feature_key: FeatureSwitchKey
  label: string
  description: string | null
  default_enabled: boolean
  min_tier: string
}

interface Props {
  brands: BrandOption[]
  selectedBrandId: string
  onBrandChange: (brandId: string) => void
  catalogByKey: Partial<Record<FeatureSwitchKey, CatalogRow>>
  brandSwitchValue: (brandId: string, feature: FeatureSwitchKey) => boolean
  onToggle: (brandId: string, feature: FeatureSwitchKey, enabled: boolean) => void
  savingSwitchKey: string | null
  missingFeaturesForBrand: FeatureSwitchKey[]
}

function minTierLabel(feature: FeatureSwitchKey, catalogByKey: Props['catalogByKey']): string {
  const tier = catalogByKey[feature]?.min_tier ?? FEATURE_SWITCH_MIN_TIERS[feature] ?? 'basic'
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function featureLabel(feature: FeatureSwitchKey, catalogByKey: Props['catalogByKey']): string {
  return catalogByKey[feature]?.label ?? FEATURE_SWITCH_DEFINITIONS[feature].label
}

function featureDescription(feature: FeatureSwitchKey, catalogByKey: Props['catalogByKey']): string {
  return catalogByKey[feature]?.description ?? FEATURE_SWITCH_DEFINITIONS[feature].description
}

export default function PlatformFeatureSwitches({
  brands,
  selectedBrandId,
  onBrandChange,
  catalogByKey,
  brandSwitchValue,
  onToggle,
  savingSwitchKey,
  missingFeaturesForBrand,
}: Props) {
  const selectedBrand = brands.find((b) => b.id === selectedBrandId)

  if (brands.length === 0) {
    return <p className="text-sm text-gray-400">No brands configured.</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="feature-switch-brand" className="block text-xs font-semibold text-gray-600 mb-1.5">
          Brand
        </label>
        <select
          id="feature-switch-brand"
          value={selectedBrandId}
          onChange={(e) => onBrandChange(e.target.value)}
          className="w-full sm:w-auto min-w-[16rem] border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.slug})
            </option>
          ))}
        </select>
        {selectedBrand && (
          <p className="text-[11px] text-gray-400 mt-1">
            Toggles below apply to all franchisees under {selectedBrand.name}.
          </p>
        )}
      </div>

      {missingFeaturesForBrand.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs p-3 rounded-xl">
          This brand is missing explicit defaults for:{' '}
          {missingFeaturesForBrand
            .map((feature) => featureLabel(feature, catalogByKey))
            .join(', ')}
          . Displayed values use catalog defaults until you toggle.
        </div>
      )}

      {FEATURE_SWITCH_CATEGORIES.map((category) => (
        <div key={category} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-1.5">
            {FEATURE_SWITCH_CATEGORY_LABELS[category]}
          </h3>
          <ul className="divide-y divide-gray-50">
            {FEATURE_SWITCHES_BY_CATEGORY[category].map((feature) => {
              const enabled = brandSwitchValue(selectedBrandId, feature)
              const rowKey = `brand:${selectedBrandId}:${feature}`
              const isSaving = savingSwitchKey === rowKey

              return (
                <li
                  key={feature}
                  className="flex items-start justify-between gap-4 py-3 first:pt-2 last:pb-1"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-800">
                        {featureLabel(feature, catalogByKey)}
                      </p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100">
                        {minTierLabel(feature, catalogByKey)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {featureDescription(feature, catalogByKey)}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={enabled}
                      disabled={isSaving}
                      onChange={() => onToggle(selectedBrandId, feature, !enabled)}
                    />
                    <div
                      className={`relative w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-emerald-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary)]/30 peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5`}
                    />
                    <span className="sr-only">
                      {isSaving ? 'Saving…' : enabled ? 'On' : 'Off'}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
