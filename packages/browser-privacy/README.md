# `@cis/browser-privacy`

Contrato de navegador para CIS, CDS y COCHID. Su primer corte, C1.1, no activa analítica ni
diagnóstico. Define cómo una aplicación puede pedir consentimiento y cómo un sink futuro debe
apagarse al rechazar o revocar.

## Reglas del contrato

- `necessary` siempre está disponible. Incluye la sesión OIDC y preferencias indispensables de la
  aplicación; este paquete nunca borra sus cookies ni su storage.
- `analytics` y `diagnostics` parten en `unknown`, que equivale a no cargar SDK, no enviar beacon y
  no abrir requests.
- Las decisiones se guardan en `localStorage` del origen. C1.1 no comparte consentimiento entre
  marcas, dominios ni subdominios.
- El gate entrega un `AbortSignal` al sink. Rechazar, revocar o disponer el gate aborta el trabajo
  activo y ejecuta su función de limpieza.
- La UI no pertenece al paquete. Cada marca puede presentar su banner y preferencias con Style v10,
  conservando las mismas categorías y estados.

## Uso mínimo

```js
import { createConsentGate, createConsentStore } from '@cis/browser-privacy'

const consent = createConsentStore()
const analytics = createConsentGate({
  category: 'analytics',
  store: consent,
  start({ signal }) {
    const controller = new AbortController()
    signal.addEventListener('abort', () => controller.abort(), { once: true })
    return () => controller.abort()
  },
})

consent.setCategory('analytics', 'accepted')
// analytics.dispose() al desmontar la aplicación
```

## Configuración apagada

Un consumidor parte con `provider: none`, IDs y endpoints nulos. `validateTelemetrySiteConfig`
rechaza una configuración que intente agregar un ID, endpoint o DSN mientras el proveedor siga
apagado. Habilitar un sink es otro corte: exige propietario, retención, política y configuración
aprobada.

## Fuera de C1.1

C1.1 no decide proveedor analítico, IDs de sitio, deduplicación, retención, clasificación legal de
GlitchTip ni texto legal. Tampoco reemplaza las cookies HttpOnly de autenticación. Esos cambios se
activan sólo en un corte posterior y autorizado.
