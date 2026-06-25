export interface SmartAssignDecisionInput {
  featureEnabled: boolean
  role: string | undefined
  activeCount: number
  minimumActiveCount: number
  isNearest: boolean
}

export interface SmartAssignDecision {
  isRecommended: boolean
  showBadge: boolean
}

export function getSmartAssignDecision(input: SmartAssignDecisionInput): SmartAssignDecision {
  const isManagerView = input.role !== 'employee'
  const isRecommended = input.activeCount === input.minimumActiveCount
  const showBadge = input.featureEnabled && isManagerView && (isRecommended || input.isNearest)
  return { isRecommended, showBadge }
}
