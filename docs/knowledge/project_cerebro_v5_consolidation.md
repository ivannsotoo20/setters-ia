---
name: Cerebro v5 — consolidación CORE + COACH (Sprint Iota, 2026-05-18)
description: Migración big-bang del Cerebro v4 (11 bloques shared fragmentados) al v5 (1 CORE consolidado + 1 output_contract separado + 1 coach_v5 monolítico per tenant). Marker dinámico de fase activa via placeholder + atributo XML. Sin compat v4.
type: project
originSessionId: 8b10d4c4-8cd6-4767-b7f8-cffa33b5a61e
---
Sprint Iota completado el 2026-05-18. Iván consolidó la arquitectura de prompts del SaaS Setters IA:

**Decisión fundamental**: pasar de 11 bloques shared (`core_v4_base` + 6 × `fase_N_v4` + 4 protocolos) + 1 `coach_v3` per tenant a una arquitectura de **2 bloques shared** (`core_v5_base` + `output_contract_v5`) + **1 `coach_v5` per tenant** (monolítico inline con 9 sub-secciones canónicas).

**Why**: (a) cache hit rate más alto (prefix invariante durante toda la conversación, sin re-cache por cambio de fase), (b) modelo "hace más caso" al prompt porque ve el panorama completo en vez de fragmentos, (c) operativa más simple (2 .md vs 11 .md para editar el core).

**Trade-off resuelto**: el CORE consolidado pesa ~53k chars (~13k tokens) vs ~5k del `core_v4_base` solo. Cache write cost 25% extra primera vez es trivial (~$0.30/día por tenant a 20 conv/día). Cache read se amortiza desde el segundo turno.

**Decisiones del usuario validadas en plan-mode**:
- Big-bang sin feature flag. Conversaciones existentes eran de testeo, no producción.
- `output_contract_v5` SEPARADO del CORE narrativo (JSON schema técnico no debe mezclarse con voz conversacional).
- No regresión C1/C2/C3 explícita. Iván trabajó el contenido del CORE para que represente lo que busca.

**Marker dinámico de fase activa** (≈ 0 tokens extra, dos mecanismos combinados):
1. `{{current_phase_focus}}` — placeholder rich con instrucción focal corta inyectada por turno desde `apps/motor-agente/src/lib/phase-focus.ts` (función `buildPhaseFocusInstruction(currentPhase, isHandoff)` con 6 instrucciones + handoff override).
2. `priority="{{phaseN_priority|reference}}"` en cada etiqueta `<phaseN>`. El composer (`interpolatePhasePriorities` en `packages/prompt-composer/src/interpolate.ts`) reemplaza solo la fase actual con `priority="active"`. Las inactivas caen al fallback `reference`. Anthropic respeta el atributo XML y baja atención sobre las inactivas.

> **Corregido el 2026-08-25 — el "≈ 0 tokens extra" era cierto y aun así salía caro.** Los dos mecanismos vivían dentro del `core_v5_base`, que es el primer bloque de la ventana de caché. La caché de Anthropic casa por prefijo exacto a nivel de bloque, así que cambiar el marcador al avanzar de fase no invalidaba solo el CORE: invalidaba también los ~18.000 tokens de `coach_v5` + `output_contract_v5` que van detrás, a precio de escritura de caché de 1h ($6/M ≈ $0,108 por avance).
>
> Medido sobre el tenant 7 (Tania) el 2026-08-25, 357 llamadas al Generator: turno con la caché entera **$0,0245**; turno con el tramo reescrito **$0,1228**; caché fría **$0,2647**. Los dos únicos turnos de una conversación real salieron los dos en el estado malo — la batería lo escondía porque repite el mismo lead de ficción, cuyas siete variantes de fase ya están calientes de la vuelta anterior. Un lead real, además, trae su propia `{{tracked_calendar_url}}` dentro del coach, así que su tramo 2 arranca frío por definición: el problema no era esa escritura (una por conversación, inevitable) sino multiplicarla por cada fase atravesada.
>
> **Hoy**: `<phaseN>` sin atributo `priority`, `interpolatePhasePriorities` eliminada, y la instrucción focal emitida por el builder como bloque propio `current_phase_focus` al final del prompt y fuera de caché. El texto de `buildPhaseFocusInstruction` se basta solo (reproduce objetivo, hard cap y orden de la fase), así que no es un puntero a `<phaseN>` — que es la trampa en la que este proyecto lleva meses cayendo. Invariante protegida por `builder.test.ts` → "la parte cacheada no cambia al avanzar de fase".

**Cache strategy two-point mantenida**: breakpoint tras `core_v5_base` (cachea cerebro universal compartido entre tenants) + breakpoint tras `output_contract_v5` (cachea el prefix invariante de la conversación). `trainer_prefs_v1` sigue OUT of cache. Beneficio clave: cuando Ivan edita `coach_v5` de un tenant, el primer breakpoint sigue válido → el CORE no se recalienta.

**Cambios composer** (`packages/prompt-composer/`):
- `REQUIRED_BLOCK_KEYS = ['core_v5_base', 'coach_v5']`.
- `wantedKeys = ['core_v5_base', 'coach_v5', 'output_contract_v5']` + opcionales `admin_overrides_v1` (post coach) y `trainer_prefs_v1` (final).
- Eliminados flags `isHandoff/includeObjections/includeDescualificacion/includeOutputContract` de `ComposeOptions`.
- `INTERPOLATABLE_BLOCK_KEYS = ['core_v5_base', 'coach_v5']` (ambos llevan placeholders).

**Aplicado a BD**:
- Seed 008 → carga `core_v5_base` (53196 chars) + `output_contract_v5` (2820 chars).
- Migration 058 → deactivate 11 bloques v4 shared + snapshot v1 de los v5.
- Seeds 009/010 → carga `coach_v5` Pablo Montenegro (tenant slug `montefit`, 18784 chars) + ivan-dev (tenant slug `ivan-dev`, 17635 chars).
- Migration 059 → deactivate `coach_v3` para Pablo + ivan-dev.

**María Lluc**: el ejemplo definitivo del usuario en `Downloads/bloques (1).md` está disponible como `prompts/source/coach-v5/montefit.md` y compilado en `schema/v1/seeds/011-coach-v5-montefit.sql` con tenant slug `maria-lluc` (NO existe en BD aún — Iván decide cuándo darlo de alta).

**Lo que NO se tocó** (intacto):
- `trainer_preferences.preferences` JSONB schema (todos los toggles: emojis, callProposalMode, schedulingMode, handoffMode, etc.).
- `apps/panel/lib/trainer-prefs-serializer.ts`.
- `admin_overrides_v1` (block_key, comportamiento, UI).
- Lógica del motor sobre callProposalMode/schedulingMode/handoffMode/API booking/calendar matching/lead-form/timezones Hito 11.
- Cache TTL = `'1h'`.

**Cuándo consultar esta memoria**:
- Antes de editar `prompt_blocks` v5 vía MCP.
- Antes de añadir un placeholder rich nuevo en CORE o COACH.
- Antes de modificar `phase-focus.ts` (las 6 instrucciones focales).
- Si surge debate de si retomar arquitectura fragmentada — la decisión big-bang ya está tomada y no se vuelve atrás sin razón fuerte.
- Si Iván pide migrar un trainer nuevo a v5: usar `scripts/build-coach-v5-seed.mjs`.

**Rollback de emergencia** (si v5 rompe en producción, MUY improbable): documentado en `prompts/source/core-v5/README.md`. Implica reactivar v4 shared + coach_v3 + revertir el package `@fyzon/prompt-composer` al commit anterior.
