# Roadmap — Fyzon Setters IA

> Estado actual y plan de ruta del SaaS multi-tenant de setters IA. Documento vivo: actualizar cuando cierre cada hito o se tome una decisión arquitectónica nueva.

**Última actualización**: 2026-04-27
**Estado**: Fase 1 cerrada en código (smoke E2E manual pendiente) · Fase 2 arrancada (auth scaffold)

---

## Estado en una página

```
✅ Hito 1 — tenant + profile + RLS (2026-04-20)
✅ Hito 2 — Core v3 cargado en Supabase (2026-04-20, 11 bloques, 59k chars)
✅ Hito 3 — Scaffold monorepo (2026-04-20, motor Fastify + panel Next.js + 6 packages + Docker)
✅ Hito 4 — Webhook receiver ManyChat + tenant Pablo Montenegro/Montefit (2026-04-20)
✅ Hito 5 — Prompt composer (2026-04-21, cache 2 breakpoints, ~90% ahorro tras 1ª llamada)
✅ Hito 6 — Generator Sonnet 4.5 (2026-04-26, tool-forced output + cost calc + history loader)
✅ Hito 7 — Judge + Splitter + Validator V0-V16 + runPipeline (2026-04-26)
✅ Hito 8 — Outbound ManyChat + scheduler debounce (2026-04-26, loop cerrado en código)
🔨 Fase 2 (Hito 9 en curso) — Panel SaaS v1
   ✅ Auth scaffold (middleware + login + signup + callback + dashboard placeholder, 2026-05-01)
   ⏳ Wizard onboarding (3 pasos: API key ManyChat → plantilla → keywords)
   ⏳ Configurador coach_v3
   ⏳ Visor conversaciones realtime
   ⏳ Dashboard 3 KPIs Rubén
⏳ Smoke E2E real Hito 8 (manual de Ivan: cloudflared + IG real → loop completo)
⏳ G6 — fixtures C1/C2/C3 10/10 (bloqueante para iterar coach v2)
```

Métricas:
- Tests: **110/110 verde** (12 composer + 31 pipeline + 36 validator + 6 channel-adapters + 25 motor-agente)
- Typecheck: **8/8 paquetes OK**
- Coste real medido turno 1 (cache cold): ~$0.085 — turno 2 (cache warm): ~$0.047
- Coste estimado conversación 14-20 turnos: $0.7-1.5 por lead

---

## Fase 0 — Foundations (✅ cerrada)

| Hito | Fecha | Entregable |
|---|---|---|
| 1 — tenant + profile + RLS | 2026-04-20 | `tenants(id=1, Fyzon dev)` + profile Ivan `owner` + `tenant_configs` defaults + RLS policies |
| 2 — Core v3 cargado | 2026-04-20 | 11 bloques en `prompt_blocks` con `tenant_id IS NULL` (core_v3_base 31.5k + fases 1-6 17.9k + cualif 2.3k + handoff 1.1k + pipeline 0.8k + objeciones 5.6k) |
| 3 — Scaffold monorepo | 2026-04-20 | pnpm workspaces + Turborepo. 2 apps + 6 packages. Docker Compose. `/health` OK |

## Fase 1 — Motor del agente + ManyChat (✅ cerrada en código, ⏳ smoke real pendiente)

Objetivo: pipeline inbound → Claude → outbound funcionando para el tenant de prueba (Pablo Montenegro / Montefit).

| Hito | Fecha | Entregable |
|---|---|---|
| 4 — Webhook receiver + coach Pablo | 2026-04-20 | `POST /webhook/manychat/:tenant_token` con parser Zod (+ sanitizer placeholders IG), dedup Redis, persistencia. Tenant 'montefit' (id=2) + coach_v3 (~19k chars). Channels WA + IG con `integration_accounts`. |
| 5 — Prompt composer | 2026-04-21 | `composePrompt()` ensambla core + coach + fase + cualif/handoff/pipeline + objeciones con `cache_control: 'ephemeral'` en 2 breakpoints. Prompt real tenant 2 phase 2: 60k chars ≈ 15k tokens. |
| 6 — Generator Sonnet 4.5 | 2026-04-26 | `runGenerator(deps, input)` con Anthropic SDK + tool `respond_as_setter` con tool_choice forzado (message_raw, conversation_status, phase_decision, ...). Cost calc Sonnet 4.5 con cache. Best-effort log a `llm_calls`. CLI `run-generator`. |
| 7 — Judge + Splitter + Validator + Pipeline | 2026-04-26 | `runJudge` Haiku 4.5 (8 guardrails). `runSplitter` Haiku 4.5 + fallback determinístico (≤280 chars no llama modelo). Validator 11 reglas reales (V00-V08, V11-V12, V15-V16) + 6 stubs. `runPipeline` orquesta todo + totals. |
| 8 — Outbound ManyChat + scheduler debounce | 2026-04-26 | Adapter `manyChatSendContent` real (Bearer auth + error handling). Debounce buffer Redis (sorted set, ZADD/ZRANGEBYSCORE). Scheduler con typing delays naturales (30s + 10s entre partes) + retry policy [5s, 30s, 5min]. Plugin Fastify `cron-scheduler` (debounce-tick + outbound-tick cada 5s). Webhook llama `enqueueDebounce` tras inserción inbound. |
| Smoke E2E real | ⏳ pendiente | Manual de Ivan: cloudflared + ManyChat real + IG personal envía a Pablo → bot responde realmente. Cierre oficial Fase 1. |

