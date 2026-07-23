---
name: project_nani_coach_feedback
description: "Loop del bloque COACH Nani (coach_v5 del repo Fyzon; mujeres, hinchazón/pérdida de peso, programa 'Confía en Ti'). 4º REGISTRO del avatar mujeres: HOMBRE experto no-afectivo (firma 'señorita' + reconocimiento experto). Estado tras la ronda 1 de feedback (3 conversaciones reales) + validación del setter. Recall si vuelve Nani."
metadata:
  node_type: memory
  type: project
  originSessionId: 64505cf7-1efc-4843-a69b-a41df6388e20
---

Coach **Nani** (Abderrazak Nani) — coach_v5 del repo Fyzon (NO academia/Automatía; se carga
como bloque `coach_v5` en el SaaS). Avatar mujeres-pérdida-peso/nutrición, pero un **registro
NUEVO (el 4º del avatar)**: HOMBRE entrenando a MUJERES, cercano-PROFESIONAL con punto simpático
y autoridad experta sobre el cuerpo de la mujer (hinchazón, ciclo). NO es el afectivo de María
("cielo/amor" prohibidos; veta "guapa"), ni Julia (profesional-sobrio), ni Sandra (gamberro). Su
firma: "señorita" + reconocimiento experto ("eso lo veo cada semana"). Programa "Confía en Ti"
(3 meses, 3 fases: quitar hinchazón → entreno de menos a más → pérdida 6-12kg). Diferencial:
adaptado al cuerpo de la mujer; "la hinchazón es la señal de que algo no va bien, no estético".

**Bloque:** [`prompts/source/coach-v5/nani.md`](../../prompts/source/coach-v5/nani.md) (status
draft). NO cargado (tenant `nani` sin alta). Fuentes del feedback en `Downloads/` (formulario
`setter_nani.pdf` + 3 conversaciones `SETTER IA CONVERSACION 1/2` + `setter ia - inbound`).

**4 desviaciones vs la plantilla del avatar por defecto:** (1) registro no-afectivo experto;
(2) cierre por FLUJO DE CALENDARIO (Calendly propio + Zoom que da el propio Nani, NO handoff a
Closer como María); (3) SIN lead magnet (F1 conexión pura); (4) casos especiales de HINCHAZÓN,
no médicos (no trabaja patologías).

**Ronda 1 de feedback (3 conversaciones reales anotadas por Nani) — aplicada en 4 bloques:**
- **A · Ritmo/descubrimiento:** el fallo nº1 era ir "a cuchillo". F1 ya no dispara la situación
  (1-2 turnos de conexión antes). F2 con la estructura de Nani (situación actual/deseada/
  obstáculos/intentos previos/solución percibida) + MÍN 2 preguntas por situación clave,
  profundizando en el impacto emocional (**reemplaza el anti-drilling** "acepta y avanza"). No
  saltar de tema, no re-preguntar el mismo dato, no pivotar mecánicamente a hinchazón, no forzar
  a elegir hinchazón vs peso. F3 sin presuponer compra ("por qué ahora" fuera).
- **B · Ofrecer ayuda ≠ agendar:** F4 resumen sin correr; F5 en dos movimientos separados
  (ofrecer ayuda ligada a su necesidad → luego proponer la llamada).
- **C · Objeciones:** precio con el reencuadre de Nani (fuera el seco "depende del caso");
  objeción presencial-vs-online nueva (explorar primero + flexibilidad + corrección online);
  reabrir ante re-interés.
- **D · Voz:** "maravilloso", "muchas gracias, me ayuda saberlo", y "lo entiendo perfectamente"
  PERMITIDO (a Nani le gusta rematando una empatía real).

**Decisiones D1-D4 (validadas por Iván):** D1 intentos previos ligero/emocional (1 pincelada,
respeta el Core fase2 "máx 1 pregunta breve del pasado", sin autopsia del método); D2 profundizar
en el dolor que ella trae sin pescar síntomas mecánicamente (ampliar solo si el problema es pobre);
D3 → **REVERTIDA** (ver garantía); D4 manda Nani sobre la doctrina academia §19-§29, salvo las
CR1-CR12 del Core.

**GARANTÍA de devolución — resuelta:** SÍ se dice, pero **SOLO como ÚLTIMO RECURSO en F5+**
(cuando ya se propuso la videollamada y la lead se resiste a agendar; "la última bala para salvar
la llamada"). NUNCA de apertura ni en descubrimiento (queda raro y presupone). Reversión de riesgo
por RESULTADOS ("si aplicas y no consigues tu objetivo, te devuelvo el dinero"), NUNCA una cifra
(CR2). Vive en `coach_structural_modifications_phases` Fase 5; el reencuadre presencial NO la usa.

**Validación del setter (prueba real de Iván):** veredicto = funciona correctamente y con fidelidad
alta. Clava F1 sin cuchillo, profundización emocional, reconocimiento experto sin diagnosticar,
empatía ante evento vital, precio con su reencuadre, presencial explorando primero, reabrir, y —lo
más difícil— cierre digno cuando la lead no encaja ("me veo bien, puedo yo sola") sin forzar. Gaps
corregidos tras la prueba: la garantía salía demasiado pronto (→ gateada a F5+) y se coló "de
verdad" una vez (veto reforzado; candidato a `forbiddenPhrases`/V17 al dar de alta el tenant).

**Aprendizaje de FORMATO (directiva Iván):** los bloques coach son producción que ven otros
profesionales → quedan LIMPIOS y terminados, cero placeholders/pendientes/decisiones/BORRADOR
dentro del `<coach_block>`. Ver [[feedback_coach_blocks_sin_pendientes]]. El bloque de Nani se
reescribió limpio por esto.

**Aprendizaje de AVATAR pendiente de destilar al cerrar** (no antes, Nani no está validado en
producción): el 4º registro "hombre experto no-afectivo, conexión por autoridad sobre el cuerpo
femenino" → candidato a nota P en `prompts/coach-engineering/avatares/mujeres-perdida-peso-nutricion/principios.md`.

**PENDIENTE (operativo, fuera del bloque):** alta del tenant `nani` antes del seed; confirmar el
Calendly (`/30min` vs llamada de ~1h); confirmar con Nani el "¿cuántos kilos?" (lo usa a veces; la
regla no-báscula es solo para la apertura); tratamiento tú/"señorita"; bienvenida definitiva;
seguimientos en audio → sistema de followups (no el bloque). Más DMs reales para el test de
indistinguibilidad.

Relacionado: [[project_coach_authoring_kb]], [[reference_coach_authoring_system]],
[[feedback_coach_authoring_baseline]], [[feedback_coach_blocks_sin_pendientes]].
