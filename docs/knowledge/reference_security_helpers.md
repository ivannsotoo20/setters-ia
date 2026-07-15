---
name: Helpers de seguridad Setters IA
description: Pointers a los helpers nuevos del hardening 2026-05-15 (timing-safe bearer, log redact, url validator, encryption boot check)
type: reference
---

Helpers añadidos en el audit de seguridad 2026-05-15. Usar en código nuevo siguiendo las reglas duras de CLAUDE.md proyecto §8.

**Motor:**
- `apps/motor-agente/src/lib/timing-safe-bearer.ts` — `isValidBearer(provided, expected)` para comparar tokens con `timingSafeEqual`. `extractBearer(authHeader)` para sacar el token del header Authorization.
- `apps/motor-agente/src/lib/log-redact.ts` — `safeLogBody(value)` que redacta keys con `token`, `secret`, `apiKey`, `password`, `credentials`, `accessToken`, `refreshToken`, `webhook_secret` en payloads para logs. `bodyKeys(value)` devuelve solo las keys sin valores.
- `apps/motor-agente/src/lib/crypto.ts` — `assertEncryptionKey()` lanza error si `CREDENTIALS_ENCRYPTION_KEY` falta/malformada. Llamado al boot desde `index.ts` antes de `buildServer()`.

**Panel:**
- `apps/panel/lib/validators/url.ts` — `assertHttpsUrl(input, context)` lanza `UrlValidationError` si protocol no es https (permitido http en localhost dev). `isValidHttpsUrl(input)` devuelve boolean.

**Tests:**
- `apps/motor-agente/test/timing-safe-bearer.test.ts` (11 tests)
- `apps/motor-agente/test/log-redact.test.ts` (10 tests)

**E2E security scripts:**
- `apps/motor-agente/test/security/test-rls-anon-leaks.mjs` — empíricamente valida que tablas con RLS bloquean anon. Ejecutar tras cambios en migrations o policies.
- `apps/motor-agente/test/security/test-bearer-timing.mjs` — mide diferencias de latencia en bearer comparison (requiere motor corriendo).
- `apps/motor-agente/test/security/test-dev-login-blocked.mjs` — verifica que `/api/dev-login` devuelve 404 fuera de localhost dev.

**Docs:**
- `docs/security-checklist.md` — lista pre-deploy a producción.
- `docs/security-incidents.md` — playbook respuesta a incidentes.
- `docs/manychat-security.md` — deuda asumida ManyChat sin firma.
