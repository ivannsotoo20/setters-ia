# SOP — Queja de producción sobre el setter

**Origen:** ronda de Tania del 2026-09-12 (cuatro quejas en un mensaje: una persona con 15 días
de dolor llevada a llamada, personas fuera de zona con el enlace, "agendadas" que eran enlaces
enviados, "inbound" que incluía bienvenidas y palabras clave). Las cuatro tenían el mismo
patrón: la captura enseñaba el síntoma, la base de datos enseñaba la causa, y la causa vivía
en una capa distinta de la que parecía.

## Trigger

Un trainer (o Iván en su nombre) dice que el setter hizo algo mal, manda una captura de una
conversación, o afirma que un número del panel no cuadra con lo que ve en GHL o en su agenda.

## Pasos

1. **Localizar el caso en la BD, nunca diagnosticar desde la captura.** Buscar la conversación
   por nombre, usuario o `external_id` del lead (`leads` + `conversations` + `channels`), leer
   `conversation_messages` ordenados por `sent_at` y anotar el turno exacto donde se rompió.
   Guardar el `conversation_id`: irá en la doc y en el commit.
2. **Medir cuántos casos hay del mismo tipo antes de decidir nada.** Una query agregada
   (por canal, dirección, origen, fase, prefijo del teléfono…). Un caso es una anécdota; diez
   es un patrón; y la cifra decide el tamaño de la solución.
3. **Elegir la capa por esta regla, no por dónde duele:**
   - Si hay un **dato determinista** que decide (prefijo del teléfono, quién mandó el primer
     mensaje, una cita real en el calendario), el motor lo calcula y lo declara al setter como
     HECHO en la directiva runtime (`apps/motor-agente/src/lib/lead-origin.ts`), con una red de
     seguridad en `packages/shared-validator` si la consecuencia es grave (V19, V20). El prompt
     no se pone a adivinar lo que el motor ya sabe.
   - El **cómo decirlo** (literal, tono, en qué turno) va al `coach_v5` del tenant, con el caso
     real como ejemplar ❌→✅. Ver `cargar-coach-v5-desde-md.md`.
   - Lo que **se cuenta** va al panel, y la definición exacta va escrita en el tooltip del KPI.
     Un KPI que se llama "Agendados" y cuenta F6 es una queja futura.
4. **Comprobar las etiquetas contra los hechos.** Antes de usar una columna como criterio
   (`conversation_source`, `phase_number=7`, `is_qualified`), verificar con una query qué
   significa de verdad: quién escribió el primer mensaje, si existe la cita, qué la puso ahí.
   El 2026-09-12 `conversation_source='inbound'` significaba "tipo de palabra clave", no
   "escribió ella"; y F7 lo ponía el modelo cuando la persona decía "ya reservé".
5. **Arreglar con verificación por capa:** test unitario para lo determinista (motor, validador,
   panel), batería del simulador de producción para el coach, typecheck y tests de los cuatro
   paquetes antes de commitear.
6. **Reparar el histórico si la etiqueta estaba mal:** primero `SELECT` de los ids afectados,
   después `UPDATE ... WHERE ... RETURNING`. Nunca un UPDATE sin `WHERE tenant_id`.
7. **Documentar en `docs/knowledge/`** (qué pasó con ids, qué se cambió por capa, qué queda
   pendiente y para quién) y en la memoria del proyecto. Commit en inglés, conventional
   commits; push cuando Iván lo diga, y si hay migraciones en `main`, confirmar antes.

## Output esperado

Cada queja termina con: el caso explicado con sus ids, la cifra de cuántos casos iguales hay,
el fix en la capa que toca, la verificación de esa capa, y una nota en `docs/knowledge/`.

## Errores que evita

- Endurecer el prompt cuando el dato ya lo tenía el motor (el prefijo +502 estaba en el
  número desde el primer mensaje).
- Dar por buena una métrica sin leer su definición en el código.
- Creer una etiqueta de la BD sin comprobarla contra los mensajes.
- Cerrar la queja con el fix y sin la regresión.

## Próxima revisión

Cuando se cree el segundo SaaS-tenant propio (no academia) o cuando el panel tenga el
simulador integrado y la batería deje de vivir en `.tmp/`.

## Relacionado

- Memorias: `feedback_coach_parada_se_comprueba_antes_de_enviar`,
  `feedback_coach_ronda_verificacion_adversarial`, `feedback_proactive_bug_detection`.
- `docs/knowledge/project_tania_ronda_2026-09-12.md` (el caso que originó este SOP).
