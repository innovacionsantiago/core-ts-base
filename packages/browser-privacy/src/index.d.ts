export type ConsentCategory = 'necessary' | 'analytics' | 'diagnostics'
export type OptionalConsentCategory = Exclude<ConsentCategory, 'necessary'>
export type ConsentDecision = 'unknown' | 'accepted' | 'rejected'

export interface ConsentState {
  version: 1
  necessary: 'accepted'
  analytics: ConsentDecision
  diagnostics: ConsentDecision
  decidedAt: string | null
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ConsentStore {
  readonly storageKey: string
  read(): ConsentState
  canLoad(category: ConsentCategory): boolean
  setCategory(category: OptionalConsentCategory, decision: 'accepted' | 'rejected'): ConsentState
  setDecisions(decisions: {
    analytics: 'accepted' | 'rejected'
    diagnostics: 'accepted' | 'rejected'
  }): ConsentState
  clear(): ConsentState
  subscribe(listener: (state: ConsentState) => void): () => void
}

export interface TelemetrySiteConfig {
  schemaVersion: 'cis.browser-privacy.site.v1'
  site: string
  storageScope: 'origin'
  analytics: {
    provider: 'none' | 'first-party'
    siteId: string | null
    endpoint: string | null
    owner: string | null
    retentionDays: number | null
  }
  diagnostics: {
    provider: 'none' | 'glitchtip'
    classification: 'pending' | 'necessary' | 'optional'
    dsnPublicConfigured: boolean
    owner: string | null
  }
}

export const CONSENT_VERSION: 1
export const DEFAULT_STORAGE_KEY: 'cis:browser-privacy:v1'
export const CONSENT_EVENT: 'cis:browser-privacy-change'

export function createConsentStore(options?: {
  storage?: StorageLike
  events?: EventTarget
  storageKey?: string
  now?: () => string
}): ConsentStore

export function createConsentGate(options: {
  category: OptionalConsentCategory
  store: ConsentStore
  start(context: { signal: AbortSignal }): void | (() => void) | Promise<void | (() => void)>
  onError?: (error: unknown) => void
}): { dispose(): void; sync(): Promise<boolean> }

export function validateTelemetrySiteConfig(config: TelemetrySiteConfig): true
