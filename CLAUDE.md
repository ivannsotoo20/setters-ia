# CLAUDE.md — Setters IA SaaS

Reglas operativas para Claude Code cuando trabajes en este repo. Complemento (no reemplazo) de `~/.claude/CLAUDE.md` y de la memoria del proyecto en `~/.claude/projects/C--Users-sotob-setters-ia/memory/`.

## Qué es esto

SaaS multi-tenant de setters IA para entrenadores. Reemplaza la infra actual de n8n + Supabase + GHL + WhatsApp con código propio controlado. Proyecto estratégico de Fyzon, carrera de fondo.

**Plan maestro**: `~/.claude/plans/lo-que-te-voy-shimmering-toucan.md` (todo cambio se registra en la sección 8 Log).
**Plan del Hito actual (3)**: `~/.claude/plans/retomamos-setters-ia-vamos-frolicking-pudding.md`.
**Supabase**: `ppujrqxiizgfqclbuxet` (MCP `supabase-fyzon` en `.mcp.json`).

## Estructura del monorepo

```
apps/
  panel/          Next.js 16 (Turbopack) + Tailwind 4 + Supabase Auth — trainer-facing
  motor-agente/   Fastify + Anthropic SDK + Supabase service_role — headless, corre en VPS Contabo
packages/
  db/                  tipos TS generados de Supabase + helpers de queries
  shared-validator/    V0-V16 post-LLM (red de seguridad)
  channel-adapters/    ManyChat WA/IG/FB + YCloud WA + Meta Cloud (Fase 6)
  agent-pipeline/      Generator (Sonnet) + Judge (Haiku) + Splitter (Haiku)
  prompt-composer/     ensambla system prompt desde prompt_blocks con cache breakpoints
  ghl-client/          wrapper REST GoHighLevel
prompts/source/core-v3/   fuentes markdown del Core v3 (NO editar bloques en Supabase directamente)
schema/v1/                migraciones + seeds SQL (aplicadas vía MCP)
scripts/                  build-core-v3-seed.mjs, generate-db-types.mjs
```

## Reglas no negociables

1. **Core v3 se edita SOLO vía pipeline fuente → script → seed**. Nunca tocar `public.prompt_blocks` directamente en Supabase para bloques con `tenant_id IS NULL`. Workflow completo en la memoria del proyecto (`project_saas_setters_ia.md`, sección "EDITAR EL CORE v3"). Resumen: editar `.md` en `prompts/source/core-v3/` → `node scripts/build-core-v3-seed.mjs` → revisar `git diff schema/v1/seeds/002-core-v3-blocks.sql` → aplicar con MCP.
2. **Cambios de schema**: añaden una migration numerada nueva en `schema/v1/migrations/NNN-descripcion.sql`. Después de aplicar, regenerar `packages/db/src/types.generated.ts` con `pnpm db:generate-types` (o vía MCP `supabase-fyzon.generate_typescript_types`).
3. **`packages/` vs `apps/`**: cualquier pieza reutilizable entre el motor y el panel va en `packages/`. Si vive solo dentro del motor o solo dentro del panel, se queda en `apps/<app>/`. No duplicar lógica entre apps.
4. **Service role solo en motor**. `SUPABASE_SERVICE_ROLE_KEY` nunca entra al panel ni sale al browser. Panel usa `NEXT_PUBLIC_SUPABASE_ANON_KEY` + RLS.
5. **Fixtures C1/C2/C3 son bloqueantes**. Las 3 conversaciones 10/10 (C1 difícil, C2 cualificable, C3 no cualifica) son el golden set. Cuando exista pipeline funcional, cualquier PR debe pasar la regresión contra las 3 antes de mergear.
6. **Prompt caching**. El motor usa `cache_control: { type: 'ephemeral' }` por bloque compuesto: core_v3 (cacheado), fase activa (cacheado), coach_v3 (cacheado por tenant), historial (no). Sin caching no entramos en economía viable.
7. **No inventar estructura**. Si hace falta un nuevo package o app, confirmar con Ivan antes de crear.

## Decisiones técnicas cerradas (ver plan maestro para el resto)

| Ítem | Valor |
|---|---|
| Node | 22 LTS (`.nvmrc`) |
| Package manager | pnpm workspaces + Turborepo |
| DB client motor | `@supabase/supabase-js` con service_role. NO Prisma. |
| Panel build | Next.js 16 + Turbopack |
| Orquestación jobs | Trigger.dev (se incorpora en Fase 1) |
| Canal WA primario | **YCloud** (BSP oficial Meta) para tenants nuevos. ManyChat sigue activo para tenants legacy hasta migración a GHL. Meta Cloud directo cuando Ivan sea BSP (Fase 6). |
| Canal IG/FB | ManyChat (sin alternativa hoy). Pausados temporalmente hasta tener adapter GHL o Meta Cloud directo. |
| CRM backbone | GHL Agency Unlimited ($297) con sub-cuenta por trainer. Plan medio plazo: GHL pasa a ser **pasarela de canales** (no solo CRM), reemplazando ManyChat. |

## Multi-provider routing (canales)

El motor soporta **varios proveedores BSP** en paralelo, decididos por `integration_accounts.provider`. Cuando el cron `outbound-tick` lee un `message_schedules` pending, `outbound-sender.ts:loadSendContext` carga el provider y `buildAdapter(ctx)` construye el adapter correcto:

