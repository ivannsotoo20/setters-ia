# Fyzon Setters IA

> SaaS multi-tenant de **setters IA conversacionales** para entrenadores online.
> Reemplaza la infraestructura n8n + Supabase + GHL + WhatsApp con código TypeScript propio bajo control total del agente.

**Estado actual**: Fase 1 cerrada en código (motor + pipeline 3-LLM + outbound + scheduler) · Fase 2 arrancada (auth panel).
Tests: 110/110 verde · Typecheck: 8/8 paquetes OK.

---

## Qué hace

Una conversación real entre el setter y un lead de fitness:

```
Lead (IG): "Hola"
  ↓ webhook ManyChat → motor Fastify
  ↓ debounce 25s (Redis sorted set)
  ↓ Generator (Sonnet 4.5 + prompt caching) → message_raw + phase_decision
  ↓ Judge (Haiku 4.5) → pass/fix/reject según 8 guardrails
  ↓ Splitter (Haiku 4.5) → 1-4 mensajes naturales 20-280 chars
  ↓ Validator V0-V16 (TS puro) → red de seguridad
  ↓ Scheduler (typing delay 30s + 10s entre partes)
  ↓ ManyChat sendContent → IG/WA/FB del lead
Bot: "Genial 💪 Cuéntame, ¿qué haces ahora de ejercicio?"
```

Multi-tenant: cada trainer (`tenant`) tiene su propio `coach_v3` (Bloque 2: identidad, nicho, tono, banco frases, criterios cualificación) que se compila desde un panel y se inyecta en el prompt junto al `core_v3` (Fyzon, 11 bloques compartidos: 11 reglas, 9 pre-checks, fases F0-F7, hand-off, pipeline GHL, RAM Bloque 7, objeciones).

## Stack

| Capa | Tech |
|---|---|
| Motor agente (headless) | TypeScript 5.9 · Node 22 · Fastify 5 · Anthropic SDK · ioredis · Zod · Vitest |
| Panel SaaS (trainer-facing) | Next.js 16 (App Router + Turbopack) · Tailwind 4 · Supabase Auth (`@supabase/ssr`) |
| DB / Auth / Storage / Realtime | Supabase (Postgres) — proyecto `ppujrqxiizgfqclbuxet` |
| Modelos IA | Sonnet 4.5 (Generator) · Haiku 4.5 (Judge + Splitter) · prompt caching `ephemeral` |
| Canales | ManyChat (WhatsApp + Instagram + Facebook). Adapter pattern → migración a Meta Cloud API directo en Fase 6 sin tocar el resto |
| Orquestación | pnpm workspaces · Turborepo |
| Deploy | Panel: Vercel · Motor: VPS Contabo (Docker Compose) |

## Estructura

```
apps/
  panel/                 Next.js 16 — trainer-facing (auth + onboarding + configurador)
  motor-agente/          Fastify — webhook receiver + pipeline + scheduler
packages/
  db/                    Tipos TS generados de Supabase (vía MCP)
  shared-validator/      V0-V16 post-LLM (red de seguridad)
  channel-adapters/      ManyChatWhatsAppAdapter / ManyChatInstagramAdapter / Meta Cloud (Fase 6)
  agent-pipeline/        Generator + Judge + Splitter + runPipeline
  prompt-composer/       Ensambla core + coach + fase + condicionales con cache breakpoints
  ghl-client/            Wrapper REST GoHighLevel (Fase 3)
prompts/source/core-v3/  Markdown fuente del Core (NUNCA editar bloques en Supabase a mano)
prompts/source/coach-v3/ Markdown fuente del coach por trainer
schema/v1/migrations/    Migrations SQL numeradas
schema/v1/seeds/         Seeds idempotentes (Core v3 base + tenants + coaches)
scripts/                 build-core-v3-seed.mjs · build-coach-seed.mjs · generate-db-types.mjs
```

## Quick start

Requisitos: Node 22 LTS, pnpm 10+, Docker Desktop, acceso al Supabase del proyecto + Anthropic API key.

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar y rellenar env
cp .env.example .env.local
# Pide a Ivan los valores reales

# 3. Levantar motor + redis con Docker
docker compose up --build

# 4. Smoke test motor
curl http://localhost:3001/health
# → { "status":"ok", "supabase_reachable":true, "prompt_blocks_count":11 }

