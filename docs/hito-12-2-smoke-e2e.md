# Smoke E2E — Hito 12.2 Fase E (Nombre del lead + Filtro género)

> **Objetivo**: validar que las Fases A→D del Hito 12.2 funcionan end-to-end con datos reales antes de cerrar el hito y exponer la feature a tenants productivos (Pablo, María Lluc).
>
> **Tenant objetivo**: `ivan-dev` (id=3) — entorno de desarrollo de Iván, ya tiene `coach_v5` activo y 9 leads previos.
>
> **No usar**: `fyzon-dev` (id=1) sin coach v5, no compone; `montefit` (id=2) si no quieres tocar el setup de María Lluc.
>
> **Duración estimada**: 30-45 min para los 7 escenarios.

## Pre-requisitos

Antes de empezar:

1. **Motor corriendo**. Idealmente en VPS productivo apuntando a Supabase `ppujrqxiizgfqclbuxet`. Si pruebas en local, `pnpm --filter @fyzon/motor-agente dev` + asegúrate que el webhook esté tunelado (ngrok / cloudflared) y configurado en el provider.
2. **Panel corriendo** (`pnpm --filter @fyzon/panel dev` o producción) para tocar `/settings/preferences` del tenant `ivan-dev`.
3. **Canal activo en `ivan-dev`** con `is_active=true` en `channels`. Comprueba qué provider tienes:
   ```sql
   SELECT id, channel_type, via_provider, is_active FROM channels WHERE tenant_id=3 AND is_active=true;
   ```
   El smoke funciona igual con cualquier provider (ManyChat IG/WA o YCloud WA). Usa el que tengas activo.
4. **Cuenta de prueba como lead**: una cuenta IG / WhatsApp distinta de la del trainer, con un nombre identificable (ej. tu cuenta personal vs trainer-test).
5. **Acceso MCP supabase-fyzon** disponible en esta sesión (lo está). Sirve para inspeccionar el estado de la BD en cada escenario.
6. **Acceso a logs del motor**. Ejemplos de comandos según deploy:
   - VPS: `ssh motor "tail -f /var/log/setters-ia-motor.log"` (ajusta path).
   - Local: ya verás los logs en la terminal donde corre `pnpm dev` del motor.

## Setup baseline — antes de cada escenario

Antes de cada escenario reseteamos las 4 keys del trainer + limpiamos el lead de prueba.

### A. Reset preferencias trainer

Por panel:
1. Abre `/settings/preferences` impersonado como `ivan-dev`.
2. Card "Nombre del lead": `Modo de uso = Automático`, `Tope = 2`.
3. Card "Público objetivo": `Mixto`.
4. Guarda.

O vía MCP (más rápido para iterar):
```sql
UPDATE public.trainer_preferences
SET preferences = preferences
  || jsonb_build_object(
       'useLeadNameMode', 'auto',
       'leadNameMaxMentions', 2,
       'targetClientGender', 'mixed',
       'genderVerificationStyle', 'soft'
     )
WHERE tenant_id = 3
RETURNING tenant_id, preferences -> 'useLeadNameMode' AS mode,
                     preferences -> 'leadNameMaxMentions' AS max_mentions,
                     preferences -> 'targetClientGender' AS gender,
                     preferences -> 'genderVerificationStyle' AS style;
```

Tras esto el bloque `trainer_prefs_v1` se regenera la próxima vez que se compone el prompt — el motor ya lee la versión actual del JSONB en cada turno (no requiere bumping manual).

### B. Borrar lead de prueba previo (si reutilizas la misma cuenta)

Para que el escenario empiece en F0 limpio, borra el lead + conversación previa del test:

```sql
-- Sustituye EXT_ID por el external_id de la cuenta de prueba (ManyChat subscriber_id, YCloud wa_id, etc.)
WITH target AS (
  SELECT id FROM leads WHERE tenant_id=3 AND external_id='EXT_ID'
)
DELETE FROM conversation_messages WHERE conversation_id IN
  (SELECT id FROM conversations WHERE lead_id IN (SELECT id FROM target));
DELETE FROM conversations WHERE lead_id IN (SELECT id FROM target);
DELETE FROM leads WHERE id IN (SELECT id FROM target);
```

> **Tip**: si no quieres borrar, en lugar de reset puedes resetear SOLO la inferencia para forzar re-detect:
> ```sql
> UPDATE leads
> SET parsed_name=NULL, parsed_name_status=NULL, detected_gender=NULL, name_gender_detected_at=NULL
> WHERE tenant_id=3 AND external_id='EXT_ID';
> ```