## Fase 2 — Panel SaaS v1 (🔨 en curso)

Objetivo: el trainer se da de alta, configura su setter sin tocar código, y ve sus conversaciones.

### Hito 9.1 — Auth scaffold (✅ cerrado 2026-05-01)

- `middleware.ts` con session refresh + protección `/dashboard*` + redirect `/login?next=`
- Server actions `sendMagicLink` (login + signup, `shouldCreateUser` según intent) + `logout`
- Páginas `/login` + `/signup` (client component con `useActionState` React 19)
- `/auth/callback` con `exchangeCodeForSession` + validación `next` contra open redirects
- `/dashboard` placeholder protegido con identidad + tenant
- `app/page.tsx` redirige `/` → `/dashboard` o `/login`
- Estilos auth/dashboard en `globals.css` (dark mode minimal Tailwind 4)

### Hito 9.2 — Wizard onboarding (⏳ siguiente)

Para el trainer nuevo que aterriza recién registrado:

1. **Pantalla 1 — Tenant**: pega slug + nombre del trainer/marca + nicho (preset: fitness/coaching/idiomas/...).
2. **Pantalla 2 — API key ManyChat**: trainer pega API key, panel valida llamando `GET /fb/page/getInfo`, guarda encriptada en `integration_accounts.credentials`. Genera `tenant_token` random para webhook.
3. **Pantalla 3 — Plantilla ManyChat**: panel muestra URL del webhook + body JSON copy-paste para que el trainer configure manualmente el bloque "Solicitud externa" de su flow. (Plantilla pública ManyChat preconfigurada queda como mejora Fase 5.)
4. Al completar, crea `profile` con `role=owner`, `tenant_id` recién creado, marca `tenants.onboarded_at = NOW()`.

### Hito 9.3 — Configurador coach_v3 (⏳)

El "compilador" del coach — es el corazón del panel:

- Formulario estructurado dividido en 8 secciones (Identidad / Nicho / Programa / Cualificación / Tono / Banco frases / Mensajes obligatorios / Estructura).
- Generador en cliente: form data → markdown del Bloque 2 (mismo formato que `prompts/source/coach-v3/pablo-montenegro.md`).
- Validador completitud: fuerza ≥20 frases del banco antes de activar.
- Moderación con Haiku antes de persistir el bloque libre.
- INSERT en `prompt_blocks` con `tenant_id=<trainer>`, `block_key='coach_v3'`, `version=1`.
- Versionado: `draft / active / histórico` con rollback (UPDATE `is_active`).

### Hito 9.4 — Visor conversaciones realtime (⏳)

- Lista de `conversations` filtradas por tenant.
- Detalle: `conversation_messages` ordenados por `created_at`, refresh via Supabase Realtime channel.
- Marcador visual `source='lead' | 'ai' | 'human'`.
- Botón "intervenir" → marca `handoff_to_human=true` y permite reply manual.

### Hito 9.5 — Dashboard 3 KPIs Rubén (⏳)

Los 3 KPIs canónicos heredados del setter n8n:

1. **% respuesta a la bienvenida**: `conversations` con ≥1 msg lead tras bienvenida bot / total bienvenidas enviadas.
2. **% respuesta a la primera pregunta**: ídem, foco en F1.
3. **% links enviados (KPI REY, target >15%)**: leads cualificados que reciben el link de agenda / total leads del periodo.

Visualización: 3 big numbers + sparkline 30 días + breakdown por fase.

### Hito 9.6 — Test button end-to-end (⏳)

