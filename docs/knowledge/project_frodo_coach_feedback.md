---
name: project_frodo_coach_feedback
description: "Loop del bloque COACH Frodo (academia/Automatía, hombres recomposición corporal); estado tras la ronda 2026-07-15 (gate de cierre + protocolo lead reservado §24 + test anti-invención de CONTENIDO + no valorar el cuerpo). Archivo autoritativo desde 15-jul: coach_block_frodoo.md (doble o). Recall si vuelve feedback de Frodo."
metadata: 
  node_type: memory
  type: project
  originSessionId: ce919e07-d1b4-49a3-8444-79c65dd1b808
---

Frodo = coach academia/Automatía (hombres +30, recomposición corporal: perder barriga, cuerpo atlético, salud/energía; de Canarias, **sin emojis, todo minúsculas, no abre ¿/¡**), formato full-XML `<coach_block>`. NO es coach_v5 del SaaS Fyzon; Iván lo despliega en Automatía. Mismo loop que [[project_alfonso_coach_feedback]] / [[project_roberto_coach_feedback]] / [[project_chema_coach_feedback_loop]]. Archivo: `C:\Users\sotob\Downloads\coach_block_frodo.md`. Backup = `coach_block_frodo.pre-2026-07-13.bak.md`.

**Ronda 2026-07-13** (aplicar la doctrina destilada de la ronda academia — ver [[project_coach_authoring_kb]] §26–§29/§11.15). Frodo tenía el fallo EXACTO que Rubén le marcó en la reunión del 13-jul: **lleno de preguntas de PROCESO** ("vienes entrenando?", "qué estás haciendo ahora?", "qué llevas haciendo?", "le estás dando caña al entreno?") sembradas en léxico, exemplars, F1 y F2. Cambios (+17/−14):
- **Quitadas todas las preguntas de proceso** → freno/objetivo en PRESENTE y simple (gate no-método, doctrina §19). Añadido un `⛔ GATE NO-MÉTODO` explícito en el massage de F2.
- **Regla de simplicidad (feedback Iván 13-jul, NUEVO):** con hombres, preguntas simples y directas que NO obliguen a releer — una idea por pregunta, sin subordinadas. Ejemplo de Iván: ❌ *"qué dirías que es lo que más te está frenando ahora para conseguirlo?"* → ✅ *"cuál es el mayor bloqueo que te estás encontrando ahora mismo?"*. Añadida al voiceprint de Frodo **Y destilada a la KB** (`avatares/hombres-perdida-peso/principios.md` P2 + `patrones-comunes.md §7`).
- **Pregunta muerta** ("qué cosas notarías diferentes en tu día a día") → proyección emocional "cómo te sentirías el día que lo consigas" (§11.15).
- **Curiosidad F2** (máx 2, no asumir la actividad — el caso "montaña" de la reunión era de Frodo) (§20).
- **Anti-videollamada** (§26): gateado "lo vemos en la llamada" a F5 en el léxico.
- **Calendly se MANTIENE** (Iván lo confirmó explícitamente; NO se cambió su agendamiento al método Andrea, a diferencia de Roberto 3.0). Sin tocar: el F1 "cuánto mides y cuánto pesas" (Iván lo dejó a criterio y no lo pidió cambiar).

**Ronda 2026-07-15 — feedback de Víctor ("conversación de la IA sin sentido", prioridad Alta).** ⚠️ **CAMBIO DE ARCHIVO AUTORITATIVO**: `Downloads/coach_block_frodoo.md` (doble "o"; era copia byte-idéntica de `coach_block_frodo.md`, Iván eligió trabajar sobre ella). Backup `.pre-2026-07-15.bak.md`. Conversación real (lead Jose, 52 años): tras dar "tengo 52 años mido 174 y peso 83" la IA soltó *"buen objetivo tío, con esos datos hay bastante margen para trabajar bien"*, y al responder el lead *"Es personal"* le cerró la conversación. Cambios (+44 líneas, 32.415 → 38.231 bytes):