---

## Escenario 1 — Nombre legible + modo automático

**Hipótesis**: lead con `firstName='Andrea'` debe ser detectado como `usable`, el setter usa "Andrea" máximo 2 veces.

### Setup
- Preferencias baseline (mode=auto, maxMentions=2, gender=mixed).
- Lead de prueba con **firstName legible** en el provider. Configura tu cuenta IG/WA con `Andrea Martínez` (o similar nombre humano) antes de enviar el primer mensaje.

### Acción
Como lead, envía mensaje inicial al setter (ej. "Hola, vi tu publicación, me interesa").

### Verificación inmediata (1-2 min tras el envío)

**1. Inferencia persistida**:
```sql
SELECT id, first_name, username, parsed_name, parsed_name_status, detected_gender, name_gender_detected_at
FROM leads
WHERE tenant_id=3 AND external_id='EXT_ID';
```
Esperado:
- `parsed_name = 'Andrea'`
- `parsed_name_status = 'usable'`
- `detected_gender = 'female'`
- `name_gender_detected_at` reciente (< 1 min).

**2. Mensajes del setter**:
```sql
SELECT id, source, content, sent_at
FROM conversation_messages
WHERE conversation_id = (
  SELECT id FROM conversations WHERE tenant_id=3 AND lead_id=(
    SELECT id FROM leads WHERE tenant_id=3 AND external_id='EXT_ID'
  ) ORDER BY id DESC LIMIT 1
)
ORDER BY id;
```
Esperado: el primer mensaje del setter (source='ai') menciona "Andrea" 0 o 1 vez.

### Continuar conversación (3-5 turnos)
Sigue interactuando como lead normalmente: responde a sus preguntas con frases naturales sobre tu objetivo, contexto, etc.

### Verificación al cabo de la conversación

**Conteo manual de menciones de "Andrea"**:
```sql
SELECT
  source,
  string_agg(content, ' || ' ORDER BY id) AS all_messages,
  -- count word-boundary insensitive a mayúsculas, similar a V19
  (SELECT COUNT(*) FROM regexp_matches(
    lower(string_agg(content, ' ' ORDER BY id)),
    '(?<![\p{L}\p{N}])andrea(?![\p{L}\p{N}])',
    'g'
  )) AS andrea_count
FROM conversation_messages
WHERE source='ai'
  AND conversation_id = (SELECT id FROM conversations WHERE tenant_id=3 AND lead_id=(SELECT id FROM leads WHERE tenant_id=3 AND external_id='EXT_ID') ORDER BY id DESC LIMIT 1)
GROUP BY source;
```

**Criterio PASS**:
- `andrea_count ≤ 2` en TODA la conversación (incluye saludo + un momento clave).
- Setter NO escribe el nombre cada turno (espaciado natural).

**Criterio FAIL si**:
- `andrea_count > 2` → V19 está cableado pero el modelo abusa. Revisar logs del motor por `[validator] V19` para ver si se logueó warn. Si V19 dispara repetidamente sin retry, **el sistema está funcionando como diseñado** (warn-only) — la decisión es si en Sprint posterior subir a retry.
- Setter nunca menciona el nombre → revisar `parsed_name_status` (puede haber salido `not_usable` por configuración del provider).

### Logs a buscar (motor)
```
grep -E "lead-inference|parsed_name" /var/log/motor.log
grep -E "V19" /var/log/motor.log
```
Esperado en `lead-inference`: log con `name_status='usable'`, `gender='female'`.

---

## Escenario 2 — Handle garbage + modo automático

**Hipótesis**: lead con username tipo `user12345` y firstName vacío debe quedar `not_usable`, el setter NO menciona nombre alguno.

### Setup
- Preferencias baseline.
- Lead de prueba con username tipo `user2381` o `xx_test_xx` y **sin firstName configurado** en el provider.
- Limpieza del lead previo (paso B del baseline).

### Acción
Envía mensaje inicial.

### Verificación
```sql
SELECT first_name, username, parsed_name, parsed_name_status, detected_gender
FROM leads WHERE tenant_id=3 AND external_id='EXT_ID';
```
Esperado:
- `parsed_name = NULL`
- `parsed_name_status = 'not_usable'` (o `'usable'` si Haiku fallback recuperó algún nombre dentro del handle — ambos son aceptables, lo verás en `detected_gender` si hay nombre extraído).
- `detected_gender = 'unknown'` (si status≠usable, el motor no llama detect-gender).

