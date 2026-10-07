# Tania (tenant 7) — ronda del 2026-10-07: cualificación, videollamada, precio, bienvenidas

Feedback de Tania (vía Iván) con cinco puntos, su documento del 05/10 sobre cómo proponer la
videollamada, sus respuestas sobre precio y servicio, y un caso del día anterior: "la IA empezó
una conversación WhatsApp con un hombre de Uruguay, que viene de formulario de Tally". Sin acceso
a Supabase desde la sesión (el MCP no conecta desde la nube), así que nada se midió en BD: las
causas salen del código y de la captura de sus palabras clave.

## 1. Llamadas a quien no cualifica por país o por tiempo de dolor

"Es un fallo que llevamos meses intentando corregir". El criterio estaba escrito en el coach
(suelo, filtros 2 y 3) y aplicarlo dependía del modelo. **Cerrojo de la videollamada (V22)**,
determinista y por tenant:

- Config: `tenant_configs.lead_qualification.call_gate = { require_country, min_pain_months }`.
  `require_country` usa la lista blanca de zona (siempre + con filtro).
- Con cerrojo, la tool del Generator lleva tres campos más: `lead_country_iso`,
  `pain_duration_months`, `previous_episode`. El setter los declara en cada turno en que los sabe
  (la directiva runtime le explica qué declarar y que sin eso la propuesta no sale).
- Un turno que lleva a la videollamada (fase 5-6, `qualified` o la URL del calendario en el texto)
  sin país de zona (salvo que el prefijo ya lo confirme) o con menos de N meses sin episodio
  anterior: UN reintento con la instrucción concreta (preguntarlo, o el camino del bloque para quien
  no cualifica). Si insiste, `CallGateError`: no sale nada, IA pausada y aviso a la entrenadora
  (mismo aterrizaje que V20/V21). Si el reintento falla por la red, el error sube y el turno se
  reencola entero.
- Código: `packages/agent-pipeline/src/pipeline.ts` (`isCallStep`, `callGateMiss`,
  `CallGateError`), `apps/motor-agente/src/lib/call-gate.ts`, `process-debounced.ts` y el simulador.

## 2. El hombre de Uruguay que pasó el Tally

La residencia escrita en zona (o una IA que aprobaba) mandaba la decisión aunque el prefijo fuera
de fuera: era la excepción D1 del 26-09 (+502 "En Canadá" → aprobado y derivado a Tania). Con la
regla de Iván del 03-10 ("en WhatsApp el prefijo descalifica directamente") la excepción sobraba.

- Formulario (`lead-qualifier.ts`, `decideByPrefix`): con lista blanca, prefijo fuera de zona o
  desconocido (≥8 dígitos) → rechazado en seco, antes de la IA y aunque la residencia escrita sea
  de zona. También para payloads sin respuestas (el endpoint lo aplica igual).
- Chat (`zone-policy.ts`, `lead-origin.ts`, reintento de V21): el veredicto
  `prefix_out_residence_in` y la "única excepción" de la directiva solo con
  `lead_qualification.residence_overrides_prefix = true`. Por defecto, un prefijo de fuera cierra
  aunque diga que vive en zona. Si Iván quiere volver a D1, es esa clave.

## 3. Precio y explicación del acompañamiento

- Precio en dos pasos, con sus literales: la primera vez reconoce que es importante y vuelve a si
  puede ayudarla; solo si insiste, "entre 600 y 1.200€" y la invitación a la videollamada. No es la
  propuesta (no sube fase). Tres cosas lo bloqueaban: la CR2 del Core (sin rangos), el guardrail 2
  del Judge (quitaba cualquier cifra antes de F6) y V11. Ahora: Core v7 con una excepción para el
  literal que autorice el coach; Judge y V11 dejan pasar el texto exacto de
  `lead_qualification.allowed_price_text` (cualquier otra cifra sigue siendo filtración).
- Servicio: respuestas cortas a "¿sería en casa?", material, días y seguimiento, en
  `coach_program_info`. Contestar exactamente lo que pregunta; la operativa completa, en la
  videollamada.

## 4. Videollamada (su documento del 05/10)

