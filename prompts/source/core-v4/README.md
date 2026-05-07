# Core v4 — IA Setter Conversacional Fyzon (REORGANIZADO 2026-05-07)

> Este directorio contiene los archivos fuente del **Cerebro del Setter** (antes "Core") y los **6 archivos de fase** que componen el prompt-sistema universal compartido por todo trainer Fyzon. La **Información sobre la empresa** (antes "Coach") vive en `prompts/source/coach-v4/`. El script `scripts/build-core-v4-seed.mjs` (pendiente de crear) genera `schema/v1/seeds/007-core-v4-blocks.sql`.

## Origen de la versión

- **Plan vigente**: `~/.claude/plans/c-users-sotob-downloads-prompt-ejemplo-quirky-puffin.md` (reorganizado 2026-05-07).
- **Reunión equipo Fyzon 2026-05-06** (132 min, transcripción en `Downloads/Transcripción reunión equipo.md`).
- **Mini bloque de Rubén**: estructura final aprobada por el equipo. Reemplaza la propuesta XML que circulaba como referencia inicial.
- **Co-redacción** Iván ↔ Claude Code, con reciclaje del contenido firmado en la primera iteración (Secciones 1-6, backup en `_legacy/`).

## Arquitectura final del v4 (D43–D52)

### Cerebro del Setter — `core-v4/` (este directorio)

El **Cerebro del Setter** es el bloque universal compartido por todo trainer. Se compone de:

- **6 sub-bloques** (todos en `01-role.md`, un solo `block_key=core_v4_base`):
  1. Identidad — quién eres y qué haces
  2. Propósito — por qué existes
  3. Tareas — cuándo y cómo se utilizan las instrucciones (modelo mental + lentes)
  4. Reglas — Críticas (inviolables) + Condicionales (operativas) + Jerarquía de decisión
  5. Objetivos — los 3 criterios universales de cualificación
  6. Resultado esperado — éxito vs no éxito + handoff causas

- **6 fases** (`02-fase-1.md` … `07-fase-6.md`), cada una con los 5 elementos D49: Objetivo / Estructura / Resultado esperado / Criterio de avance / Cómo actuar ante imprevistos.

- **3 protocolos universales** (`08-objeciones.md`, `09-descualificacion.md`, `10-handoff.md`) — sin ejemplos de wording (D42); solo mecánica + estructura. Las frases concretas y los criterios específicos viven en el Coach.

- **1 contrato de output** (`11-output-contract.md`) — referencia del schema de salida del setter (recomendación Robert OpenAI 4.5/5.4). Implementación real en motor TS con Anthropic SDK + tool_choice forzado.

### Información sobre la empresa para la que trabajas — `coach-v4/`

Plantilla maestra en `coach-v4/_template-coach.md` con 7 sub-bloques:
1. Información del profesional
2. Información del programa y soluciones
3. Cualificación + Descualificación específicas
4. Lenguaje y tono (20 frases ejemplo + emojis + inicios)
5. Mensajes obligatorios por fase (modificables desde la app)
6. Contexto de la conversación (Fase 0 — bienvenida / lead magnet / inbound)
7. Afectaciones a la estructura

Cada trainer real tiene su propio archivo `coach-v4/<trainer-slug>.md` siguiendo la plantilla.

## Diferencias principales vs Core v3 (D43–D52)

1. **Renombre**: Core → "Cerebro del Setter". Coach → "Información sobre la empresa para la que trabajas". Anclaje cognitivo del modelo (D44).
2. **6 bloques universales** (D43) sustituyen a los ~12 tags XML del v3 / propuesta intermedia.
3. **TEMA PRINCIPAL ÚNICO TRANSVERSAL** sustituye D-vs-P (D35).
4. **Sin bloque NICHO** (D41).
5. **Core agnóstico al estilo** (D42): cero ejemplos de wording / aperturas / repertorio aquí; todo eso vive en Coach.
6. **F0 va al Coach, no aquí** (D45): contexto previo depende del trigger del trainer.
7. **5 elementos por fase** (D49): Objetivo / Estructura / Resultado esperado / Criterio de avance / Cómo actuar ante imprevistos.
8. **Reglas Críticas + Condicionales separadas** (D46).
9. **6 reglas absolutas anti-derivación-médica** (D47) en Reglas Críticas: nunca urgencias / teléfonos / rol de profesional de salud / minimizar / ignorar / alarmar.
10. **Cualificación general baja al Coach** (D48): aquí solo los 3 criterios universales.
11. **Handoff doble capa** (D51): universal aquí + específico del trainer en Coach.
12. **Conectores XML al final** (D52): primero contenido, luego nomenclatura para producción.
13. **F4 con pregunta omitible** (D50): si el lead ya verbalizó que necesita ayuda, no se vuelve a preguntar.
14. **Sin TIPO 1/TIPO 2/50-50** (decisión reunión Rubén l.209).
15. **Sin "introducciones variadas" como regla** (D39.7): se mueven al Coach.
16. **Validación SÍ, "te entiendo" literal NO** (D36): la doctrina vive en Reglas Críticas; las frases concretas en Coach.

