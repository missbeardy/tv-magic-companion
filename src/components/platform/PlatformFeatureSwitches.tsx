import { useState, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  FEATURE_SWITCH_CATEGORIES,
  FEATURE_SWITCH_CATEGORY_LABELS,
  FEATURE_SWITCH_DEFINITIONS,
  FEATURE_SWITCH_MIN_TIERS,
  FEATURE_SWITCHES_BY_CATEGORY,
  type FeatureSwitchCategory,
  type FeatureSwitchKey,
} from '../../lib/features'

interface BrandOption {
  id: string
  name: string
  slug: string
  primary_color?: string
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

function enabledCountInCategory(
  category: FeatureSwitchCategory,
  brandId: string,
  brandSwitchValue: Props['brandSwitchValue']
): number {
  return FEATURE_SWITCHES_BY_CATEGORY[category].filter((feature) =>
    brandSwitchValue(brandId, feature)
  ).length
}

/** Light tint of a brand hex for accordion headers (falls back to TV Magic blue). */
function brandHeaderTint(hex: string | undefined, mixPercent: number): string {
  const match = hex?.trim().match(/^#?([0-9a-f]{6})$/i)
  const color = match ? `#${match[1]}` : '#004B93'
  return `color-mix(in srgb, ${color} ${mixPercent}%, white)`
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
  const [openCategories, setOpenCategories] = useState<Record<FeatureSwitchCategory, boolean>>(() =>
    Object.fromEntries(
      FEATURE_SWITCH_CATEGORIES.map((category, index) => [category, index === 0])
    ) as Record<FeatureSwitchCategory, boolean>
  )

  const selectedBrand = brands.find((b) => b.id === selectedBrandId)
  const headerBg = brandHeaderTint(selectedBrand?.primary_color, 12)
  const headerHoverBg = brandHeaderTint(selectedBrand?.primary_color, 18)
  const headerBorder = brandHeaderTint(selectedBrand?.primary_color, 22)

  function toggleCategory(category: FeatureSwitchCategory) {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }))
  }

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

      <div
        className="space-y-2"
        style={
          {
            '--brand-header-bg': headerBg,
            '--brand-header-hover': headerHoverBg,
            '--brand-header-border': headerBorder,
          } as CSSProperties
        }
      >
        {FEATURE_SWITCH_CATEGORIES.map((category) => {
          const features = FEATURE_SWITCHES_BY_CATEGORY[category]
          const enabledCount = enabledCountInCategory(category, selectedBrandId, brandSwitchValue)
          const isOpen = openCategories[category]

          return (
            <div
              key={category}
              className="rounded-xl overflow-hidden bg-white"
              style={{ border: '1px solid var(--brand-header-border)' }}
            >
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition bg-[var(--brand-header-bg)] hover:bg-[var(--brand-header-hover)]"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: selectedBrand?.primary_color ?? '#004B93' }}
                  />
                  <span className="text-sm font-semibold text-gray-800">
                    {FEATURE_SWITCH_CATEGORY_LABELS[category]}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-gray-500 shrink-0">
                  {enabledCount}/{features.length} on
                </span>
              </button>

              {isOpen && (
                <ul className="divide-y divide-gray-100 border-t border-[var(--brand-header-border)]">
                  {features.map((feature) => {
                    const enabled = brandSwitchValue(selectedBrandId, feature)
                    const rowKey = `brand:${selectedBrandId}:${feature}`
                    const isSaving = savingSwitchKey === rowKey

                    return (
                      <li
                        key={feature}
                        className="flex items-start justify-between gap-4 px-4 py-3"
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
                            className="relative w-11 h-6 rounded-full bg-gray-200 peer-checked:bg-emerald-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-primary)]/30 peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"
                          />
                          <span className="sr-only">
                            {isSaving ? 'Saving…' : enabled ? 'On' : 'Off'}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
