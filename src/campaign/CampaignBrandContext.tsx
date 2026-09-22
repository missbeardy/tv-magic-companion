import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface CampaignBrand {
  orgSlug: string
  name: string
  logoUrl: string | null
  website: string | null
  primaryColor: string
  secondaryColor: string
}

const DEFAULT_BRAND: Omit<CampaignBrand, 'orgSlug'> = {
  name: 'TV Magic',
  logoUrl: null,
  website: 'https://tvmagic.com.au/',
  primaryColor: '#004B93',
  secondaryColor: '#00B4C5',
}

const CampaignBrandContext = createContext<CampaignBrand | null>(null)

/**
 * Fetches public branding for /visualise/:orgSlug once per mount. Falls back
 * to the TV Magic defaults on any failure so the page never renders blank —
 * a missing/misspelled slug should look like the org's own campaign page,
 * not an error screen.
 */
export function CampaignBrandProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
  const [brand, setBrand] = useState<CampaignBrand>({ orgSlug, ...DEFAULT_BRAND })

  useEffect(() => {
    let cancelled = false
    setBrand({ orgSlug, ...DEFAULT_BRAND })

    fetch(`/api/campaign-quote?orgSlug=${encodeURIComponent(orgSlug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Partial<CampaignBrand> | null) => {
        if (cancelled || !data) return
        setBrand({
          orgSlug,
          name: data.name || DEFAULT_BRAND.name,
          logoUrl: data.logoUrl ?? null,
          website: data.website ?? DEFAULT_BRAND.website,
          primaryColor: data.primaryColor || DEFAULT_BRAND.primaryColor,
          secondaryColor: data.secondaryColor || DEFAULT_BRAND.secondaryColor,
        })
      })
      .catch(() => {
        // keep the default brand — the page still works
      })

    return () => {
      cancelled = true
    }
  }, [orgSlug])

  const value = useMemo(() => brand, [brand])

  return <CampaignBrandContext.Provider value={value}>{children}</CampaignBrandContext.Provider>
}

export function useCampaignBrand(): CampaignBrand {
  const ctx = useContext(CampaignBrandContext)
  return ctx ?? { orgSlug: 'default', ...DEFAULT_BRAND }
}
