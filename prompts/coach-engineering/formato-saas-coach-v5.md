# LEY DE FORMATO — Bloque `coach_v5` en el SaaS Setters IA

> **NET-NEW.** Este documento NO venía del proyecto CloudChat. Es la reconciliación
> entre la craft de autoría de coaches (doctrina, canónicos, plantillas) y el
> formato REAL que el motor del SaaS espera. Un coach traído del formato antiguo
> de CloudChat **se rompe en producción** si no cumple esta ley. Léelo antes de
> generar o reconciliar cualquier coach.
>
> Última actualización: 2026-06-12.

---

## 0. El modelo de 2 bloques (Core fijo + Coach variable) y cómo vive en el SaaS

El system prompt del setter se compone en `packages/prompt-composer/`. La craft de
CloudChat hablaba de **Core (fijo) + Coach (variable)**. En el SaaS eso son filas en
`public.prompt_blocks`, compuestas en este orden con cache breakpoints:

| sort | block_key | tenant | Qué es | Quién edita |
|---|---|---|---|---|
| 0 | `core_v5_base` | `NULL` (shared) | El Core universal (CR1–CR12, F0–F6, objeciones, handoff). NO se toca. | Iván/Claude vía flujo versionado |
| 5 | `coach_v5` | tenant | **El bloque que tú autorías.** Identidad, voz, fases, cualificación, etc. | Iván + Claude |
| 6 | `admin_overrides_v1` | tenant | Instrucciones extra que solo el agency admin mete. Opcional. | SOLO Iván, UI `/admin/tenants/[id]` |
| 100 | `output_contract_v5` | `NULL` (shared) | JSON schema técnico de salida. NO se toca. | — |
| 110 | `trainer_prefs_v1` | tenant | Autogenerado desde `/settings/preferences`. FUERA de cache. | Trainer (autogen, nunca a mano) |

`REQUIRED_BLOCK_KEYS = ['core_v5_base', 'coach_v5']` — si falta el coach, el composer
lanza error. El Core canónico vive en
[`prompts/source/core-v5/01-core.md`](../source/core-v5/01-core.md) — es vocabulario-idéntico
al `Prompt_Core.md` de CloudChat (CR1–CR12, fases, Tipos A/B/C/D, PCSC/PSSC,
`<coach_ref>`, 3 modos de apertura). **No lo dupliques en la KB; refiérelo.**

**Referencia de formato gold-standard:** [`prompts/source/coach-v5/montefit.md`](../source/coach-v5/montefit.md)
(Pablo Montenegro / Montefit). Es el coach más limpio y completo en formato correcto:
frontmatter bien puesto, convención de headers correcta, `{{tracked_calendar_url}}`,
`coach_special_protocols`, `coach_program_is/isnt`. Cópialo como molde mecánico.
⚠️ *Caveat conocido:* su frontmatter dice `trainer: maria-lluc-martorell` pero el cuerpo
es Pablo Montenegro — un descuadre del repo (ver §7). El formato es correcto; el slug del
frontmatter, no.

---

## 1. Frontmatter YAML OBLIGATORIO

Todo `.md` de coach en `prompts/source/coach-v5/<slug>.md` empieza con frontmatter.
El seed builder ([`scripts/build-coach-v5-seed.mjs`](../../scripts/build-coach-v5-seed.mjs))
lo strippea antes de cargar, pero lo NECESITA para no romper el parseo. Los archivos de
CloudChat NO lo traen — hay que añadirlo.

```yaml
---
trainer: <slug-kebab>            # DEBE coincidir con el nombre del .md y con la identidad del cuerpo
tenant_slug: <slug-del-tenant>   # DEBE existir en la tabla tenants antes de cargar el seed
block_key: coach_v5              # hardcoded, no cambiar
sort_order: 5                    # hardcoded
version: 1                       # hardcoded (schema version del bloque, NO la revisión histórica)
status: draft | clean            # marcador editorial
approved: YYYY-MM-DD | pending
cerebro: v5
sprint: <contexto>
notes:
  - nota libre
---
```

Regla: `trainer` (frontmatter) = nombre del archivo = identidad del cuerpo
(`## coach_identity_name`). Si no cuadran, el seed carga contenido equivocado bajo el
slug equivocado. (Es justo el bug de montefit.md.)

---

## 2. Convención de headers EXACTA (lo que más se equivoca al portar)

El bloque es markdown monolítico con **wrappers XML por sección** y **sub-headers
markdown dentro** — EXCEPTO `coach_tone`, cuyas sub-secciones son **sub-tags XML**.
La UI `/admin/cerebro` navega por los headers `## coach_*`. Molde canónico:
[`prompts/source/coach-v5/_template-coach.md`](../source/coach-v5/_template-coach.md).

