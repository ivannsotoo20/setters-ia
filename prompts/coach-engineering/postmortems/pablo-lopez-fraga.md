<!--
  Importado verbatim del proyecto CloudChat (postmortem_pablo_lopez.md). Registro histórico.
  Mapeo de nombres a la KB actual:
   - aprendizajes_proceso.md            -> ../doctrina-universal.md
   - plantilla_hombres_perdida_peso.md  -> ../avatares/hombres-perdida-peso/plantilla.md
   - canonico_hombres_perdida_peso.md   -> ../avatares/hombres-perdida-peso/canonico-pablo-lopez-fraga.md
   - canonico_mujeres_perdida_peso.md   -> ../avatares/mujeres-perdida-peso-nutricion/canonico-maria-de-lluc.md
   - CHECKLIST_AUDITORIA.md             -> ../checklist-auditoria.md
  Nota: Pablo Lopez Fraga (avatar hombres) != Pablo Montenegro (tenant Montefit del repo).
-->

# POSTMORTEM — Coach Pablo López Fraga

**Fecha del proceso:** 25–26 mayo 2026
**Avatar:** Hombres pérdida de peso (>30 años, online)
**Estado final:** Canónico consolidado en `canonico_hombres_perdida_peso.md`
**Iteraciones:** 7 (v1 → v8)

---

## 1. Punto de partida

Existía un coach de Pablo en producción con problemas graves identificados en reunión con Rubén (jefe de estrategia) y en una conversación real fallida con un lead. Los problemas eran:

1. Bienvenida del sistema rota (dos preguntas en una).
2. Salto directo a Fase 2 sin Fase 1 de conexión.
3. Violación de CR7 (preguntas sobre el pasado).
4. Validaciones-eco sistemáticas (reformular palabras del lead).
5. Dos conversaciones en paralelo (la IA no recoge lo que dice el lead).
6. Cualificación con opciones cerradas (alto/bastante/máximo) que rompe el flujo.
7. Resumen de F4 inventando datos no verbalizados.

Existía un canónico funcional de referencia: María de Lluc (nicho mujeres nutrición), que servía como modelo estructural de fases. El reto era portar la lógica estructural manteniendo fidelidad a la voz de Pablo (masculina, directa, sin diminutivos).

---

## 2. Recorrido por iteración

### v1 — Coach reconstruido con coach_overrides al inicio (932 líneas)

**Decisión:** seis reglas duras de prohibición en bloque `<coach_overrides>` al principio, sobrescribiendo el Core (CR7 prevalece, preguntas siempre abiertas, validación no es eco, F2 sustituye cuantificación, F3 sustituye opciones cerradas, validación condicionada).

**Lo que pasó:** funcional. Resolvió los siete problemas del punto de partida. Pero el bloque de prohibiciones era largo y redundante con lo que ya describían las otras secciones.

**Aprendizaje:** las prohibiciones gigantes funcionan, pero hay redundancia entre prohibir y describir en positivo. Si describes bien cómo SÍ se hace, la prohibición sobra.

### v2 — Eliminación de coach_overrides, todo en positivo (932 → 825 líneas)

**Decisión:** disolver el bloque de prohibiciones en descripciones positivas en cada sección. Mantener solo prohibiciones operativamente concretas (`coach_tone_lexicon > NUNCA`, descualificadores, mecánicas binarias del voiceprint).

**Lo que pasó:** el coach quedó más limpio y alineado con la estructura de María de Lluc. Las pruebas iniciales mostraron que el comportamiento se mantenía.

**Aprendizaje universal:** los modelos siguen mejor "haz X así" que "no hagas Y". Las prohibiciones útiles son las que son operativamente concretas y acotadas (token específico, mecánica binaria, descalificador). Las prohibiciones comportamentales abstractas ("no hagas eco") tienen siempre una formulación positiva equivalente que funciona mejor — describir cómo SÍ se hace, mostrarlo con exemplars, mostrarlo en contrast pairs.

### v3 — Anti-eco quirúrgico (825 → 1128 líneas)

