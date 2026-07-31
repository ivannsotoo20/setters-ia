# CHECKLIST DE AUDITORÍA — Bloque COACH

Pasar ANTES de entregar cualquier coach nuevo o ajustado. Cada punto se responde ✅ / ❌.
Si hay algún ❌ → corregir antes de entregar. El Core (`core_v5_base`) se asume cerrado:
esto audita el Coach.

---

## SECCIÓN 1 — COMPLETITUD ESTRUCTURAL

- [ ] ¿Están las secciones OBLIGATORIAS? (`coach_identity`, `coach_tone`,
  `coach_structural_modifications`, `coach_phase_massage`, `coach_links`,
  `coach_qualification`, `coach_wclose`, `coach_program`; `coach_objections` y
  `coach_special_protocols` opcionales).
- [ ] ¿`coach_identity_notia` tiene mensaje literal? (si no → el Core hace handoff Tipo C
  silencioso; confirmar que es lo deseado).
- [ ] ¿Cada subsección de `coach_structural_modifications` dice algo explícito, incluido
  "Sin modificaciones" donde no haya cambios? (nada en blanco).
- [ ] ¿Cada fase de `coach_phase_massage` indica mensaje literal o "Sin mensaje literal —
  aplicar Core + tono", o que está desactivada?
- [ ] ¿No queda ningún `[PENDIENTE — pedir al entrenador]` sin resolver (o marcado para
  iteración)?
- [ ] ¿Se han borrado los comentarios de instrucción de la plantilla?

---

## SECCIÓN 2 — COHERENCIA INTERNA Y CON EL CORE

- [ ] ¿Ningún punto del Coach contradice una CR1–CR12 del Core? (lo vigila también el
  validador `V10-coach-contradiction.ts`).
- [ ] ¿Cada `<coach_ref>` del Core apunta a una sección que EXISTE en este Coach?
- [ ] ¿La lógica de fase (`coach_structural_modifications_phases`) y los mensajes literales
  (`coach_phase_massage`) NO se duplican entre sí?
- [ ] ¿Los caps de mensaje por fase son coherentes con el Core (o se indica que los
  sobrescriben)?
- [ ] ¿Los conteos internos cuadran? (si dice "los datos son 3", que liste 3).
- [ ] ¿Los `handoff_cause` referenciados existen y son consistentes?
- [ ] **Mecanismo de parada correcto para el sistema de destino** (§30). Coach de `academia/`
  (Automatía): TODA parada va con `manual_attention` **+** `skip_reply` + `motivo: <causa>`;
  **cero** `handoff_to_human` y cero etiquetas de tipo emitidas (Tipo A/B/C/D, "Causa F").
  Coach de `source/coach-v5/` (SaaS): al revés, el contrato del Core (`handoff_to_human` +
  `handoff_cause` enum). Grep de control: los conteos de `manual_attention` y `skip_reply`
  deben **coincidir** — si no, hay una parada a medias que no apaga la IA.
- [ ] ¿Cada parada dice si es **muda** (sin mensaje) o **tras mensaje** (se envía el
  `coach_wclose` y después se apaga)? Un cierre cálido que apaga sin enviar deja al lead con
  silencio; un handoff invisible que envía mensaje delata la derivación.
- [ ] ¿Los links de `coach_links` coinciden con los citados en `coach_phase_massage`?

---

## SECCIÓN 3 — CUALIFICACIÓN

- [ ] ¿`coach_qualification_criteria` define criterios mínimos concretos?
- [ ] ¿`coach_qualification_doesnt` marca qué requiere VERBALIZACIÓN EXPLÍCITA del lead vs.
  qué NO descualifica (duda, respuestas cortas, falta de urgencia)?
- [ ] ¿Los criterios de descualificación tienen su cierre cálido en `coach_wclose`?
- [ ] ¿`coach_wclose` tiene mensajes literales reales, no descripciones?

---

## SECCIÓN 4 — PROGRAMA Y OBJECIONES

- [ ] ¿`coach_program` es BREVE? (sin detalle operativo — el setter no vende, CR3).
- [ ] ¿`coach_program_is` / `coach_program_isnt` están definidos (o el diferenciador deja
  claro para quién es / no es)?
- [ ] ¿`coach_objections` (si se rellena) aporta manejo específico de nicho, no solo repite
  el protocolo genérico del Core?
- [ ] ¿Las frases de objeción van HILADAS (cálidas, lógica lineal, cerrando en redirección/pregunta),
  no troceadas en frases secas separadas por puntos? (§27).
- [ ] ¿Cada objeción recupera el control con una pregunta anclada al objetivo/bloqueo si es rebatible, o
  cierra con cariño si es descualificación blanda ("no es mi momento")? (§28).

---