### Criterio PASS
- En 5+ turnos del setter, ningún mensaje del setter contiene el username literal (`user2381` no aparece).
- Ningún mensaje del setter inventa un nombre random.
- El setter se dirige al lead de forma neutra ("¿qué tal?", "cuéntame", sin "hola X").

### Criterio FAIL
- El setter escribe `user2381` o cualquier handle literal → bug en composer (verifica que `buildLeadAddressingDirective` devuelve la directiva "no menciones nombre" cuando status='not_usable').

---

## Escenario 3 — Modo never (no menciones aunque haya nombre)

**Hipótesis**: aunque el lead tenga `firstName='Andrea'`, el setter no menciona el nombre.

### Setup
- En `/settings/preferences`, Card "Nombre del lead" → `Modo de uso = Nunca`.
- Lead con firstName legible (Andrea Martínez o equivalente).
- Borra lead previo.

### Acción
Mensaje inicial + 3-4 intercambios normales.

### Verificación

```sql
SELECT parsed_name, parsed_name_status FROM leads WHERE tenant_id=3 AND external_id='EXT_ID';
```
Esperado: `parsed_name = 'Andrea'`, status `usable` (la inferencia se ejecuta igual — es el composer quien decide no usarlo).

### Criterio PASS
- Ningún mensaje del setter (source='ai') contiene "Andrea".
- El setter saluda y se dirige a la persona de forma neutra ("hola, ¿qué tal?").

### Criterio FAIL
- El setter menciona "Andrea" aunque sea 1 vez → bug en `buildLeadAddressingDirective` (verifica que la directiva inyectada al `core_v5_base` empieza con "NO debes mencionar el nombre del lead").

---

## Escenario 4 — Modo always con handle (asume el handle como nombre)

**Hipótesis**: aunque el handle parezca garbage, si modo=`always`, el setter intenta usarlo.

### Setup
- `/settings/preferences` → Card "Nombre del lead" → `Modo = Siempre`, `Tope = 2`.
- Lead con username "Andrea_Mart" o "andrea123" (handle con nombre dentro).
- Borra lead previo.

### Acción
Mensaje inicial + 3-4 turnos.

### Verificación
```sql
SELECT parsed_name, parsed_name_status FROM leads WHERE tenant_id=3 AND external_id='EXT_ID';
```
Esperado: status puede ser `'not_usable'` (heurística rechaza por números) pero el composer, al ver modo='always', emite una directiva alternativa (probable degradación a "no inventes nombre si no hay dato").

### Criterio PASS (caso A — Haiku recuperó el nombre)
- `parsed_name = 'Andrea'`, status `usable` post-Haiku fallback.
- Setter usa "Andrea" hasta 2 veces.

### Criterio PASS (caso B — Haiku no estaba o no recuperó)
- Si `parsed_name=null`, el composer emite "no inventes nombre, dirige neutro" → setter no menciona nombre. **Esto es comportamiento aceptable** del modo always cuando la heurística no puede extraer nada. Documenta cuál de los 2 caminos tomó.

### Criterio FAIL
- El setter escribe el handle literal `andrea123` → bug en composer.

---

## Escenario 5 — Filtro género `target=male` + lead femenino (mismatch)

**Hipótesis**: el setter introduce pregunta de verificación en F1, no en F0.

### Setup
- `/settings/preferences` → Card "Público objetivo" → `Hombres`, `Estilo = Suave (recomendado)`.
- Lead con firstName legible femenino (`Andrea Martínez`, `María Pérez`).
- Borra lead previo.

### Acción
1. Envía saludo inicial como lead ("hola, vi tu reel").
2. Tras la respuesta del setter (que será un saludo de F0 sin pregunta de género), envía un segundo mensaje natural ("estoy buscando ponerme en forma").
3. La siguiente respuesta del setter debe contener la pregunta de verificación (F1).

### Verificación

**Lead detectado correctamente**:
```sql
SELECT parsed_name, parsed_name_status, detected_gender FROM leads WHERE tenant_id=3 AND external_id='EXT_ID';
```
Esperado: `parsed_name='Andrea'`, status `usable`, `detected_gender='female'`.

**Verificar fase de cada turno**:
```sql
SELECT cm.id, cm.source, cm.content, cm.sent_at, c.phase_number
FROM conversation_messages cm
JOIN conversations c ON c.id = cm.conversation_id
WHERE c.tenant_id=3 AND c.lead_id=(SELECT id FROM leads WHERE tenant_id=3 AND external_id='EXT_ID')
ORDER BY cm.id;
```

