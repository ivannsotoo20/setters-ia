---
name: project-coach-authoring-export
description: "Paquete/skill distribuible \"coach-authoring\" para migrar la autoría de prompts al Claude de la empresa + regla de exclusión (archivos prompt-tania-*.txt) en entregables al jefe."
metadata: 
  node_type: memory
  type: project
  originSessionId: b2636a79-e9eb-4153-a409-eca769f3ec6c
---

2026-07-03: El jefe del setter IA pidió (1) centralizar la creación de prompts en el Claude de la empresa y (2) documentar el proceso completo. Empaquetado como **skill de Claude Code** `coach-authoring` → `coach-authoring.zip` en el Escritorio (~250 KB, 33 archivos, rutas forward-slash cross-platform).

Estructura del ZIP: raíz `coach-authoring/` con `SKILL.md` (entrada) + `PROCESO-CREACION-PROMPT.md` (SOP de 10 pasos con compuerta humana) + `PROCESO-CREACION-PROMPT.html` (versión presentable para el jefe) + `README-PAQUETE.md`, y `kb/` que **espeja las rutas del repo** (`prompts/coach-engineering/`, `prompts/source/core-v5/`, `prompts/source/coach-v5/` con los coaches de ejemplo `ivan-dev` + `roberto-cordobilla` + `_template`, `scripts/`) para preservar los enlaces relativos internos. Instalación: descomprimir → `.claude/skills/coach-authoring/`. Estado final: 31 archivos, 231 KB.

Alcance decidido: **solo autoría + handoff**. El paquete NO lleva credenciales (`.env*`/`.mcp.json` excluidos); la carga real en la app va por panel `/admin/cerebro` o por quien tiene el repo. Verificado grep: 0 secretos, 0 project-ref.

**Regla dura de exclusión (durable):** para entregables al jefe/empresa se excluyen (2026-07-03, orden de Iván): (1) **Tania** — los 3 `prompt-tania-*.txt` de la raíz; (2) **Montefit / Pablo Montenegro** — sus coaches `montefit.md` + `pablo-montenegro.md` (misma persona) Y todas sus menciones en la craft (formato-saas §0/§7/§128, README avatar adultos-ocupados + caveat "tres Pablos", doctrina §176, canónico adultos-ocupados, postmortem nota, `_template` notas, comentario de uso en `build-coach-v5-seed.mjs`). El avatar "adultos ocupados" conserva sus principios A1-A5 (método) pero pierde su ejemplo canónico (era Montefit). Su existencia NO se menciona ni se señala como omitida. Verificar SIEMPRE con `grep -i 'montefit|montenegro|tania'` sobre el staging antes de comprimir. `ivan-dev` y `roberto-cordobilla` SÍ se incluyen.

Para re-empaquetar: repetir staging (copiar los 3 subárboles + 2 scripts bajo `kb/`, generar los 4 docs), correr los greps anti-fuga (tania / secretos / .sql-.env-.mcp), y zipear con separadores `/` vía API .NET `ZipArchive` (Compress-Archive de PS5.1 mete `\` y rompe en Mac). Relacionado: [[project_coach_authoring_kb]], [[reference_coach_authoring_system]].