## SECCIÓN 5 — MENSAJES LITERALES

- [ ] ¿Los mensajes literales (`coach_phase_massage`, `coach_wclose`, `notia`) están en la
  VOZ real del profesional?
- [ ] ¿Ningún mensaje literal viola una CR (precios, fechas, diagnóstico, número de teléfono)?
- [ ] ¿Las excepciones a reglas del Core (ej: pregunta con opciones, propuesta en 2 mensajes)
  están marcadas como excepción única y acotada?
- [ ] ¿Ninguna respuesta de objeción (precio u otra) nombra "videollamada / llamada / el programa"
  antes de F5? Antes de F5 la objeción reconduce al descubrimiento SIN nombrar la llamada (§26).

---

## SECCIÓN 6 — FIDELIDAD DE VOZ

- [ ] ¿`coach_tone` tiene `priority="highest"`?
- [ ] ¿`coach_tone_voiceprint` usa parámetros BINARIOS/CUANTIFICADOS con tope — sin
  "frecuente / mucho / siempre"?
- [ ] ¿Cada rasgo característico del voiceprint tiene al menos un ejemplo que NO lo use?
  (prevención de sobre-aplicación).
- [ ] ¿El voiceprint es COHERENTE con los mensajes literales?
- [ ] ¿`coach_tone_exemplars` tiene ≥5 ejemplos en `<ejemplo situacion="...">`, etiquetados
  (conexión, validación, profundización, puente, propuesta)?
- [ ] ¿Los exemplars son REALES del profesional, no inventados?
- [ ] ¿Hay exemplars con y sin emoji, y con y sin muletilla (diversidad — doctrina §8)?
- [ ] ¿`coach_tone_contrast` tiene ≥2 pares ❌genérico → ✅coach con el MISMO contenido?
- [ ] ¿`coach_tone_lexicon` define palabras que USA y palabras PROHIBIDAS?
- [ ] ¿`coach_tone_variety` está presente (regla de no repetición)?
- [ ] ¿La proporción validación/dirección del voiceprint está diseñada para el avatar
  (doctrina §9), no asumida?
- [ ] **TEST DE INDISTINGUIBILIDAD:** ¿un mensaje autogenerado junto a uno literal del
  profesional se distinguiría? Si SÍ → ❌, revisar voz.

---

## SECCIÓN 7 — FORMATO SaaS coach_v5 (NET-NEW — el coach cae directo o no)

Cruzar con [`formato-saas-coach-v5.md`](formato-saas-coach-v5.md):

- [ ] Frontmatter YAML completo; `trainer` = nombre del `.md` = `coach_identity_name`.
- [ ] `tenant_slug` existe (o se marca "alta de tenant pendiente").
- [ ] `<coach_block>` con sus secciones; **solo `coach_tone`** usa sub-tags XML; el resto
  `##`/`###`. Header text = key canónica exacta.
- [ ] Exemplars en `<ejemplo situacion="...">`.
- [ ] `coach_main_link` usa `{{tracked_calendar_url|fallback}}` (o vacío + `coach_main_link_type:
  human_handoff`). CERO URL de agenda hardcodeada.
- [ ] `coach_main_link_type` ∈ {`calendar`, `form`, `whatsapp`, `human_handoff`, vacío} (no
  `calendly`).
- [ ] Cero `{{...}}` sin fallback; cero placeholder fuera de la whitelist; nada de
  `{{phaseN_priority}}` (solo core).
- [ ] NADA de tú/usted, tope de mensajes/turno, frases prohibidas ni `handoffMode` dentro del
  coach (eso es `trainer_prefs_v1`); si el original los traía, anotarlos como "configurar en
  trainer_preferences".
- [ ] Sin `#` escapados (`\#\#`).
- [ ] **Dry-run del seed:** `node scripts/build-coach-v5-seed.mjs --trainer <slug> --tenant-slug
  <slug> --seed-number NNN` corre sin error y reporta chars ≥ ~5000.

---

## SECCIÓN 8 — DIRECCIÓN DE LA CONVERSACIÓN (§19–§29, Rubén 2026-06-18 + academia 2026-07-13)

Auditar sobre conversaciones simuladas (no se ve solo leyendo el bloque). El tono puede estar bien
y la dirección mal — esto audita la dirección.

- [ ] ¿La conversación identifica y ANCLA en UN bloqueo central (en presente), o da bandazos? (§19).
- [ ] ¿CERO preguntas "qué estás haciendo ahora [para resolverlo]" / "qué has probado"? El freno se
  pregunta en PRESENTE, no se mapea el problema ni los intentos pasados (§1/§11.8/§19; puntos 1+2 de Iván).
