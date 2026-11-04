# Tania (tenant 7) — ronda del 2026-11-04: su respuesta por número, los recursos A/B y el plan por fases

Tania contestó por número a las preguntas del 21-oct y mandó el documento «Recursos regalados»
(Grupo A sin CTA, seis vídeos, para quien no cualifica por país; Grupo B, dos VSL con CTA, solo
para quien cualifica y necesita confianza). Con una captura de Ecuador que enseñaba lo que seguía
pasando: justificación del país, corte en seco sin recurso, «??» y una cirugía indicada que la IA
ignoró. Plan aprobado por Iván el 4-nov (fichero de plan de la sesión); este documento es el estado.

## 1. La causa raíz

El coach v30/v31 y su configuración (precio 200-1.200, primer literal, cierre con recurso, margen
de 2 turnos) se escribieron y probaron el 21-oct pero **nunca se cargaron**: esperaban el OK de
Tania a las frases. En producción seguía el **v29** (bloque 36, md5 `0d3a666b…`, 29 snapshots),
`allowed_price_text` «entre 600 y 1.200€», `zone_close_message` de corte directo y sin
`price_first_step_text`, `zone_close_resources` ni `zone_explore_turns`. Casi todo lo que ella
veía salía de ahí.

## 2. Lo medido el 4-nov (BD de producción)

- **Bienvenidas.** Desde el 8-oct, 0 aperturas de Instagram clasificadas `bienvenida`; 279 son su
  respuesta de palabra clave; WhatsApp sigue (56 por formulario). Coincide con lo que ella sospecha:
  no las ha enviado a mano.
- **Inbound.** Instagram, desde el 15-sep: 49 aperturas de 4 o más palabras, 47 en pausa, 30 sin
  respuesta de nadie, 35 insistieron. Palabra suelta «espalda»: 11 de 14 atendidas por la IA.
  `Hernia` e `Info`, palabras de su ManyChat, estaban `is_active=false`: quien escribe «hernia» a
  secas queda pausado para siempre aunque ManyChat le conteste (el Caso B del router no quita la
  pausa). Las aperturas de Instagram vienen por el webhook de GHL (`ghl_inbound_mode`); Tania no
  tiene `integration_accounts` de ManyChat.
- **Idioma.** ~32 conversaciones en inglés, 4 en portugués y 4 en francés en 60 días (≈1 %). El
  motor no fuerza idioma; la única barrera era la línea del coach «Escribes siempre en castellano».
  Piezas deterministas solo en español: `asksForCountry` (V23), `asksForPrice`, las regex de
  residencia, los literales que envía el motor.
- **Recursos.** El v31 y el SQL del v31 usaban como cierre 8 los dos VSL del Grupo B, los que ella
  veta para fuera de zona. Los seis del Grupo A no estaban en ningún sitio.
- **Dashboard.** 4.181 conversaciones `active` (2.796 con `ai_paused_until='infinity'`).
  `activeConvsQuery` va sin `range` ni `order`: PostgREST corta en 1.000 filas arbitrarias y la
  alerta «esperando respuesta» se calculaba sobre un cuarto aleatorio. Las conversaciones inbound de
  Instagram de octubre existen (64, 40 sin respuesta) pero `isSetterOwned` excluye
  `ai_paused_until != null` y no son handoff: caen entre las dos alertas. No hay sincronización de
  bandeja: si Instagram no entrega una «solicitud», no existe en la BD.
- **Facebook.** Sin `integration_accounts` (decisión del 2-sep): el motor nunca envía. Su embudo FB
  funciona solo: «Siii😊» 757 veces desde el 1-oct, 565 con el enlace de Tally en menos de 2 min.
  «espalda» escrito a pelo en Facebook: 5 casos, 0 respuestas de nadie. La respuesta de palabra
  clave la da ManyChat, y en la página de Facebook no la tiene.
- **Operación recomendada.** El Core (`01-core.md`, «qué no es objeción», punto 3) trata «lesión
  que requiere cirugía pendiente» como descualificación Tipo B con cierre; el coach no lo modulaba.
- **«??».** 498 de 2.087 mensajes de IA en 30 días (24 %). V08 solo avisa.
- **RLS.** `tenant_configs`, `prompt_blocks` y `resources` tienen una sola policy `FOR ALL USING
  (tenant_id = tenant_id_for_user())`, sin `WITH CHECK` ni rol: cualquier miembro del tenant puede
  hacer `UPDATE` con la anon key. Hallazgo colateral, tarea aparte.

## 3. Decisiones de Iván (4-nov)

- **D5.** Fuera de zona: texto libre validado. El modelo redacta el cierre con 1 o 2 vídeos del
  Grupo A; el motor valida (URLs permitidas, sin motivo, sin agenda) y cae a la variante literal si
  falla dos veces. Sustituye al D1 del 20-oct.
- **D6.** La exclusión de quien pregunta si es sanitaria aplica solo a la apertura; a mitad de
  conversación sigue el literal «No soy fisioterapeuta…».
