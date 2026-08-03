# Coaches de la academia — bloques de trabajo

Bloques `coach_block` de los entrenadores de la **academia**. Se versionan aquí para que
viajen con el repo y para tener historial real: hasta 2026-07-15 vivían sueltos en
`Downloads/` de una sola máquina, con una decena de ficheros `.bak` haciendo de control de
versiones a mano.

## Ojo: esto NO es el SaaS Fyzon

La academia corre sobre **Automatía**, no sobre el motor de este repo.
Estos bloques **no** se cargan con `build-coach-v5-seed.mjs`, **no** van a `prompt_blocks`
y **no** siguen la ley de formato `coach_v5` (frontmatter, sub-tags XML, `{{tracked_calendar_url}}`).

> **Qué es Automatía (corregido por Iván, 2026-07-31).** Una herramienta propia **hecha con
> código**, no n8n. Versiones anteriores de este README y de la memoria decían "Automatía (n8n +
> Anthropic)" — **era falso**. Dos consecuencias prácticas: (1) **ya cachea el prompt**, así que
> el bloque es prefijo estable y su tamaño no se paga entero en cada turno; (2) el vocabulario de
> parada que consume es `manual_attention` + `skip_reply`, no el contrato del SaaS (doctrina §30).
Despliega Iván, a mano, en Automatía.

Están aquí por dos razones: son el corpus real donde se practica la craft de
[`prompts/coach-engineering/`](../README.md), y necesitan viajar entre máquinas.

**Trampa conocida — los dos Roberto.** `roberto.md` (aquí) y
[`prompts/source/coach-v5/roberto-cordobilla.md`](../../source/coach-v5/roberto-cordobilla.md)
son **la misma persona**: Roberto Cordobilla, "Rober". Lo que cambia es el sistema, el formato
y — lo que de verdad importa — **la fecha**:

| | `academia/roberto.md` | `source/coach-v5/roberto-cordobilla.md` |
|---|---|---|
| Sistema | Automatía — **vivo** | SaaS Fyzon — `status: draft`, nunca seedeado |
| Formato | `<coach_block>` XML | `coach_v5` (frontmatter + sub-tags) |
| Viene de | `coach_block_roberto_3.0.md` | `coach_block_roberto.txt` (junio) |
| Última ronda | **2026-07-13** (agendamiento método Andrea) | 2026-06-18 (reunión Rubén) |

**El draft del SaaS va por detrás**: es la reconciliación v2 de la reunión de Rubén y **no
lleva la ronda del método Andrea** (pedir WhatsApp, sin Calendly). Si algún día se seedea tal
cual, se despliega un Rober desactualizado. Su `tenant_slug` sigue en `[PENDIENTE]` y su propio
frontmatter avisa: *"TESTEAR antes de seedear (plan: Roberto primero → si mejora, propagar a Alfonso)"*.

> Nota de corrección (2026-07-15): la primera versión de este README afirmaba que eran "dos
> personas distintas". **Era falso** — se dedujo de una nota de memoria que decía "distinto del
> roberto-cordobilla.md" queriendo decir *otro fichero*, no *otra persona*. Verificado contra
> ambos ficheros: los dos son Roberto Cordobilla.

## El mismo coach en los dos sistemas — mapa (2026-07-30)

Roberto no es un caso aislado: **tres entrenadores existen a la vez en academia y en el SaaS**.
En los tres, la versión del SaaS va POR DETRÁS. La regla, hasta nuevo aviso:

> **La versión viva y corregida de estos tres es la de `academia/`. La de `source/coach-v5/` es
> un borrador anterior a las rondas de feedback. No seedear sin portar las rondas primero.**

