/** Trust numbers, shared by the mobile hero band and the guarantee card. */
export interface ProofPoint {
  value: string
  label: string
  /** Shorter label for the single-row strip above the stage on mobile. */
  shortLabel: string
}

export const PROOF_POINTS: ProofPoint[] = [
  // shortLabel has to survive three-up at 360px without truncating.
  { value: '460,000+', label: 'TVs mounted', shortLabel: 'mounted' },
  { value: '6,000+', label: '5-star reviews', shortLabel: '5-star' },
  { value: '22+', label: 'Years', shortLabel: 'years' },
]
