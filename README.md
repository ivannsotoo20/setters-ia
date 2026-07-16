# Fyzon Setters IA

> SaaS multi-tenant de **setters IA conversacionales** para entrenadores online.
> Reemplaza la infraestructura n8n + Supabase + GHL + WhatsApp con código TypeScript propio bajo control total del agente.

**Snapshot: 2026-07-16.** Este README es una foto en el tiempo. La **fuente de verdad viva**
es, por orden: el código → `git log` → [CLAUDE.md](CLAUDE.md) → [docs/knowledge/](docs/knowledge/README.md).
Si algo aquí contradice a esos, ganan ellos (y conviene corregir este fichero).

**Estado**: último hito documentado **12.3** · Cerebro **v5** consolidado en código.
Tests **1264/1264 verde** (86 ficheros) · typecheck limpio en todo el monorepo.
Pendientes que bloquean *producción* (no código): smokes E2E reales + pasar los
`*_VERIFY_MODE` a `enforce`, atados al acceso SSH al VPS.

---

## Qué hace

Una conversación real entre el setter y un lead de fitness:

```
Lead (IG/WA/FB): "Hola"
  ↓ webhook (ManyChat / YCloud / GHL Marketplace) → motor Fastify
  ↓ routing multi-tenant por proveedor + gate de clasificación (keywords)
  ↓ debounce 25s (Redis sorted set)
  ↓ Generator (Sonnet 4.5 + prompt caching) → message_raw + phase_decision
  ↓ Judge (Haiku) → pass/fix/reject según guardrails
  ↓ Splitter (Haiku) → 1-N burbujas (cap por trainer, 20-280 chars)
  ↓ Validator V0-V18 (TS puro) → red de seguridad post-LLM
  ↓ Scheduler (typing delay natural + delay entre partes)
  ↓ adapter del proveedor (ManyChat sendContent / YCloud sendDirectly) → IG/WA/FB del lead
Bot: "Genial 💪 Cuéntame, ¿qué haces ahora de ejercicio?"
```

**Multi-tenant — el system prompt se compone en 4 capas (Cerebro v5):**

1. `core_v5_base` + `output_contract_v5` — **compartidos** (`tenant_id IS NULL`): cerebro
   narrativo con las 6 fases inline + reglas críticas/condicionales + objeciones + handoff, y
   el contrato JSON de salida separado.
2. `coach_v5` — **por trainer**: identidad, voz (voiceprint/lexicon/exemplars), fases,
   enlaces, cualificación, programa, objeciones.
3. `admin_overrides_v1` — **solo el agency admin** (Iván) por tenant, opcional.
4. `trainer_prefs_v1` — **autogenerado** desde `/settings/preferences` (fuera del cache).

Prompt caching `ephemeral` con 2 breakpoints (tras el CORE y tras el contrato) → cuando se
edita el coach de un tenant, el CORE cacheado no se recalienta.

## Stack

| Capa | Tech |
|---|---|
| Motor agente (headless) | TypeScript · Node 22 · Fastify 5 · Anthropic SDK · ioredis · Zod · Vitest |
| Panel SaaS (trainer-facing) | Next.js 16 (App Router + Turbopack) · Tailwind 4 · Supabase Auth (`@supabase/ssr`) |
| DB / Auth / Storage / Realtime | Supabase (Postgres) — proyecto `ppujrqxiizgfqclbuxet` (MCP `supabase-fyzon`) |
| Modelos IA | Sonnet 4.5 (Generator) · Haiku (Judge + Splitter) · prompt caching `ephemeral` |
| Canales (multi-provider) | ManyChat (WA/IG/FB, legacy) · **YCloud** (WA, BSP oficial Meta) · Meta Cloud / GHL (futuro). Elegido por `integration_accounts.provider`; adapter pattern en `packages/channel-adapters`. |
| CRM / conectores | GHL Agency (sub-cuenta por trainer) como **conector de origen** — el CRM es el propio SaaS. Calendarios GHL en solo-lectura (Hito 10). |
| Orquestación | pnpm workspaces · Turborepo · Trigger.dev (outbound opcional) |
| Deploy | Panel: Vercel · Motor: VPS Contabo (Docker Compose) |

## Estructura

```
apps/
  panel/                 Next.js 16 — trainer-facing (auth, onboarding, /admin/cerebro,
                         conversations, contacts, calendars, keywords, labels, settings, GDPR)
  motor-agente/          Fastify — webhooks + pipeline 3-LLM + scheduler + booking + follow-ups
packages/
  db/                    Tipos TS generados de Supabase (vía MCP)
  shared-validator/      V0-V18 post-LLM (red de seguridad)
  channel-adapters/      manychat/ · ycloud/ · ghl/ (adapter por provider)
  agent-pipeline/        Generator + Judge + Splitter + runPipeline + cost
  prompt-composer/       Ensambla las 4 capas del Cerebro v5 con cache breakpoints
  ghl-client/            Wrapper REST GoHighLevel (OAuth + calendars + contacts)
prompts/source/core-v5/  Markdown fuente del Cerebro v5 (NUNCA editar bloques en Supabase a mano)
prompts/source/coach-v5/ Markdown fuente del coach por trainer
prompts/coach-engineering/ KB de autoría de coaches (doctrina + avatares + checklist)
schema/v1/migrations/    Migrations SQL numeradas (aplicadas vía MCP)
schema/v1/seeds/         Seeds idempotentes (008-core-v5-blocks.sql + coaches v5)
scripts/                 build-core-v5-seed.mjs · build-coach-v5-seed.mjs · generate-db-types.mjs
docs/knowledge/          Conocimiento versionado del proyecto (el porqué + loops abiertos)
```

