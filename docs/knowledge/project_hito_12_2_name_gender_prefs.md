---
name: project-hito-12-2-name-gender-prefs
description: "REVERTIDO — Hito 12.2 (nombre lead + filtro género) NO está en el código. Se documenta como diseño cerrado por si se retoma, no como estado vigente."
metadata: 
  node_type: memory
  type: project
  originSessionId: 089ef20f-cc5f-4b36-bd3d-762f2e3629ff
  status: reverted
---

> ⚠️ **AVISO DE ESTADO (verificado 2026-07-15) — este Hito NO está en el código.**
>
> El texto de abajo se escribió el 2026-05-20 y afirma que las Fases A+B+C+D estaban
> completadas. **Eso ya no es cierto.** El Hito 12.2 se aplicó en `c19751a` y se
> **revirtió** en `f8bdfd8`. El Hito 12.3 se re-aplicó después en `2e3f11b`, cuyo mensaje
> lo deja explícito: *"re-apply Hito 12.3 keywords inbound (**sin Hito 12.2**)"*.
>
> Evidencia en el repo hoy: los validadores de `packages/shared-validator/src/rules/`
> llegan hasta **V18** — **V19 no existe** en ningún fichero. `CLAUDE.md` tampoco tiene
> sección de Hito 12.2 (sí de 12.1 y 12.3), consistente con la reversión.
>
> **Cómo leer este documento:** vale como **diseño cerrado y decisiones ya debatidas**
> (los defaults, el ternario `mixed|male|female`, la pregunta de género en F1 y no en F0).
> Si se retoma, se re-implementa desde cero — no hay código vivo sobre el que construir.
> No asumir que ninguna de las Fases A-E está hecha.

Hito 12.2 — SaaS Setters IA. Plan: añadir 2 dimensiones de preferencias del trainer en `trainer_preferences.preferences` JSONB:

**Sub-feature A — Uso del nombre del lead**
- `useLeadNameMode: 'auto'|'always'|'never'` (default `'auto'`).
- `leadNameMaxMentions: 0..5` (default 2).
- Detección F0 con heurística regex + Haiku fallback para casos ambiguos (Andrea12345 vs Andrea Martínez).

**Sub-feature B — Filtro público objetivo + verificación género**
- `targetClientGender: 'mixed'|'male'|'female'` (default `'mixed'` = feature off).
- `genderVerificationStyle: 'soft'|'direct'` (default `'soft'`).
- Si mismatch detectado: pregunta verificación en F1 (no F0 — confirmado por Iván).

**Why:** trainers que trabajan solo con un género (Pablo Montenegro, futuros) pierden tiempo con leads que escriben por familiares/parejas opuestos al target. Pregunta natural en F1 filtra sin descartar prematuramente. Uso del nombre evita llamar al lead con un handle de usuario garbage tipo "andrea12345" cuando los datos GHL no aportan nombre real.

**How to apply:**
- Para futuras sesiones: Fase A está cerrada (schema + UI + tests + COMMENT v8). Si Iván dice "vamos con Fase B del Hito 12.2", siguen pasos B-C-D-E listados en `CLAUDE.md` proyecto sección "Hito 12.2".
- Defaults sanos: tenants legacy NO necesitan migration de filas — el parser tolera missing keys.
- Decisiones cerradas (no re-debatir sin razón):
  - F1 no F0 para pregunta género (evidencia: auditoría Pablo, muchas mujeres son cliente final aunque escriban por su pareja).
  - Selector ternario `mixed|male|female`, no toggle binario.
  - Best effort puro en MVP (no validador estricto en Fase A; V19 vendrá en Fase D).
  - Heurística + Haiku fallback (no LLM-only por coste).
  - Sin re-detect post-LLM en MVP (Iván dio carta blanca; decidí no hacerlo por simplicidad — el setter usa el nombre del historial libremente).

Archivos tocados Fase A:
- `schema/v1/migrations/068-trainer-prefs-name-gender.sql` (COMMENT v8).
- `apps/panel/lib/trainer-prefs-serializer.ts` (types, constants, parsers, defaults, secciones markdown nuevas).
- `apps/panel/app/(app)/settings/preferences/preferences-form.tsx` (2 CollapsibleCards nuevas con EnforcementBadge `best_effort`).
- Tests fixtures actualizados: `apps/panel/test/lib/trainer-prefs-serializer.test.ts` (3 lugares), `apps/panel/test/actions/prompts-trainer-prefs.test.ts` (1 lugar).

