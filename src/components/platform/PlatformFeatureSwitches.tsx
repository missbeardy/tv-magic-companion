import { useState } from 'react'
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

/** Normalise brand hex (#RGB or #RRGGBB). */
function normalizeBrandHex(hex: string | undefined): string {
  const six = hex?.trim().match(/^#?([0-9a-f]{6})$/i)?.[1]
  if (six) return `#${six}`
  const three = hex?.trim().match(/^#?([0-9a-f]{3})$/i)?.[1]
  if (three) {
    return `#${three[0]}${three[0]}${three[1]}${three[1]}${three[2]}${three[2]}`
  }
  return '#004B93'
}

function brandRgb(hex: string | undefined): [number, number, number] {
  const normalized = normalizeBrandHex(hex).slice(1)
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ]
}

/** Tinted background — rgba reads more clearly than a very light color-mix. */
function brandTintRgba(hex: string | undefined, alpha: number): string {
  const [r, g, b] = brandRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
  const brandHex = normalizeBrandHex(selectedBrand?.primary_color)
  const headerBg = brandTintRgba(brandHex, 0.35)
  const headerHoverBg = brandTintRgba(brandHex, 0.48)
  const headerBorder = brandTintRgba(brandHex, 0.65)

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
          <div className="flex items-center gap-2 mt-2">
            <span
              className="inline-block w-5 h-5 rounded-md border border-black/10 shrink-0"
              style={{ backgroundColor: brandHex }}
              title={brandHex}
            />
            <p className="text-[11px] text-gray-500">
              Brand colour <span className="font-mono text-gray-600">{brandHex}</span> — toggles apply to all
              franchisees under {selectedBrand.name}.{' '}
              <span className="text-gray-400">
                (Nav bar uses your org colour; accordions use the brand template colour above.)
              </span>
            </p>
          </div>
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

      <div className="space-y-2">
        {FEATURE_SWITCH_CATEGORIES.map((category) => {
          const features = FEATURE_SWITCHES_BY_CATEGORY[category]
          const enabledCount = enabledCountInCategory(category, selectedBrandId, brandSwitchValue)
          const isOpen = openCategories[category]

          return (
            <div
              key={category}
              className="rounded-xl overflow-hidden bg-white"
              style={{ border: `1px solid ${headerBorder}` }}
            >
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition"
                style={{
                  backgroundColor: headerBg,
                  borderLeft: `4px solid ${brandHex}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = headerHoverBg
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = headerBg
                }}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: brandHex }}
                  />
                  <span className="text-sm font-semibold" style={{ color: brandHex }}>
                    {FEATURE_SWITCH_CATEGORY_LABELS[category]}
                  </span>
                </div>
                <span
                  className="text-[11px] font-semibold shrink-0 px-2 py-0.5 rounded-full"
                  style={{
                    color: brandHex,
                    backgroundColor: brandTintRgba(brandHex, 0.25),
                    border: `1px solid ${headerBorder}`,
                  }}
                >
                  {enabledCount}/{features.length} on
                </span>
              </button>

              {isOpen && (
                <ul
                  className="divide-y divide-gray-100 border-t"
                  style={{ borderColor: headerBorder }}
                >
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
