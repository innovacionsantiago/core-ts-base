# core-ts-base · estándar TypeScript/JS para servicios CIS

**Propósito**: template canónico de configuración TS/JS y workflow CI reusable para todo servicio TS del ecosistema CIS (Next.js, Vite, Express, libs).

Sibling de `core-python-base`. ADR-018 extendido a TS.

## Workflows disponibles

### `ci-typescript.yml`

Lint + format + type + test + npm-audit reusable.

**Inputs**:

| Input | Required | Default | Descripción |
|---|---|---|---|
| `node_version` | no | `"20"` | setup-node version |
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
      node_version: "20"
      coverage_min: 60
```

## Convenciones que esto impone

- **Node 20 LTS** (target). Servicios nuevos: 20 explícito.
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
    "test": "vitest run",
    "test:cov": "vitest run --coverage",
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
