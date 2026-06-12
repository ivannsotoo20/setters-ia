# Coach Engineering — Sistema de autoría de bloques COACH

Base de conocimiento desde la que Claude Code (y Iván) generan, reconcilian y mejoran
los bloques `coach_v5` de cada entrenador del SaaS Setters IA. Importada y reconciliada
desde el proyecto CloudChat (mayo 2026) y conectada al formato real del repo.

**Objetivo del sistema:** que cada coach que cerramos deje un aprendizaje destilado aquí,
para que el siguiente (mismo nicho o nuevo) salga mejor sin repetir explicaciones.

---

## Mapa de la KB

```
prompts/coach-engineering/
  README.md                     ← este archivo (índice + método + protocolo de aprendizaje)
  doctrina-universal.md         12 principios que aplican a CUALQUIER coach (validación, eco, muletilla, exemplars…)
  formato-saas-coach-v5.md      LA LEY DE FORMATO: cómo el coach cae directo en el SaaS sin romperse
  checklist-auditoria.md        checklist obligatorio antes de entregar (estructura + voz + formato SaaS)
  avatares/
    hombres-perdida-peso/       principios + plantilla + canónico (Pablo López Fraga)
    mujeres-perdida-peso-nutricion/  principios + plantilla + canónico (María de Lluc)
    adultos-ocupados/           canónico = montefit.md (Pablo Montenegro) — gold-standard de formato
  postmortems/
    pablo-lopez-fraga.md        historia de iteración v1→v8 del avatar hombres
  ejemplos-formato-antiguo/
    coach-block-juan-gil.md     ejemplo de prompt en formato CloudChat antiguo (a reconciliar)
```

Fuentes de verdad que NO viven aquí (se referencian, no se duplican):
- **Core universal:** [`prompts/source/core-v5/01-core.md`](../source/core-v5/01-core.md) (`core_v5_base`).
- **Esqueleto canónico del coach:** [`prompts/source/coach-v5/_template-coach.md`](../source/coach-v5/_template-coach.md).
- **Coaches FINALES (output):** `prompts/source/coach-v5/<slug>.md` — ahí van los que autorías.
- **Pipeline de carga:** [`scripts/build-coach-v5-seed.mjs`](../../scripts/build-coach-v5-seed.mjs) + composer en
  [`packages/prompt-composer/`](../../packages/prompt-composer).

---

## Arquitectura en 1 minuto

El setter = **Core (fijo) + Coach (variable)** concatenados. En el SaaS son filas en
`prompt_blocks`: `core_v5_base` (shared) + `coach_v5` (tenant, **lo que autorías**) +
`output_contract_v5` (shared) + opcionales `admin_overrides_v1` y `trainer_prefs_v1`.
El Core delega al Coach vía `<coach_ref section="..."/>`. CR1–CR12 del Core SIEMPRE
prevalecen; el resto del Coach prevalece sobre los ejemplos del Core. Detalle completo y
la frontera de capas (qué va en coach vs trainer_prefs vs admin_overrides):
[`formato-saas-coach-v5.md`](formato-saas-coach-v5.md).

---

## Avatares cubiertos

| Avatar | Canónico | Plantilla | Postmortem | Validación/dirección |
|---|---|---|---|---|
| **Hombres pérdida de peso** (+30, online) | `avatares/hombres-perdida-peso/canonico-pablo-lopez-fraga.md` (Pablo López Fraga, reconciliado) | sí | `postmortems/pablo-lopez-fraga.md` | validar = excepción (≈7/10 dirección) |
| **Mujeres pérdida de peso / nutrición** | `avatares/mujeres-perdida-peso-nutricion/canonico-maria-de-lluc.md` (María de Lluc, reconciliado) | sí | (reconstruir si surge aprendizaje) | validación alta = parte del valor |
| **Adultos ocupados / agenda saturada** | [`prompts/source/coach-v5/montefit.md`](../source/coach-v5/montefit.md) (Pablo Montenegro) | (derivar al 2º coach) | — | foco invertido: objetivos antes que dolor |