### Criterio PASS
- Mensaje del setter en **F0** (saludo inicial) NO contiene pregunta sobre familiar/pareja.
- Mensaje del setter en **F1** (tras primer intercambio) SÍ contiene una variante natural de "¿es para ti o para algún familiar/pareja/cercano?".
- El estilo es **suave**: NO menciona explícitamente "trabajo solo con hombres".

### Criterio FAIL
- La pregunta aparece en F0 → bug en el prompt o el modelo no respetó la directiva (revisa el system prompt compuesto vía logs si tienes algún dump).
- La pregunta nunca aparece → revisa que `extraSystemSuffix` se construyó correctamente (logs motor con grep `genderVerificationDirective`).
- La pregunta menciona "trabajo solo con hombres" → debería ser modo `direct`, no `soft`. Verifica preferencia.

### Variante 5b — Estilo `direct`
Repite con `Estilo = Directa`. Esperado: la pregunta del F1 incluye explícitamente "el programa es solo para hombres" o similar.

---

## Escenario 6 — Filtro género `target=male` + lead masculino (sin mismatch)

**Hipótesis**: cuando el género detectado coincide con target, NO se introduce pregunta de verificación.

### Setup
- Preferencias: `target=Hombres`, `estilo=soft`.
- Lead con firstName masculino legible (`Carlos`, `Pablo`, `David`).
- Borra lead previo.

### Acción
Conversación normal 3-4 turnos.

### Verificación
```sql
SELECT detected_gender FROM leads WHERE tenant_id=3 AND external_id='EXT_ID';
```
Esperado: `detected_gender = 'male'`.

### Criterio PASS
- Ningún mensaje del setter (en F0, F1, ni siguientes) contiene la pregunta de verificación.
- Flujo de cualificación normal.

### Criterio FAIL
- El setter pregunta por familiar/pareja igualmente → bug en `buildGenderVerificationDirective` (debería devolver null cuando target==detected).

---

## Escenario 7 — V19 warn por exceso de menciones

**Hipótesis**: si el setter menciona el nombre del lead más de `leadNameMaxMentions` en total (turno actual + historial), V19 emite warn en logs (NO retry — solo log).

### Setup
- `/settings/preferences` → Card "Nombre del lead" → `Modo = Automático`, `Tope = 1` (muy bajo para forzar warn).
- Lead con firstName legible (`Andrea`).
- Borra lead previo.

### Acción
Conversación de 4-5 turnos. El primer turno del setter probablemente saluda con "Andrea" — ya consume el cap. Si el setter en algún turno posterior repite "Andrea", se dispara V19.

### Verificación

**Logs motor**:
```bash
grep -E "ruleId.*V19|name overuse" /var/log/motor.log
```

Esperado: aparición de log con `ruleId: 'V19'`, `severity: 'warn'`, descripción tipo `El nombre "Andrea" se mencionó N veces (tope 1, exceso N-1). Este turno aporta M.`

### Criterio PASS
- V19 aparece en logs al menos 1 vez cuando el setter excede.
- El mensaje del setter **se envía igual** al lead (warn-only, no bloquea).
- El sistema NO entra en bucle de retry (revisa que no haya múltiples llamadas Generator en el mismo turno).

### Criterio FAIL
- V19 nunca aparece → el motor no está pasando `leadParsedName` o `leadNameMaxMentions` al `validationContext`. Revisa con:
  ```sql
  SELECT
    cm.id, cm.content,
    (SELECT count(*) FROM regexp_matches(lower(cm.content), '(?<![\p{L}\p{N}])andrea(?![\p{L}\p{N}])', 'g')) AS andrea_count_in_turn
  FROM conversation_messages cm
  WHERE cm.conversation_id = (SELECT id FROM conversations WHERE tenant_id=3 AND lead_id=(SELECT id FROM leads WHERE tenant_id=3 AND external_id='EXT_ID') ORDER BY id DESC LIMIT 1)
    AND cm.source='ai'
  ORDER BY cm.id;
  ```
  Si la suma de `andrea_count_in_turn` > 1 y no hubo V19 warn, hay bug.
- El sistema reintenta (Generator llamado 2x en el mismo turno) → bug: V19 debe ser warn-only, no retry. Revisa `pipeline.ts` por si alguien metió un branch retry V19.

---

