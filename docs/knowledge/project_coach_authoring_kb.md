---
name: coach-authoring-kb
description: "Base de conocimiento de autoría de bloques coach_v5 (doctrina, avatares, postmortems, checklist) en prompts/coach-engineering/ + loop de aprendizaje. Consultar al generar/reconciliar cualquier coach."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3f90a343-959f-4cc3-b294-8d24e803925b
---

KB de autoría de bloques COACH montada el 2026-06-12, importada y reconciliada desde el proyecto CloudChat de Iván. Vive en el repo: `prompts/coach-engineering/`.

**Qué contiene:**
- `README.md` — índice + flujos A–F + protocolo de aprendizaje.
- `doctrina-universal.md` — 25 principios universales (validación≠eco, muletilla≠introducción, exemplars enseñan el patrón, proporción se diseña, + DIRECCIÓN de la conversación §19–§25 desde Rubén 2026-06-18).
- `formato-saas-coach-v5.md` — NET-NEW: la ley de formato que reconcilia el conocimiento CloudChat al `coach_v5` real del SaaS.
- `checklist-auditoria.md` — checklist pre-entrega (estructura + voz + formato SaaS).
- `avatares/{hombres-perdida-peso, mujeres-perdida-peso-nutricion, adultos-ocupados}/` — principios + plantilla + canónico por avatar.
- `postmortems/pablo-lopez-fraga.md` y `ejemplos-formato-antiguo/coach-block-juan-gil.md`.

**Hallazgo clave:** la craft de CloudChat ES el proceso upstream de los bloques `coach_v5` del SaaS. Mismo Core (CR1–CR12, F0–F6, Tipos A/B/C/D, PCSC, `<coach_ref>`). El Core canónico vive en `prompts/source/core-v5/01-core.md` (no se duplica). Los coaches FINALES van a `prompts/source/coach-v5/<slug>.md` y se cargan con `scripts/build-coach-v5-seed.mjs` → MCP, o vía `/admin/cerebro`.

**3 avatares cubiertos:** hombres pérdida peso (Pablo López Fraga, canónico de referencia, NO tenant), mujeres pérdida peso/nutrición (María de Lluc), adultos ocupados (Pablo Montenegro = `montefit.md`, gold-standard de formato). Tres Pablos distintos a no confundir.

**Loop multi-coach (2026-06-12):** el avatar hombres ya tiene 2 coaches reales destilados — Pablo López Fraga + **Daniel** (recomp/definición 25-35; Iván lo trajo por CÓMO CUALIFICA). El ledger vivo `avatares/hombres-perdida-peso/patrones-comunes.md` acumula el núcleo común (Pablo ∩ Daniel) + lo que aporta cada uno + qué sube a doctrina vs queda de avatar. Al construir un coach nuevo: núcleo común + diferencial que aplique + tono/frases del entrenador nuevo. Daniel aportó (subido a doctrina §13-§17): objeción explorar→responder→reconducir, validar-persona-no-creencia, no-presuposición de interés, lectura de temperatura, tells anti-IA; y al avatar (principios P7-P9): craft de cualificación con gating (decididness + gate de inversión sin precio + sondeo según conciencia), banco de objeciones, puente F4 binario. Regla clave: la profundidad del gating en chat depende de si el coach se auto-cierra (Pablo/Daniel) o deriva a closer (María).

**Avatar mujeres también multi-coach (2026-06-12):** María de Lluc + **Julia/Mireya ("Mujer en Forma")** (mujeres 35-60 pérdida peso/fuerza). Ledger `avatares/mujeres-perdida-peso-nutricion/patrones-comunes.md`. **Hallazgo central:** el avatar mujeres NO es monolítico en tono — María es afectiva (cálida, "cielo", emojis cariñosos, validación alta) y Julia es cercano-PROFESIONAL NO afectiva (apelativos cariñosos prohibidos, emojis sobrios, validación contenida). El **registro afectivo vs profesional se diseña por perfil del lead + marca, NO por género** (doctrina §9). Julia aportó a doctrina §18 (interpretar antes de preguntar + anclar situacional + reformular en pregunta + profundizar antes de avanzar) y un modo de falla §11.9 (heredar literales del canónico de otro coach sin adaptar el registro: sus wclose vinieron en tono María afectivo y contradicen su voiceprint — cada literal pasa SU voiceprint). Julia confirma la regla self-close/closer (deriva a equipo → gating blando).

**Sandra Matías = 3.er registro mujeres + 1.er coach producido por Claude (2026-06-12):** mujeres ~30-50 SANAS que ya entrenan (estética), registro DIRECTO-cercano-gamberro (polo directo, como Julia pero con más personalidad). Flujo C: Iván trajo su prompt (hecho con otra herramienta) + el formulario; lo analicé, di MODs 1-6 + señal de compromiso B3, y lo reconstruí en formato coach_v5 → `avatares/mujeres-perdida-peso-nutricion/referencia-sandra-matias.md` (status draft, afinar con DMs reales + alta de tenant antes de mover a prompts/source/coach-v5/). Aprendizajes: (1) el modo de falla §11.9 vivo — su prompt decidía registro directo en el voiceprint pero ejecutaba afectivo (María) en exemplars/F1; la decisión de registro no basta, hay que ejecutarla en exemplars/F1/emojis. (2) Refinamiento de la regla de gating: NO lo decide el género sino QUIÉN cierra — Sandra se auto-cierra (sin closer) Y es mujeres → necesita señal ligera de prioridad/compromiso en chat (B3), más suave que Daniel y SIN tocar dinero (CR2). (3) MODs clave para cualificación de 10: F2 situacional no genérica (§18 Julia), handoff F5 tras aceptación (no antes — trabajar objeciones), proporción directa real en exemplars. Iteración 2026-06-16 (feedback Sandra): cierre F6 ahora pide el número para coordinar por WhatsApp (excepción a CR6 autorizada en coach_special_protocols) + handoff; nuevo modo de falla universal doctrina §11.10 — el setter que ES el profesional (trabaja solo) rompe el handoff invisible si nombra al coach en 3ª persona o verbaliza la derivación ("te busco un hueco con Sandra"); reforzar en el flujo de cierre F5/F6, no solo en coach_identity.

**Feedback reunión Rubén 2026-06-18 (DIRECCIÓN de la conversación):** tono ya resuelto, falla la dirección. Se añadieron doctrina §19–§25 (anclar en el bloqueo central en presente; curiosidad sobre la motivación; no educar; criterios = una pregunta; expectativa-vs-realidad; abrir leads cerrados; flujo encadenado tipo Joseca) + enmiendas §1/§5/§18.3 + modos de falla §11.11–14. Avatar hombres: P3 reordenado, P7 acotado, P10 nuevo. Avatar mujeres: P10 (+1 profundización extra, Jordi como ejemplo). Scaffold `avatares/hombres-perdida-peso/referencia-estructura-joseca.md` a rellenar por Iván con las 7 preguntas reales de Joseca. Plan/método: Roberto v2 primero → testear → propagar a Alfonso → Core escalonado. Detalle y método de trabajo: [[coach-direccion-bloqueos]].

**Discrepancia repo a vigilar:** `montefit.md` tiene frontmatter `trainer: maria-lluc-martorell` pero el cuerpo es Pablo Montenegro; CLAUDE.md lo llama "María Lluc". Confirmar con Iván antes de seedearlo.

Operativa de uso y la ley de formato: ver [[coach-authoring-system]]. Workflow de prompts/MCP general: ver [[reference_prompts_mcp_workflow]].