- **D7.** «Mis textos / Mis recursos» (Fase 3) antes que la pasada completa de rendimiento (Fase 4).
- **D8.** Normalizador de «??»/«!!» en esta ronda.
- Se mantiene: Facebook apagado en el SaaS; WhatsApp cierra por prefijo en el mismo turno; lista
  blanca de zona intacta; «precio determinante» fuera.

## 4. Fase 1 — coach v32 y configuración (sin código de motor)

Coach v32 (`prompts/source/coach-v5/tania-duarte-matos.md`, body 48.096 caracteres; el v31 tenía
45.954): idioma en cuatro lenguas; biblioteca en dos grupos con el «para quién» de su documento;
cierre 8 sin guion (margen solo si falta información, el cierre redactado en su tono con 1 o 2
vídeos del Grupo A; mientras no llegue la entrega 2a, el motor sigue mandando la variante literal
del vídeo elegido); los tres literales exactos del precio del 4-nov; implicación con umbral de
varias señales y su literal nuevo; protocolo «OPERACIÓN RECOMENDADA» que modula el punto 3 del
Core; una línea en handoff.

Configuración (`.tmp/ronda-tania-04-nov/cargar-v32-config.sql`): `allowed_price_text` «entre 200
y 1.200 €», `price_first_step_text`, `zone_close_resources` con las seis variantes del Grupo A,
`zone_explore_turns` 2, `call_gate.ask_country_question`, `default_audio_language` `auto`, y
`automation_keywords` `Hernia` e `Info` activas.

Batería local `bateria-v32-local.mts` (13 escenarios: la captura de Ecuador, Perú que ya contó lo
suyo, Colombia sin contexto, Cuba vaga, +51 por WhatsApp, país sin explicación, precio dos veces,
sesiones, precio al abrir, cirugía recomendada, implicación aislada y acumulada, inglés).
Primera pasada (1,90 $): 7 de 13 en verde. Lo que falló y por qué:

- **Del bloque (corregido con corpus antes de la segunda pasada):** «cada sesión» y «precio al
  abrir» salían parafraseados en vez de con los literales (se añadieron los dos intercambios de
  ejemplo); con tres señales de poca implicación el modelo tranquilizaba y seguía preguntando (se
  fijó el umbral: «dos señales ya son varias; en cuanto aparece la segunda, el literal»).
- **Del test:** en la captura de Ecuador el modelo cerró en el turno del país con el vídeo lumbar
  (ya sabía L5-L1, año y medio): es lo que pide Tania («si ya sabemos qué necesita, no volvemos a
  preguntar»); el test exigía el vídeo de horas sentada, que ella iba a decir después.
- **Del motor (para la entrega 2a):** un país suelto sin que lo hayamos preguntado («De
  Colombia» tras «Hola, me duele la espalda», «Soy de Cuba») queda como `mention`: V23 no lo
  repregunta porque el modelo declara `lead_country_iso`, pero el motor no cierra por una mención
  y la conversación sigue turnos. Arreglo: en `zone-policy.ts`, un mensaje entero que es solo un
  país, gentilicio, «De X» o «Soy de X» (≤4 palabras, sin «pero/aunque») cuenta como
  `reject_by_declaration`. Además, el modelo pone «¿» de apertura en 7 de 13 escenarios y «??» en
  8 de 13 pese al voiceprint, y abre con «Vale»/«Oye» (vetados): el normalizador de 2a quita
  también los signos de apertura; «Vale»/«Oye» pueden ir al vocabulario prohibido (V17, estricto)
  si Iván quiere.
- **Visto en WhatsApp +51:** «mucho rato de pie» eligió el short de horas sentada; la variante
  literal decía «sentada». Se reescribió la variante en neutro («tanto rato en la misma postura»)
  hasta que 2a deje al modelo redactar.

Segunda pasada (los cinco escenarios tocados, 0,76 $): 5 de 5 en verde. Ecuador cierra en el turno
del país con el vídeo lumbar; +51 cierra en el mismo turno con la variante en neutro; «cada
sesión» saca los dos literales en sus burbujas; el precio al abrir saca la apertura de F1, el
primer literal y «Cuéntame qué te ocurre…»; con la segunda señal de poca implicación sale su
literal y, al tercer rechazo, el cierre de «ahora no». En total, 11 de 13 escenarios en verde;
los dos restantes («De Colombia» y «Soy de Cuba» sueltos) dependen del cambio de `zone-policy.ts`
de la entrega 2a. Coach v32 listo para cargar: body 49.159 caracteres, md5 `3f44080b81e1…`.

## 5. Fase 2 (código, tres entregas) y siguientes

- **2a motor** (esta sesión): idioma determinista (`detectLeadLanguage`, directiva por turno,
  regex en pt/en/fr, literales validados en vez de sustituidos), cierre fuera de zona en texto libre
  (`zone_close_mode='free'`, allowlist del Grupo A, V20 con allowlist), normalizador de signos
  (`trainer_preferences.singlePunctuation`, que quita también «¿» y «¡» para este voiceprint) y
  el país suelto sin pregunta como declaración (`zone-policy.ts`).
