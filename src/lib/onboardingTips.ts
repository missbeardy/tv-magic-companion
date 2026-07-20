/** In-app coach tips for team-mode bespoke mechanics (Package 8 / T2.4). */

export type OnboardingTipId = 'pool_timer' | 'contact_rounds' | 'next_action_cta'

export interface OnboardingTipDef {
  id: OnboardingTipId
  title: string
  body: string
}

export interface OnboardingTipContext {
  /** Solo mode never shows tips (no pool). */
  isSoloMode: boolean
  /** At least one unassigned/pooled lead is visible. */
  hasPooledLead: boolean
  /** At least one contact_attempted lead is visible. */
  hasContactAttemptedLead: boolean
  /** Any lead is visible (for next-action tip). */
  hasAnyLead: boolean
}

export interface OnboardingTipsState {
  /** Tip ids the user has dismissed ("Got it"). */
  dismissed: OnboardingTipId[]
  /** When true, start from the first tip again (header "?" replay). */
  replay: boolean
}

const STORAGE_PREFIX = 'onboarding_tips_v1'
const LEGACY_POOL_COACH_PREFIX = 'tvm_leads_pool_coach_dismissed'

export const ONBOARDING_TIPS: OnboardingTipDef[] = [
  {
    id: 'pool_timer',
    title: 'Pick up leads from the pool',
    body: 'Unassigned leads sit in the pool with a countdown. Call or SMS to claim one. If you don’t respond in time, the lead returns to the pool automatically so someone else can take it.',
  },
  {
    id: 'contact_rounds',
    title: 'Contact rounds',
    body: 'Each call or SMS counts as a contact attempt. After several unanswered rounds the lead is marked Lost automatically — so nothing sits cold forever.',
  },
  {
    id: 'next_action_cta',
    title: 'Your next move',
    body: 'The big action button on each lead always shows the right next step — Call, Quote, Book, or Complete. Tap it instead of hunting through menus.',
  },
]

export function emptyOnboardingTipsState(): OnboardingTipsState {
  return { dismissed: [], replay: false }
}

export function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

function legacyPoolCoachKey(userId: string): string {
  return `${LEGACY_POOL_COACH_PREFIX}:${userId}`
}

/** Pure: which tip to show next given progress + screen context. */
export function resolveNextTip(
  state: OnboardingTipsState,
  context: OnboardingTipContext
): OnboardingTipDef | null {
  if (context.isSoloMode) return null

  const dismissed = new Set(state.dismissed)
  const tips = state.replay
    ? ONBOARDING_TIPS
    : ONBOARDING_TIPS.filter((t) => !dismissed.has(t.id))

  for (const tip of tips) {
    if (tip.id === 'pool_timer' && !context.hasPooledLead) continue
    if (tip.id === 'contact_rounds' && !context.hasContactAttemptedLead) continue
    if (tip.id === 'next_action_cta' && !context.hasAnyLead) continue
    if (!state.replay && dismissed.has(tip.id)) continue
    return tip
  }
  return null
}

export function loadOnboardingTipsState(userId: string): OnboardingTipsState {
  if (typeof window === 'undefined' || !userId) return emptyOnboardingTipsState()
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingTipsState>
      const dismissed = Array.isArray(parsed.dismissed)
        ? (parsed.dismissed.filter((id): id is OnboardingTipId =>
            ONBOARDING_TIPS.some((t) => t.id === id)
          ) as OnboardingTipId[])
        : []
      return { dismissed, replay: Boolean(parsed.replay) }
    }

    // Migrate legacy single pool-coach dismissal into tip 1 dismissed.
    if (localStorage.getItem(legacyPoolCoachKey(userId)) === '1') {
      const migrated: OnboardingTipsState = { dismissed: ['pool_timer'], replay: false }
      saveOnboardingTipsState(userId, migrated)
      return migrated
    }
  } catch {
    // private browsing / quota
  }
  return emptyOnboardingTipsState()
}

export function saveOnboardingTipsState(userId: string, state: OnboardingTipsState): void {
  if (typeof window === 'undefined' || !userId) return
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function dismissOnboardingTip(userId: string, tipId: OnboardingTipId): OnboardingTipsState {
  const current = loadOnboardingTipsState(userId)
  const dismissed = current.dismissed.includes(tipId)
    ? current.dismissed
    : [...current.dismissed, tipId]
  const next: OnboardingTipsState = { dismissed, replay: false }
  saveOnboardingTipsState(userId, next)
  return next
}

export function replayOnboardingTips(userId: string): OnboardingTipsState {
  const next: OnboardingTipsState = { dismissed: [], replay: true }
  saveOnboardingTipsState(userId, next)
  return next
}