**Detonante:** tests con 4 conversaciones simuladas mostraron que el modelo seguía haciendo eco sistemático y abría con muletilla en 7 de 8 turnos consecutivos. Análisis turno-por-turno del PDF reveló el patrón.

**Diagnóstico:** la regla "1 de cada 3 mensajes abre con muletilla" del Core estaba sobrescrita por v2 con "criterio de uso por situación". Pero el criterio era demasiado permisivo: como casi todo lead +30 verbaliza algo emocional, el modelo encontraba siempre justificación para meter muletilla. Y la "validación" que metía era reformulación de las palabras del lead, no validación real.

**Decisión:** introducir 3 tipos de apertura A/B/C (emoción real / info neutra / avance concreto), un test anti-eco binario antes de enviar, y restricción del banco "Eso ya es un avance" solo cuando hay acción concreta YA en marcha (no para deseos ni metas).

**Aprendizaje universal #1:** la validación-eco es el modo de falla más común y persistente. Reformular la situación que el lead acabó de describir, con sinónimos y otro orden de palabras, NO es validación. Es eco con muletilla delante.

**Aprendizaje universal #2:** validar la EMOCIÓN ≠ validar la SITUACIÓN. La validación real nombra el peso o sentimiento invisible detrás de lo que dijo el lead (cansancio, hartazgo, frustración, miedo, alivio). La validación falsa reformula la situación que el lead describió.

**Aprendizaje universal #3:** los exemplars enseñan al modelo cuál es el patrón "estándar". Si todos los exemplars tienen "muletilla + validación + pregunta", el modelo replica ese patrón en cada turno aunque la regla diga "criterio de uso". Hay que **incluir exemplars sin muletilla** (arranque directo, pregunta directa pura, anclaje sin muletilla) para que el corpus muestre diversidad.

### v4 — Reducción + F1 siempre con introducción + prohibido "Eso/Lo" (1128 → 656 líneas)

**Detonante:** v3 funcionaba pero pesaba demasiado y seguían apareciendo arranques con "Eso de..." y "Lo de..." que delataban patrón de IA.

**Decisión:** prohibir explícitamente empezar mensajes con "Eso..." / "Lo..." como demostrativo + sustantivo abstracto. Compactar secciones reorganizando información sin perder reglas.

**Cambio crítico:** F1 SIEMPRE requiere introducción + pregunta, nunca arranque directo con pregunta pura. F2+ puede adaptar.

**Aprendizaje universal #4:** F1 es CONEXIÓN, no entrevista. Una pregunta directa pura en T1 (sin frase introductoria que conecte con lo que el lead dijo) hace que la conversación arranque seca y rompe la sensación de "te he leído". F1 entera necesita introducción + pregunta.

### v5 — Anti-dramatización ("Esa + sustantivo abstracto") (656 → 693 líneas)

**Detonante:** test con leads simulados reveló un patrón nuevo: el modelo arrancaba mensajes con "Esa sensación de...", "Esa mezcla de...", "Esa parte de...". Aparentemente parecía validación empática, pero estaba haciendo dos cosas mal a la vez: (1) reformulaba la situación del lead, (2) le añadía vocabulario emocional que el lead no había verbalizado.

**Ejemplo del patrón fallido:**
> Lead: "ya he probado mil cosas y no me han funcionado"
> Setter: "Esa sensación de invertir energía y volver al punto de salida es lo más jodido de todo esto."
>
> El lead NO dijo "sensación", NO dijo "invertir energía", NO dijo "punto de salida", NO dijo "lo más jodido". El setter le metió todo eso.

**Decisión:** añadir el patrón `"Esa/Eso/Lo + sustantivo abstracto al inicio del mensaje"` a la lista de patrones a evitar. Introducir el principio nuevo: **VALIDAR, NO DRAMATIZAR**. Test de 3 preguntas antes de enviar (¿es eco? ¿es dramatización? ¿es interpretación que añade vocabulario no verbalizado?).

**Aprendizaje universal #5:** la dramatización es el modo de falla "elegante" de la IA. Cuando intenta sonar profunda y empática, añade vocabulario emocional que el lead no usó. Es peor que el eco porque parece validación de alta calidad. La regla operativa es: **solo se puede validar emoción que el lead haya verbalizado explícitamente con sus palabras** (cansancio, hartazgo, pereza, frustración, miedo, harto, mal). Si no la verbalizó, no se pone.

