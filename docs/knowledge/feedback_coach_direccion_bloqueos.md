---
name: coach-direccion-bloqueos
description: "Feedback reunión Rubén 2026-06-18 sobre los setters IA: el tono ya está resuelto, falla la DIRECCIÓN. Identificar y anclar en el bloqueo central (en presente), no educar, criterios = una pregunta, flujo encadenado tipo Joseca. Recall al generar/ajustar cualquier coach o el Core."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 16b20c09-94f3-47ab-b715-27971dcf23a3
---

Reunión de Rubén Rosales (Academia Entrenadores Online) el **2026-06-18** revisando conversaciones reales de varios setters IA (Alfonso Santos, Roberto Gordovilla, Jordi Altemir). Transcripción: `Downloads/Sala de reuniones personales de Aca.txt`.

**Diagnóstico central:** el tono y la fluidez ya están resueltos ("de puta madre"); lo que falla es la **DIRECCIÓN** de la conversación. El setter "va dando bandazos" porque no identifica el problema central, profundiza en detalles no prioritarios, educa/opina, sobre-pesa criterios de cualificación y no lee cuándo el lead no cualifica.

**Why:** es el siguiente salto de calidad de los coaches. Resuelto el tono (problema previo), la palanca ahora es darle rumbo a la conversación. Rubén lo confirma sobre varios coaches a la vez, así que es doctrina, no un arreglo puntual.

**How to apply:** se destiló al loop de aprendizaje de [[coach-authoring-kb]] sin duplicar capas —
- **Universal → `doctrina-universal.md` §19–§25** (+ enmiendas §1/§5/§18.3 + modos de falla §11.11–14): §19 identificar y anclar en el bloqueo central (DIRECCIÓN, no "solución con calzador"); §20 curiosidad sobre la motivación (no cambiar de tema); §21 no educar/corregir/opinar; §22 criterios de (des)cualificación = UNA pregunta, no debate (+ señal "yo puedo solo" = no cualifica); §23 expectativa-vs-realidad (lead que ya adoptó solución y está contento); §24 leads cerrados (pregunta súper abierta; el silencio cualifica); §25 flujo de preguntas encadenado tipo Joseca.
- **Avatar hombres → `principios.md`** P3 reordenado (porqué temprano + curiosidad + bloqueo en presente + preguntas con la palabra del lead), P7 acotado (criterios = una pregunta; fuera el sondeo de intentos pasados), P10 nuevo (dirección masculina + leads cerrados). `plantilla.md`, `patrones-comunes.md §6` y `checklist-auditoria.md` sección 8 alineados.
- **Avatar mujeres → `principios.md`** P10 (misma dirección + 1 profundización extra; Jordi Altemir como ejemplo positivo de empatía + anclaje temprano).
- **Coach → queda en cada uno:** las 7 preguntas reales de Joseca (las extrae Iván; andamio en `avatares/hombres-perdida-peso/referencia-estructura-joseca.md`) + la voz de Roberto.

**Resolución de un choque importante (decidida por Iván):** los 2 puntos de Iván (no preguntar "qué estás haciendo ahora"; no profundizar en los problemas) chocaban con el flujo Joseca verbalizado por Rubén ("¿cómo has intentado solucionarlos?") y con la doctrina previa (§1 ponía "qué llevas haciendo ahora" como ejemplo; §18.3 usaba una pregunta de pasado). Resolución elegida: **bloqueo en PRESENTE como brújula** — identificar el bloqueo central y anclar para dirigir hacia la llamada, NUNCA preguntar qué ha probado ni qué hace ahora para resolverlo; el bloqueo da dirección, no se diagnostica ni se resuelve en chat (eso es del profesional en la llamada).

