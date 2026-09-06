# Conocimiento del proyecto — Setters IA

Base de conocimiento **versionada** del proyecto. Antes vivía solo en la memoria local de
Claude Code (`~/.claude/projects/C--Users-sotob-setters-ia/memory/`), que está indexada por
la ruta del proyecto en **una máquina concreta** y por tanto no viajaba a otro equipo ni a
otro clon del repo. Desde 2026-07-15 vive aquí para que cualquier máquina que clone el repo
(Windows, Mac, Linux) arranque con el mismo contexto.

## Cómo leer esta carpeta

**Esto son observaciones puntuales, no estado vigente.** Cada fichero se escribió en una
fecha y refleja lo que era cierto ese día. El código evoluciona por debajo. La jerarquía de
autoridad cuando algo se contradice:

1. **El código** — lo que hay en el repo hoy. Manda siempre.
2. **`git log`** — la historia real de qué entró, qué se revirtió y cuándo.
3. **`CLAUDE.md`** (raíz) — la doctrina operativa vigente: arquitectura, las 4 capas del
   Cerebro v5, reglas de MCP, seguridad, hitos cerrados.
4. **Esta carpeta** — el porqué de las decisiones, los loops abiertos con cada coach y el
   contexto que no se deduce del código ni del historial.

Si un fichero de aquí menciona un fichero, una función o un flag: **verificar que sigue
existiendo antes de construir encima**. Ya ha pasado (ver el aviso del Hito 12.2).

## Credenciales: nunca

La memoria original tenía **credenciales vivas en claro** (la API key de ManyChat del tenant 2
y 3 tokens de webhook). Se redactaron al portarla — verificado que **nunca llegaron a
commitearse** al repo ni a su historial. Donde había un valor ahora hay `[REDACTADO — …]`
indicando dónde vive el real (`tenant_tokens` / `integration_accounts.credentials_encrypted`).

Esto importa más de lo que parece: según `CLAUDE.md`, el token aleatorio de la URL es la
**única** autenticación de los webhooks de ManyChat ("deuda asumida" — ManyChat no firma).
Filtrar ese token es filtrar el acceso.

**Al añadir notas aquí: cero tokens, cero API keys, cero PEM.** Se referencia dónde vive el
valor, nunca el valor. Escanear antes de commitear.

## Índice

### Estado y arquitectura

- [Proyecto SaaS Setters IA](project_saas_setters_ia.md) — estado base + arquitectura.
  Es el documento más largo y el más antiguo (2026-05-09): úsalo para **contexto histórico
  de los Hitos 1-9**, no como estado actual. El estado vigente se lee del `git log` + `CLAUDE.md`.
- [Cerebro v5 — consolidación CORE+COACH](project_cerebro_v5_consolidation.md) — Sprint Iota
  2026-05-18: big-bang de 11 bloques v4 → 2 v5 shared + `coach_v5` monolítico. Marker dinámico
  de fase activa. Sin compat v4.
- [Workflow editar prompts + MCP](reference_prompts_mcp_workflow.md) — puntero a la sección de
  `CLAUDE.md` donde vive la operativa de las 4 capas, versionado, placeholders y MCP.
  **Leer antes de tocar `prompt_blocks` o `trainer_preferences`.**
- [Helpers de seguridad (hardening 2026-05-15)](reference_security_helpers.md) — punteros a
  `isValidBearer`, `safeLogBody`, `assertEncryptionKey`, `assertHttpsUrl` + scripts E2E.

### Hitos con estado peculiar

- ⚠️ [Hito 12.2 — nombre del lead + filtro género](project_hito_12_2_name_gender_prefs.md) —
  **REVERTIDO, no está en el código.** Se conserva como diseño cerrado por si se retoma.
  Ver el aviso dentro del fichero antes de asumir nada.
- [Hito 9 — OAuth Marketplace: CERRADO](project_hito_9_oauth_cerrado.md) — cerrado 2026-05-12,
  smoke E2E validado (DM desde IG móvil nativa → motor → respuesta entregada). **No hacen falta
  las env vars OAuth ni tocar el VPS por SSH**: bastó 1 UPDATE por MCP añadiendo `auth_type='oauth'`.
  Onboarding de un trainer nuevo = 1 click "Install" en su sub-cuenta GHL.
  *Residual*: pasar `GHL_WEBHOOK_VERIFY_MODE` de `warn` a `enforce` sí requiere pegar la PEM RSA
  en el `.env.local` del VPS, y **eso** sigue bloqueado por el acceso SSH.