### v6 — Validar es la excepción, no la regla (693 → 479 líneas)

**Detonante:** tras v5, la conversación seguía sintiéndose excesivamente "terapéutica" para un coach de hombres +30 que quieren perder barriga. Pablo es entrenador, no terapeuta. Su nicho es directo. La validación constante (aunque ya no fuera eco ni dramatización) seguía sobrando.

**Decisión:** **inversión del principio raíz**. Pasar de "validar siempre que haya emoción" a "validar es la excepción". Distribución cuantificada por cada 10 turnos: 5-6 mensajes con pregunta directa + 2-3 mensajes con anclaje en lo dicho + 1-2 mensajes con validación tipo muletilla.

**Aprendizaje del avatar (no universal):** en nichos masculinos directos (hombres pérdida peso, fuerza, deportes con métrica), validar emocionalmente en cada turno desentona. El profesional no es terapeuta; es entrenador o experto. La validación se reserva para momentos en que el lead ha verbalizado emoción explícita REAL.

**Atención:** este aprendizaje NO es transferible directo a otros avatares. María de Lluc valida MUCHO porque el nicho mujeres nutrición + TCA + ansiedad con comida lo necesita. La proporción validación/dirección es específica del nicho. Lo que SÍ es universal es: **la proporción correcta se diseña, no se asume**.

### v7 — Taxonomía de 4 sub-tipos de introducción (479 → 549 líneas)

**Detonante:** feedback directo de Iván tras leer v6 — el modelo seguía oscilando entre "muletilla en cada turno" y "pregunta directa demasiado seca". Y lo importante (citando a Rubén): F1 es **conexión real con lo que el lead acaba de decir**. Si comenta el contenido, hablar del contenido; si menciona el regalo, recoger el regalo. Eso no es ni pregunta directa ni muletilla: es conexión natural con lo dicho.

**Diagnóstico clave:** se había escapado la distinción entre **INTRODUCCIÓN** y **MULETILLA**. Una introducción puede hacerse de 4 formas distintas:
- **Sub-tipo A** — Anclaje en lo dicho, sin muletilla ("Cuando me dices...", "A qué te refieres con...")
- **Sub-tipo B** — Conexión con lo que el lead ha comentado, sin muletilla ("Genial que te aporten los vídeos! Cuéntame...")
- **Sub-tipo C** — Validación sin muletilla ("A casi todos les pasa lo mismo,", "Tiene sentido,")
- **Sub-tipo D** — Validación con muletilla ("Uff,", "Es normal hombre,", "Ostras,")

La pregunta directa pura es el modo OCASIONAL, no la base. Distribución: 7/10 introducción + pregunta (rotando A/B/C/D) + 3/10 pregunta directa pura.

**Reglas de alternancia inviolables que se introducen:**
1. Dos preguntas directas seguidas → prohibido.
2. Dos muletillas seguidas → prohibido.
3. Máximo 2 muletillas en ventana de 5 mensajes.
4. No repetir el mismo sub-tipo dos veces seguidas.
5. F1 entera (mensajes 1-5): NUNCA pregunta directa pura. Todos con introducción.
6. F1 primer mensaje: prioridad Sub-tipo B (conexión con lo que el lead respondió a la bienvenida).

**Aprendizaje universal #6 (uno de los más importantes del proceso):** **introducción ≠ muletilla**. Confundir ambas cosas lleva a oscilar entre dos extremos malos: muletilla en cada turno (suena a bot empático) o pregunta directa pura siempre (suena a entrevista fría). La solución estructural es separar las dos cosas, dar 4 sub-tipos posibles de introducción, y dejar la pregunta directa pura como modo ocasional con sus propias reglas.

**Aprendizaje universal #7:** las reglas de alternancia funcionan mejor cuando son binarias y mecánicas ("dos seguidas → prohibido") que cuando son cuantitativas y aproximadas ("aproximadamente 1 de cada 3"). El modelo cumple mejor con reglas binarias.

