import { UserRole } from '../types.js'

/**
 * Numeric rank per role, ordered by privilege. Higher rank implies every
 * capability of the lower ranks. OWNER always outranks everything.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  VIEWER: 1,
  MANAGER: 2,
  OWNER: 3,
}

/** True when `role` has at least the privileges of `minimum`. */
export function hasMinimumRole(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/** VIEWER+ — any authenticated operator. */
export function canView(role: UserRole): boolean {
  return hasMinimumRole(role, 'VIEWER')
}

/** MANAGER+ — run checks, manage locations, dismiss alerts. */
export function canOperate(role: UserRole): boolean {
  return hasMinimumRole(role, 'MANAGER')
}

/** OWNER only — settings, users, data and backups. */
export function canAdminister(role: UserRole): boolean {
  return role === 'OWNER'
}
