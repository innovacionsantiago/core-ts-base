export const CONSENT_VERSION = 1
export const DEFAULT_STORAGE_KEY = 'cis:browser-privacy:v1'
export const CONSENT_EVENT = 'cis:browser-privacy-change'

const OPTIONAL_CATEGORIES = new Set(['analytics', 'diagnostics'])
const OPTIONAL_DECISIONS = new Set(['unknown', 'accepted', 'rejected'])

function emptyState() {
  return {
    version: CONSENT_VERSION,
    necessary: 'accepted',
    analytics: 'unknown',
    diagnostics: 'unknown',
    decidedAt: null,
  }
}

function resolveBrowserDependency(value, name) {
  if (value) return value
  if (name === 'storage' && typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage
  if (name === 'events' && typeof globalThis.addEventListener === 'function') return globalThis
  throw new Error(`${name} is required outside a browser`)
}

function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail })
  const event = new Event(type)
  Object.defineProperty(event, 'detail', { value: detail })
  return event
}

function parseStoredConsent(raw) {
  if (!raw) return emptyState()
  try {
    const value = JSON.parse(raw)
    if (value?.version !== CONSENT_VERSION) return emptyState()
    if (!OPTIONAL_DECISIONS.has(value.analytics)) return emptyState()
    if (!OPTIONAL_DECISIONS.has(value.diagnostics)) return emptyState()
    if (typeof value.decidedAt !== 'string' || !value.decidedAt) return emptyState()
    return {
      version: CONSENT_VERSION,
      necessary: 'accepted',
      analytics: value.analytics,
      diagnostics: value.diagnostics,
      decidedAt: value.decidedAt,
    }
  } catch {
    return emptyState()
  }
}

export function createConsentStore(options = {}) {
  const storage = resolveBrowserDependency(options.storage, 'storage')
  const events = resolveBrowserDependency(options.events, 'events')
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const now = options.now ?? (() => new Date().toISOString())

  function read() {
    try {
      return parseStoredConsent(storage.getItem(storageKey))
    } catch {
      return emptyState()
    }
  }

  function emit(state) {
    events.dispatchEvent(createDetailEvent(CONSENT_EVENT, state))
  }

  function setCategory(category, decision) {
    if (category === 'necessary') throw new Error('necessary is always accepted and cannot be changed')
    if (!OPTIONAL_CATEGORIES.has(category)) throw new Error(`unknown category: ${category}`)
    if (decision !== 'accepted' && decision !== 'rejected') {
      throw new Error(`invalid consent decision: ${decision}`)
    }
    const current = read()
    storage.setItem(storageKey, JSON.stringify({
      version: CONSENT_VERSION,
      analytics: current.analytics,
      diagnostics: current.diagnostics,
      [category]: decision,
      decidedAt: now(),
    }))
    const state = read()
    emit(state)
    return state
  }

  function clear() {
    storage.removeItem(storageKey)
    const state = emptyState()
    emit(state)
    return state
  }

  function canLoad(category) {
    if (category === 'necessary') return true
    if (!OPTIONAL_CATEGORIES.has(category)) return false
    return read()[category] === 'accepted'
  }

  function subscribe(listener) {
    const handleChange = (event) => listener(event.detail)
    events.addEventListener(CONSENT_EVENT, handleChange)
    return () => events.removeEventListener(CONSENT_EVENT, handleChange)
  }

  return Object.freeze({ canLoad, clear, read, setCategory, subscribe, storageKey })
}

export function createConsentGate({ category, store, start, onError = () => {} }) {
  if (!OPTIONAL_CATEGORIES.has(category)) {
    throw new Error('a consent gate is only valid for analytics or diagnostics')
  }
  if (!store || typeof store.canLoad !== 'function' || typeof store.subscribe !== 'function') {
    throw new Error('store must implement canLoad and subscribe')
  }
  if (typeof start !== 'function') throw new Error('start must be a function')

  let active = null
  let disposed = false
  let generation = 0

  function stopActive() {
    generation += 1
    if (!active) return
    const current = active
    active = null
    current.controller.abort()
    current.cleanup?.()
  }

  async function sync() {
    if (disposed || !store.canLoad(category)) {
      stopActive()
      return false
    }
    if (active) return true
    const currentGeneration = ++generation
    const controller = new AbortController()
    active = { controller, cleanup: null }
    try {
      const cleanup = await start({ signal: controller.signal })
      if (disposed || currentGeneration !== generation || !store.canLoad(category)) {
        controller.abort()
        if (typeof cleanup === 'function') cleanup()
        if (active?.controller === controller) active = null
        return false
      }
      if (typeof cleanup === 'function') active.cleanup = cleanup
      return true
    } catch (error) {
      if (active?.controller === controller) active = null
      controller.abort()
      onError(error)
      return false
    }
  }

  const unsubscribe = store.subscribe(() => {
    void sync()
  })
  void sync()

  return Object.freeze({
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      stopActive()
    },
    sync,
  })
}

function assertNullable(value, label) {
  if (value !== null) throw new Error(`${label} must be null while provider none`)
}

export function validateTelemetrySiteConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config must be an object')
  if (config.schemaVersion !== 'cis.browser-privacy.site.v1') throw new Error('unsupported schemaVersion')
  if (typeof config.site !== 'string' || !config.site.trim()) throw new Error('site is required')
  if (config.storageScope !== 'origin') throw new Error('storageScope must be origin')

  const analytics = config.analytics
  if (!analytics || !['none', 'first-party'].includes(analytics.provider)) {
    throw new Error('analytics provider must be none or first-party')
  }
  if (analytics.provider === 'none') {
    assertNullable(analytics.siteId, 'analytics.siteId')
    assertNullable(analytics.endpoint, 'analytics.endpoint')
    assertNullable(analytics.owner, 'analytics.owner')
    assertNullable(analytics.retentionDays, 'analytics.retentionDays')
  } else {
    if (![analytics.siteId, analytics.endpoint, analytics.owner].every((value) => typeof value === 'string' && value.trim())) {
      throw new Error('enabled analytics requires siteId, endpoint and owner')
    }
    if (!Number.isInteger(analytics.retentionDays) || analytics.retentionDays <= 0) {
      throw new Error('enabled analytics requires a positive retentionDays')
    }
  }

  const diagnostics = config.diagnostics
  if (!diagnostics || !['none', 'glitchtip'].includes(diagnostics.provider)) {
    throw new Error('diagnostics provider must be none or glitchtip')
  }
  if (diagnostics.provider === 'none') {
    if (diagnostics.dsnPublicConfigured !== false) {
      throw new Error('diagnostics.dsnPublicConfigured must be false while provider none')
    }
    assertNullable(diagnostics.owner, 'diagnostics.owner')
    if (diagnostics.classification !== 'pending') {
      throw new Error('diagnostics classification must remain pending while provider none')
    }
  } else {
    if (!['necessary', 'optional'].includes(diagnostics.classification)) {
      throw new Error('enabled diagnostics requires a necessary or optional classification')
    }
    if (diagnostics.dsnPublicConfigured !== true) {
      throw new Error('enabled diagnostics requires an approved public DSN')
    }
    if (typeof diagnostics.owner !== 'string' || !diagnostics.owner.trim()) {
      throw new Error('enabled diagnostics requires an owner')
    }
  }
  return true
}
