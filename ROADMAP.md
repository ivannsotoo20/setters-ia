# Roadmap — Fyzon Setters IA

> Estado y rumbo del SaaS multi-tenant de setters IA.

**Última actualización**: 2026-07-16
**Snapshot** — la fuente de verdad viva es, por orden: el código → `git log` →
[CLAUDE.md](CLAUDE.md) → [docs/knowledge/](docs/knowledge/README.md). Este documento es una
foto: si contradice a esos, ganan ellos.

**Estado**: último hito documentado **12.3**. Cerebro **v5** consolidado en código. Lo que
falta para *producción* no es código, es operativa bloqueada por el acceso SSH al VPS (smokes
E2E reales + pasar los `*_VERIFY_MODE` a `enforce`).

---

## Estado en una página

```
✅ Hito 1-3  — foundations: tenant + RLS · Cerebro cargado en Supabase · scaffold monorepo (2026-04-20)
✅ Hito 4-8  — motor: webhook ManyChat + composer + Generator + Judge/Splitter/Validator + outbound/scheduler (2026-04-26)
✅ Hito 9    — OAuth Marketplace GHL + YCloud como conectores de origen + bienvenida WA por formulario
               (doctrina 2026-05-10; OAuth cerrado 2026-05-12; onboarding trainer = 1 click "Install")
✅ Hito 10   — Calendarios GHL + trazabilidad de bookings (webhook AppointmentCreate → F7 + handoff) (2026-05-14)
✅ Hito 11   — Timezone-awareness lead/trainer en el prompt (2026-05)
✅ Hito 12   — Cerebro v5 consolidado: 11 bloques v4 → 2 shared + coach_v5 monolítico, marker dinámico de fase (2026-05-18)
✅ Hito 12.1 — cumplimiento estricto: max msgs/turno + tratamiento tú/usted + vocabulario prohibido (V17/V18) (2026-05-20)
⛔ Hito 12.2 — REVERTIDO: nombre del lead + filtro de género NO está en el código (por eso 12.1 salta a 12.3)
✅ Hito 12.3 — keywords type='inbound' disparan IA también en InboundMessage (leads orgánicos) (2026-05-25)
📚 2026-07-15 — conocimiento del proyecto versionado en docs/knowledge/ (antes solo en memoria local)
⏳ Producción — smokes E2E reales + *_VERIFY_MODE=enforce (bloqueado por SSH al VPS)
```

Métricas (2026-07-16, con env *placeholder* para el motor):
- Tests: **1264/1264 verde** en 86 ficheros — 560 panel · 395 motor · 83 composer · 59 validator · 59 adapters · 56 pipeline · 52 ghl-client.
- Typecheck: limpio en todo el monorepo (8 workspaces: 2 apps + 6 packages).
- Coste real por turno (medido Fase 1, cache warm): ~$0.05 · conversación 14-20 turnos: ~$0.7-1.5 por lead.

---

## Fase 0 — Foundations (✅ cerrada)

| Hito | Fecha | Entregable |
|---|---|---|
| 1 — tenant + profile + RLS | 2026-04-20 | `tenants` + profile owner + `tenant_configs` defaults + RLS policies |
| 2 — Cerebro cargado | 2026-04-20 | Bloques en `prompt_blocks` con `tenant_id IS NULL` (después consolidados a v5) |
| 3 — Scaffold monorepo | 2026-04-20 | pnpm workspaces + Turborepo. 2 apps + 6 packages. Docker Compose. `/health` OK |

## Fase 1 — Motor del agente + ManyChat (✅ cerrada en código)

Objetivo: pipeline inbound → Claude → outbound para el tenant de prueba (Pablo Montenegro / Montefit).

| Hito | Fecha | Entregable |
|---|---|---|
| 4 — Webhook receiver + coach Pablo | 2026-04-20 | `POST /webhook/manychat/:tenant_token` con parser Zod + dedup Redis + persistencia. Tenant 2 (montefit) + coach. |
| 5 — Prompt composer | 2026-04-21 | `composePrompt()` con `cache_control: 'ephemeral'` en 2 breakpoints. |
| 6 — Generator Sonnet 4.5 | 2026-04-26 | `runGenerator` + tool `respond_as_setter` con tool_choice forzado + cost calc. |
| 7 — Judge + Splitter + Validator + Pipeline | 2026-04-26 | `runJudge` (Haiku, guardrails) + `runSplitter` (Haiku + fallback determinístico) + Validator + `runPipeline`. |
| 8 — Outbound + scheduler debounce | 2026-04-26 | Adapter real + debounce buffer Redis + typing delays + cron-scheduler (tick cada 5s). Loop cerrado en código. |