- [ ] ¿Hay curiosidad sobre la motivación — al menos 1 follow-up del porqué antes de avanzar, sin
  cambiar de tema? (§20).
- [ ] ¿CERO educar/corregir/opinar sobre lo que el lead hace mal? (muestra comprensión, reconduce) (§21).
- [ ] ¿Los criterios de (des)cualificación (tiempo, edad…) se preguntan UNA vez, sin debatirse ni
  orbitar la conversación? ¿Se lee la señal "yo puedo solo" como no-cualifica? (§22).
- [ ] ¿El lead que ya adoptó solución y está contento se maneja con expectativa-vs-realidad, no con
  más dolor ni venta forzada? (§23).
- [ ] ¿Protocolo de lead cerrado: pregunta súper abierta + el silencio cualifica + no forzar el
  enlace sin conexión? (§24).
- [ ] ¿Flujo encadenado — cada pregunta nace de la anterior — y misma estructura base en todas las
  conversaciones (no 3 conversaciones con 3 estructuras distintas)? (§25).
- [ ] ¿Empatía ante evento vital (lesión/accidente/embarazo) en F1 ANTES de ir al objetivo? (§5).
- [ ] Si se profundiza en el bloqueo, ¿es sobre impacto/consecuencia/motivación/duración EN PRESENTE, y
  NUNCA autopsia del método pasado ("qué probaste / por qué no te funcionó")? (§19).
- [ ] ¿Curiosidad sobre un dato/actividad/interés personal en F2 con tope de 2 preguntas y sin asumir la
  actividad (se pregunta cuál es)? (§20).
- [ ] ¿Cero preguntas muertas/vagas ("qué cambiaría en tu día a día/vida")? Proyección en clave EMOCIONAL
  ("cómo te sentirías cuando lo consigas") (§11.15).
- [ ] "No es el momento" con un EVENTO concreto (oposición, cita médica) → ¿compromiso bidireccional anclado
  a la fecha, no cierre pasivo? (§29).

### El suelo antes de proponer la llamada (§31)

- [ ] ¿Existe un **SUELO** escrito en binario ("si te falta uno, PROHIBIDO proponer"), y no solo un techo
  ("si ya los tienes, deja de preguntar")? Un criterio que solo frena el exceso no frena el defecto.
- [ ] ¿La decisión "¿ya puedo proponer?" tiene **fuente única**? Busca todas las secciones que la contestan
  (criterio de suficiencia, temperatura, trigger de cierre temprano, gate de compromiso, criterios de
  cualificación, fases): si hay dos umbrales distintos, el modelo usará el más laxo.
- [ ] ¿La cláusula de fuente única aclara que otras secciones pueden **sumar** requisitos por encima pero
  nunca rebajar? (si no, el modelo da por derogadas la micro-confirmación y la línea roja).
- [ ] ¿El **estándar de prueba** es la palabra literal del lead ("podrías citarla"), no la inferencia
  ("si puedes responder mentalmente")?
- [ ] **Bucle auto-cumplido**: ¿el bloque ordena buscar microcompromisos ("tiene sentido?") y a la vez
  cataloga ese "sí" como señal de compra que dispara el atajo? Si sí, el setter fabrica su propio permiso.
  Debe decir explícitamente que una señal provocada por el setter no cuenta.
- [ ] ¿Hay **tope global de preguntas** que mande sobre los parciales? Haz la aritmética: elementos +
  follow-ups + reacciones + disponibilidad + movimientos del gate. Si sube el suelo sin tope, vuelve el
  interrogatorio.
- [ ] ¿La salida cuando falta un elemento **NO es cerrar**? Falta de casilla ≠ descualificación: lo que
  cierra es que el lead no se abra tras la pregunta súper abierta. Contrastar contra
  `coach_qualification_doesnt` ("duda / respuestas cortas NO descualifican").
- [ ] Si el coach fija "**una sola pregunta por mensaje**": ¿está declarada la excepción de los mensajes que
  fusionan verificación + propuesta (F4/F5)? ¿Y aclarado que una pregunta de DOS PUERTAS no son dos preguntas?

---

## MODO DE USO

1. Leer el coach completo una vez.
2. Rellenar cada punto ✅/❌.
3. Si hay ❌ → corregir ANTES de entregar.
4. Si todo ✅ → testear con ≥4 escenarios simulados (auditar la SECCIÓN 8 en cada uno):
   - Lead con respuestas vagas/cortas (sin bucles; protocolo lead cerrado §24).
   - Lead que lo tiene todo claro (sin rellenar fases; flujo encadenado §25).
   - Lead positivo sin dolor / ya con solución y contento (expectativa-vs-realidad §23; sin forzar problemas).
   - Conversación normal (fidelidad de voz — test de indistinguibilidad; anclaje en bloqueo §19).
