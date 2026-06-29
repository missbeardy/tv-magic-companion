import type { Org } from '../types/org'

export type OperationMode = 'solo' | 'team'

export function isSoloOperationMode(org: Pick<Org, 'operation_mode'> | null | undefined): boolean {
  return org?.operation_mode === 'solo'
}

export function isTeamOperationMode(org: Pick<Org, 'operation_mode'> | null | undefined): boolean {
  return !org?.operation_mode || org.operation_mode === 'team'
}
