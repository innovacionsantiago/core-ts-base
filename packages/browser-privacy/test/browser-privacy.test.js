import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONSENT_EVENT,
  DEFAULT_STORAGE_KEY,
  createConsentGate,
  createConsentStore,
  validateTelemetrySiteConfig,
} from '../src/index.js'

class MemoryStorage {
  values = new Map()

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }

  removeItem(key) {
    this.values.delete(key)
  }
}

const flushEvents = () => new Promise((resolve) => setTimeout(resolve, 0))

function createHarness() {
  const storage = new MemoryStorage()
  const events = new EventTarget()
  const store = createConsentStore({
    storage,
    events,
    now: () => '2026-08-27T12:00:00.000Z',
  })
  return { events, storage, store }
}

test('parte fail-closed y considera sólo necessary como habilitado', () => {
  const { store } = createHarness()

  assert.deepEqual(store.read(), {
    version: 1,
    necessary: 'accepted',
    analytics: 'unknown',
    diagnostics: 'unknown',
    decidedAt: null,
  })
  assert.equal(store.canLoad('necessary'), true)
  assert.equal(store.canLoad('analytics'), false)
  assert.equal(store.canLoad('diagnostics'), false)
})

test('persiste decisiones por categoría y publica el estado completo', () => {
  const { events, storage, store } = createHarness()
  const observed = []
  events.addEventListener(CONSENT_EVENT, (event) => observed.push(event.detail))

  store.setCategory('analytics', 'accepted')
  store.setCategory('diagnostics', 'rejected')

  assert.equal(store.canLoad('analytics'), true)
  assert.equal(store.canLoad('diagnostics'), false)
  assert.deepEqual(JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY)), {
    version: 1,
    analytics: 'accepted',
    diagnostics: 'rejected',
    decidedAt: '2026-08-27T12:00:00.000Z',
  })
  assert.equal(observed.length, 2)
  assert.equal(observed.at(-1).diagnostics, 'rejected')
})

test('persiste una elección completa en una sola operación y emite un solo cambio', () => {
  const { events, storage, store } = createHarness()
  const observed = []
  events.addEventListener(CONSENT_EVENT, (event) => observed.push(event.detail))

  const state = store.setDecisions({
    analytics: 'rejected',
    diagnostics: 'accepted',
  })

  assert.deepEqual(state, {
    version: 1,
    necessary: 'accepted',
    analytics: 'rejected',
    diagnostics: 'accepted',
    decidedAt: '2026-08-27T12:00:00.000Z',
  })
  assert.deepEqual(JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY)), {
    version: 1,
    analytics: 'rejected',
    diagnostics: 'accepted',
    decidedAt: '2026-08-27T12:00:00.000Z',
  })
  assert.equal(observed.length, 1)
})

test('ignora storage corrupto o de otra versión y nunca acepta necessary rechazado', () => {
  const { storage, store } = createHarness()
  storage.setItem(DEFAULT_STORAGE_KEY, '{no-json')
  assert.equal(store.read().analytics, 'unknown')
  storage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify({ version: 2, analytics: 'accepted' }))
  assert.equal(store.read().analytics, 'unknown')
  assert.throws(() => store.setCategory('necessary', 'rejected'), /necessary/)
})

test('clear elimina sólo su clave y vuelve a unknown', () => {
  const { storage, store } = createHarness()
  storage.setItem('session-owned-by-oidc', 'keep')
  store.setCategory('analytics', 'accepted')

  store.clear()

  assert.equal(storage.getItem(DEFAULT_STORAGE_KEY), null)
  assert.equal(storage.getItem('session-owned-by-oidc'), 'keep')
  assert.equal(store.read().analytics, 'unknown')
})

test('el gate no inicia antes del consentimiento y aborta al revocar', async () => {
  const { store } = createHarness()
  let starts = 0
  let stops = 0
  let aborted = 0
  const gate = createConsentGate({
    category: 'analytics',
    store,
    start({ signal }) {
      starts += 1
      signal.addEventListener('abort', () => {
        aborted += 1
      })
      return () => {
        stops += 1
      }
    },
  })

  await flushEvents()
  assert.equal(starts, 0)
  store.setCategory('analytics', 'accepted')
  await flushEvents()
  assert.equal(starts, 1)
  store.setCategory('analytics', 'rejected')
  await flushEvents()
  assert.equal(aborted, 1)
  assert.equal(stops, 1)
  store.setCategory('analytics', 'accepted')
  await flushEvents()
  assert.equal(starts, 2)

  gate.dispose()
  assert.equal(aborted, 2)
  assert.equal(stops, 2)
})

test('provider none rechaza IDs, endpoints y DSN accidentales', () => {
  const disabled = {
    schemaVersion: 'cis.browser-privacy.site.v1',
    site: 'example.test',
    storageScope: 'origin',
    analytics: {
      provider: 'none',
      siteId: null,
      endpoint: null,
      owner: null,
      retentionDays: null,
    },
    diagnostics: {
      provider: 'none',
      classification: 'pending',
      dsnPublicConfigured: false,
      owner: null,
    },
  }

  assert.equal(validateTelemetrySiteConfig(disabled), true)
  assert.throws(
    () => validateTelemetrySiteConfig({
      ...disabled,
      analytics: { ...disabled.analytics, endpoint: '/api/analytics/events' },
    }),
    /provider none/,
  )
  assert.throws(
    () => validateTelemetrySiteConfig({
      ...disabled,
      diagnostics: { ...disabled.diagnostics, dsnPublicConfigured: true },
    }),
    /provider none/,
  )
})