## Quick start

Requisitos: Node 22 LTS, pnpm 10+, Docker Desktop, acceso al Supabase del proyecto + Anthropic API key.

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar y rellenar env
cp .env.example .env.local
# Pide a Ivan los valores reales (.env.local es gitignored)

# 3. Levantar motor + redis con Docker
docker compose up --build

# 4. Smoke test motor
curl http://localhost:3001/health
# → { "status":"ok", "supabase_reachable":true, ... }

# 5. En otra terminal, panel Next.js
pnpm --filter @fyzon/panel dev
# → http://localhost:3000 (te redirige a /login)
```

> Los tests son unitarios (mocks) y no necesitan `.env.local`, salvo el motor: su
> `src/config/env.ts` valida el entorno al importar y hace `process.exit(1)` si faltan
> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` o `ANTHROPIC_API_KEY`. En CI/local basta
> exportar valores *placeholder* (no reales) para esas tres.

> **Setup completo paso a paso para una persona nueva**: ver [ONBOARDING.md](ONBOARDING.md).

## Documentación del repo

| Archivo | Para qué |
|---|---|
| [README.md](README.md) | Esto — visión 30s + quick start |
| [ONBOARDING.md](ONBOARDING.md) | Setup local de cero a productivo |
| [ROADMAP.md](ROADMAP.md) | Estado de hitos + fases + decisiones (snapshot; ver git log para lo vivo) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow de prompts · convenciones commit · branch model · code review |
| [CLAUDE.md](CLAUDE.md) | Reglas operativas + doctrina vigente (arquitectura, 4 capas, MCP, seguridad, hitos) |
| [docs/knowledge/](docs/knowledge/README.md) | El porqué de las decisiones + loops abiertos por coach + contexto no deducible del código |

## Comandos útiles

```bash
pnpm install                              # bootstrap monorepo
pnpm dev                                  # turbo run dev (motor + panel paralelo)
pnpm --filter @fyzon/motor-agente dev     # solo motor (puerto 3001)
pnpm --filter @fyzon/panel dev            # solo panel (puerto 3000)
pnpm typecheck                            # tsc --noEmit en todo el monorepo
pnpm -r test                              # vitest run en todos los paquetes
pnpm build                                # turbo run build
pnpm db:generate-types                    # regenera packages/db/src/types.generated.ts
pnpm core:build-seed                      # regenera schema/v1/seeds/008-core-v5-blocks.sql
node scripts/build-coach-v5-seed.mjs --trainer <slug> --tenant-slug <slug> --seed-number <NNN>
docker compose up --build                 # motor + redis locales
```

## Reglas no negociables (resumen — el detalle vive en [CLAUDE.md](CLAUDE.md))

1. **Cerebro v5 NUNCA se edita directo en Supabase**. Los bloques shared (`core_v5_base`,
   `output_contract_v5`) se editan por el flujo versionado: `.md` en `prompts/source/core-v5/`
   → `pnpm core:build-seed` → revisar diff → aplicar vía MCP + snapshot en `prompt_block_versions`.
   Los `coach_v5` se cargan por UI (`/admin/cerebro`) o `build-coach-v5-seed.mjs`, nunca a pelo.
2. **`SUPABASE_SERVICE_ROLE_KEY` solo en motor**. Nunca en el panel. Nunca en browser (panel = anon + RLS).
3. **Fixtures C1/C2/C3 son bloqueantes**. Cualquier PR que toque pipeline o coach pasa la regresión contra las 3 antes de mergear.
4. **Prompt caching activado siempre**. Sin él, la economía no es viable.
5. **Seguridad dura**: tablas nuevas con `tenant_id` → RLS obligatorio; comparación de tokens → `isValidBearer`/`timingSafeEqual`, nunca `===`; logs de payload → `safeLogBody`. Ver §Seguridad de CLAUDE.md.
6. **No metemos Prisma** sin conversación previa. Hoy `@supabase/supabase-js` con service_role en el motor.
7. **No commits sin que Ivan los pida**. Preparamos cambios, Ivan revisa, Ivan aprueba.

## Estado en una página

```
✅ Hito 1-3  — foundations: tenant + RLS · Cerebro cargado en Supabase · scaffold monorepo
✅ Hito 4-8  — motor: webhook ManyChat + composer + Generator + Judge/Splitter/Validator + outbound/scheduler
✅ Hito 9    — OAuth Marketplace GHL + YCloud como conectores de origen + bienvenida WA por formulario
               (OAuth cerrado 2026-05-12; onboarding trainer = 1 click "Install")
✅ Hito 10   — Calendarios GHL + trazabilidad de bookings (webhook AppointmentCreate → F7 + handoff)
✅ Hito 11   — Timezone-awareness lead/trainer en el prompt
✅ Hito 12   — Cerebro v5 consolidado (2 bloques shared + coach_v5 monolítico, marker dinámico de fase)
✅ Hito 12.1 — cumplimiento estricto: max msgs/turno + tratamiento tú/usted + vocabulario prohibido (V17/V18)
⛔ Hito 12.2 — REVERTIDO (nombre del lead + filtro de género): NO está en el código; diseño conservado por si se retoma
✅ Hito 12.3 — keywords type='inbound' disparan IA también en InboundMessage (leads orgánicos)
⏳ Producción — smokes E2E reales + pasar *_VERIFY_MODE a enforce (bloqueado por acceso SSH al VPS)
```

Detalle e historia en [ROADMAP.md](ROADMAP.md) y, para el estado vivo, en `git log` + [CLAUDE.md](CLAUDE.md).

## Licencia

Privado. Propiedad de Fyzon (Iván Soto). No redistribuir.
