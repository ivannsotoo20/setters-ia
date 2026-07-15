---
name: Workflow editar prompts + MCP supabase-fyzon (Setters IA)
description: Pointer al CLAUDE.md del proyecto que documenta cómo editar las 4 capas de prompts, versionado prompt_block_versions, placeholders rich, y patrón de uso del MCP supabase-fyzon. Sprint Delta 2026-05-09.
type: reference
originSessionId: a261ff0f-b9b4-4257-bbbc-a4525e3b1d23
---
Toda la operativa para editar prompts del setter (Cerebro v5 shared, Coach v5 por tenant, admin_overrides_v1, trainer_prefs_v1) + sistema de versionado + placeholders rich + reglas de uso del MCP supabase-fyzon vive en:

- **`C:\Users\sotob\setters_ia\CLAUDE.md`** — secciones:
  - "Editar prompts — Cerebro v5 (consolidado, 4 capas)" — incluye Hito 12 (Sprint Iota 2026-05-18) sobre la consolidación a `core_v5_base` + `output_contract_v5` shared + `coach_v5` per tenant.
  - "Versionado de prompt_blocks (`prompt_block_versions`)"
  - "Placeholders rich en bloques shared / tenant" — placeholder list incluye `{{current_phase_focus}}` y `{{phaseN_priority|reference}}` (Cerebro v5).
  - "MCP supabase-fyzon — patrón de uso" (incluye anti-patrones)
  - "Hito 12 — Cerebro v5 consolidado (Sprint Iota, 2026-05-18)"

**Cerebro v5 — cambio importante (2026-05-18, big-bang)**: los 11 bloques shared del v4 (`core_v4_base` + 6 × `fase_N_v4` + `objeciones_v4` + `descualificacion_v4` + `handoff_v4` + `output_contract_v4`) se consolidaron en 2 (`core_v5_base` + `output_contract_v5`). Los `coach_v3` se migraron a `coach_v5` (Pablo + ivan-dev). Sin compat: v4 desactivado definitivamente. Marker dinámico de fase activa via `{{current_phase_focus}}` (inyectado por motor desde `apps/motor-agente/src/lib/phase-focus.ts`) + atributo XML `priority="active|reference"` (resuelto por `interpolatePhasePriorities` en composer).

**Cuándo consultarlo**:
- Antes de tocar cualquier `prompt_blocks` row vía MCP
- Antes de añadir un placeholder rich nuevo en un bloque shared
- Antes de modificar `trainer_preferences.preferences` JSONB
- Antes de aplicar una migration que cambia `prompt_blocks` o tablas relacionadas
- Cuando otro proyecto necesite copiar el patrón de versionado snapshot pre/post UPDATE

**Patrón clave que NO está en el código** (aprendido en Sprint 2.6 → 2.6b): el `INSERT...RETURNING` con JOIN al row UPDATEado en la misma transacción puede leer el contenido PRE-UPDATE. Si el snapshot v_nueva queda con contenido del v_actual, corregir con `UPDATE prompt_block_versions SET content = pb.content FROM prompt_blocks pb WHERE pb.id = prompt_block_id AND version_number = <V_NUEVA>`. Esto está documentado en CLAUDE.md proyecto sección Capa 1.
