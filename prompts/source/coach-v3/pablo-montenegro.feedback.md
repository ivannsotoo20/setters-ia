# Feedback al coach "Pablo Montenegro / Montefit" — v1

> Emitido 2026-04-20 durante ingesta inicial. El coach v1 se carga tal cual.
> Estos puntos se iteran en v2 con evidencia empírica una vez el motor corra contra las 3 conversaciones 10/10 (C1/C2/C3) de regresión.

Leyenda: 🔴 bloqueante para pasar a producción · 🟠 recomendado antes de Hito 6 · 🟢 mejora opcional

## 1. 🟠 Banco de frases del lead por debajo de 20

La memoria del plan del proyecto pide **≥20 frases reales** del banco para que el modelo aprenda el argot del avatar. El coach aporta ~15 variantes dispersas entre "Ejemplos de lenguaje y tono" y "Respuestas tipo". Ampliar con 5-7 frases extra (idealmente reales, copiadas de conversaciones del setter n8n). No bloquea arranque, pero reduce variedad léxica.

## 2. ✅ Fases F3 y F4 sin "mensajes obligatorios"  *(decisión cerrada 2026-04-27 — ver sección final)*

El coach define mensajes para F1, F2, F5, F6, F7 + Cierre. No cubre F3 ni F4. El Core los tiene definidos genéricamente. Confirmar: ¿hereda F3/F4 del Core, o Pablo quiere reglas específicas para esas fases (por ejemplo: en F3 no preguntar por peso/medidas)?

## 3. 🟠 Numeración de fases no alineada con el Core

| Coach usa | Core v3 tiene |
|---|---|
| "Fase 5 — El Puente" | `fase_4_v3` (el Core nombra F4 como Puente) |
| "Fase 6 — Propuesta" | `fase_5_v3` |
| "Fase 7 — Envío de link" | `fase_6_v3` |
| "Cierre post-agenda" | post-F6 + `handoff_v3` |

Durante Hito 5 (composer) hay que mapear expresamente estas correspondencias para que el modelo no entre en confusión cuando el Core hable de F4 y el coach hable de F5.

## 4. 🟠 Regla del tercio estricta puede forzar respuestas demasiado cortas

*"Regla del tercio estricta (~1/3 de lo que escribe el lead)"*. Con lead que escribe 3 palabras, el setter respondería con 1 — anti-natural. Sugerido: "~1/3 si lead escribe >30 palabras; 1:1 si escribe <10". O dejar que el splitter lo interprete como guía blanda.

## 5. 🟢 Contradicción aparente recurso gratis vs descualificación

"Apertura outbound con recurso" envía un Drive en F1. Pero la regla universal de descualificación dice *"NUNCA ofrecer recursos gratuitos"*. Aclarar que se refiere a **tras descualificar**, no a la apertura pre-cualificación. Añadir una frase puente deja cero ambigüedad.

## 6. ✅ D1 menor de edad cubre <18 años pero no el rango 18-29 fuera de avatar  *(decisión cerrada 2026-04-27 — ver sección final)*

Avatar declarado: 30-50. D1 descualifica <18. No hay regla explícita para jóvenes de 18-29 que no encajan en el avatar típico. Dos opciones: (a) los dejamos pasar y cualifica normal (si cumplen los requisitos mínimos); (b) añadir D9 "fuera de rango de avatar" con protocolo suave. Confirmar intención.

## 7. 🟢 Placeholders del Puente — mapeo pendiente

`[NOMBRE]`, `[SITUACIÓN]`, `[FRENO]`, `[RESULTADO]` deben interpolarse en runtime desde el estado de `conversations` (`goal`, `problem`, `current_context`, `leads.first_name`). Mapeo exacto se documenta en `packages/prompt-composer` cuando se implemente (Hito 5).

## 8. ✅ URL de agenda ENTREGADA 2026-04-20

Ivan entregó `https://cal.com/ivan.soto/consultoria` (Cal.com). Cargado en v1.1 del coach en ambas menciones ("Fase 7 — Envío de link" + "URL de agenda" en afectaciones).

⚠️ **Observación**: la URL es de Ivan Soto, no de Pablo Montenegro. El coach sigue diciendo "Soy Pablo, fundador de Montefit" en identidad. Esto es intencional para pruebas internas del motor. Cuando Pablo/Montefit pase a producción real con leads propios, sustituir por su Cal.com y regenerar seed 004 (`node scripts/build-coach-seed.mjs --trainer pablo-montenegro --tenant-slug montefit`).