Botón en el panel "Probar mi setter": dispara internamente `runPipeline` con un mensaje de ejemplo + tenant del usuario logueado, muestra el output en la UI sin pasar por ManyChat. Útil para QA del coach.

### Hito 9.7 — Gestión de recursos + delays + horarios + blacklist (⏳)

- Subir PDFs/videos a Supabase Storage + reglas de envío (qué fase, qué condición).
- Config de `active_delay` / `idle_delay` / `between_parts_delay` por tenant.
- Horarios actividad (no responder fuera de horario laboral del trainer).
- `ignored_users` (blacklist).

---

## Fase 3 — GHL backbone + Stripe + onboarding BSP ManyChat (⏳ pendiente — 2-3 semanas)

| Pieza | Detalle |
|---|---|
| Sub-cuenta GHL automática | API Lead Connector → create location por trainer. GHL Agency Unlimited $297. |
| Pipeline GHL aprovisionado | Stages F1-F6 + F11 Espera + F12 Perdido en cada nuevo trainer. |
| Custom fields GHL | `contact.external_id`, `contact.username`, `contact.conversation_context`, `contact.lead_goal`, `contact.primary_problem`. |
| Stripe billing | Setup fee + suscripción mensual. Webhooks → tabla `subscriptions`. |
| Follow-ups | Tabla `follow_ups` + cron programa mensajes en `message_schedules` con `message_type='follow_up'`. |
| Onboarding docs | Vídeos 2 min por paso del wizard. |

## Fase 4 — Migración controlada (⏳ — 2-3 semanas)

- Trainer piloto 1 (Fyzon dev / Ivan) → uno a uno, validar con leads pequeños.
- Trainer piloto 2-3 → añadir, supervisión humana, comparativa KPIs vs setter n8n actual.
- Ajustes iterativos del Core v3 y del pipeline según feedback.
- **Decision gate**: si KPI-3 SaaS ≥ KPI-3 n8n para 3 pilotos → aprobar escalado.
- Documentación soporte + playbook incidencias.

## Fase 5 — Apertura a nuevos trainers (continuo)

- Landing del SaaS Fyzon con copy convincente.
- Self-service onboarding completo sin intervención humana.
- Escalado infra según demanda (upgrade VPS Contabo o migrar a Fly.io/Render).
- Monitorización coste API Claude por tenant (alertas si se dispara).
- Cohorte por cohorte abrir a los ~44 trainers del Supabase viejo (uno a uno reonboarding manual por Ivan).
- Objetivo a 6 meses de apertura: 100+ trainers activos, churn <5% mensual.

## Fase 6 — Post-MVP (futuro)

- Agenda nativa (OAuth Google Calendar + GHL Calendar directo, no enlace externo).
- Edición avanzada de fases por el trainer (hoy solo toggle, después editar contenido).
- Respuestas rápidas / FAQ personalizadas.
- **Migración a Meta Cloud API directa** (cuando Ivan sea BSP aprobado): adapter swap en `channel-adapters` sin tocar el resto.
- Dashboard predictivo (probabilidad de cierre del lead, recomendación follow-up).
- Multi-coach por tenant (varios setters por trainer, para equipos).

---

## Decisiones arquitectónicas (D1–D29)

Resumen condensado. Detalle completo y rationale en la memoria del proyecto (`~/.claude/projects/C--Users-sotob-setters-ia/memory/project_saas_setters_ia.md`).