## Cleanup post-smoke

Tras terminar todos los escenarios:

### Resetear preferencias trainer
```sql
UPDATE public.trainer_preferences
SET preferences = preferences
  || jsonb_build_object(
       'useLeadNameMode', 'auto',
       'leadNameMaxMentions', 2,
       'targetClientGender', 'mixed',
       'genderVerificationStyle', 'soft'
     )
WHERE tenant_id = 3
RETURNING preferences;
```

### Opcional: borrar leads de prueba
```sql
WITH targets AS (
  SELECT id FROM leads WHERE tenant_id=3 AND external_id IN ('EXT_ID_1', 'EXT_ID_2', '...')
)
DELETE FROM conversation_messages WHERE conversation_id IN
  (SELECT id FROM conversations WHERE lead_id IN (SELECT id FROM targets));
DELETE FROM conversations WHERE lead_id IN (SELECT id FROM targets);
DELETE FROM leads WHERE id IN (SELECT id FROM targets);
```

---

## Troubleshooting

### El setter sigue mencionando el nombre aunque puse `mode=never`
1. Verifica que el panel guardó: `SELECT preferences -> 'useLeadNameMode' FROM trainer_preferences WHERE tenant_id=3;` debe devolver `'never'`.
2. Verifica que el bloque `trainer_prefs_v1` se regeneró: el motor lee del JSONB cada turno, pero el bloque markdown también se actualiza al guardar el form. Si tocaste el JSONB por MCP, fuerza la regeneración guardando algo en el panel.
3. Inspecciona el system prompt en runtime (si tienes logs detallados): debe contener "NO debes mencionar el nombre del lead".

### `parsed_name_status` siempre devuelve `unknown`
1. Verifica que el provider envía `firstName` / `username` en el payload. Mira logs del webhook:
   ```bash
   grep -E "lead.*payload|upsertLead.*input" /var/log/motor.log
   ```
2. Si el payload llega vacío, es problema del provider config (ManyChat Custom Fields, GHL contact enrichment, etc.) — no del Hito 12.2.

### V19 dispara warn pero el setter sigue abusando del nombre
**Comportamiento esperado**. V19 es warn-only por design (Fase D). Si en producción ves esto recurrente, hay 3 caminos:
1. Ajustar la directiva del placeholder `{{lead_addressing_directive}}` en `core_v5_base` con frases más firmes.
2. Reforzar la frase del modo en `buildLeadAddressingDirective` (composer).
3. Upgrade V19 a retry — basta replicar el patrón V17 en `pipeline.ts:runPipeline`.

### Haiku NO se llama nunca (heurística siempre)
1. Verifica `ANTHROPIC_API_KEY` en env del motor.
2. La heurística cubre ~80% de leads. Solo casos con `parsed_name_status='not_usable'` Y hay material aprovechable disparan Haiku. Si tus casos de prueba son obvios (Andrea Martínez puro vs user12345 puro), Haiku NO se llama porque la heurística ya resuelve.

### El bloque `trainer_prefs_v1` no se actualizó tras cambiar las prefs por panel
1. Verifica que `saveTrainerPreferences` se ejecutó sin error (consola panel).
2. Inspecciona el row:
   ```sql
   SELECT length(content), updated_at FROM prompt_blocks
   WHERE tenant_id=3 AND block_key='trainer_prefs_v1' AND is_active=true;
   ```
3. Si `updated_at` es viejo, el problema está en el panel (action `saveTrainerPreferences` o `regenerateTrainerPrefsBlock`). Si está reciente pero el setter no respeta, el motor está usando cache — reinicia el motor para limpiar el prompt-composer cache.

---

## Cierre del Hito 12.2

Tras pasar los 7 escenarios sin FAIL:

1. **Update `CLAUDE.md` proyecto**: en la tabla de fases del Hito 12.2, cambia "Fase E — Smoke" de `Pendiente` a `✅ <fecha>` con notas de cualquier ajuste hecho durante smoke.
2. **Update `MEMORY.md` proyecto**: marca el hito como cerrado.
3. **Considera promover a producción**: si quieres exponer la feature a Pablo (tenant productivo), no hay migración adicional — los defaults sanos del schema v8 hacen que Pablo siga funcionando como hasta ahora (`mode='auto'`, `gender='mixed'`) hasta que él decida configurar sus preferencias.

Si algún escenario falla, **NO cerrar el hito** — abrir un sub-sprint para arreglar la pieza específica y re-correr el smoke.