Archivos tocados Fase B (2026-05-20):
- `schema/v1/migrations/069-leads-name-gender-inference.sql` (+ 4 columnas en `leads`).
- `apps/motor-agente/src/lib/detect-name.ts` (heurística + opcional Haiku 4.5 fallback).
- `apps/motor-agente/src/lib/detect-gender.ts` (diccionario es-ES ~500 nombres + ambiguos + Haiku fallback).
- `apps/motor-agente/src/services/lead-inference.ts` (orquestador con TTL skip 24h).
- `apps/motor-agente/src/services/lead-ingest.ts:upsertLead` (llamada post-insert, try/catch silencioso).
- `apps/motor-agente/test/detect-name.test.ts` + `detect-gender.test.ts` (82 tests).
- `packages/db/src/types.generated.ts` (regenerado vía MCP).

Coste detección por lead nuevo: ~0 en 80% casos (heurística), ~$0.0001-0.0003 en 20% (Haiku fallback). Skip TTL 24h evita re-llamadas innecesarias.

Archivos tocados Fase C (2026-05-20):
- `packages/prompt-composer/src/types.ts` — `LeadInferenceContext`, `ComposeOptions.leadId/leadInference`, `TrainerContext.leadAddressingDirective`.
- `packages/prompt-composer/src/interpolate.ts` — placeholder `{{lead_addressing_directive}}`, builders `buildLeadAddressingDirective` + `buildGenderVerificationDirective`, types `UseLeadNameMode/TargetClientGender/GenderVerificationStyle`.
- `packages/prompt-composer/src/index.ts` — carga lazy de `leads` desde `leadId`, merge de directivas en `trainerContext` + `extraSystemSuffix`, parsers defensivos de las 4 keys Hito 12.2.
- `prompts/source/core-v5/01-core.md` — frontmatter v2, nueva sección `<lead_addressing>` con placeholder.
- `schema/v1/seeds/008-core-v5-blocks.sql` — regenerado via `pnpm core:build-seed`.
- BD: `prompt_blocks` id=32 actualizado vía MCP (53196→53695 chars), snapshot v2 en `prompt_block_versions`.
- `packages/prompt-composer/test/interpolate.test.ts` — 17 tests nuevos.

Decisión clave Fase C: `lead_addressing_directive` va al CORE cacheado (siempre presente, distintas variantes por modo). `gender_verification_directive` va a `extraSystemSuffix` (OUT of cache, solo cuando hay mismatch detectado) para no inflar el prompt cacheado con texto que solo aparece en ~10-15% de conversaciones.

Archivos tocados Fase D (2026-05-20):
- `packages/shared-validator/src/rules/V19-name-overuse.ts` (nuevo, warn-only).
- `packages/shared-validator/src/types.ts` — `ValidationContext.leadParsedName/leadNameMaxMentions`.
- `packages/shared-validator/src/rules/index.ts` — registro V19 en `DEFAULT_RULES`.
- `packages/agent-pipeline/src/pipeline.ts` — forward `leadParsedName/leadNameMaxMentions/expectedAddressing` al `validatorCtx`.
- `apps/motor-agente/src/services/process-debounced.ts` — SELECT `lead.parsed_name`, `loadSchedulingConfig` añade `leadNameMaxMentions`, `validationContext` propaga.
- `packages/shared-validator/test/validator.test.ts` — 15 tests V19.

Decisión clave Fase D: V19 es **warn-only**, no retry. Razón: la heurística es falible (contexto puede justificar repetir nombre — confirmación de datos, nombre compuesto Andrea-Andrea, etc.). Retry forzado generaría regresiones. Coherente con `EnforcementBadge best_effort` mostrado al trainer en UI. Si Iván cambia opinión, basta editar el orquestador `runPipeline` (sección V17 retry como template) para añadir branch V19 retry.

Relacionado: [[project-cerebro-v5-consolidation]] (Cerebro v5 actual donde irán los placeholders rich en Fase C), [[reference-prompts-mcp-workflow]] (workflow MCP usado para aplicar migrations 068 + 069).