### Bugs abiertos

- 🐛 [`captured_lead_name` captura nombres ajenos](project_motor_bug_captured_lead_name.md) —
  **afecta a TODOS los tenants**. La IA agarra un nombre de una plantilla o de un tercero que
  esté en el historial y lo persiste a `leads.first_name` sin guarda de procedencia. Verificado
  abierto el 2026-07-30. El fix es de código + deploy del motor, no de `coach_block`.

### Autoría de coaches (coach-engineering)

- [KB de autoría de coaches](project_coach_authoring_kb.md) — la base en
  `prompts/coach-engineering/` (doctrina + avatares + formato SaaS + checklist + postmortems).
  Consultar al generar o reconciliar cualquier `coach_v5`.
- [Sistema de autoría coach_v5](reference_coach_authoring_system.md) — las 6 reglas de formato
  SaaS + pipeline de carga + loop de aprendizaje cuando entra un entrenador nuevo.
- [Estándar mínimo de autoría (baseline)](feedback_coach_authoring_baseline.md) — al **abrir**
  cualquier conversación de coach-authoring, tener presente todo lo anterior. No arrancar de cero.
- [Dirección de la conversación (feedback Rubén)](feedback_coach_direccion_bloqueos.md) —
  reunión 2026-06-18: el tono ya está bien, lo que falla es la **dirección**. Doctrina §19–§25.
- [Fase 2 — modo cómo-no-qué](feedback_coach_fase2_como_no_que.md) — directiva del 29-jun para
  autorar/reconciliar la Fase 2 de cualquier coach.
- [El feedback va DENTRO del esquema](feedback_coach_reglas_dentro_del_esquema.md) — directiva del
  25-jul: lo nuevo se traduce a su sección canónica, **nunca** como "reglas duras" antepuestas al
  principio del bloque. Incluye el mapa de destinos.
- [Export al Claude de la empresa](project_coach_authoring_export.md) — skill distribuible
  `coach-authoring`. Incluye la **regla dura de exclusión** en entregables al jefe.
- [Bloques coach sin pendientes](feedback_coach_blocks_sin_pendientes.md) — los bloques coach son
  producción que ven otros profesionales: quedan **limpios y terminados**, cero placeholders,
  pendientes o notas de decisión dentro del `<coach_block>`. Van al conocimiento o al chat.
- [Parar una conversación: `manual_attention` + `skip_reply`](feedback_coach_parada_manual_attention.md)
  — directiva del 31-jul: en la academia toda parada emite **los dos criterios juntos** + `motivo:`,
  nunca `handoff_to_human` ni Tipo A/B/C/D (Automatía no consume ese vocabulario). Incluye la
  frontera con el SaaS, donde el contrato es justo el contrario. Doctrina §30.

### Loops abiertos por coach

> Todos son de **academia/Automatía** salvo Nani, que es un tenant del SaaS de este repo.
>
> ⚠️ **Roberto, Beatriz y Pepe existen en los DOS sistemas**, y la versión del SaaS
> (`prompts/source/coach-v5/`) va por detrás de la de academia en los tres. La de Pepe arrastra
> además sus dos fallos P0, y el seed `012` está compilado de ella. Mapa y regla en el
> [README de academia](../../prompts/coach-engineering/academia/README.md).

- [Alfonso](project_alfonso_coach_feedback.md) — hombres pérdida de peso. Última ronda
  **2026-09-05, LOS HITOS** (reunión de Rubén del 03-09): el `<coach_discovery_gate>` deja de ser 5
  elementos con un presupuesto numerado de 6 preguntas EN ORDEN y pasa a **4 hitos sin orden**, con
  la regla de que un hito CERRADO no se vuelve a preguntar y de que un «no lo sé» lo cierra igual
  que si constara. Muere el elemento IMPACTO; el H3 gana una **segunda puerta, la expectativa**.
  ⚠️ **El bucle de preguntas repetidas no era de Alfonso, era de la arquitectura**: la misma está en
  `angel-martinez`, `frodo`, `alex` y `luis-royan`. ⚠️ **Se mide shows/agendas, no agendas.**
  Rondas anteriores relevantes: 2026-08-24 (el ritmo) y 2026-07-31b (nace el gate → doctrina §31).