| Entrenador | `academia/` (Automatía, XML) | `source/coach-v5/` (SaaS) | Qué le falta al del SaaS |
|---|---|---|---|
| Roberto Cordobilla | `roberto.md` — ronda 2026-07-13 | `roberto-cordobilla.md` — 2026-06-18 | la ronda del método Andrea (pedir WhatsApp, sin Calendly) |
| Beatriz Juan | `beatriz-juan.md` — ronda 1, 2026-07-28 | `beatriz-juan.md` — 2026-07-20 | **el bloque de método** que la ronda 1 le devolvió (0 apariciones vs 6) |
| Pepe Jiménez | `pepe.md` — rondas 1 y 2, 25 y 27-jul | `pepe-jimenez.md` — 2026-07-20 | ⚠️ **los dos fallos P0**: dice "una videollamada tú y yo" (la atiende su equipo de admisiones) y no lleva la regla de precio |

⚠️ **`schema/v1/seeds/012-coach-v5-pepe-jimenez.sql` está compilado de esa versión con los dos
fallos P0.** Lleva un aviso en cabecera. Aplicarlo tal cual desplegaría a un cliente real el
comportamiento que su propio equipo marcó como riesgo de marca. Verificado por grep el
2026-07-30.

Por qué pasa: son dos pipelines distintos con dos ritmos distintos. El feedback de los
entrenadores entra por academia (que es donde están desplegados), y el port al `coach_v5` del
SaaS se hizo una vez, el 20 de julio, y no se ha vuelto a sincronizar. **Al aplicar una ronda a
un coach que existe en los dos sitios, decidir explícitamente si se porta o se anota la deuda** —
y si se anota, que quede en su loop de `docs/knowledge/`.

## Qué hay

| Fichero | Avatar / perfil | Venía de | Estado |
|---|---|---|---|
| [alfonso.md](alfonso.md) | Hombres pérdida de peso | `alfonso_coach.rtf` (antes `coach_block_alfonso_2.0.md`) | Ronda 2026-07-31b (`<coach_discovery_gate>` = suelo de 4 elementos antes de F5 + preámbulo repartido en el esquema + parada = `manual_attention` + `skip_reply`). ⚠️ **Este fichero va POR DELANTE del `.rtf`**: para desplegar, el bueno es este |
| [roberto.md](roberto.md) | Hombres sobrepeso +100 kg | `coach_block_roberto_3.0.md` | Ronda 2026-07-13. **Número de Rober pendiente** |
| [frodo.md](frodo.md) | Hombres recomposición | `coach_block_frodoo.md` | Ronda 2026-08-03 (`<coach_discovery_gate>` = suelo de 5 elementos en lugar del tope de 2 preguntas + preámbulo repartido en el esquema + parada migrada a §30 + sub-tipo E de aporte). ⚠️ Los 3 ejemplos de aporte están **pendientes de validar con Frodo** |
| [chema.md](chema.md) | Programa Fénix | `coach_block_chema.txt` | Ronda 2026-06-20 |
| [miguel-aguado.md](miguel-aguado.md) | Mujeres 35-70 pérdida de peso sin dietas (IG outbound, handoff sin enlace) | `coach_block_miguel_aguado.md` | Ronda 1 aplicada 2026-07-31 (escalera de cambio en F4) |
| [andrea.md](andrea.md) | Mujeres | `coach_block_andrea.md` | 2026-07-06 |
| [alex.md](alex.md) | **Escaladores** estancados o lesionados (Escalada Inteligente) — nicho fuera del corpus fitness | — | 2026-07-24. ⚠️ **Formato antiguo** (`# BLOQUE 0…7`, no el esquema `<coach_block>`); sin loop documentado |
| [beatriz-juan.md](beatriz-juan.md) | Madres postparto (mujeres, registro afectivo) | `victor_beatriz_coach.rtf` | Ronda 1 aplicada 2026-07-28. **Lleva un override de §19 que hay que enseñarle a Rubén antes de desplegar** |
| [luis-royan.md](luis-royan.md) | Mujeres menopausia (4º avatar) | diseño desde cero + `luis_coach.rtf` | **Ronda 2026-07-31**: 5 tandas de feedback, reescrito a v3 (precheck R1-R8 + conversación dorada + banco de movimientos). ⚠️ Lo desplegado era una **copia truncada** sin el preámbulo: pegar SIEMPRE desde aquí. Pendiente: smoke contra la conversación del 30-jul |
| [pepe.md](pepe.md) | HYROX / rendimiento híbrido (avatar de OBJETIVO) | bloque desplegado en Automatía | Ronda 1 aplicada 2026-07-25. **Duración del programa + corpus de voz pendientes** |
| [DIRECTIVAS_OPERATIVAS_POR_NICHO_v1.md](DIRECTIVAS_OPERATIVAS_POR_NICHO_v1.md) | 7 nichos × DN-01..06 (doc de Rubén) | igual | Menopausia = §7, base de Luis Royán |

