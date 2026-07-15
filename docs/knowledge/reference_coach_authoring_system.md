---
name: coach-authoring-system
description: "Cómo autorío bloques coach_v5 cuando entra un entrenador nuevo — puntero a la KB, las 6 reglas de formato SaaS, y el loop de aprendizaje. Recall al aparecer cualquier coach."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3f90a343-959f-4cc3-b294-8d24e803925b
---

Cuando Iván traiga un entrenador nuevo (o pida modificar/reconciliar un coach), soy el experto en autoría de bloques COACH. Antes de empezar leer la KB: `prompts/coach-engineering/README.md` (índice + flujos A–F) y, según la tarea, `doctrina-universal.md` + `formato-saas-coach-v5.md` + la plantilla del avatar. Detalle de la KB: [[coach-authoring-kb]].

**Las 6 reconciliaciones de formato SaaS (lo que rompe un prompt traído del formato antiguo si no se cumple):**
1. Frontmatter YAML obligatorio (`trainer` = archivo = `coach_identity_name`; `block_key: coach_v5`, `sort_order: 5`, `version: 1`, `tenant_slug`).
2. Headers: SOLO `<coach_tone>` usa sub-tags XML; el resto `##`/`###`. Exemplars en `<ejemplo situacion="...">`.
3. Enlaces con `{{tracked_calendar_url|fallback}}` + `coach_main_link_type: calendar` — NUNCA Calendly hardcodeado (rompe el matching de bookings Hito 10). Si hay handoff humano en F5 → vacío + `human_handoff`.
4. Capa trainer_prefs: tú/usted, tope de mensajes/turno, frases prohibidas y modo de handoff NO van en el coach (son `trainer_prefs_v1`, enforce en código Hito 12.1).
5. Whitelist de placeholders del coach; nada de `{{phaseN_priority}}` (solo core); siempre con fallback.
6. NUNCA inventar (mensajes literales, exemplars, criterios verbatim del trainer).

**Cómo entrego:** `.md` en `prompts/source/coach-v5/<slug>.md` → `node scripts/build-coach-v5-seed.mjs --trainer <slug> --tenant-slug <slug> --seed-number NNN` → aplicar vía MCP supabase-fyzon, o pegar en `/admin/cerebro`. Nunca `UPDATE prompt_blocks` a pelo (snapshot en `prompt_block_versions`).

**Loop de aprendizaje (clave del encargo de Iván):** tras cerrar un coach o cuando Iván repita una corrección, destilo SIN duplicar entre capas: universal → `doctrina-universal.md`; de avatar → `avatares/<avatar>/`; de formato → `formato-saas-coach-v5.md`; del coach → su canónico; de mi forma de trabajar → un `feedback_coach_*.md` aquí en memoria. Iván especifica a qué entrenador/avatar se debe parecer el nuevo.