## Fase 2+ — Panel, multi-provider y Cerebro v5 (✅ entregado hasta Hito 12.3)

El panel arrancó como auth scaffold y hoy cubre onboarding, `/admin/cerebro` (editor
versionado de las 4 capas), conversaciones, contactos, calendarios, keywords, labels,
preferencias del trainer y GDPR. El detalle vigente de cada hito vive en [CLAUDE.md](CLAUDE.md);
resumen:

| Hito | Fecha | Entregable |
|---|---|---|
| 9 — Conectores de origen + bienvenida WA | 2026-05-10 / OAuth cerrado 2026-05-12 | GHL Marketplace App (OAuth, routing por `locationId`) + YCloud como pasarela WA. `POST /automations/lead-form/:token` + `POST /internal/welcome`. **Doctrina: el SaaS es el CRM; GHL solo conector de origen.** Onboarding trainer = 1 click "Install". |
| 10 — Calendarios GHL + bookings | 2026-05-14 | Webhook `AppointmentCreate/Update/Delete` → matcher híbrido (`fyzon_lead_uuid` slug + phone) → mueve conv a F7 + pausa IA + handoff. Panel `/calendars`. Solo lectura (GHL sigue siendo la fuente). |
| 11 — Timezone-awareness | 2026-05 | Placeholders `{{lead_timezone_label}}` / `{{trainer_timezone_label}}` en el prompt. (11.1: banner impersonate descartado.) |
| 12 — Cerebro v5 consolidado | 2026-05-18 | Big-bang: 11 bloques shared v4 → `core_v5_base` + `output_contract_v5`. `coach_v3` → `coach_v5` monolítico. Marker dinámico de fase activa (`current_phase_focus` + `priority` XML). Sin compat v4. |
| 12.1 — Cumplimiento estricto | 2026-05-20 | 3 prefs enforce en código: `aiMessagesPerTurnMax` (cap Splitter+Generator), `addressingMode` tú/usted/mirror (V18), `forbiddenPhrases` (V17 + 1 retry). |
| 12.2 — Nombre del lead + filtro género | REVERTIDO | Aplicado y revertido; **no existe en el código** (no hay `useLeadNameMode`, `targetClientGender` ni V19). Diseño conservado en [docs/knowledge/project_hito_12_2_name_gender_prefs.md](docs/knowledge/project_hito_12_2_name_gender_prefs.md). |
| 12.3 — Keywords inbound | 2026-05-25 | `automation_keywords.type='inbound'` también dispara IA en InboundMessage → recupera leads orgánicos que antes quedaban pausados. |

### Hito 12.2 — por qué la numeración salta de 12.1 a 12.3

Se aplicó en `c19751a`, se revirtió en `f8bdfd8`, y el 12.3 se re-aplicó en `2e3f11b`
explícitamente "sin Hito 12.2". Los validadores llegan hasta **V18**. Si algún documento
afirma que el 12.2 está entregado, está desactualizado.

---

## Rumbo (lo que queda — reconciliar con `git log` + CLAUDE.md antes de arrancar)

El roadmap "clásico" (Fase 3 GHL backbone / Fase 4 migración / Fase 5 apertura / Fase 6
Meta Cloud) sigue siendo la dirección de fondo, con matices que ya han cambiado sobre el
papel original:

- **GHL cambió de rol**: ya NO es el CRM backbone; es conector de origen + calendarios. El
  CRM es el propio SaaS (doctrina Hito 9, 2026-05-10).
- **WhatsApp**: la pasarela es **YCloud** (BSP oficial) para tenants nuevos; ManyChat queda
  legacy hasta migrar cliente a cliente. Meta Cloud directo cuando Iván sea BSP (Fase 6).
- **Calendarios**: la lectura ya está (Hito 10); el bidireccional (crear/editar citas desde
  el SaaS) sigue pendiente.

**Producción — pendientes que no son código** (bloqueados por el acceso SSH al VPS):
- Smokes E2E reales por hito (lead-form/bienvenida, booking→F7, keywords inbound de Pablo).
- Pasar `GHL_WEBHOOK_VERIFY_MODE` / `YCLOUD_WEBHOOK_VERIFY_MODE` / `LEAD_FORM_VERIFY_MODE` a
  `enforce` (implica pegar la PEM RSA en `.env.local` del VPS).
