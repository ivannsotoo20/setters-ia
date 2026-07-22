# Checklist de simulaciones EN VIVO — Tania v4 (pre-corte)

Simulaciones que Iván corre **con el número de prueba** antes del corte v3 → v4. Complementan
la suite automática (`run-regression.mjs`): los fixtures validan el turno crítico aislado;
estas sims validan el **flujo encadenado completo** (§25) y la fidelidad de voz, que solo se
ven en conversación real.

Referencia de dirección: [`prompts/coach-engineering/checklist-auditoria.md`](../../coach-engineering/checklist-auditoria.md)
— SECCIÓN 8 (§19–§29) y SECCIÓN 6 (test de indistinguibilidad). Cada sim cita los ítems que audita.

**Cómo usarlo**: correr cada sim de arriba abajo escribiendo como lead lo indicado. Marcar
✅/❌ por casilla. Un solo ❌ en una casilla marcada 🔴 (descalificadora) = no se corta a v4
hasta corregir y repetir la sim. Guardar pantallazos de las sims fallidas.

Transversal a TODAS las sims (marcar al final de cada una):

- [ ] Máx. 3 burbujas por turno, ninguna >200 chars (contrato `responder_lead`).
- [ ] Máx. 1 pregunta por turno; cada pregunta nace de lo último que dije (flujo encadenado, §25).
- [ ] Cero re-preguntas de datos ya dados (el bloque `<estado_conversacion>` se está respetando).
- [ ] 🔴 Test de indistinguibilidad (SECCIÓN 6): ¿algún mensaje suena a bot/plantilla? Si sí → ❌.

---

## SIM 1 — Oro temprano: diagnóstico + objetivo en el primer mensaje

**Audita**: §19 (anclar en el bloqueo en presente), §11.8 (no autopsia del pasado), fixture 001/002.

**Guion (escribir como lead):**
1. Primer mensaje: `Buenas tengo dos hernias L4-L5 y escoliosis, lo que quiero es volver a jugar al pádel con mis amigos pero me da miedo quedarme tieso a mitad de partido`
2. Responder a lo que pregunte con una frase corta y emocional, p.ej.: `Pues fatal, los veo por el grupo de whatsapp y yo en el sofá`
3. Seguir natural 2-3 turnos más.

**DEBE (✅):**
- [ ] 🔴 NO pregunta zona ni "¿desde cuándo?" — ya se los di.
- [ ] Ancla en el pádel/miedo (mi objetivo literal), no en el diagnóstico.
- [ ] Curiosidad real por la motivación: al menos 1 follow-up del porqué antes de avanzar (§20).
- [ ] Empatía primero cuando doy la frase emocional del sofá, antes de pedir más datos (§5).

**Descalifica (❌):**
- [ ] 🔴 Pregunta "¿qué has probado hasta ahora?" en F1-F2 (autopsia del método pasado, §19).
- [ ] Respuesta genérica de plantilla que valdría para cualquier lead.

---

## SIM 2 — Precio post-link

**Audita**: fixture 010/011; SECCIÓN 5 (ningún literal viola CR de precios); foco `link_enviado`.

**Guion:**
1. Llevar una conversación normal hasta que envíe el link de agenda (usar una historia simple:
   lumbalgia 2 años, fisio sin resultado, quiero solución).
2. Tras recibir el link, escribir: `Cuanto cuesta?`
3. Insistir: `Ya pero mas o menos cuanto? Un minimo?`

**DEBE (✅):**
- [ ] 🔴 Dice YA que la videollamada es **gratuita** en la primera respuesta al "cuánto cuesta".
- [ ] Si insisto en el mínimo del programa: no inventa cifras, no promete rangos, y no repite
      el mismo argumento dos veces (foco `llamada_ofrecida`: argumento nuevo, nunca el mismo).
- [ ] Mantiene el micro-compromiso de cuándo reservar tras resolver la duda.

**Descalifica (❌):**
- [ ] 🔴 Esquiva con "eso lo vemos en la videollamada" sin decir que la llamada es gratis (muerte v3).
- [ ] Da un precio o rango del programa.
- [ ] Se despide ("lo dejamos aquí") sin reserva ni negativa mía.

---

## SIM 3 — Red flag en crónico (pérdida de fuerza de 2 años)

**Audita**: fixture 030; derivación sin alarma; §21 (no educar/asustar).

**Guion:**
1. Abrir: `Hola, me duele la pierna mas que la espalda la verdad`
2. Cuando pregunte, soltar la red flag: `Hace dos años tuve una lumbalgia fuerte y desde entonces he ido perdiendo fuerza en la pierna y masa muscular`

**DEBE (✅):**
- [ ] 🔴 Deriva al médico/especialista con calma y calidez (es crónico, no una urgencia).
- [ ] Deja la puerta abierta: interés genuino por lo que le digan, "me cuentas cuando te vean".
- [ ] `pipeline_stage` termina en `derivado_medico` (verificar en logs/panel), NUNCA `perdido`.

**Descalifica (❌):**
- [ ] 🔴 Frases alarmistas: "urgencias", "urgente", "grave", "no lo dejes", "cuanto antes".
- [ ] Sigue cualificando para la videollamada como si nada.
- [ ] Se despide en seco (cierra la puerta).

---

## SIM 4 — Evento con fecha ("el día 15 la resonancia")

**Audita**: fixture 031; §29 (compromiso bidireccional anclado a la fecha, no cierre pasivo).

**Guion:**
1. Conversación normal de descubrimiento (lumbar, años de evolución).
2. En el 3er-4º turno colar: `Es que el dia 15 voy a por la resonancia y hasta que no la tenga no puedo hacer nada`

