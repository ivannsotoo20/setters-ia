# Onboarding — Fyzon Setters IA

> Setup completo de cero a productivo en local. Tras seguir esta guía deberías poder levantar motor + panel, ver tests verdes y entender por dónde empezar a contribuir.

Tiempo estimado: 30-45 minutos.

---

## 1. Prerrequisitos del sistema

| Tool | Versión mínima | Cómo instalar |
|---|---|---|
| Node | 22 LTS | [nodejs.org](https://nodejs.org/) o `nvm install 22 && nvm use 22` |
| pnpm | 10+ | `npm i -g pnpm@latest` |
| Docker Desktop | 4.0+ | [docker.com](https://www.docker.com/products/docker-desktop) — necesario para Redis local + opcional para correr el motor en container |
| Git | Cualquiera reciente | `git --version` |
| VS Code (opcional) | — | Con extensiones: ESLint, Prettier, Tailwind CSS IntelliSense |

Verifica:

```bash
node -v   # v22.x
pnpm -v   # 10.x
docker --version
git --version
```

> En Windows con Git Bash, el binario Docker no está en PATH por defecto. Si tienes problemas:
> ```bash
> export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
> ```

---

## 2. Clonar e instalar

```bash
git clone <URL-DEL-REPO> setters_ia
cd setters_ia
pnpm install
```

Tarda 2-3 minutos la primera vez. Es un monorepo pnpm + Turborepo con 2 apps + 6 packages.

---

## 3. Variables de entorno

```bash
cp .env.example .env.local
```

Pide a Ivan los siguientes valores reales (los placeholders no funcionan):

| Var | Quién la usa | Riesgo si filtra |
|---|---|---|
| `SUPABASE_URL` | motor + panel | bajo (URL pública del proyecto) |
| `SUPABASE_ANON_KEY` | panel + browser | bajo (protegida por RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo motor** | **CRÍTICO** — bypassea RLS, es root de la DB |
| `ANTHROPIC_API_KEY` | motor | **ALTO** — coste real por token |
| `NEXT_PUBLIC_SUPABASE_URL` | panel browser | igual que SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | panel browser | igual que SUPABASE_ANON_KEY |

`.env.local` está en `.gitignore`. **Nunca lo commitees**.

---

## 4. Generar tipos de la DB

El paquete `@fyzon/db` tiene tipos TypeScript generados desde el schema real de Supabase. Si abres el repo y `packages/db/src/types.generated.ts` no existe o está desactualizado:

```bash
pnpm db:generate-types
```

Este comando usa el MCP de Supabase via Claude Code, o como alternativa la CLI de Supabase. Para CI o setup sin Claude Code, hace falta `supabase gen types` con un access token.

> Si no tienes acceso al MCP Supabase y solo necesitas typecheck, pide a Ivan la última versión de `types.generated.ts` y commitéala.

---

## 5. Levantar el stack en dev

### Opción A — Todo en Docker (recomendado primera vez)

```bash
docker compose up --build
```

Esto arranca:
- `redis` (puerto 6379)
- `motor` Fastify (puerto 3001)

El panel **no** está dockerizado — siempre se levanta con pnpm en otra terminal.

### Opción B — Motor en pnpm + Redis solo en Docker

```bash
docker compose up redis -d
pnpm --filter @fyzon/motor-agente dev
```

### Panel Next.js (siempre con pnpm)

```bash
pnpm --filter @fyzon/panel dev
```

URLs activas:
- Motor: `http://localhost:3001`
- Panel: `http://localhost:3000`

---

## 6. Smoke checks

### Motor health

```bash
curl http://localhost:3001/health
```

Esperado:

```json
{
  "status": "ok",
  "supabase_reachable": true,
  "prompt_blocks_count": 11,
  "redis_reachable": true
}
```

Si `prompt_blocks_count` no es 11, el Core v3 no está cargado en tu Supabase. Aplica los seeds (ver sección 8).

### Tests del monorepo

```bash
pnpm test
```

Esperado: **110 tests verde** distribuidos en 5 paquetes (`channel-adapters`, `shared-validator`, `prompt-composer`, `agent-pipeline`, `motor-agente`).

### Typecheck

```bash
pnpm typecheck
```

Esperado: **8/8 successful** (sin errores TypeScript en ningún paquete).

### Pipeline E2E (Generator + Judge + Splitter contra Anthropic real)

> Coste: ~$0.01-0.05 por corrida con prompt caching.

```bash
pnpm --filter @fyzon/motor-agente run-pipeline \
  --tenant 2 \
  --phase 1 \
  --message "Hola, queria info"
```

Salida esperada: 1-4 mensajes naturales que respeten el coach de Pablo Montenegro (acento venezolano, cercano, sin coaching motivacional).

### Panel auth (magic link)

1. Abre `http://localhost:3000` → te redirige a `/login`.
2. Pega el email de Ivan (`sotobautistaivan@gmail.com`) si quieres entrar como owner del tenant 1, o crea tu user vía `/signup` con tu email.
3. Click en el botón → revisa Gmail → click en el enlace → aterrizas en `/dashboard`.

Si el magic link no llega:
- **Configura redirect URL en Supabase**: Authentication → URL Configuration → añade `http://localhost:3000/auth/callback`.
- Revisa carpeta de spam (Supabase usa su SMTP por defecto).

---

## 7. Estructura mental — qué vive dónde

```
apps/panel/
  app/(login,signup,auth/callback,dashboard)   ← rutas Next.js 16 App Router
  lib/actions/auth.ts                          ← server actions login/logout
  lib/supabase/{client,server}.ts              ← clientes Supabase SSR
  middleware.ts                                ← refresh sesión + protección rutas

apps/motor-agente/
  src/server.ts                                ← Fastify entry
  src/routes/webhook-manychat.ts               ← POST /webhook/manychat/:tenant_token
  src/services/process-debounced.ts            ← orquestador debounce → pipeline → INSERT message_schedules
  src/services/outbound-sender.ts              ← cron envío vía adapter ManyChat
  src/plugins/cron-scheduler.ts                ← 2 setIntervals (debounce + outbound)
  scripts/run-pipeline.ts                      ← CLI E2E para tests reales

packages/agent-pipeline/src/
  generator.ts        ← runGenerator (Sonnet 4.5 + tool-forced output)
  judge.ts            ← runJudge (Haiku 4.5 + 8 guardrails)
  splitter.ts         ← runSplitter (Haiku 4.5 + fallback determinístico)
  pipeline.ts         ← runPipeline orquesta todo + totals
  cost.ts             ← calculateCostUsd con cache_read/cache_write/output

packages/prompt-composer/src/
  builder.ts          ← buildComposedPrompt(rows, options) puro
  index.ts            ← composePrompt(supabase, options) con query

packages/shared-validator/src/
  rules/V00-V16.ts    ← 17 reglas (11 reales + 6 stubs)
  index.ts            ← validateMessage runner

packages/channel-adapters/src/manychat/
  api-client.ts       ← manyChatSendContent (POST /fb/sending/sendContent)
  whatsapp.ts         ← ManyChatWhatsAppAdapter
  instagram.ts        ← ManyChatInstagramAdapter

prompts/source/
  core-v3/            ← 3 archivos .md fuente del Core (la única fuente de verdad)
  coach-v3/           ← 1 archivo por trainer (hoy: pablo-montenegro.md)

schema/v1/
  migrations/         ← migraciones DDL numeradas
  seeds/              ← seeds idempotentes (002 Core v3 / 003 tenant Pablo / 004 coach Pablo)
```

---

## 8. Aplicar seeds (si tu Supabase está vacío)

> Si tienes acceso al Supabase de Ivan (`ppujrqxiizgfqclbuxet`), todos los seeds ya están aplicados — salta esta sección.
> Si vas a usar tu propio Supabase, aplícalos en orden:

```
schema/v1/migrations/001-initial.sql       ← schema base (tenants, profiles, prompt_blocks, ...)
schema/v1/seeds/001-tenant-fyzon-dev.sql   ← tenant_id=1 + profile Ivan owner
schema/v1/seeds/002-core-v3-blocks.sql     ← 11 bloques Core v3 con tenant_id=NULL
schema/v1/seeds/003-tenant-montefit.sql    ← tenant_id=2 (Pablo Montenegro)
schema/v1/seeds/004-coach-pablo-montenegro.sql  ← coach_v3 para tenant 2
```

Aplicación recomendada via Claude Code + MCP `supabase-fyzon`:

```
"Lee el archivo schema/v1/seeds/002-core-v3-blocks.sql y aplícalo
en el Supabase conectado vía MCP supabase-fyzon usando apply_migration."
```

Alternativa CLI: `supabase db push` o pegar el SQL en SQL Editor del dashboard.

---

## 9. Comandos que usarás todo el rato

```bash
# Desarrollo
pnpm --filter @fyzon/motor-agente dev      # motor con tsx watch
pnpm --filter @fyzon/panel dev             # panel con next turbopack
pnpm dev                                   # ambos en paralelo

# Calidad
pnpm typecheck                             # tsc --noEmit en todo
pnpm test                                  # vitest run en todos los paquetes
pnpm -r test                               # idem, recursivo (más verbose)
pnpm --filter @fyzon/agent-pipeline test   # solo un paquete

# DB
pnpm db:generate-types                     # regenera types.generated.ts

# Core v3 (workflow editar el prompt — leer CONTRIBUTING.md primero)
pnpm core:build-seed                       # regenera 002-core-v3-blocks.sql
node scripts/build-coach-seed.mjs --trainer pablo-montenegro --tenant-slug montefit

# Smoke pipeline real
pnpm --filter @fyzon/motor-agente run-pipeline --tenant 2 --phase 1 --message "Hola"
pnpm --filter @fyzon/motor-agente run-debounce-tick
pnpm --filter @fyzon/motor-agente run-outbound-tick
pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 2

# Docker
docker compose up --build                  # motor + redis
docker compose logs -f motor               # logs en vivo
docker compose down                        # parar todo
```

---

## 10. Smoke E2E real con webhook (cuando llegue el momento)

Para probar el loop completo IG → motor → respuesta IG:

```bash
# Terminal 1: motor + redis
docker compose up --build

# Terminal 2: túnel público
cloudflared tunnel --url http://localhost:3001
# Copia la URL https://*.trycloudflare.com

# Terminal 3: logs
docker compose logs -f motor
```

Pega la URL del túnel + el webhook token del tenant en ManyChat:

```
https://<tunel>.trycloudflare.com/webhook/manychat/<webhook_token>
```

> El webhook token del tenant Pablo (id=2) está en la memoria del proyecto. Pídelo a Ivan.

Envía un DM a la cuenta IG del tenant que dispare el flow ManyChat. Deberías ver en logs del motor:

1. `POST /webhook/manychat/...` → 200 ack
2. ~25s después: `[debounce-tick] processing conversation X`
3. Generator + Judge + Splitter logs
4. `[outbound-tick] sending part 1/N to instagram via manychat`
5. El bot responde en el IG del lead.

Si algo falla, los logs lo dicen. Trazabilidad: tabla `llm_calls` en Supabase tiene cada llamada con request/response.

---

## 11. Troubleshooting común

| Síntoma | Probable causa | Solución |
|---|---|---|
| `Missing NEXT_PUBLIC_SUPABASE_URL` | `.env.local` no existe o no tiene NEXT_PUBLIC_* | `cp .env.example .env.local` y rellenar |
| `ANTHROPIC_API_KEY: required` al arrancar motor | env vacía en shell antes de cargar `.env.local` | El motor usa `dotenv` con `override: true`. Si persiste, `unset ANTHROPIC_API_KEY` antes de `pnpm dev` |
| `prompt_blocks_count: 0` en /health | seeds no aplicados | Ver sección 8 |
| Test del panel falla con "Window is not defined" | server component intentando usar API browser | Mueve a client component con `'use client'` |
| Magic link nunca llega | Site URL / Redirect URLs mal en Supabase | Auth → URL Configuration → añade `http://localhost:3000/auth/callback` |
| `docker compose up` cuelga en Building motor | Cache corrupta | `docker compose build --no-cache motor` |
| ManyChat webhook 200 OK pero sin respuesta del bot | API key ManyChat caducada o tenant sin coach_v3 | Mira `llm_calls` y `message_schedules` en Supabase |
| Vitest dice "Cannot find module @fyzon/db" | tipos no generados | `pnpm db:generate-types` |

---

## 12. Cómo iterar el Core v3 (NUNCA editar Supabase directo)

Resumen — detalle completo en [CONTRIBUTING.md](CONTRIBUTING.md):

```
1. Editar prompts/source/core-v3/<archivo>.md
2. node scripts/build-core-v3-seed.mjs
3. git diff schema/v1/seeds/002-core-v3-blocks.sql   ← revisa
4. Aplicar via MCP supabase-fyzon.apply_migration
5. Validar con SELECT del propio seed (debe devolver 11 filas)
```

Mismo patrón para el coach de un trainer concreto, con `build-coach-seed.mjs`.

---

## 13. Próximo paso lógico tras setup

Cuando todo verde:

1. Lee [ROADMAP.md](ROADMAP.md) para entender qué viene.
2. Habla con Ivan sobre qué tarea coger primero. Probables candidatas en este orden:
   - **Wizard onboarding del panel** (Fase 2.2): Next.js + form Tenant + API key ManyChat + plantilla.
   - **Configurador coach_v3** (Fase 2.3): formulario → markdown → INSERT en `prompt_blocks`.
   - **Visor conversaciones** (Fase 2.4): Supabase Realtime listing.
3. Antes de tocar código, lee [CONTRIBUTING.md](CONTRIBUTING.md) para convenciones de commits + workflow Core v3.

---

## 14. Cosas que sí o sí tienes que pedir a Ivan

- Acceso al Supabase del proyecto (invitación al dashboard).
- `SUPABASE_SERVICE_ROLE_KEY` real.
- `ANTHROPIC_API_KEY` real (con monitor de coste si vas a hacer muchas pruebas).
- Webhook token del tenant para smoke E2E manual.
- Acceso al repo GitHub (privado).
- Acceso a la cuenta ManyChat si vas a tocar flows.
- (Opcional) Acceso al VPS Contabo si vas a deployar motor en prod.

---

¿Atascado? Pregunta a Ivan directamente — no des vueltas más de 30 min con un bloqueo.