- Migración Ed25519 + re-hospedar la app GHL en el Developer Portal de Iván.

**Producto — siguientes grandes bloques** (Fase 3-6 clásicas, ver CLAUDE.md/docs para el detalle vivo):
- Stripe billing + aprovisionamiento automático de sub-cuenta por trainer.
- Migración controlada de los ~44 trainers del Supabase viejo, cohorte a cohorte.
- Agenda nativa (OAuth Calendar directo), multi-coach por tenant, dashboard predictivo.

---

## Loops abiertos por coach (coach-engineering)

La autoría/reconciliación de coaches vive en `prompts/coach-engineering/` (doctrina + avatares
+ checklist). Los loops abiertos con cada entrenador (Alfonso, Roberto, Frodo, Chema, Luis
Royán) están documentados en [docs/knowledge/](docs/knowledge/README.md) — leer ahí antes de
generar o ajustar cualquier `coach_v5`.

---

## Decisiones arquitectónicas — histórico D1–D29 (Fase 0-1, hasta 2026-04-27)

Estas son las decisiones fundacionales. **La doctrina posterior (D30+) NO se mantiene en esta
tabla**: vive en [CLAUDE.md](CLAUDE.md) (secciones de Hitos 9-12.3) y en
[docs/knowledge/](docs/knowledge/README.md). Ojo: algunas de abajo quedaron superadas
(p.ej. GHL como CRM backbone → hoy solo conector de origen; Meta Cloud como adapter único MVP
→ hoy YCloud es la pasarela WA).

| # | Fecha | Decisión |
|---|---|---|
| D1-D7 | 2026-04-19 | Shared multi-tenant + RLS Supabase. Stack Tipo 1 (panel Next.js) + Tipo 2 (motor TS/Node en VPS Contabo). Setup fee + suscripción. *(GHL como CRM backbone — luego revisado en Hito 9.)* |
| D8 | 2026-04-19 | Arquitectura prompt por capas + jerarquía de decisión critical_rules > pre_checks > Coach > resto. *(Evolucionó al Cerebro v5 de 4 capas.)* |
| D15 | 2026-04-19 | Trigger.dev para jobs asíncronos (se incorporó como opción de outbound). |
| D16 | 2026-04-19 | WhatsApp Meta Cloud como adapter único MVP. *(Superado: YCloud es la pasarela WA hasta BSP Meta.)* |
| D19 | 2026-04-20 | Flujo asíncrono con debounce 25s: ack 200 inmediato → acumula → genera → envía vía API del provider. |
| D26 | 2026-04-21 | Composer: función pura + wrapper. Cache `'two-point'` (2 breakpoints). |
| D27 | 2026-04-26 | Generator: tool `respond_as_setter` con `tool_choice` forzado garantiza output estructurado. |
| D28 | 2026-04-26 | Pricing Sonnet 4.5 confirmado viable a escala SaaS. |
| D29 | 2026-04-27 | Iterar el coach solo con evidencia (fixtures C1/C2/C3 + `llm_calls` reales). |

*(Tabla condensada; el rationale completo de la etapa fundacional está en
[docs/knowledge/project_saas_setters_ia.md](docs/knowledge/project_saas_setters_ia.md).)*

---

## Reglas no negociables (resumen — detalle en [CLAUDE.md](CLAUDE.md))

1. Cerebro v5 NUNCA se edita directo en Supabase — `.md` en `prompts/source/core-v5/` → `pnpm core:build-seed` → diff → MCP + snapshot.
2. `SUPABASE_SERVICE_ROLE_KEY` solo en motor. Nunca en panel. Nunca en browser.
3. Fixtures C1/C2/C3 bloqueantes: todo PR que toque pipeline o coach pasa la regresión antes de mergear.
4. Prompt caching activado siempre.
5. Seguridad dura: RLS en tablas nuevas con `tenant_id`; tokens con `isValidBearer`/`timingSafeEqual` (nunca `===`); `safeLogBody` en logs.
6. No Prisma sin conversación previa. No segunda librería HTTP (Fastify, no Express).
7. No commits sin que Ivan los pida.

## Cómo se actualiza este documento

Es un snapshot. Cuando cierre un hito nuevo, actualiza el "Estado en una página" + la tabla de
hitos entregados, y stampea la fecha de arriba. La doctrina fina (D30+) NO va aquí: va a
`CLAUDE.md` y a `docs/knowledge/`. Antes de fiarte de cualquier línea, contrasta con `git log`.
