---
name: feedback_coach_reglas_dentro_del_esquema
description: "Directiva de Iván (2026-07-25): el feedback nuevo de un coach se traduce DENTRO de la sección canónica del esquema XML que le corresponde, nunca como una capa de 'reglas duras' antepuesta al principio del bloque. Recall al aplicar cualquier ronda de feedback a un coach."
metadata:
  node_type: memory
  type: feedback
---

Al incorporar una ronda de feedback a un bloque coach, **la información nueva se traduce a la
sección canónica que le corresponde dentro del esquema XML**. No se antepone al principio del
bloque como conceptos sueltos ni como un bloque de "REGLAS DURAS".

**Por qué:** un preámbulo de reglas se salta el protocolo del esquema y el modelo pierde la
referencia de dónde vive cada cosa. Traducida dentro, el propio prompt sabe que tiene que seguir
la actualización porque está en la sección que ya consulta para esa decisión.

Iván lo corrigió en la **ronda 1 de Pepe**: se habían puesto 4 reglas duras antes de
`<coach_identity>` en vez de repartirlas por sus secciones. Ver
[[project_pepe_coach_feedback]].

## Cómo aplicar — mapa de destinos

| Lo que llega en el feedback | Dónde va |
|---|---|
| Quién es y quién atiende la llamada | `coach_identity_role` |
| Mecánica de voz, movimientos de tono | `coach_tone_voiceprint` |
| No repetirse | `coach_tone_variety` |
| Comportamiento transversal que modifica el Core (memoria del hilo, prevalencias) | `coach_structural_modifications_core` |
| Condiciones de entrada a una fase y topes | `coach_structural_modifications_phases` |
| Manejo de una objeción | su `## coach_objections_*` |

Si hace falta marcar prevalencia, se dice **dentro** de la sección y se deja un puntero cruzado
desde `_core`. Sub-secciones extra dentro de un wrapper sí valen
(`## coach_objections_logistica`); sub-tags XML fuera de `coach_tone`, no.

**Ojo:** Alfonso y Frodo arrastran marcos rectores antes de `<coach_identity>` — eso es **herencia**,
no el patrón a imitar. **Luis Royán ya no**: en la ronda del 31-jul se disolvió su marco rector
dentro del esquema (ver [[project_luis_royan_coach_menopausia]] §CORRECCIÓN DE IVÁN). Sirve de
plantilla de cómo se hace: el "no repetirse" fue a `coach_tone_variety`, el "esto no es un
interrogatorio" y las cuatro palancas a `coach_structural_modifications_core`, la frase rectora a
`coach_tone_voiceprint` y las zonas a `coach_structural_modifications_phases`.

⚠️ **La misma trampa vale para las capas nuevas que escribes TÚ.** En esa ronda se llegó a crear un
bloque de reglas binarias numeradas al principio, con la excusa de deduplicar prohibiciones repartidas
por siete sitios. El problema que resolvía era real, pero la solución correcta no es una capa nueva
delante: es **enunciar cada regla UNA vez en su sección canónica** y referenciar la sección desde el
resto. Directiva de Iván: *en vez de engordar el bloque con parches por errores que se han ido
cometiendo, hay que saber explicarlo mejor con lo que el bloque ya tiene.* Añadir a veces hace falta;
anteponer una capa de correcciones, casi nunca.

Destilado también a
[`prompts/coach-engineering/formato-saas-coach-v5.md`](../../prompts/coach-engineering/formato-saas-coach-v5.md)
§2. Ver [[reference_coach_authoring_system]] y [[feedback_coach_authoring_baseline]].
