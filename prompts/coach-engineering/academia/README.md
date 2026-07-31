# Coaches de la academia — bloques de trabajo

Bloques `coach_block` de los entrenadores de la **academia**. Se versionan aquí para que
viajen con el repo y para tener historial real: hasta 2026-07-15 vivían sueltos en
`Downloads/` de una sola máquina, con una decena de ficheros `.bak` haciendo de control de
versiones a mano.

## Ojo: esto NO es el SaaS Fyzon

La academia corre sobre **Automatía (n8n + Anthropic)**, no sobre el motor de este repo.
Estos bloques **no** se cargan con `build-coach-v5-seed.mjs`, **no** van a `prompt_blocks`
y **no** siguen la ley de formato `coach_v5` (frontmatter, sub-tags XML, `{{tracked_calendar_url}}`).
Despliega Iván, a mano, en Automatía.

Están aquí por dos razones: son el corpus real donde se practica la craft de
[`prompts/coach-engineering/`](../README.md), y necesitan viajar entre máquinas.

**Trampa conocida — los dos Roberto.** `roberto.md` (aquí) y
[`prompts/source/coach-v5/roberto-cordobilla.md`](../../source/coach-v5/roberto-cordobilla.md)
son **la misma persona**: Roberto Cordobilla, "Rober". Lo que cambia es el sistema, el formato
y — lo que de verdad importa — **la fecha**:

| | `academia/roberto.md` | `source/coach-v5/roberto-cordobilla.md` |
|---|---|---|
| Sistema | Automatía (n8n) — **vivo** | SaaS Fyzon — `status: draft`, nunca seedeado |
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

## Qué hay

| Fichero | Avatar / perfil | Venía de | Estado |
|---|---|---|---|
| [alfonso.md](alfonso.md) | Hombres pérdida de peso | `alfonso_coach.rtf` (antes `coach_block_alfonso_2.0.md`) | Ronda 2026-07-29. ⚠️ **Este fichero va POR DELANTE del `.rtf`**: para desplegar, el bueno es este |
| [roberto.md](roberto.md) | Hombres sobrepeso +100 kg | `coach_block_roberto_3.0.md` | Ronda 2026-07-13. **Número de Rober pendiente** |
| [frodo.md](frodo.md) | Hombres recomposición | `coach_block_frodoo.md` | Ronda 2026-07-29 (señal de compra + banco de preguntas clave) |
| [chema.md](chema.md) | Programa Fénix | `coach_block_chema.txt` | Ronda 2026-06-20 |
| [miguel-aguado.md](miguel-aguado.md) | Mujeres 35-70 pérdida de peso sin dietas (IG outbound, handoff sin enlace) | `coach_block_miguel_aguado.md` | Ronda 1 aplicada 2026-07-31 (escalera de cambio en F4) |
| [andrea.md](andrea.md) | Mujeres | `coach_block_andrea.md` | 2026-07-06 |
| [alex.md](alex.md) | **Escaladores** estancados o lesionados (Escalada Inteligente) — nicho fuera del corpus fitness | — | 2026-07-24. ⚠️ **Formato antiguo** (`# BLOQUE 0…7`, no el esquema `<coach_block>`); sin loop documentado |
| [beatriz-juan.md](beatriz-juan.md) | Madres postparto (mujeres, registro afectivo) | `victor_beatriz_coach.rtf` | Ronda 1 aplicada 2026-07-28. **Lleva un override de §19 que hay que enseñarle a Rubén antes de desplegar** |
| [luis-royan.md](luis-royan.md) | Mujeres menopausia (4º avatar) | diseño desde cero + `luis_coach.rtf` | **Desbloqueado 2026-07-28** (llegó su voz). 2 rondas aplicadas. Pendiente: cadencia de emojis + smoke |
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

Y la craft para tocarlos (doctrina §1–§29, avatares, checklist) en
[`prompts/coach-engineering/`](../README.md). El
[estándar mínimo](../../../docs/knowledge/feedback_coach_authoring_baseline.md) dice que se
tiene presente TODO eso al abrir cualquier conversación de coach-authoring. No arrancar de cero.

## Reglas

**Se acabaron los `.bak`.** Git es el backup. Un cambio = un commit con qué cambió y por qué.
No crear `alfonso_2.1.md` ni `frodoo.md`: se edita el fichero y se commitea.

**Nada de credenciales.** Estos bloques llevan enlaces públicos de negocio (Calendly, landings,
posts de Instagram) y eso está bien. Teléfonos personales, tokens o API keys, no. Verificado
limpio al importarlos el 2026-07-15.

**El `core_block` de la academia no entra aquí.** Está en `.gitignore` a propósito: el CORE de
la academia es de Automatía y versionarlo crearía una segunda fuente de verdad frente al
`core_v5` de este repo. Ver [`docs/knowledge/project_academia_core_overhaul.md`](../../../docs/knowledge/project_academia_core_overhaul.md).
