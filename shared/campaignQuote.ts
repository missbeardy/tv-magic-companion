export const CAMPAIGN_SOURCE = 'campaign_visualise'
export const CAMPAIGN_LEAD_SOURCE = 'Wall visualiser'

export const CAMPAIGN_PRODUCT_KINDS = ['tv', 'soundbar', 'video-wall', 'speaker', 'art'] as const
export type CampaignProductKind = (typeof CAMPAIGN_PRODUCT_KINDS)[number]

export const CAMPAIGN_ZONES = ['above', 'in', 'below'] as const
export type CampaignZone = (typeof CAMPAIGN_ZONES)[number]

export interface CampaignQuoteInput {
  name: string
  phone: string
  address: string
  productId: string
  productLabel: string
  productKind: CampaignProductKind
  centreHeightMm: number
  ceilingHeightMm: number
  wallWidthMm: number
  viewingDistanceMm: number
  floorToBottom: number
  ceilingToTop: number
  zone: CampaignZone
}

export type ParseCampaignQuoteResult =
  | { ok: true; data: CampaignQuoteInput }
  | { ok: false; error: string; honeypot?: true }

const ZONE_LABEL: Record<CampaignZone, string> = {
  in: 'On the ideal spot',
  above: 'Too high — drag down',
  below: 'Too low — drag up',
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isKind(value: string): value is CampaignProductKind {
  return (CAMPAIGN_PRODUCT_KINDS as readonly string[]).includes(value)
}

function isZone(value: string): value is CampaignZone {
  return (CAMPAIGN_ZONES as readonly string[]).includes(value)
}

function finiteMm(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < min || rounded > max) return null
  return rounded
}

export function serviceTypeForProductKind(kind: CampaignProductKind): string {
  if (kind === 'soundbar') return 'Sound Bar'
  if (kind === 'speaker') return 'Home Theatre'
  if (kind === 'video-wall') return 'Video Wall'
  return 'Wall Mounting'
}

export function buildCampaignLeadDetails(data: CampaignQuoteInput): string {
  const fmt = (n: number) => `${n.toLocaleString('en-AU')} mm`
  return [
    'Wall visualiser quote',
    `Product: ${data.productLabel}`,
    `Centre height: ${fmt(data.centreHeightMm)}`,
    `Floor to bottom: ${fmt(data.floorToBottom)}`,
    `Ceiling to top: ${fmt(data.ceilingToTop)}`,
    `Ceiling: ${fmt(data.ceilingHeightMm)}`,
    `Wall width: ${fmt(data.wallWidthMm)}`,
    `Sofa distance: ${fmt(data.viewingDistanceMm)}`,
    `Height zone: ${ZONE_LABEL[data.zone]}`,
  ].join('\n')
}

export function parseCampaignQuoteBody(body: unknown): ParseCampaignQuoteResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const record = body as Record<string, unknown>
  if (trimString(record.website)) {
    return { ok: false, error: 'Invalid submission', honeypot: true }
  }

  const name = trimString(record.name)
  const phone = trimString(record.phone)
  const address = trimString(record.address)
  const productId = trimString(record.productId).slice(0, 64)
  const productLabel = trimString(record.productLabel).slice(0, 80)
  const productKind = trimString(record.productKind)
  const zone = trimString(record.zone)

  if (!name) return { ok: false, error: 'name is required' }
  if (!phone) return { ok: false, error: 'phone is required' }
  if (!address) return { ok: false, error: 'address is required' }
  if (!productId || !productLabel) return { ok: false, error: 'product is required' }
  if (!isKind(productKind)) return { ok: false, error: 'product kind is invalid' }
  if (!isZone(zone)) return { ok: false, error: 'height zone is invalid' }

  const centreHeightMm = finiteMm(record.centreHeightMm, 200, 4000)
  const ceilingHeightMm = finiteMm(record.ceilingHeightMm, 1800, 6000)
  const wallWidthMm = finiteMm(record.wallWidthMm, 1000, 20000)
  const viewingDistanceMm = finiteMm(record.viewingDistanceMm, 500, 12000)
  const floorToBottom = finiteMm(record.floorToBottom, 0, 5000)
  const ceilingToTop = finiteMm(record.ceilingToTop, 0, 5000)
  if (
    centreHeightMm == null ||
    ceilingHeightMm == null ||
    wallWidthMm == null ||
    viewingDistanceMm == null ||
    floorToBottom == null ||
    ceilingToTop == null
  ) {
    return { ok: false, error: 'placement measurements are invalid' }
  }

  return {
    ok: true,
    data: {
      name: name.slice(0, 120),
      phone: phone.slice(0, 32),
      address: address.slice(0, 240),
      productId,
      productLabel,
      productKind,
      centreHeightMm,
      ceilingHeightMm,
      wallWidthMm,
      viewingDistanceMm,
      floorToBottom,
      ceilingToTop,
      zone,
    },
  }
}