| # | Fecha | Decisión |
|---|---|---|
| D1-D7 | 2026-04-19 | Shared multi-tenant + RLS Supabase. GHL como CRM backbone (sub-cuenta por trainer, agentes IA nativos NO se usan). Plan GHL Agency Unlimited $297. WA + IG + FB desde día 1. Setup fee + suscripción mensual. Stack Tipo 1 (Next.js panel) + Tipo 2 (motor TS/Node + Claude Agent SDK en VPS Contabo). |
| D8 | 2026-04-19 | Arquitectura prompt revisada: 3 bloques (Core v2.0 inmutable + coach_v3 obligatorio + nicho_v3 opcional), no 4 capas. Jerarquía decisión: critical_rules > pre_message_checks > Coach > Nicho > resto. |
| D14 | 2026-04-19 | Híbrido: clonar patrones estructurales 1prompt-os de Kadzin (MIT) + reescribir lógica diferencial Fyzon. |
| D15 | 2026-04-19 | Trigger.dev para orquestación jobs asíncronos (Fase 1 maduro). Hoy node-cron suficiente. |
| D16 | 2026-04-19 | WhatsApp con Meta Cloud API oficial como adapter único MVP (NO Evolution). Migración directa Meta en Fase 6. |
| D17-D18 | 2026-04-19 | Scope MVP configurador: identidad, nicho, tono, KB, lead magnets, escalada humano, enlace agenda externo, horario, 3 canales. FUERA: agenda nativa OAuth, FAQ. |
| D19 | 2026-04-20 | Flujo respuesta asíncrono con debounce: motor responde 200 ack inmediato, acumula 25s, genera respuesta, envía vía API ManyChat directa (no retroalimenta flow). Requiere credenciales API ManyChat por trainer. |
| D21 | 2026-04-20 | Trainer arranque: Pablo Montenegro / Montefit como tenant 2 (en vez de clonar trainer n8n existente). Coach v1.1 con feedback de 11 puntos para iterar v2 con evidencia. |
| D22 | 2026-04-20 | URL agenda Pablo: `https://cal.com/ivan.soto/consultoria` (intencional para pruebas, sustituir en prod). |
| D23 | 2026-04-20 | Credenciales ManyChat cargadas en `integration_accounts`. Formato `page_id:secret`. Encriptadas at-rest. |
| D24 | 2026-04-21 | Contrato ManyChat validado: campos `Id de contacto`, `Nombre`, `Apellido`, `Teléfono`, `Última entrada de texto`, `origin_trigger` custom. |
| D25 | 2026-04-21 | Sanitizer placeholders en parser (IG no expone teléfono → `{{phone}}` literal → null antes del upsert). |
| D26 | 2026-04-21 | Composer architecture: función pura `buildComposedPrompt(rows)` + wrapper `composePrompt(supabase)`. Cache `'two-point'` default → 2 cache hits por llamada Anthropic. |
| D27 | 2026-04-26 | Generator architecture: tool `respond_as_setter` con `tool_choice` forzado garantiza output estructurado. Cost calc separado en `cost.ts`. |
| D28 | 2026-04-26 | Pricing Sonnet 4.5 confirmado: $3/M input, $0.30/M cache_read, $3.75/M cache_write, $15/M output. Coste real medido viable a escala SaaS. |
| D29 | 2026-04-27 | Coach Pablo v2 PARADA hasta tener G6 (3 fixtures C1/C2/C3) + dump `llm_calls` reales. Iterar sin evidencia contamina la decisión. Decisiones cerradas pre-v2: P2 (F3/F4 hereda Core), P6 (D9 fuera de avatar condicional). |

---

## Recursos pendientes (G1–G9)

| # | Estado | Qué es |
|---|---|---|
| G1 | ✅ entregado 2026-04-20 | Prompt setter actual desgranado en Core v3 (11 bloques shared cargados) |
| G2 | ⏳ útil no bloqueante | Export n8n (workflow completo + contrato payload ManyChat) |
| G3 | ⏳ no bloqueante | URL repo GitHub de referencia |
| G4 | ⏳ no bloqueante | Skill n8n→Claude (para portar reglas restantes V09/V10/V13/V14) |
| G5 | ⏳ no bloqueante | Skill agentes WhatsApp |
| G6 | ⏳ **BLOQUEANTE para coach v2** | 3 conversaciones 10/10 (C1 difícil, C2 cualificable, C3 no cualifica) |
| G7 | ⏳ no bloqueante | Automations GHL actuales |
| G8 | ⏳ no bloqueante | Métricas baseline del setter n8n actual |
| G9 | ⏳ no bloqueante | Estado infra (WA Business API, app Meta, otros credentials) |

---

## Reglas no negociables (resumen)

1. Core v3 NUNCA se edita directo en Supabase — siempre vía pipeline `.md` → script → seed SQL → MCP. Workflow completo en [CONTRIBUTING.md](CONTRIBUTING.md).
2. `SUPABASE_SERVICE_ROLE_KEY` solo en motor. Nunca en panel. Nunca en browser.
3. Fixtures C1/C2/C3 son bloqueantes una vez existan. Cualquier PR que toque pipeline o coach debe pasar la regresión antes de mergear.
4. Prompt caching activado siempre. Sin él la economía rompe.
5. No metemos Prisma sin conversación previa con Ivan.
6. No hay segunda librería HTTP (si existe Fastify, no Express).
7. No commits sin que Ivan los pida. Preparamos cambios, Ivan revisa, Ivan aprueba.

---

## Cómo se actualiza este documento

Cada vez que cierre un hito o se tome una decisión arquitectónica nueva (D30+), añade una entrada aquí + en la memoria del proyecto (Ivan la mantiene). Si la decisión modifica el roadmap, actualiza también el "Estado en una página".