- **Bug 1 root cause = SIEMBRA, no alucinación.** *"buen objetivo tío"* estaba sembrada **4 veces** (lexicon desnudo + openers + exemplars + fase1) = la frase más repetida del bloque; agravante: peso/altura vivían pegados al *"aterrizaje del objetivo"* (L153/L277), así que datos sueltos activaron el frame "objetivo". **Es el caso "Vale tío" de Alfonso otra vez** → confirma el aprendizaje de método (revisar SIEMPRE si el bloque siembra antes de escribir la regla).
- **`⚠️ TEST BINARIO ANTI-INVENCIÓN DE CONTENIDO`** (nuevo, en voiceprint): atribuir OBJETIVO/INTENCIÓN/DECISIÓN/COMPROMISO exige palabra literal del lead. Datos (edad/peso/altura/profesión) NO son objetivo. Es el hermano del test anti-invención EMOCIONAL de Alfonso 2.0, que no cubría contenido. Lexicon condicionado + condicionales reforzados en exemplars/fase1 + ejemplo nuevo del caso real en openers sub-tipo B.
- **`⚠️ NO VALORES SU CUERPO NI SUS DATOS (CR4)`** (nuevo, voiceprint): los datos físicos se recogen como contexto y NO se juzgan. Prohibido *"hay bastante margen"*, *"con eso se puede hacer mucho"*. A 174/83 eso es decirle que está gordo sin que lo pregunte.
- **Bug 2 root cause = HUECO: §24 no existe en NINGÚN sitio.** Verificado por grep: ni en `core_block.GENERAL.txt`, ni `core_block_v6.md`, ni `core_block_roberto.md`, ni en Frodo. La DIRECCIÓN §19–§25 se destiló a la KB y a los coaches del repo, pero **al CORE de la academia nunca se aplicó** (congelado hasta validar Roberto). Además la IA violó 2 reglas escritas: el propio bloque decía *"nunca cerrar antes de 2-3 intercambios reales"* (hubo 1) y el CORE L605 manda *"reconducir primero; si el lead REITERA, entonces cierre"*.
- **`<coach_lead_reservado priority="high">`** (nuevo, en structural_modifications): límite ≠ retirada. Acusar recibo + reconducir por otra vía en el MISMO mensaje, nunca re-preguntar lo negado, nunca cerrar. + pregunta súper abierta si da poca info 4-5 turnos; el silencio cualifica.
- **`## REGLA DURA — GATE DE CIERRE`** al principio del bloque (donde Alfonso 2.0 tiene su MARCO RECTOR): 3 checks binarios antes de cualquier wclose. **La regla existía pero vivía en `coach_qualification_doesnt`** — una sección de CRITERIOS que el modelo consulta para decidir si alguien cualifica, no al construir el turno. Aprendizaje de método: *una regla en la sección equivocada no se cumple*.
- **wcloses marcados `Mensaje LITERAL`** + prohibido parafrasear/mezclar: el cierre que envió no era ninguno de los dos, era una **mezcla improvisada** con su molde. Solo fase6 tenía la marca "(LITERAL)".
- **DESCARTADO por Iván**: reescribir los ❌ verbatim que siembran (el gate no-método SÍ funcionó; tocarlo podría debilitarlo).

**Hallazgo universal de esta ronda (§1 en estado puro, pendiente de destilar con OK de Iván):** *"darle caña"* aparecía en **un solo sitio de todo el bloque — dentro de una prohibición** (L296, gate no-método: "le estás dando caña al entreno?") y el modelo lo usó en el cierre. Igual, el ❌ del voiceprint (*"qué dirías que es lo que más te está frenando ahora para conseguirlo?"*) produjo casi la frase prohibida. **Escribir la frase mala ENTERA la siembra** — sobre todo cuando es una frase natural y útil (≠ un error obvio como los pares ❌/✅ de Alfonso, que sí funcionan). Candidatos a KB: refuerzo §1, modo de falla §11.16 (invención de CONTENIDO), §24 al CORE academia (congelado), y "los literales sin marcar se parafrasean" a formato.

**Observación fuera del prompt:** la bienvenida de esa conversación (*"Muy buenas! 😊 qué tal Jose! Gracias por seguirme!!"* + *"el menú de Jose Luis"*) va etiquetada **Manual** y lleva emoji, mayúsculas y doble exclamación — las 3 prohibidas en absoluto por el voiceprint de Frodo. No es bug del bloque (lo mandó un humano), pero el lead recibió una voz y luego otra.

**PENDIENTE**: Iván testea en Automatía. Sin destilar a la KB todavía.

Recall si vuelve feedback de Frodo o se toca su bloque.