- **2b motor** (sesión propia): gate de intención en la apertura (`classified_or_intent`,
  prefiltro + Haiku, etiqueta «Profesional», nunca «profesional» en `conversation_source`).
- **2c panel** (sesión propia): alertas calculadas en SQL (RPC `dashboard_alerts`), tercera alerta
  de inbound en pausa, y los tres arreglos baratos de velocidad.
- **Fase 3:** «Mis textos / Mis recursos» con placeholders en el coach y la tabla `resources`.
- **Fase 4:** rendimiento completo.

## 6. Cargado en producción el 4-nov (OK de Iván)

- Coach v32 con `scripts/load-coach-v5-version.mjs` (`--expect-md5 0d3a666b…` del v29): bloque 36,
  md5 `54938d78d4acf38cf5ad7724f270b351`, 49.702 caracteres; **snapshot v30 en BD** (los v30/v31
  del `.md` nunca se aplicaron, así que la numeración del historial va por detrás de la del `.md`).
  El contenido lleva retornos de carro (543) igual que el v29 (503): el cargador lee la copia de
  trabajo, que en Windows es CRLF. No es una regresión; si se quiere limpiar, normalizar en el
  cargador, no en BD.
- `tenant_configs` del tenant 7: `allowed_price_text` «entre 200 y 1.200 €», `price_first_step_text`,
  6 `zone_close_resources` del Grupo A, `zone_explore_turns` 2, `call_gate.ask_country_question`,
  `default_audio_language` `auto` (SQL en `.tmp/ronda-tania-04-nov/cargar-v32-config.sql`, con rollback).
- `automation_keywords` 10 (`Info`) y 11 (`Hernia`) activas.
- Smoke en el simulador de producción (`.tmp/sim-tests/smoke-v32-prod.mjs`, 0,22 $): Ecuador → país
  en el turno 2 sin justificación, cierre en el turno del país con el vídeo lumbar del Grupo A y
  `disqualified`; precio → primer literal exacto sin cifra y, al insistir, el segundo literal exacto
  con la puerta de precio «libre».

## 7. Las sesiones paralelas (estado al cierre del 4-nov)

- **2b gate de intención** (rama `claude/festive-tu-83be3e`, worktree `.claude/worktrees/festive-tu-83be3e`): hecho,
  sin commit, 2032 tests verdes. `inbound-intent-gate.ts` (prefiltro + Haiku con tool forzada), `automation-keywords.ts`
  (sacado del router para evitar el ciclo de imports), helper `inbound-opening` en `shared-validator` con re-export en
  el panel, modo `classified_or_intent` en la action y el formulario del panel, migraciones **083** (etiqueta Profesional)
  y **084** (CHECK de los modos de entrada: las 039/042 dejaron CHECK de dos valores). Decisiones de esa sesión: en el
  modo nuevo la palabra suelta gana a la palabra clave `inbound`; el registro en `llm_calls` va con `role='qualifier'` y
  `request_payload.kind='inbound_intent_gate'`; `custom_fields.inbound_intent` se guarda en los tres veredictos.
  Activar: aplicar 083 y 084, desplegar motor y panel, y
  `UPDATE public.tenant_configs SET ghl_inbound_mode = 'classified_or_intent' WHERE tenant_id = 7`.
- **2c alertas + velocidad** (rama `claude/elated-bose-7c0d22`): el proceso se cayó (exit 3221226505) con
  `dashboard-loader.ts`, `dashboard-query.ts` y la RPC a medias; reanudada por mensaje con la numeración corregida
  (**085** RPC, **087** índices).
- **Hardening RLS** (rama `claude/goofy-robinson-6015c3`): hecho, sin commit. Migración **086** (SELECT para miembros del
  tenant + agency admin; RESTRICTIVE que niega INSERT/UPDATE/DELETE por sesión en `tenant_configs`, `prompt_blocks` y
  `resources`; solo escribe service_role), `setAiEnabled` con rol, script RLS ampliado (20 pass). Inventario: el panel
  nunca escribe esas tablas con la sesión del usuario. **Hallazgo crítico fuera del alcance:** `profiles` tiene la misma
  policy `FOR ALL` sin `WITH CHECK` y `authenticated` tiene UPDATE de todas sus columnas: cualquier usuario autenticado
  puede poner `is_agency_admin=true` en su propia fila y el panel le abre impersonate de todos los tenants y
  `/admin/cerebro`. Verificado solo leyendo el catálogo. Esa sesión dejó tarjetas para arreglarlo y para barrer las otras
  17 tablas con la misma forma de policy.

## 8. Pendiente

- Respuesta a Tania por número + guía (`.tmp/ronda-tania-04-nov/respuesta-tania-04-nov.txt`, `guia-tania.md`), la envía Iván.
- Commit de la Fase 1 (esta rama) y de las ramas 2b y RLS; aplicar 083, 084 y 086; desplegar; activar el modo en el tenant 7.
- Entrega 2a (esta sesión), 2c (reanudada), Fase 3 y Fase 4 del plan. El arreglo de `profiles` es urgente y va aparte.
