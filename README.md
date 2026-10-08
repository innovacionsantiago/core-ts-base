# core-ts-base · estándar TypeScript/JS para servicios CIS

**Propósito**: template canónico de configuración TS/JS y workflow CI reusable para todo servicio TS del ecosistema CIS (Next.js, Vite, Express, libs).

Sibling de `core-python-base`. ADR-018 extendido a TS.

## Workflows disponibles

### `lighthouse-ci.yml`

Reusable Lighthouse CI workflow (W17). Wraps `treosh/lighthouse-ci-action@v11`,
captures category scores, and gates regressions vs an in-repo baseline.

**Inputs**:

| Input | Required | Default | Descripción |
|---|---|---|---|
| `urls` | yes | — | URLs to scan (multiline string, one per line) |
| `node_version` | no | `"20"` | setup-node version |
| `runs` | no | `1` | Lighthouse runs per URL (median) |
| `baseline_path` | no | `data/lighthouse-baseline.json` | JSON baseline of category scores |
| `regression_threshold` | no | `10` | Fail if any score drops more than N points vs baseline |
| `working_directory` | no | `"."` | Subdir del repo |
| `categories` | no | `performance,accessibility,seo,best-practices` | Lighthouse categories |
| `skip_regression_gate` | no | `false` | Report-only mode |

Baseline format accepted:
- Object map: `{ "https://x.test/": { "performance": 92, ... } }`.
- cis-qa baseline: `{ "results": [ { "url": "...", "scores": {...}, "skipped": false } ] }`.

Usage example (a Next.js app on a preview deploy):

```yaml
name: Lighthouse
on:
  pull_request:
  push:
    branches: [main]
jobs:
  lighthouse:
    uses: innovacionsantiago/core-ts-base/.github/workflows/lighthouse-ci.yml@main
    with:
      urls: |
        https://staging.example.com/
        https://staging.example.com/dashboard
      regression_threshold: 10
```

Artifacts uploaded: `.lighthouseci/`, `scores.json`, `regression-report.txt`,
and `lighthouse-suggested-baseline.json` (only when no baseline exists yet).

### `ci-typescript.yml`

Lint + format + type + test + npm-audit reusable.

**Inputs**:

| Input | Required | Default | Descripción |
|---|---|---|---|
| `node_version` | no | `"22"` | setup-node version |
| `working_directory` | no | `"."` | Subdir del repo |
| `coverage_min` | no | `60` | Threshold coverage |
| `skip_coverage_gate` | no | `false` | No falla si coverage<threshold |
| `package_manager` | no | `"npm"` | `npm` / `pnpm` / `yarn` |

**Pasos**:
1. checkout
2. setup-node con cache
3. `npm ci` (o pnpm/yarn equivalent)
4. **Lint**: `npm run lint` o `npx eslint .`
5. **Format**: `npm run format:check` o `npx prettier --check .`
6. **Type**: `npx tsc --noEmit` (si `tsconfig.json` presente)
7. **Test**: `npm run test:cov` → `npm run test -- --coverage` → `npx vitest run --coverage` (auto-fallback)
8. **Security**: `npm audit --audit-level=high --json` (report-only V1)
9. Upload artifacts (coverage, npm-audit, lint-output)

## Cómo usarlo desde un repo consumidor

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  ci:
    uses: innovacionsantiago/core-ts-base/.github/workflows/ci-typescript.yml@main
    with:
      node_version: "22"
      coverage_min: 60
```

## Convenciones que esto impone

- **Node 22 LTS** (target). Servicios nuevos: 22 explícito.
- **eslint + prettier** como tooling base. Si el repo no los tiene configurados, el step se warn-skipea.
- **vitest** como test runner default (preferido sobre jest por ESM-native + speed).
- **tsc --noEmit** como type-check independiente del bundler.
- **`npm run test:cov`** como script convencional para test+coverage.
- **`npm run format:check`** como script convencional para verificar prettier.
- **Coverage 60%** mínimo (configurable, gradual igual que Python).

## Scripts npm convencionales

Recomendados en `package.json` para que el workflow los detecte:

```json
{
  "scripts": {
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "i18n:check": "cis-i18n check messages",
    "test": "npm run i18n:check && vitest run",
    "test:cov": "npm run i18n:check && vitest run --coverage",
    "test:watch": "vitest"
  }
}
```

## TODO

- [ ] Snapshot de `eslint.config.mjs` canónico (flat config).
- [ ] Snapshot de `prettier.config.mjs` canónico.
- [ ] Snapshot de `tsconfig.base.json` canónico (extends pattern).
- [ ] `package.json.template` con devDeps mínimas (eslint, prettier, vitest, typescript).
- [ ] cis-validators TS layer cuando exista.

## Referencias

- `core-python-base` — sibling Python.
- `core-deploy/cd-vps-cis.yml` — deploy workflow (TS sites usan template `post_deploy.ts.sh`).
- ADR-018 (Python project standard, conceptos extensibles a TS).

## Idiomas en proyectos nuevos

Copia también `messages/` e `i18n.config.json` al crear un servicio. La lista
habilitada inicial es `["es", "en"]`. Para ampliarla agrega códigos del
[contrato canónico](../core-i18n/README.md#locales-y-rutas), traduce los
catálogos base con Claude y pasa la configuración a los helpers. JSON no
admite comentarios; las instrucciones de ampliación viven aquí.

El catálogo mínimo contiene `app.name = "{name}"`: un parámetro de marca sin
prosa que traducir, idéntico en los dos idiomas. Codex escribe solamente el
español fuente. Cuando agregues textos, Claude completa los otros catálogos con
`cis-i18n missing`, `merge` y `check`. No copies el español como traducción.
El check bloquea si falta una clave en inglés, aunque el runtime use fallback.

Node 22 es necesario para la CLI, también en servicios Python. El paquete no
está publicado en npm: construye el commit 59123818f634 de core-i18n y copia su
tarball privado en `vendor/cis-i18n-0.2.0.tgz` del consumidor, conservándolo
en Git para que CI sea reproducible. El patrón `file:vendor/…` ya lo usa
`cis-usaia/frontend-v2` para `@cis/github` y `@cis/browser-privacy`.
No uses un checkout Node Git sin construir `dist/`.

```sh
mkdir -p vendor
cp /srv/projects/core/core-i18n/.tmp/cis-i18n-0.2.0.tgz vendor/
```

Los textos visibles, metadatos y atributos accesibles se leen con el helper
del stack; los formatos usan el locale y el HTML declara `lang` y `dir`.
No se modifica el kit. Sigue el [canon de idiomas](../../CANON.md#idiomas-i18n-decisión-martín-2026-10-08).

Después de copiar `package.json.template`, ejecuta `npm install` y conserva
`package-lock.json`. `npm test` y `npm run test:cov` incluyen `i18n:check`.