No es para resolver, crear la progresión, pautar ni decirle qué hacer: es para conocer mejor su
situación y valorar si Tania puede ayudarla y si su forma de trabajar encaja. Su literal va en
`coach_phase_massage_fase5`, con las frases que veta. El ejemplo de F5 del v28 ("valorar desde
dónde partes y construir una progresión") enseñaba justo lo que vio en producción ("armar esa
progresión contigo"): fuera. También los literales de objeción con "lo vemos todo" o "ver cómo te
mueves".

**Pendiente**: el punto 2 de ese documento (en qué momento preguntar el país) no llegó en la
captura. Se mantiene la decisión de Iván del 03/10 (WhatsApp nunca; Instagram al principio).

## 5. Bienvenidas que no se contaban

Sus tres palabras clave de bienvenida son frases enteras con emoji («Hola, te doy la bienvenida a
esta comunidad 🎉», la #29, nueva). El detector solo ignoraba mayúsculas y espacios: con el nombre
de la persona delante, otro emoji o "Hola!" en vez de "Hola,", no casaba. Sin casar, el outbound sin
conversación se descarta (Caso C de `routeGhlOutbound`): ni conversación de bienvenida ni conteo,
y si la persona contestaba, la conversación nacía como inbound.

- Matcher (`ghl-message-router.ts`, `matchesKeywordPattern`): pasada literal sin acentos (el panel
  ya lo prometía) y, para palabras clave de 4+ palabras, sus palabras en orden ignorando emojis,
  signos y letras alargadas, con hasta 2-3 palabras metidas (el nombre) y, desde 6 palabras, una
  que falte o cambie. Las cortas no pasan por ahí: «Hola! 👋» sin emoji casaría con cualquier hola.
- Lo ya perdido no se recupera desde la BD: el Caso C no guardaba nada. El log de ese caso lleva
  ahora los 80 primeros caracteres para ver qué no casó.
- Ojo con el conteo: "Bienvenidas enviadas" cuenta conversaciones por su fecha de creación. Una
  bienvenida a alguien que ya tenía conversación cuenta en el día en que se abrió esa conversación.

## 6. Facturas (julio, agosto, septiembre)

Fuera del código: lo resuelve Iván.

## Coach v29

`prompts/source/coach-v5/tania-duarte-matos.md`: videollamada, precio, servicio, recursos con sus
frases (las del documento INFORMACIÓN NEGOCIO TANIA), seguimiento ligero tras un recurso, nivel de
conciencia como guía de ruta, y el filtro 3 sin la excepción de residencia. Cuerpo de ~39,0k a
~43,0k caracteres: todo lo que entra son sus literales.

## Orden de despliegue (importa)

Pasos 2-4 en un solo comando, con comprobaciones (no pisa un Core o un coach editados fuera del
`.md`): `node scripts/apply-tania-ronda-2026-10-07.mjs` (solo mira) y después con `--apply`. El
motor (paso 1) se desplegó el 2026-10-07 en el run 71 de `deploy-motor`.

1. **Motor** (push a `main`, CI `deploy-motor.yml`) y panel (Vercel). Sin el motor nuevo, el
   literal del precio lo borraría el Judge y no habría cerrojo.
2. **Config del tenant 7** (merge, nunca reescribir el JSONB):
   ```sql
   UPDATE public.tenant_configs
   SET lead_qualification = lead_qualification || jsonb_build_object(
     'call_gate', jsonb_build_object('require_country', true, 'min_pain_months', 3),
     'allowed_price_text', 'entre 600 y 1.200€'
   )
   WHERE tenant_id = 7
   RETURNING tenant_id, lead_qualification->'call_gate', lead_qualification->>'allowed_price_text';
   ```
3. **Core v7** (compartido, afecta a todos los tenants; sin literal de precio en su coach no les
   cambia nada): `node scripts/load-core-v5.mjs --block core_v5_base --summary "v7: CR2 admite el literal de precio autorizado por el coach" --dry`
   (tiene que decir actual 53201 → nuevo 53473 chars) y después sin `--dry`.
4. **Coach v29**: `node scripts/load-coach-v5-version.mjs --tenant 7 --file prompts/source/coach-v5/tania-duarte-matos.md --version 29 --expect-md5 0a1c69b752a4c8f83353922aa12f0a97 --summary "v29: videollamada, precio, servicio, recursos"`
   (el md5 esperado es el del v28 en BD, con saltos CRLF; si no casa, sacarlo de la BD).
5. **Batería del simulador**: proponer sin país en Instagram (tiene que preguntar), dolor de 6
   semanas sin episodio (no propone), precio una vez (literal 1) y otra (literal 2, sin subir
   fase), "¿sería en casa?" (respuesta corta), propuesta (literal de la videollamada, sin
   "progresión"), un +598 por WhatsApp (cierre 8 directo).

## Carga (2026-10-07, Iván desde Windows con el script)

Los tres pasos en verde: `lead_qualification` del tenant 7 con `call_gate` y `allowed_price_text`
(claves previas conservadas); Core `core_v5_base` (id 32) de 53.201 a 53.473 caracteres, snapshot
v7 (revertir = copiar el v6); coach de Tania (id 36) en v29, md5 en BD
`0d3a666b8e09eec106648fc2c4a95476` (CRLF, 43.529 caracteres), snapshot v29 verificado. Ese md5 es
el `--expect-md5` de la próxima carga (v30). Pendiente: la batería del simulador.