## Mapeo archivo → block_key (Supabase)

| Archivo | block_key | Status |
|---|---|---|
| `01-role.md` | `core_v4_base` | reciclado parcial (4/6 bloques con contenido, 2/6 stubs) |
| `02-fase-1.md` | `fase_1_v4` | clean — firmada 2026-05-07 |
| `03-fase-2.md` | `fase_2_v4` | clean — firmada 2026-05-07 |
| `04-fase-3.md` | `fase_3_v4` | clean — firmada 2026-05-07 |
| `05-fase-4.md` | `fase_4_v4` | clean — firmada 2026-05-07 (con RC6 pregunta omitible) |
| `06-fase-5.md` | `fase_5_v4` | clean — firmada 2026-05-07 |
| `07-fase-6.md` | `fase_6_v4` | clean — firmada 2026-05-07 |
| `08-objeciones.md` | `objeciones_v4` | clean — firmada 2026-05-07 (RAM universal sin frases) |
| `09-descualificacion.md` | `descualificacion_v4` | clean — firmada 2026-05-07 (cierre cálido + Express) |
| `10-handoff.md` | `handoff_v4` | clean — firmada 2026-05-07 (causas A/B/C/D + R10–R15 D47) |
| `11-output-contract.md` | `output_contract_v4` | clean — firmada 2026-05-07 (schema con `tema_principal_identificado` + `objetivo_cuantificado`) |

## Status de redacción del Cerebro del Setter (`01-role.md`)

| # | Sub-bloque | Status | Aprobado por Iván | Origen |
|---|---|---|---|---|
| 1 | Identidad | clean (reciclado) | 2026-05-07 (firma original `<role>`) | Reciclado literal |
| 2 | Propósito | clean | 2026-05-07 | Reciclado de `<goal>` (parte 1) |
| 3 | Tareas | clean | 2026-05-07 | Reciclado de `<mental_model>` + `<core_principles>` |
| 4 | Reglas | clean | 2026-05-07 | Reglas Críticas R1–R15 (incluye R10–R15 anti-derivación-médica D47) + Condicionales RC1–RC6 + Jerarquía |
| 5 | Objetivos | clean | 2026-05-07 | Reciclado de `<goal>` (parte 2) |
| 6 | Resultado esperado | clean | 2026-05-07 | Reciclado de `<goal>` (parte 3) + cita causas A/B/C/D |

## Status de redacción de las fases F1–F6

| Fase | Status | Aprobada |
|---|---|---|
| F1 Conexión + Tema | clean | 2026-05-07 |
| F2 Contexto + problema | clean | 2026-05-07 |
| F3 Cualificación | clean | 2026-05-07 |
| F4 Transición + ¿necesita ayuda? omitible | clean | 2026-05-07 |
| F5 Propuesta llamada flexible | clean | 2026-05-07 |
| F6 Envío enlace + cierre | clean | 2026-05-07 |

## Status de redacción de protocolos universales

| Archivo | Status | Aprobada |
|---|---|---|
| `08-objeciones.md` (RAM universal) | clean | 2026-05-07 |
| `09-descualificacion.md` (cierre cálido + Express) | clean | 2026-05-07 |
| `10-handoff.md` (causas A/B/C/D + R10–R15) | clean | 2026-05-07 |
| `11-output-contract.md` (schema con tema + objetivo) | clean | 2026-05-07 |

## Workflow para editar v4

1. Editar archivo `.md` correspondiente (stub o sub-bloque del Cerebro).
2. `node scripts/build-core-v4-seed.mjs` (cuando exista) → regenera `schema/v1/seeds/007-core-v4-blocks.sql`.
3. Revisar `git diff schema/v1/seeds/007-core-v4-blocks.sql`.
4. Aplicar via MCP `supabase-fyzon.apply_migration`.
5. Validar con SELECT.

## Rollback

Si v4 se rompe en producción:
- `UPDATE prompt_blocks SET is_active=TRUE WHERE block_key LIKE '%_v3' AND tenant_id IS NULL;`
- `UPDATE prompt_blocks SET is_active=FALSE WHERE block_key LIKE '%_v4' AND tenant_id IS NULL;`
- El composer carga `WHERE is_active=TRUE`, vuelve a v3 sin redeploy.

## Backup del archivo firmado anterior

`_legacy/01-role-firmado-2026-05-07.md` contiene la versión firmada antes de la reorganización. Conserva el contenido aprobado por Iván de las 6 secciones originales (`<role>`, `<personality_and_tone>`, `<goal>`, `<mental_model>`, `<core_principles>`, `<message_types>`). Sirve de fuente de verdad para el reciclaje en curso.
