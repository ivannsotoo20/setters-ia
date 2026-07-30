# Onboarding — Fyzon Setters IA

> Setup completo de cero a productivo en local. Tras seguir esta guía deberías poder levantar
> motor + panel, ver tests verdes y entender por dónde empezar a contribuir.

**Snapshot: 2026-07-16.** La fuente de verdad viva es el código → `git log` →
[CLAUDE.md](CLAUDE.md) → [docs/knowledge/](docs/knowledge/README.md). Si algo aquí contradice
a esos, ganan ellos.

Tiempo estimado: 30-45 minutos.

---

## 1. Prerrequisitos del sistema

| Tool | Versión | Cómo instalar |
|---|---|---|
| Node | 22 LTS (`.nvmrc`) | [nodejs.org](https://nodejs.org/) o `nvm install 22 && nvm use 22` |
| pnpm | **10.33.0** (pin en `packageManager`) | `corepack enable && corepack prepare pnpm@10.33.0 --activate` |
| Docker Desktop | 4.0+ | [docker.com](https://www.docker.com/products/docker-desktop) — Redis local + opción de correr el motor en container |
| Git | Reciente | `git --version` |
| VS Code (opcional) | — | Extensiones: ESLint, Prettier, Tailwind CSS IntelliSense |

Verifica:

```bash
node -v   # v22.x
pnpm -v   # 10.33.0 (debe coincidir con packageManager del package.json raíz)
docker --version
git --version
```

> En Windows con Git Bash, el binario Docker no está en PATH por defecto:
> ```bash
> export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"
> ```

---

## 2. Clonar e instalar

```bash
git clone https://github.com/ivannsotoo20/setters-ia.git setters_ia
cd setters_ia
pnpm install
```

Tarda 2-3 minutos la primera vez. Es un monorepo pnpm + Turborepo: **2 apps + 6 packages**.

---

## 3. Variables de entorno

```bash
cp .env.example .env.local
```

`.env.example` tiene la lista completa (Supabase, Anthropic, Redis, ManyChat, YCloud, GHL
OAuth, Groq, Resend, Trigger.dev, modos `*_VERIFY_MODE`, `INTERNAL_STATS_TOKEN`,
`CREDENTIALS_ENCRYPTION_KEY`…). Casi todas tienen default o son opcionales. **El motor solo
exige tres para arrancar** (su `src/config/env.ts` valida el entorno al importar y hace
`process.exit(1)` si faltan):

| Var | Quién la usa | Riesgo si filtra |
|---|---|---|
| `SUPABASE_URL` | motor + panel | bajo (URL pública del proyecto) |
| `SUPABASE_SERVICE_ROLE_KEY` | **solo motor** | **CRÍTICO** — bypassea RLS, es root de la DB. Nunca en panel/browser. |
| `ANTHROPIC_API_KEY` | motor | **ALTO** — coste real por token |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | panel (browser) | bajo (protegidas por RLS) |

Pide a Ivan los valores reales. `.env.local` está en `.gitignore` — **nunca lo commitees**.

---

## 4. Generar tipos de la DB

`@fyzon/db` tiene tipos TypeScript generados desde el schema real de Supabase. Si
`packages/db/src/types.generated.ts` no existe o está desactualizado:

```bash
pnpm db:generate-types
```

Usa el MCP `supabase-fyzon` vía Claude, o la CLI de Supabase (`supabase gen types` con access
token) como alternativa. Si solo necesitas typecheck y no tienes acceso al MCP, pide a Ivan la
última versión del fichero.

---

## 5. Levantar el stack en dev

### Opción A — Motor + Redis en Docker (recomendado primera vez)

```bash
docker compose up --build   # arranca redis (6379) + motor Fastify (3001)
```

El panel **no** está dockerizado — siempre con pnpm en otra terminal.

### Opción B — Motor en pnpm + Redis solo en Docker

```bash
docker compose up redis -d
pnpm --filter @fyzon/motor-agente dev
```

### Panel Next.js (siempre con pnpm)

```bash
pnpm --filter @fyzon/panel dev
```

URLs: Motor `http://localhost:3001` · Panel `http://localhost:3000`.

---

## 6. Smoke checks

### Motor health

```bash
curl http://localhost:3001/health
```

Forma real de la respuesta:

```json
{
  "ok": true,
  "service": "motor-agente",
  "uptime_s": 2,
  "supabase_reachable": true,
  "prompt_blocks_count": 2
}
```

`prompt_blocks_count` = filas de `prompt_blocks` con `tenant_id IS NULL` (los bloques
compartidos del Cerebro; **≥ 2** con Cerebro v5 cargado — `core_v5_base` + `output_contract_v5`,
más las versiones antiguas inactivas si quedan). Lo que importa: `supabase_reachable=true` y
`prompt_blocks_count > 0`. Si es `0`/`null`, el Cerebro no está cargado o Supabase no responde
(ver sección 8).

### Tests del monorepo

⚠️ **El root NO tiene script `test`** — usa `pnpm -r test` (recursivo), no `pnpm test`.

```bash
pnpm -r test
```

Esperado: **~1264 tests verde** repartidos en 7 paquetes con tests (panel, motor-agente,
prompt-composer, shared-validator, channel-adapters, agent-pipeline, ghl-client).

> Los tests son unitarios (mocks). El único que necesita entorno es el **motor**: su
> `env.ts` hace `process.exit(1)` al importar si faltan las 3 vars requeridas. Sin `.env.local`,
> exporta *placeholders* (no reales) solo para correr los tests:
> ```bash
> SUPABASE_URL="http://localhost:54321" \
> SUPABASE_SERVICE_ROLE_KEY="placeholder" \
> ANTHROPIC_API_KEY="placeholder" \
> pnpm -r test
> ```

### Typecheck

```bash
pnpm typecheck   # esperado: limpio en todos los workspaces
```

### Pipeline E2E (Generator + Judge + Splitter contra Anthropic real)

> Coste: ~$0.01-0.05 por corrida con prompt caching. Requiere `ANTHROPIC_API_KEY` real.

```bash
pnpm --filter @fyzon/motor-agente run-pipeline \
  --tenant 2 --phase 1 --message "Hola, quería info"
```

Salida: 1-N burbujas naturales que respetan el `coach_v5` del tenant 2 (Pablo Montenegro /
Montefit).

### Panel auth (magic link)

1. Abre `http://localhost:3000` → redirige a `/login`.
2. Pega el email de Ivan (`sotobautistaivan@gmail.com`) para entrar como owner, o crea tu user vía `/signup`.
3. Click → revisa Gmail → click en el enlace → aterrizas en el panel.

Si el magic link no llega: Supabase → Authentication → URL Configuration → añade
`http://localhost:3000/auth/callback`. Revisa spam.

---

## 7. Estructura mental — qué vive dónde

```
apps/panel/
  app/(app)/                     ← rutas Next.js 16: /admin/cerebro, /conversations, /contacts,
                                    /calendars, /keywords, /labels, /settings/*, /onboarding, GDPR
  lib/actions/*.ts               ← server actions (prompts, calendars, welcome-template, members…)
  lib/trainer-prefs-serializer.ts← JSONB prefs → bloque trainer_prefs_v1
  lib/supabase/{client,server}.ts + middleware.ts

apps/motor-agente/
  src/server.ts                          ← Fastify entry
  src/routes/webhook-manychat.ts         ← ManyChat (WA/IG/FB)
  src/routes/webhook-ycloud.ts           ← YCloud (WA, firma HMAC)
  src/routes/webhook-ghl.ts (+ -calendar)← GHL Marketplace (OAuth + AppointmentCreate…)
  src/routes/automation-lead-form.ts     ← POST /automations/lead-form/:token
  src/routes/internal-*.ts               ← /internal/welcome, /internal/calendars/sync (bearer)
  src/services/process-debounced.ts      ← debounce → pipeline → INSERT message_schedules
  src/services/outbound-sender.ts        ← envío vía adapter según provider
  src/services/{appointment-matcher,appointment-applier,send-welcome-template}.ts
  src/lib/phase-focus.ts                 ← {{current_phase_focus}} por turno
  src/plugins/cron-scheduler.ts          ← ticks debounce + outbound

packages/agent-pipeline/src/    generator · judge · splitter · pipeline · cost · tool-definition
packages/prompt-composer/src/   builder (buildComposedPrompt puro) · index (composePrompt) · interpolate · types
packages/shared-validator/src/  rules/V00..V18 · lib/detect-addressing · index (runner)
packages/channel-adapters/src/  manychat/ · ycloud/ · ghl/
packages/ghl-client/            wrapper REST GoHighLevel (OAuth, calendars, contacts)

prompts/source/core-v5/         01-core.md + 02-output-contract.md  ← fuente del Cerebro (única verdad)
prompts/source/coach-v5/        1 .md por trainer (pablo-montenegro, montefit, ivan-dev…)
prompts/coach-engineering/      KB de autoría de coaches (doctrina + avatares + checklist)

schema/v1/migrations/           DDL numerado (aplicado vía MCP)
schema/v1/seeds/                008-core-v5-blocks.sql + 009/010/011 coach_v5
```

---

## 8. Aplicar seeds (si tu Supabase está vacío)

> Si tienes acceso al Supabase de Ivan (`ppujrqxiizgfqclbuxet`), todo está aplicado — salta.
> Si usas tu propio Supabase, aplica en orden: migraciones `schema/v1/migrations/001…NNN` y
> luego los seeds vigentes:

```
schema/v1/seeds/008-core-v5-blocks.sql          ← core_v5_base + output_contract_v5 (tenant_id NULL)
schema/v1/seeds/009-coach-v5-pablo-montenegro.sql
schema/v1/seeds/010-coach-v5-ivan-dev.sql
schema/v1/seeds/011-coach-v5-montefit.sql
```

Aplicación recomendada vía Claude + MCP `supabase-fyzon`:

```
"Lee schema/v1/seeds/008-core-v5-blocks.sql y aplícalo en el Supabase
conectado vía MCP supabase-fyzon."
```

Alternativa: pegar el SQL en el SQL Editor del dashboard.

> Los seeds/migrations `002-core-v3` y `007-core-v4` son **historia** — el Cerebro vigente es
> v5. No los apliques encima de un Supabase v5.

---

## 9. Comandos que usarás todo el rato

```bash
# Desarrollo
pnpm --filter @fyzon/motor-agente dev      # motor con tsx watch
pnpm --filter @fyzon/panel dev             # panel con next turbopack
pnpm dev                                   # ambos en paralelo (turbo)

# Calidad
pnpm typecheck                             # tsc --noEmit en todo
pnpm -r test                               # vitest run en todos los paquetes (NO existe `pnpm test`)
pnpm --filter @fyzon/agent-pipeline test   # solo un paquete

# DB
pnpm db:generate-types                     # regenera types.generated.ts

# Cerebro v5 (workflow de prompts — leer CLAUDE.md §"Editar prompts — 4 capas" y CONTRIBUTING.md)
pnpm core:build-seed                       # regenera schema/v1/seeds/008-core-v5-blocks.sql
node scripts/build-coach-v5-seed.mjs --trainer pablo-montenegro --tenant-slug montefit --seed-number 009

# Smoke / debug del motor
pnpm --filter @fyzon/motor-agente run-pipeline --tenant 2 --phase 1 --message "Hola"
pnpm --filter @fyzon/motor-agente run-generator --tenant 2 --phase 1 --message "Hola"
pnpm --filter @fyzon/motor-agente preview-prompt --tenant 2 --phase 2

# Docker
docker compose up --build                  # motor + redis
docker compose logs -f motor               # logs en vivo
docker compose down                        # parar
```

---

## 10. Smoke E2E real con webhook (cuando llegue el momento)

Dos caminos de entrada al motor:

- **ManyChat (legacy)** — túnel público + pegar la URL en el flow ManyChat.
- **GHL Marketplace (Hito 9, camino productivo)** — el trainer instala la app con 1 click
  "Install" en su sub-cuenta; inbound + outbound llegan al motor por `locationId`. No necesita
  túnel. Ver [docs/marketplace-app-setup.md](docs/marketplace-app-setup.md).

Camino ManyChat con túnel:

```bash
docker compose up --build                         # T1: motor + redis
cloudflared tunnel --url http://localhost:3001    # T2: copia la URL https://*.trycloudflare.com
docker compose logs -f motor                       # T3: logs
```

Pega en ManyChat: `https://<tunel>.trycloudflare.com/webhook/manychat/<webhook_token>`
(el token del tenant lo tiene Ivan). Envía un DM que dispare el flow y observa en logs:

1. `POST /webhook/manychat/...` → 200 ack.
2. ~25s: el cron-scheduler procesa el debounce de la conversación.
3. Generator + Judge + Splitter.
4. `outbound-tick` envía las burbujas al canal.
5. El bot responde en el chat del lead.

Trazabilidad: tablas `llm_calls`, `pipeline_runs`, `message_schedules` en Supabase.

---

## 11. Troubleshooting común

| Síntoma | Probable causa | Solución |
|---|---|---|
| `Invalid environment variables` + salida inmediata del motor | faltan `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` | rellena `.env.local`, o exporta placeholders si solo corres tests |
| `pnpm test` → "No script named test" | el root no tiene `test` | usa `pnpm -r test` |
| 12 test files del motor fallan con `process.exit(1)` | corres tests sin las 3 env vars | exporta placeholders (ver sección 6) |
| `prompt_blocks_count: 0` en /health | seeds no aplicados | ver sección 8 |
| `Missing NEXT_PUBLIC_SUPABASE_URL` (panel) | `.env.local` sin las NEXT_PUBLIC_* | rellénalas |
| Magic link nunca llega | Redirect URLs mal en Supabase | Auth → URL Configuration → añade `/auth/callback` |
| `docker compose up` cuelga en Building motor | cache corrupta | `docker compose build --no-cache motor` |
| Webhook 200 OK pero sin respuesta del bot | API key del canal caducada o tenant sin `coach_v5` | mira `llm_calls` + `message_schedules` |
| `Cannot find module @fyzon/db` | tipos no generados | `pnpm db:generate-types` |

---

## 12. Cómo iterar el Cerebro v5 (NUNCA editar Supabase directo)

Resumen — detalle en [CLAUDE.md](CLAUDE.md) (§"Editar prompts — Cerebro v5, 4 capas") y
[CONTRIBUTING.md](CONTRIBUTING.md):

```
1. Editar prompts/source/core-v5/01-core.md (o 02-output-contract.md)
2. pnpm core:build-seed
3. git diff schema/v1/seeds/008-core-v5-blocks.sql   ← revisa
4. Aplicar vía MCP supabase-fyzon + snapshot en prompt_block_versions
5. Sync del frontmatter (version + approved) para que el próximo build no lo pise
```

El `coach_v5` de un trainer se edita por UI (`/admin/cerebro`, con drafts/preview) o con
`build-coach-v5-seed.mjs` — nunca `UPDATE prompt_blocks` a pelo.

---

## 13. Próximo paso lógico tras setup

Cuando todo esté verde:

1. Lee [CLAUDE.md](CLAUDE.md) (doctrina + hitos hasta 12.3) y [docs/knowledge/README.md](docs/knowledge/README.md) (el porqué + loops abiertos por coach).
2. Mira `git log` para ver qué entró último.
3. Habla con Ivan sobre qué coger. Frentes vivos habituales: smokes E2E productivos
   (bloqueados por SSH al VPS), loops de coach en `docs/knowledge/` (Alfonso, Roberto, Frodo,
   Chema, Luis Royán), o lo que Ivan priorice.
4. Antes de tocar código, [CONTRIBUTING.md](CONTRIBUTING.md) para convenciones de commits + workflow de prompts.

---

## 14. Cosas que sí o sí tienes que pedir a Ivan

- Acceso al Supabase del proyecto (invitación al dashboard).
- `SUPABASE_SERVICE_ROLE_KEY` + `ANTHROPIC_API_KEY` reales.
- Webhook token del tenant + credenciales de canal (ManyChat / YCloud / app GHL) si vas a probar E2E.
- Acceso al repo GitHub (privado).
- (Opcional) Acceso al VPS Contabo si vas a deployar el motor en prod.

---

¿Atascado? Pregunta a Ivan directamente — no des vueltas más de 30 min con un bloqueo.