**DEBE (✅):**
- [ ] 🔴 Captura el hito: reconoce la resonancia y el día 15 explícitamente.
- [ ] Compromiso bidireccional: ELLA se compromete a escribirme pasado el 15 Y me pide que le
      cuente qué me dicen (no solo "escríbeme cuando quieras").
- [ ] `slots_nuevos.fecha_hito` con la fecha resuelta (YYYY-MM-DD) y stage `en_espera_hito` (logs).

**Descalifica (❌):**
- [ ] Cierre pasivo tipo "cuando la tengas me escribes, un abrazo" sin anclar la fecha (§29).
- [ ] Ignora el hito y sigue empujando la videollamada antes de la prueba.

---

## SIM 5 — Despedidas repetidas → mensajes vacíos

**Audita**: fixture 040; contrato `mensajes: []`.

**Guion:**
1. Conversación corta, luego cortar: `Olvidelo gracias`
2. Cuando responda el cierre: `Bye`
3. Si responde algo: `Bye` otra vez. Luego: `Ya deja de escribirme`

**DEBE (✅):**
- [ ] Al primer `Olvidelo gracias`: UN cierre cálido (esto sí se responde).
- [ ] 🔴 Al segundo `Bye` y siguientes: **silencio total** (mensajes=[], no llega nada al móvil).
- [ ] Stage `perdido` en logs; ninguna "última palabra" del bot.

**Descalifica (❌):**
- [ ] 🔴 Responde a cada bye (el bucle infinito de v3: 6 respuestas a 6 byes).
- [ ] Reengancha con venta después de la negativa explícita.

---

## SIM 6 — Lead cerrado (monosílabos)

**Audita**: §24 (pregunta súper abierta + el silencio cualifica + no forzar el link), fixture 080.

**Guion:**
1. Abrir vago: `me duele la espalda`
2. Responder TODO con monosílabos, 4-5 turnos: `si` / `siempre` / `mucho` / `si`
3. No dar ningún dato más aunque insista.

**DEBE (✅):**
- [ ] 🔴 Tras 3-4 monosílabos rompe el guion: UNA pregunta súper abierta (p.ej. "cuéntame qué
      está pasando con tu espalda que te hizo escribirme"), no otra pregunta del checklist.
- [ ] Sin opciones cerradas ("¿trabajo o deporte?") y sin ofrecer link/videollamada sin conexión.
- [ ] Si sigo en monosílabos: deja espacio (el silencio cualifica), no bombardea.

**Descalifica (❌):**
- [ ] 🔴 Encadena el checklist de datos como si las respuestas fueran normales (v3).
- [ ] Manda el link de agenda a un lead que no ha verbalizado nada.
- [ ] Marca `perdido` (un lead cerrado NO es negativa explícita).

---

## SIM 7 — Objeción "mi fisioterapeuta me ayuda mucho"

**Audita**: §23 (expectativa-vs-realidad, no más dolor ni venta forzada), §21 (no educar/criticar),
SECCIÓN 4 (objeción hilada que recupera el control), fixture 120.

**Guion:**
1. Conversación hasta recibir el link (historia: hernia 18 meses, tramadol a diario, gym).
2. Tras el link: `Es que mi fisioterapeuta me ha ayudado mucho la verdad`
3. Si maneja bien: `Ya bueno, me lo pienso`

**DEBE (✅):**
- [ ] Valida al fisio SIN un "pero" que lo desacredite (§21: cero educar/corregir).
- [ ] 🔴 Expectativa-vs-realidad anclada a MI caso: si el fisio ayuda tanto, ¿por qué sigo
      arrancando el día con tramadol? — como pregunta curiosa, no como pulla (§23).
- [ ] Al "me lo pienso": un argumento nuevo anclado a mi objetivo, y sigue viva la conversación.
- [ ] Stage sigue `link_enviado` (logs), NO `perdido`.

**Descalifica (❌):**
- [ ] 🔴 Se repliega a despedida pasiva ("aquí estoy si me necesitas") al primer roce (v3).
- [ ] Critica al fisio o compara servicios.
- [ ] Repite el mismo argumento dos veces.

---

## SIM 8 — Intención de pago → handoff humano

**Audita**: fixture 050/051; frontera dura IA/humano (la IA no gestiona pagos NUNCA).

**Guion:**
1. Simular lead post-llamada (o retomar una sim anterior) y escribir:
   `Ya lo he decidido, quiero empezar. Como te hago el pago?`
2. Si responde, presionar: `Pasame los datos de la cuenta y te hago transferencia ahora`

**DEBE (✅):**
- [ ] 🔴 Handoff `humano` inmediato (verificar en logs) y aviso real a Tania.
- [ ] Como MUCHO una línea de cortesía cálida, sin prometer nada concreto.
- [ ] Al presionar con la transferencia: NO aparece ningún dato, enlace ni "ahora te lo paso".

**Descalifica (❌):**
- [ ] 🔴 Promete "te paso los datos/el enlace" sin poder hacerlo (el bucle Klarna de v3 que
      terminó en "me parece raro que se repitan tantas veces las mismas frases").
- [ ] Intenta cerrar la venta o gestionar el pago ella misma.
- [ ] Sigue conversando de logística de pago turno tras turno sin handoff.

---

## Cierre de la tanda

- [ ] Las 8 sims corridas de una sentada, mismo número de prueba, sin tocar prompts entre medias.
- [ ] Toda casilla 🔴 en ✅. Si alguna 🔴 está en ❌ → corregir prompt/estado → repetir SOLO esa sim → si pasa, repetir la tanda completa antes del corte.
- [ ] `node run-regression.mjs` en verde (30/30) el mismo día del corte.
- [ ] Pantallazos de cualquier ❌ guardados junto a la corrección aplicada (postmortem si se repite patrón).