### v8 — Consolidación manual de Iván (549 → 380 líneas)

**Decisión:** Iván modificó v7 a mano ajustando exemplars, mensaje literal de F5 ("Perfecto señor!"), respuesta de precio nueva, ratio 7/10 vs 3/10, mensaje literal de F6 "Perfecto tío 👌". Esta es la versión que se elevó a canónico.

**Aprendizaje universal #8:** el toque humano final sobre el coach generado por la IA es necesario y valioso. La IA llega a un punto donde la estructura está bien y la voz está bien pero hay matices micro (un "señor!" aquí, un "tío" allá, una respuesta concreta que el profesional prefiere) que solo el humano que conoce al profesional puede afinar. **El proceso correcto es: IA construye estructura + tono → humano valida y ajusta micro → IA consolida y publica como canónico.**

---

## 3. Aprendizajes consolidados

### 3.1 — Universales (aplican a cualquier avatar)

1. **Describir en positivo > listar prohibiciones**, excepto cuando la prohibición es operativamente concreta (token específico, mecánica binaria, descalificador).
2. **Validar la EMOCIÓN, no la SITUACIÓN.** La validación real nombra el peso o sentimiento invisible detrás de lo dicho. Eco = reformular la situación con sinónimos.
3. **Solo validar emoción verbalizada explícita con palabras del lead** ("cansado", "harto", "pereza", "frustrado", "miedo", "mal"). Si no la verbalizó, no se pone.
4. **Anti-dramatización: prohibido empezar mensaje con demostrativo + sustantivo abstracto** ("Esa sensación de...", "Eso de...", "Lo de..."). Reformula la situación Y añade vocabulario no verbalizado: doble falta.
5. **F1 es CONEXIÓN, no entrevista.** El primer mensaje conecta con lo que el lead respondió a la bienvenida. Sub-tipo B (conexión con lo dicho) prioritario en T1. Nunca pregunta directa pura en F1.
6. **Introducción ≠ muletilla.** Confundir ambas hace oscilar entre dos extremos malos. Hay al menos 4 sub-tipos de introducción posibles (anclaje / conexión / validación sin muletilla / validación con muletilla).
7. **Las reglas de alternancia binarias funcionan mejor que las cuantitativas.** "Dos seguidas → prohibido" se cumple. "Aproximadamente 1 de cada 3" se ignora.
8. **Los exemplars enseñan el patrón estándar.** Si todos los exemplars tienen el mismo molde, el modelo replicará ese molde en cada turno. Hay que **incluir exemplars sin muletilla y exemplars con pregunta directa pura** para que el corpus muestre diversidad.
9. **Test anti-eco binario antes de enviar:** comparar la frase de apertura con las palabras del último mensaje del lead. Si las palabras clave coinciden o son sinónimos → es eco, reescribir apuntando a la emoción.
10. **El toque humano final es necesario.** La IA llega a estructura + tono correctos; el humano afina micro-detalles que solo conoce. Proceso correcto: IA construye → humano ajusta → IA consolida.

### 3.2 — Específicos del avatar "hombres pérdida de peso"

1. **Validar es la excepción, no la regla.** Distribución: 7/10 introducción + pregunta + 3/10 pregunta directa pura. Las muletillas son ingredientes puntuales, no la base.
2. **Registro masculino directo:** prohibidos diminutivos cálidos ("cositas", "poquito"), apelativos femeninos ("cielo", "cariño"), conectores formales. USAR "hombre", "tío", "Por si puedo echarte una mano,".
3. **Las preguntas exactas de F2-F3 son del avatar, no del entrenador:**
   - F2: aterrizaje del objetivo ("Cuando me dices perder peso, tienes algo en mente, una cifra o cómo te gustaría verte?") + por qué ("Qué te aportaría a ti conseguirlo?") + obstáculos en presente ("Qué te está rompiendo el ritmo ahora?").
   - F3: motivo AHORA ("Qué te ha llevado a querer ponerte ahora con esto?") + proyección ("Cómo describirías tu día a día si lo consiguiéramos?").
   Estas preguntas funcionan para cualquier entrenador del avatar — son fruto de iteración, no son neutras.