```
<coach_block>

  <coach_identity>
    ## coach_identity_name           ← markdown ##
    ## coach_identity_niche
    ## coach_identity_role
    ## coach_identity_notia
  </coach_identity>

  <coach_tone priority="highest">
    <coach_tone_voiceprint> ... </coach_tone_voiceprint>     ← AQUÍ sub-tags XML
    <coach_tone_variety> ... </coach_tone_variety>
    <coach_tone_lexicon> ... </coach_tone_lexicon>
    <coach_tone_openers> ... </coach_tone_openers>
    <coach_tone_emojis> ... </coach_tone_emojis>
    <coach_tone_exemplars>
      <ejemplo situacion="conexion_F1"> ... </ejemplo>       ← exemplars en <ejemplo situacion="...">
      ...
    </coach_tone_exemplars>
    <coach_tone_contrast> ... </coach_tone_contrast>
  </coach_tone>

  <coach_structural_modifications>
    ### coach_structural_modifications_core      ← markdown ### (nivel 3)
    ### coach_structural_modifications_phases
    ### coach_structural_modifications_objections
    ### coach_structural_modifications_handoff
  </coach_structural_modifications>

  <coach_phase_massage>
    ## coach_phase_massage_fase0  ...  ## coach_phase_massage_fase6     ← markdown ##
  </coach_phase_massage>

  <coach_links>
    ## coach_main_link
    ### coach_main_link_type
    ## coach_secondary_links
  </coach_links>

  <coach_qualification>
    ## coach_qualification_criteria / _doesnt / _special
  </coach_qualification>

  <coach_wclose>
    ## coach_wclose_generic / _not_now / _wrong_expectation / _under_age
  </coach_wclose>

  <coach_program>
    ## coach_program_name / _info / _differentiator   (montefit añade _is / _isnt — válido)
  </coach_program>

  <coach_objections>
    ## coach_objections_avatar / _price
  </coach_objections>

  <coach_special_protocols>   ← opcional; texto plano dentro
  </coach_special_protocols>

</coach_block>
```

Reglas mecánicas:
- **Solo `coach_tone`** usa sub-tags XML. Todo lo demás usa `##`/`###`.
- NUNCA escapar los `#` (`\#\#`). El canónico CloudChat de María viene con `\#\#` por
  pegado de Google Doc; hay que limpiarlo (el seed builder limpia parte, pero no lo
  des por hecho).
- El texto del header DEBE ser exactamente la key canónica (sin acentos, sin variantes).

---

## 3. Enlaces: placeholder, NUNCA hardcode

`coach_main_link` y los envíos de enlace en `coach_phase_massage_fase6` usan el
placeholder `{{tracked_calendar_url|<fallback>}}`, NO una URL pegada a mano.

```
## coach_main_link
`{{tracked_calendar_url|[PENDIENTE — Cal.com/Calendly real del trainer]}}`

### coach_main_link_type
calendar        ← valores válidos: calendar | form | whatsapp | human_handoff | (vacío)
```

**Por qué es crítico:** el motor inyecta en runtime una URL trackeada por-lead
(`fyzon_lead_uuid` + phone prefilled, Hito 10) para casar el booking de GHL con el lead
y mover la conversación a F7. Una URL hardcodeada rompe ese matching. Los canónicos de
CloudChat (Pablo López Fraga, Juan Gil) hardcodean su Calendly — al reconciliar, sustituir
por `{{tracked_calendar_url|<su Calendly real>}}` y `coach_main_link_type: calendar`
(no `calendly`).

Si el trainer hace **handoff humano en F5 sin enlace** (caso María): `coach_main_link`
vacío, `coach_main_link_type: human_handoff`, y F6 no se ejecuta por el setter.

---

## 4. Whitelist de placeholders del coach

Solo `core_v5_base` y `coach_v5` se interpolan (`INTERPOLATABLE_BLOCK_KEYS`). Placeholders
válidos DENTRO del coach (sintaxis `{{key|fallback}}`; ver `packages/prompt-composer/src/interpolate.ts`):

| Placeholder | Qué inyecta |
|---|---|
| `{{tracked_calendar_url\|fb}}` | URL de agenda trackeada por-lead (Hito 10) |
| `{{available_slots\|fb}}` | lista markdown de huecos libres (Hito 10.6) |
| `{{current_date\|fb}}` | fecha actual es-ES legible (Hito 10.6.1) |
| `{{lead_contact_status\|fb}}` | bloque markdown nombre/email ✓/✗ (Hito 10.6.1) |
| `{{lead_timezone_label\|fb}}` / `{{trainer_timezone_label\|fb}}` | etiquetas de zona horaria (Hito 11) |
| `{{current_phase_focus\|fb}}` | instrucción focal por turno (la inyecta el motor) |
| `{{trainer_phone\|fb}}` | teléfono E.164 del trainer (legacy/handoff) |
| `{{handoff_directive}}` | render rico según `trainer_preferences.handoff` (sin sintaxis de fallback) |

