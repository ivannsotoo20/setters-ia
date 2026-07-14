# POSTMORTEM — Objeción de precio que nombra la videollamada antes de proponerla

Fecha del proceso: 2026-07-13 (reunión Rubén 13-jul + feedback trainer Alfonso Santos #64).
Avatar: transversal (detectado en varios coaches del avatar hombres pérdida de peso).
Estado final: aprendizaje destilado → doctrina **§26** (regla) + **§27** (craft) + ítems de checklist.
Tipo: **modo de falla universal** (no es la iteración de un coach concreto).

---

## 1. Punto de partida

Caso real, repetido en varios coaches: el lead pregunta o duda por el precio en Fase 1/2/3 y el setter responde
con algo del tipo *"eso lo vemos en la videollamada"* / *"por eso primero hacemos una videollamada de
valoración"* / *"el precio depende, te lo explico en la llamada"* — **nombrando la videollamada (y a veces "el
programa") cuando NADIE ha propuesto todavía ninguna llamada**.

Por qué falla (Rubén, 13-jul, sobre una conversación de Andrea Oliver):
- El lead se queda descolocado: *"¿de qué llamada me habla?"* — el mensaje no tiene sentido sin un contexto que
  aún no existe.
- Devalúa la llamada y presupone un paso que el lead no ha aceptado (rompe §15 "no presuponer interés" + CR3).
- La vieja plantilla de precio "justifica que el programa es individualizado" cuando **el programa tampoco ha
  aparecido** en la conversación.

---

## 2. Diagnóstico (el turno que falla)

Objeción de precio pre-F5 → respuesta que introduce "videollamada / llamada / el programa" fuera de su momento.
Raíz: §15 (no presuponer interés) no bastaba — no prohibía **NOMBRAR** la llamada; faltaba la regla binaria
operativa. Se manifestaba además troceada/seca (frases cortas separadas por puntos, sin hilo), que es el otro
defecto de craft (§27).

Contraste correcto (Rubén): la respuesta de precio que menciona la llamada **solo** está bien cuando la llamada
YA se ha propuesto o el enlace ya se ha enviado (F5+). Antes de eso, se reencuadra y se reconduce al
DESCUBRIMIENTO con una pregunta anclada al objetivo/bloqueo, sin nombrarla.

---

## 3. Aprendizajes consolidados

### 3.1 Universal → doctrina §26 (no nombrar la llamada/programa antes de F5)
Regla binaria: si una respuesta anterior a F5 contiene "llamada/videollamada/programa" → reescribir. Antes de
F5 la objeción reconduce al descubrimiento sin nombrarla.

### 3.2 Craft asociado → doctrina §27 (frases de objeción hiladas, no troceadas)
La respuesta va como una unidad cálida de lógica lineal que cierra en pregunta, con comas, no troceada. Referencia
de estilo: el `<coach_objections>` de Miguel Aguado (protocolo RAM + deflexión); en el repo, el voiceprint de
Roberto.

### 3.3 Coach → revisar `coach_objections_price` de cada coach
Que la respuesta de precio pre-F5 reconduzca al descubrimiento sin nombrar la llamada. Aplicado en Alfonso 2.0
(reescritura de `coach_objections_price` por momentos F1/pre-F5/F5+) y contemplado en Roberto 3.0 (su voiceprint
ya prohíbe nombrar la llamada salvo en F6 o si el lead lo pregunta).

---

## 4. Modos de falla a vigilar (tests proactivos)
- Respuesta de objeción con "llamada / videollamada / programa" antes de F5 (§26).
- Respuesta troceada/seca en lugar de hilada (§27).
- Justificar "el programa es individualizado" cuando el programa no ha aparecido en la conversación.

---

## 5. Próximos pasos
- §26 → doctrina + checklist Sección 5 (ítem nuevo). ✅ hecho.
- §27 → doctrina + checklist Sección 4 (ítem nuevo). ✅ hecho.
- **Candidato a 9.º añadido del CORE de la academia** (la regla es universal a todos los coaches): pendiente,
  escalonado DESPUÉS de validar Roberto (no tocar el Core todavía — ver memoria `feedback_coach_direccion_bloqueos`).

---

## Referencias
- Doctrina universal: [`../doctrina-universal.md`](../doctrina-universal.md) §26, §27, §28, §11.15.
- Checklist: [`../checklist-auditoria.md`](../checklist-auditoria.md) Secciones 4 y 5.
- Molde de postmortem: [`pablo-lopez-fraga.md`](pablo-lopez-fraga.md).
- Fuente: reunión Rubén 2026-07-13 (`Downloads/Impromptu Zoom Meeting - July 13.txt`) + feedback trainer Alfonso #64.