**Método de trabajo confirmado en la reunión (cómo iterar coaches):**
- **No rehacer de cero: ajustar lo que ya hay** sobre el feedback existente (Sergio + Rubén).
- **Testear UN coach primero, luego propagar:** se cambia **Roberto Cordobilla / "Rober"** primero (en la reunión se le llamó "Gordovilla"; nombre real Cordobilla; más descontento que Alfonso). **Roberto v2 YA construido** (2026-06-20) en `prompts/source/coach-v5/roberto-cordobilla.md` (su voz real + backbone de Joseca + §19–§25; status draft, pendiente de TEST + alta de tenant). Si mejora → se aplica a Alfonso. El cambio al **Core (`core_v5_base`) va escalonado DESPUÉS** de validar Roberto (Rubén: "test uno primero").
- **Joseca es el patrón de referencia del avatar hombres** (el Core se reformuló sobre él). Sus 7 preguntas + marco mental YA destiladas en `avatares/hombres-perdida-peso/referencia-estructura-joseca.md` (Joseca es de trail running; transfiere la ESTRUCTURA, no el nicho; mapeadas a pérdida de peso en presente). Iván las puso también en el grupo.
- Inputs ya recibidos (2026-06-20): bloque actual de Roberto + system message de Joseca. Pendiente: alta del tenant_slug de Rober + test de Roberto v2 con conversaciones reales antes de seedear.
- **CORE (Fase 3) analizado (2026-06-20):** Iván pasó el `core_block.GENERAL.txt` de producción. Hallazgo honesto: el CORE ya cubre mucho (tema principal = bloqueo, expectativa-vs-realidad ya en F2, validación con tope CR8, cualificación = una pregunta, fases lineales). Los cambios son **8 añadidos quirúrgicos**, no rewrite: (1) NUEVA "no educar/dar consejos"; (2) bloqueo en presente (CR7+F2); (3) NUEVA curiosidad sobre la motivación; (4) leads cerrados = pregunta súper abierta (F1); (5) flujo encadenado explícito (Lente 1); (6) empatía evento vital (F1); (7) criterios=una pregunta + leer "puedo solo"; (8) cerrar el bucle de expectativa-vs-realidad. Tensión a decidir por Rubén: "puedo solo" hoy es objeción a trabajar (CORE) vs descualifica (Rubén) → propuesta concilia (explorar 1 vez → si reafirma, cerrar). Entregable de revisión: `docs/cambios-core-reunion-ruben.html` (con aprobar/rechazar/comentar + generador de decisiones). NO se ha tocado ningún archivo del CORE; espera OK del equipo + Roberto validado.
- **Entregables HTML para el equipo (paleta Fyzon, vanilla JS, en `docs/`):** `ajustes-setter-roberto-v2-reunion-ruben.html` (simulador antes/después) + `cambios-core-reunion-ruben.html` (revisión del CORE). Downloads está bloqueado por el protector → viven en el repo.

**Idea de producto (fuera de prompt):** revisar/"apagar" el setter justo antes de enviar el enlace en leads sin conexión/confianza (handoff-review), para no tirar el enlace a un cerrado que dice "sí, luego lo veo" y nunca agenda.

**Extensión 2026-07-13:** la doctrina creció con **§26–§29 + §11.15** (objeciones + agendamiento), destilados de la ronda de coaches academia del 13-jul (feedback trainer Alfonso #64 + reunión Rubén 13-jul + estilo objeciones de Miguel Aguado): §26 no nombrar la llamada/programa antes de F5, §27 objeciones hiladas (no troceadas), §28 rebatir vs cerrar con cariño, §29 compromiso temporal por evento, §11.15 pregunta muerta; + enmiendas §19 (profundizar impacto-presente / nunca autopsia del método — reconcilia el "profundizar más" del trainer con el gate no-método) y §20 (curiosidad F2 máx 2 + no asumir la actividad). Coaches tocados: Alfonso 2.0 y Roberto 3.0 ([[project_alfonso_coach_feedback]], [[project_roberto_coach_feedback]]). §26 candidato al CORE de la academia, escalonado (no tocar hasta validar Roberto).

Operativa de autoría y formato: ver [[coach-authoring-kb]] y [[coach-authoring-system]].