4. **F6 modular, no replicable a ciegas:** el flujo Calendly → casos de éxito → número de Pablo es específico de SU workflow. Otros entrenadores del avatar pueden tener otra operativa (handoff humano, sin casos de éxito, sin petición de número).
5. **Descualificadores duros del avatar:** mujeres, hombres <25 verbalizado.
6. **Tono directo no significa frío.** El tono de Pablo conecta con calidez masculina ("hombre", "tío", "eh" coloquial de cierre, jaja para bajar tensión) sin terapeutizar.

### 3.3 — Específicos de Pablo (no replicables sin ajuste)

1. Workflow Calendly directo (sin handoff humano para coordinar).
2. Página de casos de éxito en Canva enviada en F6 mensaje 2.
3. Petición de número de teléfono antes del handoff final.
4. Pablo trabaja SOLO (no menciones "mi equipo", handoff invisible).
5. Mensajes literales exactos de F5 ("Perfecto señor! Pues sinceramente me gustaría proponerte...") y F6 ("Perfecto tío 👌", "Perfecto, muchas gracias! Nos vemos en la llamada").
6. Respuesta literal a precio ("El precio depende de cada caso, por lo que para poder decirte con exactitud ese precio...").

---

## 4. Modos de falla a vigilar en futuros coaches

Estos son los patrones que aparecieron y costaron iteraciones detectar. Listarlos aquí permite buscarlos proactivamente en cada coach nuevo:

1. **Eco con muletilla delante.** El modelo cree que añadir "Uff totalmente," + reformular las palabras del lead = validación. No lo es. → Test anti-eco binario.
2. **Dramatización con "Eso/Esa/Lo + sustantivo abstracto".** El modelo intenta sonar empático añadiendo vocabulario emocional que el lead no usó. → Prohibición explícita del patrón.
3. **Muletilla en cada turno** porque casi todo lead "verbaliza algo emocional". → Regla binaria "dos seguidas no" + máximo 2 en ventana de 5.
4. **Pregunta directa pura en F1** que rompe la sensación de conexión. → F1 entera con introducción, Sub-tipo B prioritario en T1.
5. **Resumen de F4 inventando datos** que el lead no verbalizó (restricciones, kilos, plazos, motivaciones). → Regla "solo datos verbalizados".
6. **Opciones cerradas en preguntas** (alto/bastante/máximo) que fuerzan al lead a elegir y rompen el flujo. → Toda pregunta abierta excepto excepciones literales documentadas.
7. **Saltos de fase prematuros** (saltar F1 e ir directo a F2 porque el lead "ya verbalizó objetivo"). → Reglas de avance de fase + criterios explícitos.
8. **Preguntas sobre el pasado** ("¿qué has probado?", "¿de dónde vienes?"). → Refuerzo de CR7 + exemplars solo en presente.

---

## 5. Métricas del proceso

- **Iteraciones totales:** 7 (v1 → v8)
- **Reuniones de feedback:** 1 (con Rubén, jefe de estrategia)
- **PDFs de tests revisados turno a turno:** 4
- **Líneas iniciales (v1):** 932
- **Líneas finales (canónico):** 518 (incluyendo metadatos)
- **Aprendizajes universales extraídos:** 10
- **Aprendizajes del avatar extraídos:** 6
- **Tiempo del proceso:** ~36 horas (25-26 mayo 2026)

---

## 6. Próximos pasos a partir de este postmortem

1. Los **10 aprendizajes universales** (sección 3.1) se vuelcan a `aprendizajes_proceso.md` (doctrina general del proyecto).
2. Los **6 aprendizajes del avatar** (sección 3.2) se vuelcan a `plantilla_hombres_perdida_peso.md` como bloque "principios del avatar" que NO se toca al adaptar a un coach nuevo.
3. Los **6 específicos de Pablo** (sección 3.3) quedan en el canónico marcados como específicos (no replicables sin verificar workflow del nuevo entrenador).
4. Los **8 modos de falla** (sección 4) se incorporan al `CHECKLIST_AUDITORIA.md` como tests proactivos a aplicar en cada coach nuevo.