- [Roberto](project_roberto_coach_feedback.md) — hombres +100kg. Ronda 2026-07-13, número de
  Rober **pendiente**. Ojo: hay **dos ficheros del mismo Rober** (una persona, dos sistemas) —
  el vivo en `academia/roberto.md` y el draft del SaaS `source/coach-v5/roberto-cordobilla.md`,
  que va por detrás. Ver la tabla en el [README de academia](../../prompts/coach-engineering/academia/README.md).
- [Frodo](project_frodo_coach_feedback.md) — hombres recomposición, sin emojis ni minúsculas.
  Última ronda **2026-07-29**: regla dura de señal de compra, guerra a la "y" de pegamento y
  banco de preguntas clave con tope de 2 en toda la conversación.
- [Chema](project_chema_coach_feedback_loop.md) — Programa Fénix. Llega feedback en `.docx`.
- [Luis Royán — menopausia](project_luis_royan_coach_menopausia.md) — avatar nuevo (el 4º).
  **Ronda 2026-07-31**: son **5 tandas de feedback**, no 2, y las 4 primeras juzgan el mismo bloque.
  Dice que va a PEOR y la causa nº1 está confirmada: **se desplegó una copia truncada** a la que le
  faltaban las 589 palabras de apertura, justo la directiva anti-repetición de la que se queja.
  Causa nº2: le quitamos cuatro movimientos y solo le añadimos prohibiciones. Bloque reescrito
  (precheck R1-R8, conversación dorada, banco de movimientos). ⚠️ Y **el feedback nunca se le
  devolvió marcado**, que es por qué re-pide cosas y concluye que empeora.
- [Nani](project_nani_coach_feedback.md) — ⚠️ **tenant del SaaS, no academia**: es `coach_v5` de
  verdad, en [`prompts/source/coach-v5/nani.md`](../../prompts/source/coach-v5/nani.md). Mujeres,
  hinchazón/ciclo, programa "Confía en Ti". **4º REGISTRO del avatar mujeres**: hombre experto
  no-afectivo (firma "señorita"). 3 rondas (23 y 24-jul) + validado en prueba real; la garantía
  solo como último recurso en F5+. `status: draft`, tenant `nani` sin alta.
- [Pepe Jiménez — HYROX](project_pepe_coach_feedback.md) — primer avatar de **OBJETIVO** puro.
  Ronda 1 aplicada 2026-07-25. La llamada la atiende su equipo de admisiones, no él. Trae el
  hallazgo del canal de autoridad por **reconocimiento** (candidato a §30 de la doctrina).
- [Beatriz Juan — madres postparto](project_beatriz_coach_feedback.md) — ronda 1 aplicada
  2026-07-28. **Reclamó el bloque de método que la doctrina §19 le había quitado** y se le
  devolvió con 5 blindajes: hay que enseñárselo a Rubén antes de desplegar, porque desde fuera
  parece la regresión de lo que se corrigió en Frodo.
- [Miguel Aguado — mujeres 35-70 sin dietas](project_miguel_coach_feedback.md) — última ronda
  **2026-09-05, LOS HITOS** (reunión de Rubén del 03-09). ⚠️ **Esta ronda DESMONTA la escalera de
  cambio que le añadimos en julio**: las cuatro preguntas que Rubén mandó eliminar eran, una por una,
  sus cuatro escalones. Colapsa a UNA pregunta (la de necesidad) con **dos puertas** para el handoff
  —que nombre la necesidad, o que diga qué espera—, porque en Miguel el handoff ES el producto y sin
  la segunda puerta se secaba. Las 7 casillas de CSM-06 pasan a 4 hitos, la conexión adopta el literal
  que dictó Rubén, y la parada se migra por fin a `manual_attention` + `skip_reply` (§30).
  ⚠️ **El permiso para repetir preguntas estaba escrito**: la escalera autorizaba «una variante del
  mismo escalón reformulada», y el anti-bucle se medía por etapa y no por dato. Contexto de la ronda 1
  (por qué nació la escalera):
  importancia → urgencia → necesidad), candidata a doctrina si mide bien. Su banco de objeciones ya
  es la referencia externa de §27.
