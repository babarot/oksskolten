import { AsyncLocalStorage } from 'node:async_hooks'

export type UserRole = 'owner' | 'admin' | 'member'
export type UserStatus = 'active' | 'invited' | 'disabled'

export interface AuthIdentity {
  kind: 'user' | 'apiKey' | 'local'
  userId: number | null
  email: string | null
  role: UserRole | null
  status: UserStatus | null
  apiKeyId?: number
  apiKeyScopes?: string
}

const identityStore = new AsyncLocalStorage<AuthIdentity | null>()

export function setCurrentIdentity(identity: AuthIdentity | null): void {
  identityStore.enterWith(identity)
}

export function getCurrentIdentity(): AuthIdentity | null {
  return identityStore.getStore() ?? null
}

export function getCurrentUserId(): number | null {
  return getCurrentIdentity()?.userId ?? null
}

export function isAdminLike(role: UserRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function roleCanManage(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'owner') return true
  if (actorRole === 'admin') return targetRole === 'member'
  return false
}
