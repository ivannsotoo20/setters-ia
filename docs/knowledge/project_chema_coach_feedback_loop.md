---
name: project_chema_coach_feedback_loop
description: "Loop recurrente de feedback del coach de Chema Uriarte (Programa Fénix, dolor crónico) y estado actual del prompt"
metadata: 
  node_type: memory
  type: project
  originSessionId: aeb03a2f-3d65-4319-89f2-cf886cd53bad
---

Loop recurrente: Chema Uriarte (coach "Programa Fénix", nicho dolor crónico/fibromialgia; setter IA = "Cristina") manda feedback en un `.docx` (`Downloads/Feedback - Chema Uriarte Gutiérrez*.docx`) y yo lo aplico al bloque coach `C:\Users\sotob\Downloads\coach_block_chema.txt` (formato XML `<coach_block>`, NO el pipeline coach-v5 del repo — Iván lo carga al SaaS él mismo).

**Método validado con Iván**: informe primero (qué pidió / cómo lo cambiaría, sin tocar) → Iván aprueba → aplico SOLO lo aprobado vía script Python con conteo-check (CRLF-safe) + `diff -u` contra backup. Cada tanda deja backup `coach_block_chema.pre-<fecha>.bak.txt`. Iván valora MUCHO la brevedad y el lenguaje plano en los cierres (se frustra con jerga técnica tipo "rollback/regresión"); explicar en cristiano.

**Estado del prompt tras feedback 14-jun + 20-jun (2026-06):**
- Enlace DEFINITIVO: `https://info.programafenixonline.com/` (sustituyó a `forms.gle/...` y al temporal `netlify.app`). Es info detallada + formulario.
- Cierre F6 = self-booking: el lead rellena formulario → reserva su cita en **Calendly** (elige día/hora él) → confirma a Cristina → Cristina avisa a Chema. Ya NO "Chema agenda a mano".
- **Handoff Tipo A dispara al CONFIRMAR la reserva, NO al enviar el enlace** (la IA sigue activa un turno para confirmar la cita). Cambio de comportamiento — smoke recomendado al desplegar.
- Vídeo de YouTube ELIMINADO (la info está en la web). No se envía nunca.
- Métricas de resultados corregidas (Chema las tenía cruzadas): dolor 66%, fibromialgia 57%, sensib. central 47%, pastillas 75%, insomnio 47%, catastrofismo 70%, depresión 52%, estrés 46%.
- "generar el dolor" (no "interpretar"); FAQs nuevas: psicología anti-"aceptación", nutrición (enfermera-DIETISTA, "dietas" prohibida, casos TCA), "aún no tengo diagnóstico".
- Decisiones de Iván: sin etiqueta formal "Problema entrevista" (se gestiona con handoff+notes); Cádiz presencial se queda como excepción manual. El SaaS NO detecta la reserva de Calendly (externo) → el cierre depende de la confirmación del lead por chat (así lo diseña Chema).

Relacionado: [[project_coach_authoring_kb]], [[reference_coach_authoring_system]], [[feedback_coach_direccion_bloqueos]].
