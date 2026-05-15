# Security E2E tests

Scripts node de validación empírica de la postura de seguridad. NO son unit
tests (esos viven en `apps/motor-agente/test/*.test.ts` con Vitest). Estos
scripts pegan contra Supabase REST real (anon key) y/o el motor desplegado
(`MOTOR_BASE_URL`) para comprobar que los controles funcionan end-to-end.

## Ejecutar

```bash
# Carga .env.local (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY).
# Las variables del motor son opcionales si solo quieres probar RLS de Supabase.
node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
node apps/motor-agente/test/security/test-bearer-timing.mjs   # requiere MOTOR_BASE_URL
```

## Scripts disponibles

| Script | Qué prueba | Requiere |
|---|---|---|
| `test-rls-anon-leaks.mjs` | Tablas con RLS no devuelven datos a anon key | NEXT_PUBLIC_SUPABASE_URL + ANON_KEY |
| `test-bearer-timing.mjs` | Bearer timing-safe en `/internal/*` | MOTOR_BASE_URL + INTERNAL_STATS_TOKEN |
| `test-dev-login-blocked.mjs` | `/api/dev-login` 404 fuera de dev local | PANEL_BASE_URL |

## Output esperado

```
=== RLS Anon Leaks Test ===
  ✓ pipeline_runs: returned [] from anon
  ✓ automation_keywords: returned [] from anon
  ✓ v_tenant_health: returned [] from anon
  ✓ tenant_tokens: returned [] from anon
  ✓ integration_accounts: returned [] from anon
  ✓ provision_tenant rpc: 401/403 from anon
PASS — 6/6 controls effective
```

Cualquier fila que devuelva DATOS desde anon es un leak crítico. Revisar el
plan `~/.claude/plans/verifica-muy-bien-que-ticklish-patterson.md` §3.A.
