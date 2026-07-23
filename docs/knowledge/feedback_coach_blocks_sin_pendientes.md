---
name: feedback_coach_blocks_sin_pendientes
description: "Directiva Iván 2026-07-22: los bloques coach son producción que ven otros profesionales — quedan LIMPIOS y terminados, cero placeholders/pendientes/notas de decisión dentro del <coach_block>. Los pendientes van a esta carpeta de conocimiento o al chat, nunca al bloque. Recall al autorar/editar cualquier coach."
metadata:
  node_type: memory
  type: feedback
  originSessionId: 64505cf7-1efc-4843-a69b-a41df6388e20
---

**NUNCA dejar nada "pendiente" dentro de un bloque coach** (`prompts/source/coach-v5/*.md`, y
sobre todo el `<coach_block>` que se carga y se ve en `/admin/cerebro`). Prohibido en el CUERPO
del bloque:
- Placeholders de pendientes: "PENDIENTE", "[PENDIENTE — pedir a X]", "iterar con", "afinar con
  DMs reales".
- Notas de decisión interna: "D1/D3/D4", "decisión abierta", "confirmar con Nani/Iván", "a confirmar".
- Marcadores de borrador: "BORRADOR", "Modificables", "OJO (desajuste)".
- Andamiaje de autoría: "[... se configura en trainer_preferences ...]", breadcrumbs "(formulario D3)".

**Por qué:** el bloque lo ven otros profesionales (el trainer, el equipo). Un bloque con
"pendiente/confirmar/decisión abierta" queda como algo sin terminar y da mala imagen.

**Cómo aplicar:** dejar el bloque TERMINADO y limpio. Todo lo que sea pendiente, duda o decisión
→ va al conocimiento del proyecto (el loop del coach en `docs/knowledge/`) o se dice en el CHAT a
Iván, nunca dentro del bloque. Las referencias operativas estándar (CR2–CR12) SÍ pueden quedar
(precedente: `prompts/source/coach-v5/montefit.md`); lo que se va son los pendientes, borradores
y decisiones internas.

Caso de origen: el bloque de Nani se autorió con andamiaje de autoría dentro del `<coach_block>`
(PENDIENTE, D1/D3, "confirmar con Nani", "decisión abierta" sobre la garantía). Iván lo marcó como
error y se reescribió limpio. Ver [[project_nani_coach_feedback]].

Relacionado: [[reference_coach_authoring_system]], [[feedback_coach_authoring_baseline]],
[[project_coach_authoring_kb]].