- [Gonzalo Camacho — oncología](project_gonzalo_coach_feedback.md) — **avatar nuevo (el 5º) y el
  primero clínico**: personas con cáncer en tratamiento activo. Ronda 0 el **2026-08-05**, escrito
  desde cero sobre el §1 del doc de nichos de Rubén (PATOLOGÍAS, que incluye cáncer literalmente).
  Ningún otro coach de la flota atiende oncología activa: todos la paran. Trae tres cosas nuevas:
  la **frontera genérico/su-caso** para la parada clínica (sin ella el bloque se apaga en el mensaje
  1), el **canal de claridad con permiso** heredado de Luis, y **§32 traducida al registro
  sanitario** (*la reacción que valora es el reconocimiento clínico; la energía la da la precisión,
  no el adjetivo*) — candidata a §33. ⚠️ **Compuerta de dominio: es sanitario y el bloque habla en
  su nombre, así que firma los literales antes de desplegar.**
- [Andrea Oliver — fuerza sin restricción](project_andrea_oliver_coach_feedback.md) — mujeres 35-45
  sanas; trabaja **sola y se auto-cierra**. Ronda **25-08**: la queja doble que separa dos problemas —
  *"dolores muy superficiales"* (el bloque tenía cuatro techos y ningún suelo → nace su
  `<coach_discovery_gate>`) y *"me cancelan a último momento porque piensan que es solo nutrición"*,
  que NO se arregla cualificando más hondo. Su imán son **recetas** y la explicación de cómo trabaja
  estaba condicionada a que la lead preguntara — y la que llega con el marco equivocado es justo la
  que no pregunta. De ahí el **elemento de ENCAJE**, que no existía en ningún coach del corpus y que
  se destiló a **doctrina §34**. ⚠️ **No es Andrea SOP.** Compuertas abiertas: el literal con el
  entrenamiento delante (el orden actual es suyo, de julio), el imán, y la métrica a mirar
  (asistencia, no agendas).
- [Andrea — Conquista tu SOP](project_andrea_sop_coach_feedback.md) — **avatar nuevo (el 6º) y el
  segundo clínico**: mujeres 18-55 con SOP. Ronda 0 el **2026-08-07**, traducción de su prompt en
  formato antiguo (`coach_v3` + `nicho_v3`) al esquema XML. ⚠️ **No es Andrea Oliver** (`andrea.md`),
  son dos coaches con el mismo nombre de pila. Trae el **canal 4 de complicidad vivida** con cuota
  (la setter tuvo SOP: nadie más en la flota puede validar desde "a mí me pasaba"), la **PREGUNTA-T**
  de tonificación y la **lista de reconocimiento de F1**, única excepción legítima a CERO OPCIONES del
  corpus. ✅ **La videollamada la atiende el equipo, no Andrea** (confirmado 07-08; era el mismo P0
  que Pepe) y ✅ **la setter es "Andrea" a secas**, sin apellido y sin nombrar al entrenador: por eso
  el slug va por nicho, única excepción a la convención por entrenador. **Ronda 2 (26-08): descartaba a
  mujeres en menopausia** copiando el literal de `coach_wclose_no_encaja_perfil`, que nombraba el SOP como
  la puerta — el SOP pasa a ser el FOCO y no el requisito de entrada, con **modulación sin SOP** (mismo
  flujo, el eje deja de ser los síntomas) y literal propio. Cierra la compuerta del *"Persona que no tiene
  SOP"* del original, **al revés de como la leyó la ronda 0**. Compuerta viva, y es del entrenador: si el
  programa sirve a una mujer en menopausia cuando sus pilares van por fases del ciclo.
- [Bea — embarazo y posparto](project_bea_coach_embarazo.md) — **avatar nuevo (el 7º) y el tercero
  clínico**. Entrenadora que llega **quemada de la competencia** (Scalex + la app de un freelance)
  porque le ha caído la **asistencia** a llamada. Ronda 0 el **2026-08-22**: destilado del análisis de
  Rubén sobre sus dos IAs + la lección de contexto de la reunión de Alfonso, **antes** de tener su
  documentación. El delta del nicho: la conciencia del problema es ALTA (los objetivos se eliminan) y
  lo que falta es el **permiso** — la conversación se dirige a **miedos, intención y brecha
  expectativa-realidad**, y el problema **lo nombra ella**. Principios en
  [`avatares/embarazo-posparto/principios.md`](../../prompts/coach-engineering/avatares/embarazo-posparto/principios.md).
  ⚠️ **Compuertas abiertas**: si es o no Beatriz Juan, el runtime, el alcance y la frontera clínica.