| Provider | Canales | Adapter | Endpoint envío | Auth |
|---|---|---|---|---|
| `manychat` | whatsapp, instagram, facebook | `ManyChat{WhatsApp,Instagram}Adapter` | `/fb/sending/sendContent` | Bearer `<api_key>` |
| `ycloud` | whatsapp (solo) | `YCloudWhatsAppAdapter` | `/v2/whatsapp/messages/sendDirectly` | Header `X-API-Key: <api_key>` |
| `meta_cloud` | (futuro, cuando BSP) | — | — | — |
| `ghl` | (futuro, sustituirá ManyChat) | — | — | — |

### Cómo añadir un nuevo proveedor

1. Crear `packages/channel-adapters/src/<provider>/{api-client,types,parser,<channel>}.ts` (sigue el patrón de `manychat/` y `ycloud/`).
2. Re-exportar en `packages/channel-adapters/src/index.ts`.
3. Añadir el valor al enum `channel_provider` con migration en `schema/v1/migrations/NNN-<provider>-provider-enum.sql`.
4. Crear ruta webhook nueva `apps/motor-agente/src/routes/webhook-<provider>.ts` filtrando por `tenant_tokens.purpose='<provider>_webhook'`.
5. Registrar la ruta en `apps/motor-agente/src/server.ts`.
6. Añadir `case '<provider>'` en `apps/motor-agente/src/services/outbound-sender.ts:buildAdapter()` y en `normalizeProvider()`.
7. Ampliar el tipo de `viaProvider` en `apps/motor-agente/src/services/lead-ingest.ts:GetOrCreateChannelParams` (mientras no se regeneren tipos DB).
8. Añadir `<PROVIDER>_API_BASE` en `apps/motor-agente/src/config/env.ts` y `.env.example` si aplica.
9. Tests: `packages/channel-adapters/test/<provider>-api.test.ts` (mock fetch) + `apps/motor-agente/test/parser-<provider>.test.ts` (fixtures payload).
10. Tras aplicar migration → `pnpm db:generate-types` para tipos DB actualizados.

### Convenciones

- **Token webhook**: `tenant_tokens.purpose = '<provider>_webhook'` (snake_case). Cada ruta filtra por su purpose.
- **Credenciales sensibles**: `integration_accounts.credentials_encrypted` (JSONB shape `{"blob":"v1:iv:ct:tag"}`, AES-256-GCM via `apps/motor-agente/src/lib/crypto.ts`). La columna legacy `credentials` (plain) se conserva durante la transición — el helper `decodeCredentialsRow` (`apps/motor-agente/src/lib/integration-credentials.ts`) prefiere `credentials_encrypted` y hace fallback a `credentials` plain. Backfill: `node scripts/encrypt-credentials.mjs`. Requiere env `CREDENTIALS_ENCRYPTION_KEY` (32 bytes hex, generar con `openssl rand -hex 32`).
- **Datos no sensibles**: `integration_accounts.connection_config` (JSON, plain). Para YCloud incluye `business_phone` (E.164).
- **Dedup Redis**: prefijo `<provider>:{tenantId}:{external_id_estable}`. YCloud usa el `wamid` del mensaje; ManyChat usa `subscriber_id:timestamp`.

### Verificación HMAC de webhooks (Hardening 1.2)

| Proveedor | Firma | Mecanismo |
|---|---|---|
| **YCloud** | ✅ Sí | Header `YCloud-Signature: t=<unix_seconds>,s=<hmac_sha256_hex>`. Signed payload `{ts}.{rawBody}`. Secret se obtiene del panel YCloud (Retrieve a webhook endpoint API) y se guarda en `integration_accounts.webhook_secret`. Implementación: `apps/motor-agente/src/lib/webhook-verify.ts`. Modo configurable vía `YCLOUD_WEBHOOK_VERIFY_MODE=disabled\|warn\|enforce` (default `warn`). En `enforce`, requests sin firma o con firma inválida → 401. Tolerance default 300s anti-replay. |
| **ManyChat** | ❌ No | ManyChat NO firma webhooks (verificado 2026-04-21). Protección única: token aleatorio en URL `/webhook/manychat/<tenant_token>`. Deuda asumida hasta que Pablo migre a YCloud / Meta Cloud / GHL (Fase 6). |

## Comandos frecuentes

```bash
pnpm install                      # instala todo el monorepo
pnpm dev                          # turbo run dev en todos los workspaces (motor + panel)
pnpm --filter @fyzon/motor-agente dev   # solo el motor
pnpm --filter @fyzon/panel dev          # solo el panel
pnpm typecheck                    # tsc --noEmit en todo
pnpm -r test                      # corre todos los tests (vitest) en todos los packages
pnpm build                        # turbo run build
pnpm db:generate-types            # regenera packages/db/src/types.generated.ts
pnpm core:build-seed              # regenera schema/v1/seeds/002-core-v3-blocks.sql
node scripts/build-coach-seed.mjs --trainer <slug> --tenant-slug <slug> --seed-number <NNN>
docker compose up --build         # motor + redis locales
curl localhost:3001/health        # smoke test del motor
```

## Variables de entorno

Plantilla en `.env.example`. `.env.local` es gitignored — Ivan lo rellena con credenciales reales. Motor y panel leen del mismo `.env` en desarrollo.

## Qué NO hacer

- No añadir Prisma al motor sin conversación previa con Ivan.
- No introducir una segunda librería de HTTP server (si existe Fastify, no meter Express).
- No meter Trigger.dev hasta Fase 1. En Hito 3 es esqueleto.
- No crear `.md` de análisis o de "cómo va el proyecto" si Ivan no los pide — está la memoria y el plan maestro.
- No hacer commits sin que Ivan los pida. Preparamos cambios, Ivan revisa, Ivan aprueba.
