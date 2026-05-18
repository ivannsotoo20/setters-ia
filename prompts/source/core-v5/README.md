# Cerebro v5 — Consolidación a 1 CORE + output_contract separado

> Este directorio contiene las **fuentes del Cerebro del Setter v5**. Reemplaza a `prompts/source/core-v4/` (11 archivos). El script `scripts/build-core-v5-seed.mjs` genera `schema/v1/seeds/008-core-v5-blocks.sql`. Plan: `~/.claude/plans/c-users-sotob-downloads-bloques-1-md-c-iterative-kitten.md`.

## Decisión arquitectónica (Sprint Iota.1, 2026-05-18)

El Cerebro v4 estaba fragmentado en 11 bloques shared (`core_v4_base` + 6 × `fase_N_v4` + `objeciones_v4` + `descualificacion_v4` + `handoff_v4` + `output_contract_v4`). El composer filtraba `fase_<currentPhase>_v4` dinámicamente para no cargar las 6 fases en cada llamada.

El v5 consolida a **2 bloques shared**:

| Archivo | block_key | Sort | Contenido |
|---|---|---|---|
| `01-core.md` | `core_v5_base` | 0 | TODO el cerebro narrativo: módulo de jerarquía, identidad, propósito, mental model, critical_rules, conditional_rules, core_principles, tone, verbosity, final_instructions, las 6 fases inline, objections_protocol, protocolo_handoff |
| `02-output-contract.md` | `output_contract_v5` | 100 | Schema técnico del output del LLM (JSON contract). SEPARADO del CORE narrativo por decisión arquitectónica |

## Por qué `output_contract` separado del CORE

El `output_contract` es un bloque de servicio al motor (JSON schema técnico), no conversacional. Mezclarlo dentro del CORE narrativo (que pide al modelo "eres María Lluc" y describe fases en voz humana) confunde al modelo. Manteniendo el output_contract como bloque shared aparte:
- El modelo lee primero la voz/protocolo y luego el contract técnico → mejor separación cognitiva.
- Cambios al output schema (añadir un campo, cambiar enum) no obligan a re-aprobar el cerebro entero.

## Marker dinámico de fase activa

El CORE describe las 6 fases inline (estáticas). Para que el modelo NO se confunda al ver todas al mismo tiempo, hay 2 mecanismos combinados (coste ≈ 0 tokens):

1. **Placeholder `{{current_phase_focus}}`** — al inicio del bloque, en sección `<current_phase_focus priority="highest">`. El motor (helper `apps/motor-agente/src/lib/phase-focus.ts`) inyecta una instrucción focal corta por turno: `"AHORA ESTÁS EN FASE 3 — CUALIFICACIÓN SUTIL. Hard cap 2 mensajes. Objetivo: validar disposición al cambio AHORA."`.
2. **Atributo `priority="{{phaseN_priority|reference}}"` en cada `<phaseN>`** — el composer reemplaza `priority="active"` solo para la fase actual, deja `priority="reference"` para el resto. Anthropic respeta el atributo bajando la atención sobre las inactivas.

## Placeholders rich utilizados en `01-core.md`

Resueltos en runtime por `packages/prompt-composer/src/interpolate.ts`:

- `{{current_phase_focus|<fallback>}}` — instrucción focal de la fase activa
- `{{phase1_priority|reference}}` … `{{phase6_priority|reference}}` — atributo XML por fase, dinámico
- `{{handoff_directive}}` — render dinámico del protocolo handoff Causa B según `trainer_preferences.handoff` config

**Nota**: los placeholders ricos `{{tracked_calendar_url}}`, `{{available_slots}}`, `{{current_date}}`, `{{lead_contact_status}}`, `{{lead_timezone_label}}`, `{{trainer_timezone_label}}` ya **NO viven en el CORE**. Cada Coach (`coach_v5`) los incluye en sus secciones `coach_phase_massage_fase6` / `coach_links` si su modo de agendado los requiere. La whitelist del composer permite la interpolación en ambos bloques.

## Workflow para editar v5 (rebuild full)

```bash
# 1. Editar el .md correspondiente
vim prompts/source/core-v5/01-core.md

# 2. Regenerar el seed
node scripts/build-core-v5-seed.mjs

# 3. Revisar diff
git diff schema/v1/seeds/008-core-v5-blocks.sql

# 4. Aplicar vía MCP supabase-fyzon (apply_migration con el seed o execute_sql)
```

## Workflow para editar v5 (incremental, 1 bloque vía MCP)

Patrón validado en Sprint Gamma 2.6/2.6b — sin rebuild del seed, con snapshot pre/post UPDATE en `prompt_block_versions`. Ver sección "Editar prompts — Cerebro v5" en `setters_ia/CLAUDE.md`.

## Status de redacción

| # | Archivo | Status | Aprobado | Origen |
|---|---|---|---|---|
| 1 | `01-core.md` | clean | 2026-05-18 (Iván) | Downloads/bloques.md (consolidado de los 11 bloques v4 + reorganización del usuario) |
| 2 | `02-output-contract.md` | clean | 2026-05-18 | Copia literal del `core-v4/11-output-contract.md` con frontmatter actualizado |

## Rollback

Si v5 se rompe en producción:

```sql
-- Reactivar v4 shared y desactivar v5
UPDATE prompt_blocks SET is_active=TRUE
  WHERE tenant_id IS NULL
    AND block_key IN ('core_v4_base','fase_1_v4','fase_2_v4','fase_3_v4','fase_4_v4','fase_5_v4','fase_6_v4','objeciones_v4','descualificacion_v4','handoff_v4','output_contract_v4');

UPDATE prompt_blocks SET is_active=FALSE
  WHERE tenant_id IS NULL AND block_key IN ('core_v5_base','output_contract_v5');

-- También revertir los coach_v5 → coach_v3 (migration 059)
UPDATE prompt_blocks SET is_active=TRUE WHERE block_key='coach_v3';
UPDATE prompt_blocks SET is_active=FALSE WHERE block_key='coach_v5';
```

El builder v5 fallaría sin `core_v5_base` requerido, por lo que también habría que hacer rollback del package `@fyzon/prompt-composer` al commit anterior.