⚠️ Tres "Pablos" distintos a no confundir: **Pablo López Fraga** (avatar hombres, canónico
de referencia, NO es tenant en producción), **Pablo Montenegro** (tenant Montefit real,
avatar adultos ocupados), y la nomenclatura. Ver caveat de montefit.md en
[`formato-saas-coach-v5.md`](formato-saas-coach-v5.md) §7.

---

## Flujos de trabajo (qué hago según la tarea)

- **Flujo A — coach nuevo de avatar cubierto:** leer `doctrina-universal.md` +
  `formato-saas-coach-v5.md` + `avatares/<avatar>/principios.md` + `plantilla.md`. Recoger
  el formulario del trainer. Rellenar la plantilla. Pasar `checklist-auditoria.md`. Entregar
  `.md` con frontmatter listo para `build-coach-v5-seed.mjs`.
- **Flujo B — coach nuevo de avatar SIN canónico:** leer doctrina + ambos canónicos
  (hombres/mujeres) como extremos del espectro validación/dirección. **Diseñar la proporción
  del nuevo avatar antes de escribir** (doctrina §9). Partir del `_template-coach.md` del repo.
- **Flujo C — modificar coach en producción:** root-cause primero (no parchear el síntoma),
  cross-ref con el Core, surgical edit copy-paste-ready, documentar para postmortem.
- **Flujo D — cerrar postmortem:** destilar a 3 capas (universal → `doctrina-universal.md`;
  avatar → `avatares/<avatar>/`; coach → queda en el canónico). No duplicar entre capas.
- **Flujo E — debug de conversación:** cruzar con los 8 modos de falla (doctrina §11), citar
  el turno que falla, proponer el bloque exacto a cambiar.
- **Flujo F — elevar coach a canónico de avatar:** cabecera de metadatos (qué es del avatar /
  del entrenador), generar plantilla, principios del avatar.

Carga end-to-end SIEMPRE por `build-coach-v5-seed.mjs` → MCP, o `/admin/cerebro`. Nunca
`UPDATE prompt_blocks` a pelo (ver `formato-saas-coach-v5.md` §6).

---

## Qué leer antes de empezar

| Tarea | Leer obligatorio |
|---|---|
| Coach nuevo, avatar cubierto | doctrina + formato-saas + plantilla del avatar |
| Coach nuevo, avatar no cubierto | doctrina + formato-saas + ambos canónicos + `_template-coach.md` |
| Reconciliar prompt antiguo (estilo CloudChat) | formato-saas (las 6 reconciliaciones) + `ejemplos-formato-antiguo/` |
| Modificar coach existente | doctrina + coach actual + Core + postmortem si existe |
| Debug de conversación | doctrina §11 (modos de falla) + coach actual |
| Cerrar postmortem | transcript del proceso + doctrina (para no duplicar) |

---

## Protocolo de aprendizaje (el loop que mantiene esto vivo)

Cuando cerramos un coach, o cuando Iván repite una corrección sobre un patrón, destilo el
aprendizaje a su capa correcta — **sin duplicar entre capas**:

1. **Universal** (aplica a cualquier avatar) → actualizo `doctrina-universal.md` (o
   `formato-saas-coach-v5.md` si es de formato/integración SaaS).
2. **De avatar** (aplica a futuros coaches del nicho) → actualizo `avatares/<avatar>/principios.md`
   o `plantilla.md`.
3. **Del coach** (específico del entrenador) → queda en su canónico.
4. **De mi forma de trabajar** (corrección transversal de cómo Iván quiere que opere) →
   memoria del proyecto: `feedback_coach_*.md` en
   `~/.claude/projects/C--Users-sotob-setters-ia/memory/`.

Cada archivo lleva fecha de última actualización. Antes de añadir un aprendizaje universal
nuevo, lo propongo a Iván. Punteros de memoria: ver `reference_coach_authoring_system.md`.