# 5. En otra terminal, panel Next.js
pnpm --filter @fyzon/panel dev
# → http://localhost:3000 (te redirige a /login)
```

> **Setup completo paso a paso para una persona nueva**: ver [ONBOARDING.md](ONBOARDING.md).

## Documentación del repo

| Archivo | Para qué |
|---|---|
| [README.md](README.md) | Esto — visión 30s + quick start |
| [ONBOARDING.md](ONBOARDING.md) | Setup local de cero a productivo (Node, pnpm, Docker, env, Supabase, primer arranque) |
| [ROADMAP.md](ROADMAP.md) | Estado de hitos cerrados · Fase 1/2/3/4/5/6 detalle · plan a 6 meses · decisiones D1-D29 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow Core v3 · convenciones commit · branch model · code review · cómo iterar el coach |
| [CLAUDE.md](CLAUDE.md) | Reglas operativas para Claude Code (no negociables, complemento al global) |

## Comandos útiles

```bash
pnpm install                              # bootstrap monorepo
pnpm dev                                  # turbo run dev (motor + panel paralelo)
pnpm --filter @fyzon/motor-agente dev     # solo motor (puerto 3001)
pnpm --filter @fyzon/panel dev            # solo panel (puerto 3000)
pnpm typecheck                            # tsc --noEmit en todo el monorepo
pnpm test                                 # vitest run en todos los paquetes
pnpm build                                # turbo run build
pnpm db:generate-types                    # regenera packages/db/src/types.generated.ts
pnpm core:build-seed                      # regenera schema/v1/seeds/002-core-v3-blocks.sql
docker compose up --build                 # motor + redis locales
```

## Smoke E2E (sin auth)

```bash
# Pipeline completo Generator + Judge + Splitter contra Anthropic real
pnpm --filter @fyzon/motor-agente run-pipeline \
  --tenant 2 \
  --phase 1 \
  --message "Hola"
# Coste real ~$0.01-0.05 por turno con prompt caching activo

# Forzar tick de debounce y outbound manualmente (para pruebas locales)
pnpm --filter @fyzon/motor-agente run-debounce-tick
pnpm --filter @fyzon/motor-agente run-outbound-tick
```

## Reglas no negociables

1. **Core v3 NUNCA se edita directo en Supabase**. Workflow: editar `.md` → `node scripts/build-core-v3-seed.mjs` → revisar diff → aplicar via MCP. Detalles en [CONTRIBUTING.md](CONTRIBUTING.md).
2. **`SUPABASE_SERVICE_ROLE_KEY` solo en motor**. Nunca en el panel. Nunca en browser.
3. **Fixtures C1/C2/C3 son bloqueantes** una vez existan (G6 pendiente). Cualquier PR que toque pipeline o coach debe pasar la regresión contra las 3 antes de mergear.
4. **Prompt caching activado siempre**. Sin él, no entramos en economía viable: ver `packages/prompt-composer` y D26-D28.
5. **No metemos Prisma** sin conversación previa. Hoy `@supabase/supabase-js` con service_role en el motor.
6. **No commits sin que Ivan los pida**. Preparamos cambios, Ivan revisa, Ivan aprueba.

## Estado en una página

```
✅ Hito 1 — tenant + profile + RLS
✅ Hito 2 — Core v3 cargado en Supabase (11 bloques, 59k chars)
✅ Hito 3 — Scaffold monorepo (motor + panel + 6 packages + Docker)
✅ Hito 4 — Webhook receiver ManyChat + tenant Pablo Montenegro/Montefit
✅ Hito 5 — Prompt composer (cache 2 breakpoints, ~90% ahorro)
✅ Hito 6 — Generator (Sonnet 4.5 + tool-forced output + cost calc)
✅ Hito 7 — Judge + Splitter + Validator V0-V16 + runPipeline
✅ Hito 8 — Outbound ManyChat + scheduler debounce (loop cerrado en código)
🔨 Fase 2 — Panel SaaS v1 (auth scaffold listo, falta wizard onboarding + configurador)
⏳ Smoke E2E real (manual de Ivan: cloudflared + IG real)
⏳ G6 — fixtures C1/C2/C3 10/10 (bloqueante para iterar coach v2)
```

Detalle completo en [ROADMAP.md](ROADMAP.md).

## Licencia

Privado. Propiedad de Fyzon (Iván Soto). No redistribuir.