- [Ángel Martínez — hombres 30-50 recomposición](project_angel_coach_feedback.md) — **4º coach del
  avatar hombres y el que le da la vuelta al marco.** Ronda 0 el **2026-08-24**, escrito desde cero
  con su formulario. Su lead no es el que no empieza: es **el que YA se esfuerza** (entrena, come
  bien, y no ve resultados proporcionales), así que decirle que le falta constancia le insulta.
  Tres deltas: el bloqueo se nombra en **lenguaje de progreso** y la causa se coloca en la
  **planificación**, **reconocerle el esfuerzo sustituye a la validación** como canal de autoridad,
  y la **expectativa vs realidad (§23) pasa a ser el movimiento central del descubrimiento** en vez
  de un extra. Es también el bloque con la densidad de prohibiciones más baja del corpus, escrito ya
  bajo la directiva del 24-ago. ⚠️ **Compuertas: notia, "jaja", emojis en contexto, la dos-puertas de
  su primera pregunta, y corpus de voz corto (5 literales verificados).**
- [Irene Esteve — clínica dental estética](project_irene_esteve_clinica_dental.md) — **avatar nuevo
  (el 8º), el cuarto clínico y el primero que NO es un entrenador**: quien habla es una CLÍNICA con
  equipo, en 1ª del plural, y la doctora va en 3ª. Carillas de porcelana sin tallado, Madrid /
  Barcelona / Elda-Petrer. Ronda 0 el **2026-09-06**, escrita de cero desde su formulario más
  investigación de cinco frentes. Seis inversiones respecto al corpus: el objetivo ya viene dicho, el
  freno es la decisión y no la conducta, la zona prohibida es la **valoración clínica**, el precio
  **se da entero** (650 €/pieza y el mínimo de 10 en la misma frase, o es señuelo sancionable), el
  cierre es una **visita presencial** sin señal (el KPI es la asistencia), y los terceros se atienden.
  **Cualificar aquí no es filtrar**: quien no es caso de carillas es caso de ortodoncia. Y el setter
  **declara que es una IA en el primer mensaje** por el art. 50 del AI Act, no por doctrina. Pasada
  adversarial de 5 lentes: 94 hallazgos crudos, 22 confirmados, todos aplicados. Principios en
  [`avatares/clinica-dental-estetica/principios.md`](../../prompts/coach-engineering/avatares/clinica-dental-estetica/principios.md).
- [Alex — escaladores (Alejandro Padilla)](project_alex_coach_feedback.md) — **primer coach de
  rendimiento deportivo** de la flota, y el último que quedaba en el formato antiguo `BLOQUE 0…11`.
  Su freno no es la ignorancia ni la constancia: es el **conformismo**, y por eso el objetivo se
  pregunta antes que el freno y el miedo a lesionarse sí mueve a la acción. Su escalada se pregunta
  (§33 cae del lado de Bea, no del de los hombres); su plan de entrenamiento no. Ronda 4 el
  **2026-09-04**: **la F5 se parte en microcompromiso y propuesta** con espera en medio, que es la
  petición literal de Alejandro y a la vez cierra una contradicción viva de su propio bloque (su
  Fase 4 pedía el auto-diagnóstico que su Fase 3 prohibía). De 136.869 a 72.146 chars.
  ⚠️ **Compuerta abierta: quién atiende la videollamada, el equipo o Alejandro.**
- [Roadmap academia: validar Roberto → overhaul CORE](project_academia_core_overhaul.md) —
  **ojo: sistema Automatía/n8n+Anthropic, NO este repo.** Despliega Iván.

### Cómo trabajar en este proyecto

- [Proactividad al detectar bugs colaterales](feedback_proactive_bug_detection.md) — levantar
  bugs fuera del scope durante smokes y auditorías.
- ["Actualizar todo" = commit + push](feedback_actualizar_todo_significa_push.md).
- [Banner impersonate descartado](feedback_impersonate_banner_rejected.md) — Hito 11.1.

## Mantenimiento

Cuando una de estas notas quede obsoleta, **corregir el fichero** (o marcarlo como el del
Hito 12.2) en vez de dejar que conviva con el código. Una nota que afirma algo falso hace
más daño que su ausencia: se lee como autoridad.

No duplicar aquí lo que ya está en `CLAUDE.md`, en el código o en el `git log`.
