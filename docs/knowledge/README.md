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
- [Export al Claude de la empresa](project_coach_authoring_export.md) — skill distribuible
  `coach-authoring`. Incluye la **regla dura de exclusión** en entregables al jefe.

### Loops abiertos por coach

- [Alfonso](project_alfonso_coach_feedback.md) — hombres pérdida de peso. Ronda 2026-07-13.
- [Roberto](project_roberto_coach_feedback.md) — hombres +100kg. Ronda 2026-07-13, número de
  Rober **pendiente**. Ojo: hay **dos ficheros del mismo Rober** (una persona, dos sistemas) —
  el vivo en `academia/roberto.md` y el draft del SaaS `source/coach-v5/roberto-cordobilla.md`,
  que va por detrás. Ver la tabla en el [README de academia](../../prompts/coach-engineering/academia/README.md).
- [Frodo](project_frodo_coach_feedback.md) — hombres recomposición, sin emojis ni minúsculas.
- [Chema](project_chema_coach_feedback_loop.md) — Programa Fénix. Llega feedback en `.docx`.
- [Luis Royán — menopausia](project_luis_royan_coach_menopausia.md) — avatar nuevo (el 4º).
  Diseño cerrado, **bloqueado esperando la voz de Luis**.
- [Pepe Jiménez — HYROX](project_pepe_coach_feedback.md) — primer avatar de **OBJETIVO** puro.
  Ronda 1 aplicada 2026-07-25. La llamada la atiende su equipo de admisiones, no él. Trae el
  hallazgo del canal de autoridad por **reconocimiento** (candidato a §30 de la doctrina).
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
