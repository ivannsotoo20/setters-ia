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
  channel-adapters/    ManyChat WA/IG/FB (MVP) + Meta Cloud (Fase 6)
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
| Canal WA | Meta Cloud API vía ManyChat (MVP). Directo Meta Cloud en Fase 6. |
| CRM backbone | GHL Agency Unlimited ($297) con sub-cuenta por trainer |

## Comandos frecuentes

```bash
pnpm install                      # instala todo el monorepo
pnpm dev                          # turbo run dev en todos los workspaces (motor + panel)
pnpm --filter @fyzon/motor-agente dev   # solo el motor
pnpm --filter @fyzon/panel dev          # solo el panel
pnpm typecheck                    # tsc --noEmit en todo
pnpm build                        # turbo run build
pnpm db:generate-types            # regenera packages/db/src/types.generated.ts
pnpm core:build-seed              # regenera schema/v1/seeds/002-core-v3-blocks.sql
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