Sin Frodo ni Chema ni Alfonso hay notas de estilo/voz que solo viven en sus loops: leer
siempre el loop del coach antes de tocar su bloque.

## El estado de cada loop vive aparte

Qué se cambió, por qué y qué quedó abierto está en `docs/knowledge/`, no aquí:
[Alfonso](../../../docs/knowledge/project_alfonso_coach_feedback.md) ·
[Roberto](../../../docs/knowledge/project_roberto_coach_feedback.md) ·
[Frodo](../../../docs/knowledge/project_frodo_coach_feedback.md) ·
[Chema](../../../docs/knowledge/project_chema_coach_feedback_loop.md) ·
[Luis Royán](../../../docs/knowledge/project_luis_royan_coach_menopausia.md) ·
[Pepe](../../../docs/knowledge/project_pepe_coach_feedback.md) ·
[Beatriz](../../../docs/knowledge/project_beatriz_coach_feedback.md) ·
[Miguel Aguado](../../../docs/knowledge/project_miguel_coach_feedback.md)

Y la craft para tocarlos (doctrina §1–§30, avatares, checklist) en
[`prompts/coach-engineering/`](../README.md). El
[estándar mínimo](../../../docs/knowledge/feedback_coach_authoring_baseline.md) dice que se
tiene presente TODO eso al abrir cualquier conversación de coach-authoring. No arrancar de cero.

## Reglas

**Se acabaron los `.bak`.** Git es el backup. Un cambio = un commit con qué cambió y por qué.
No crear `alfonso_2.1.md` ni `frodoo.md`: se edita el fichero y se commitea.

**Para parar una conversación: `manual_attention` + `skip_reply` (motivo: `<causa>`), siempre los dos.**
Nunca `handoff_to_human` ni etiquetas de tipo (Tipo A/B/C/D, "Causa F") — ese vocabulario es del SaaS Fyzon y
Automatía no lo consume, así que el bloque describe una pausa que el runtime no ejecuta. Regla completa y la
frontera con el SaaS en [doctrina §30](../doctrina-universal.md). Referencia bien hecha: `andrea.md`.
Estado de la migración: ✅ `andrea.md`, ✅ `alfonso.md`, ✅ `luis-royan.md`, ✅ `frodo.md` · pendientes
`alex.md`, `beatriz-juan.md`, `chema.md`, `miguel-aguado.md` (a medias), `pepe.md`, `roberto.md` — cada uno
en su próxima ronda.

**Nada de credenciales.** Estos bloques llevan enlaces públicos de negocio (Calendly, landings,
posts de Instagram) y eso está bien. Teléfonos personales, tokens o API keys, no. Verificado
limpio al importarlos el 2026-07-15.

**El `core_block` de la academia no entra aquí.** Está en `.gitignore` a propósito: el CORE de
la academia es de Automatía y versionarlo crearía una segunda fuente de verdad frente al
`core_v5` de este repo. Ver [`docs/knowledge/project_academia_core_overhaul.md`](../../../docs/knowledge/project_academia_core_overhaul.md).
