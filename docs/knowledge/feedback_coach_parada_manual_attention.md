---
name: feedback_coach_parada_manual_attention
description: "Directiva de Iván (2026-07-31): para parar una conversación en un coach de la academia se emite SIEMPRE manual_attention + skip_reply (motivo: <causa>), nunca handoff_to_human ni etiquetas Tipo A/B/C/D. Recall al escribir o revisar cualquier trigger de parada, handoff o pausa de un coach."
metadata:
  node_type: memory
  type: feedback
---

Para parar una conversación en un bloque coach de la **academia (Automatía)** se emiten **siempre los
dos criterios juntos**:

```
manual_attention + skip_reply   (motivo: <causa>)
```

- `manual_attention` → la conversación queda marcada y notificada para que el entrenador la retome.
- `skip_reply` → la IA deja de generar respuestas.
- **Uno solo no apaga nada.** `manual_attention` sin `skip_reply` marca la conversación pero el modelo
  sigue escribiendo.

PROHIBIDO `handoff_to_human` y prohibida cualquier etiqueta de tipo (`Tipo A/B/C/D`, "Causa F",
"handoff Tipo C", `<protocolo_handoff>`). Las letras A–H pueden quedarse como índice interno de los
triggers dentro del bloque; lo que no puede aparecer es la letra como **valor emitido**. El valor
emitido es el `motivo: <causa>` en snake_case, que además suele ser el disparador de la automatización
externa (el audio de Alfonso, por ejemplo).

**Por qué:** el vocabulario `handoff_*` es del SaaS Fyzon; Automatía **no lo consume**. Un bloque
escrito así *describe* una pausa que el runtime nunca ejecuta. Es literalmente lo que pasó con Alfonso:
su F6 decía desde junio "la IA no escribe nada más y queda pausada" y el trainer reportó que no se
cumplía — no fallaba la redacción de la regla, fallaba el mecanismo. **Una instrucción que el runtime
no lee es una instrucción que no existe.**

**Cómo aplicarlo:** distinguir siempre las dos formas.
- **Apagado mudo** (handoff invisible: acepta la llamada, consulta para terceros, oferta comercial,
  cliente actual, fuga IA) → los dos criterios y **sin escribir nada**.
- **Apagado tras mensaje** (`coach_wclose`, línea roja, malestar grave) → se envía el mensaje **y
  después** se aplican los dos criterios. Un cierre cálido que apaga sin enviar deja al lead con
  silencio.

⚠️ **Frontera con el SaaS Fyzon:** los coaches `coach_v5` de `prompts/source/coach-v5/` corren contra
`output_contract_v5`, que **sí** define `handoff_to_human` (boolean) + `handoff_cause` (enum `A|B|C|D`)
validados por el motor. Ahí `manual_attention`/`skip_reply` no existen y meterlos rompe el pipeline.
Regla práctica: **coach de `academia/` → los dos criterios; coach de `source/coach-v5/` → el contrato
del Core.**

Doctrina completa: `prompts/coach-engineering/doctrina-universal.md` §30. Patrón de referencia bien
hecho desde el principio: `prompts/coach-engineering/academia/andrea.md` (Automatía Pro). Migrados a
2026-07-31: Andrea y [[project_alfonso_coach_feedback]]. Pendientes (cada uno en su próxima ronda):
alex, beatriz-juan, chema, frodo, luis-royan, miguel-aguado (a medias), pepe, roberto.

Relacionado: [[feedback_coach_reglas_dentro_del_esquema]] (lo nuevo va en su sección canónica),
[[feedback_coach_authoring_baseline]].