## 9. 🟠 Fast-Track inbound sin regla de detección explícita

El coach distingue "outbound" (lead respondiendo a bienvenida) vs "inbound" (DM espontáneo) pero no indica cómo se detecta. En ManyChat la distinción vendrá de qué trigger disparó el flow:

- Trigger "usuario envía BIENVENIDA" → **outbound** (respuesta al mensaje de Pablo)
- Trigger "DM espontáneo" → **inbound**

Documentar en el composer qué `custom_field` o qué variable de ManyChat indica el origen, y pasarlo al Generator como contexto.

## 10. 🟢 Hard cap 22 msgs + alarma al 12 como overrides del Core

El Core tiene `<phase_architecture>` con reglas genéricas de ritmo. El coach añade cifras específicas (hard cap 22, alarma al 12). En Hito 5 el composer inyecta estos overrides como instrucción adicional. No cambia nada, nota de implementación.

## 11. 🟢 Protocolo dolor espontáneo y reglas del avatar se solapan con Core

Core define "verificar tema principal una vez". Coach define "si el dolor surge, 1-2 preguntas y seguir". Ambas reglas coexisten sin contradicción directa, pero el modelo puede dudar cuál aplicar. La jerarquía de decisión del Core ya resuelve (coach > core genérico), solo nota.

---

## Acción

- v1 se carga tal cual.
- Estos 11 puntos se tratan como **hipótesis de mejora**, no defectos.
- Iteración v2 planificada: tras 3 corridas completas del motor contra C1/C2/C3, con `llm_calls` analizados y los mensajes generados evaluados por Ivan.

---

## Decisiones cerradas pre-v2 (2026-04-27)

Tras revisar el feedback con el motor ya cerrado en código (Hitos 3-8 ✅) pero sin G6 disponible todavía, se decide **parar la iteración v2 hasta tener evidencia empírica** (las 3 conversaciones canónicas C1/C2/C3 + dump real de `llm_calls`). Plan completo en `~/.claude/plans/this-session-is-being-snazzy-puddle.md`.

Aún así, dos decisiones de coach sí quedan tomadas hoy y se aplicarán cuando v2 arranque:

### P2 — F3 (cualificación) y F4 (puente_pre_propuesta) heredan del Core

No se añaden mensajes obligatorios específicos de Pablo para F3 ni F4. El Core v3 ya cubre estas fases con instrucciones genéricas suficientes. Las "preguntas prohibidas por límites técnicos del nicho" (peso, medidas, % grasa, calorías, prescripción) ya viven en la sección correspondiente del coach y aplican transversalmente — no hace falta repetirlas como mensaje obligatorio en F3.

**Justificación**: simplifica el coach, evita duplicación de reglas, deja que el Core haga su trabajo genérico. Si en las corridas reales se observa que el modelo se comporta raro en F3 o F4, se reabre.

### P6 — Lead 18-29 fuera de avatar: D9 condicional, no descalificador automático

Se añadirá un **D9 "Fuera de rango de avatar"** que se activa solo cuando concurren:

1. Edad 18-29 (extraída del lead durante la conversación), Y
2. Perfil claramente alejado del avatar declarado: estudiante sin agenda saturada, expectativa de transformación estética rápida, sin familia ni responsabilidades profesionales pesadas, contexto incompatible con el "padre/ejecutivo ocupado" de Montefit.

Si solo concurre la edad pero el perfil encaja (joven con agenda muy cargada, padre joven, ejecutivo precoz, etc.) → cualifica normal sin tratamiento especial.

Protocolo de cierre cálido tipo D8: *"Pana, el programa está más pensado para perfiles con agenda saturada y responsabilidades familiares/laborales pesadas. Pero si tu situación encaja con eso, seguimos. Si no, sigue por aquí que voy subiendo contenido."*

**Justificación**: no perder leads jóvenes que sí encajan (caso atípico pero existe); evita falsos positivos al cualificar gente fuera del nicho real; sigue el patrón de descualificación cálida con puerta abierta del resto de D's.

### Lo que sigue abierto hasta v2

P1 (banco frases <20), P3 (mapeo numeración fases), P4 (regla del tercio), P5 (recurso vs descalificación), P7 (placeholders Puente), P9 (detección Fast-Track inbound), P10 (overrides hard cap/alarma), P11 (solapamiento dolor espontáneo Core/Coach). Todos esperan al kit de evidencia descrito en el plan (G6 + dump `llm_calls` + corridas adicionales si la tabla está vacía).