**NO** uses `{{phaseN_priority}}` en el coach — eso es exclusivo de `core_v5_base`.
Defensa por defecto: si un placeholder no resuelve, debe caer al fallback; NUNCA dejar
`{{...}}` literal en el prompt enviado al modelo. Por eso SIEMPRE pon fallback.

---

## 5. La frontera de capas: qué va en `coach_v5` vs `trainer_prefs_v1` vs `admin_overrides_v1`

Esto NO existía en CloudChat (era un solo prompt). En el SaaS, parte de lo que el
canónico antiguo metía en el coach **ya migró a preferencias del trainer**, enforced en
código (Hito 12.1). **NO lo dupliques en el coach** — crearías conflicto.

Va en **`trainer_prefs_v1`** (lo configura el trainer en `/settings/preferences`,
autogenerado, enforce en código):
- Tratamiento `tú`/`usted`/`mirror_lead` (`addressingMode`, validador V18).
- Máximo de mensajes por turno (`aiMessagesPerTurnMax`, cap del Generator + Splitter).
- Frases prohibidas (`forbiddenPhrases`, validador V17).
- Modo de handoff (`handoffMode` → `{{handoff_directive}}`).
- Nombre del lead / género (Hito 12.2).

Va en **`admin_overrides_v1`** (solo Iván, por tenant): instrucciones extra que el trainer
no ve.

Va en **`coach_v5`** (lo tuyo): identidad, voiceprint y todo `coach_tone`, fases y mensajes
literales, cualificación, cierres cálidos, programa, objeciones de avatar. La VOZ y el
CRITERIO del nicho.

Regla práctica al portar un canónico antiguo: si el canónico CloudChat fija tú/usted, tope
de mensajes, frases prohibidas o modo de handoff → NO lo escribas en el coach; anótalo como
"configurar en trainer_preferences" en las notas de entrega.

---

## 6. Pipeline de carga end-to-end (nunca tocar `prompt_blocks` a pelo)

1. Autorías/reconcilias `prompts/source/coach-v5/<slug>.md` (con frontmatter).
2. Generas el seed:
   `node scripts/build-coach-v5-seed.mjs --trainer <slug> --tenant-slug <slug> --seed-number NNN`
   → escribe `schema/v1/seeds/NNN-coach-v5-<slug>.sql` (idempotente: DELETE+INSERT por
   `(tenant_id, block_key='coach_v5', version=1)` + snapshot en `prompt_block_versions`).
3. Aplicas el seed vía MCP `supabase-fyzon` (`execute_sql` / `apply_migration`), o
4. Alternativa asistida: pegas/editas en el panel `/admin/cerebro` (editor versionado con
   drafts + preview compuesto).
5. El tenant del `tenant_slug` DEBE existir antes (el seed falla con RAISE EXCEPTION si no).

Reglas duras (de CLAUDE.md): nunca `UPDATE prompt_blocks` directo sin snapshot previo en
`prompt_block_versions`; nunca confundir `prompt_blocks.version` (schema v3/v4/v5) con
`prompt_block_versions.version_number` (revisión histórica). El validador
[`V10-coach-contradiction.ts`](../../packages/shared-validator/src/rules/V10-coach-contradiction.ts)
vigila que el coach no contradiga el Core.

---

## 7. Discrepancia conocida del repo (a vigilar, no asumir)

[`prompts/source/coach-v5/montefit.md`](../source/coach-v5/montefit.md): frontmatter
`trainer: maria-lluc-martorell` + `tenant_slug: montefit`, pero el cuerpo es **Pablo
Montenegro / Montefit**. Además existe un `pablo-montenegro.md` aparte. CLAUDE.md afirma
"María Lluc disponible en montefit.md", lo cual no concuerda con el cuerpo. Antes de
generar un seed desde montefit.md, confirmar con Iván qué identidad/slug es la correcta.
Para la KB usamos montefit.md como **gold-standard de FORMATO**, no como canónico del
avatar mujeres (ese es María, reconciliada aparte).

---

## 8. Checklist mínimo de formato (antes de entregar)

- [ ] Frontmatter YAML completo y `trainer` = archivo = `coach_identity_name`.
- [ ] `<coach_block>` con las 10 secciones; solo `coach_tone` con sub-tags XML; resto `##`/`###`.
- [ ] Exemplars en `<ejemplo situacion="...">`.
- [ ] `coach_main_link` con `{{tracked_calendar_url|fallback}}` (o vacío + `human_handoff`).
- [ ] Cero URLs de agenda hardcodeadas; cero `{{...}}` sin fallback.
- [ ] Nada de tú/usted, tope de mensajes, frases prohibidas ni handoffMode dentro del coach
      (eso es `trainer_prefs_v1`).
- [ ] Sin `#` escapados (`\#\#`), sin comentarios `<!-- -->` que deban sobrevivir (el builder los borra).
- [ ] `node scripts/build-coach-v5-seed.mjs ...` corre sin error y reporta chars ≥ ~5000.
- [ ] Pasa también `checklist-auditoria.md` (estructura + voz).
