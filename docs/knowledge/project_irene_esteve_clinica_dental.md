# Clínica dental Irene Esteve — loop del bloque

**Qué es.** Setter IA para **Irene Esteve Dental Aesthetics**, clínica de estética dental
especializada en **carillas de porcelana sin tallado**. Sedes en Madrid (Serrano 77), Barcelona
(Valencia 306) y Elda-Petrer (Alicante). Corre sobre **Automatía**, igual que los coaches de la
academia: `<coach_block>`, `manual_attention` + `skip_reply`, despliega Iván.

**Dónde vive.** Bloque: [`prompts/coach-engineering/academia/irene-esteve.md`](../../prompts/coach-engineering/academia/irene-esteve.md).
Principios del avatar: [`prompts/coach-engineering/avatares/clinica-dental-estetica/principios.md`](../../prompts/coach-engineering/avatares/clinica-dental-estetica/principios.md).
Borrador de literales pendiente de validar: `avatares/clinica-dental-estetica/literales-borrador.md`.

---

## Ronda 0 — 2026-09-06

Escrito de cero desde el formulario "Automat Leads Doc a Rellenar" que rellenó la clínica, más una
investigación de cinco frentes (la clínica, el producto, el paciente, el marco legal sanitario
español y cómo cualifican de verdad las clínicas dentales).

### Es el 8.º avatar y el primero que no es un entrenador

Lo que agrupa `academia/` es el **runtime**, no el nicho. Aquí quien habla es una **empresa con
equipo**: primera persona del plural, la doctora en tercera, y Miriam (persona real, nombrada en
reseñas de Google) es quien recoge cuando el setter para.

Seis inversiones respecto a cualquier coach del corpus:

| | Entrenador | Esta clínica |
|---|---|---|
| El objetivo | hay que sacarlo | ya viene dicho |
| El freno | conductual | decisión, miedo y dinero |
| La zona prohibida | la autopsia del método | la valoración clínica |
| El precio | se esquiva siempre | **se da**, y entero |
| El cierre | videollamada | **visita presencial**, con desplazamiento |
| Terceros | apagado mudo | **se atienden** |

### Las decisiones de Iván

- **Identidad**: la clínica en plural, sin nombre propio. Miriam es la humana que recoge, no el
  setter. (Descartadas: setter llamado Miriam, y nombre nuevo de recepción.)
- **Alcance**: literal, solo carillas. Todo lo demás para y lo coge una persona (trigger D). Se
  asume el coste de soltar ortodoncia, implantes y odontología general.

### Lo que trae al corpus

- **El precio como literal cerrado.** Primer bloque donde el setter da una cifra. Los 650 €/pieza y
  el mínimo de 10 por arcada van en el mismo turno o no van: separarlos es el señuelo que tipifica
  la Guía COEM 6.2 con el ejemplo del implante y la corona.
- **Cualificar no es filtrar.** Solo cuatro salidas, todas verbalizadas por ella. Bruxismo, dientes
  torcidos, caries y encías **no descualifican**: son un paso previo, y el paso previo se hace en la
  misma clínica. Quien no es caso de carillas es caso de ortodoncia.
- **La frontera clínica se REDIRIGE, no se para** (delta con Gonzalo). En oncología parar es
  obligatorio porque hay riesgo vital; aquí el riesgo es prometer un resultado, y eso se evita **no
  valorando**, no callándose. Un setter que se apaga cada vez que preguntan por su caso deja a la
  clínica atendiendo a mano la conversación normal del nicho.
- **Las dos fotos son cosas distintas.** La de su boca es dato de salud del art. 9 RGPD: no se pide,
  no se valora, se guarda. La de una sonrisa ajena de referencia sube el compromiso y se puede
  invitar. Sin escribirlas separadas, el modelo las mezcla.
- **Declara que es una IA en el primer mensaje.** No es doctrina, es el art. 50 del Reglamento (UE)
  2024/1689, aplicable desde el 2 de agosto de 2026. Y si se lo preguntan después, lo confirma y la
  conversación **sigue**: parar ahí mataría el embudo sin ganar nada.

### La pasada adversarial

Cinco lentes independientes (juntas, cumplimiento, seis conversaciones simuladas turno a turno,
doctrina y el KPI de asistencia) sobre el borrador, con un verificador por hallazgo que intentaba
refutarlo. **94 hallazgos crudos, 22 confirmados.** Todos aplicados. El bloque salió más corto de la
auditoría que como entró (808 → 795 líneas).

Las cuatro causas raíz, y las tres primeras son fallos que ya estaban escritos en la memoria del
proyecto y aun así se colaron:

1. **Las dos puertas.** La prosa las prohibía en tres sitios y los literales las practicaban en
   trece, tres de ellos justo donde la regla decía "nunca". El modelo copia de los literales, no de
   la prosa. La lista cerrada de sitios era además falsa (la puerta B del H3 es abierta). Se
   sustituyó por un criterio: **nunca abren un hito; o acotan una respuesta que ella ya dio, o
   eligen entre opciones que son las que hay.**
2. **La "Y".** Un cupo de dos contra veintidós literales que abrían con "Y". Cupo inejecutable sin
   estado entre turnos, y corpus enseñando el antipatrón. Se borró el cupo y se reescribieron los
   literales, que es lo que dice `feedback_coach_tic_repeticion_metodo`.
3. **El trigger que apagaba al lead más caliente.** "¿Qué días tenéis?" es la respuesta más
   favorable al cierre de F5, y disparaba un apagado por dato no disponible: se saltaba F6 entero y
   Miriam recibía una conversación sin nombre ni teléfono. El horario salió del trigger y pasó a ser
   una frase de tres segundos.
4. **El precio solo existía si ella lo preguntaba.** Es el §34 de manual: quien llega con el marco
   del anuncio no pregunta, porque para ella no hay nada que aclarar, y se presentaba a la visita
   creyendo que el ticket eran 1.300 €. Ahora el precio sale **antes de proponer la visita, lo
   pregunte o no**.

Otros que sobrevivieron: cuatro literales proponían la visita por debajo del suelo de F5; el ALTO y
el orden del precio se contradecían en el turno 1 del lead más frecuente; el protocolo de Turquía
afirmaba la reversibilidad que el propio banco de retiradas prohíbe; el bloque ofrecía la ortodoncia
y apagaba la conversación cuando preguntaban por ella; y no había respuesta para "¿eso lleva IVA?".

---

## Compuertas abiertas

**Bloquean la calidad de la voz:**
- **Cero conversaciones reales de la clínica.** El formulario pedía 4-5 y el guion de preguntas, y
  no llegaron. Los literales del bloque los escribí yo: son hipótesis hasta que la clínica los
  corrija. Los seis marcados como CERRADO (presentación, precio, financiación, idoneidad, foto,
  visita) son los que no se pueden parafrasear.
- **G4 sin contestar**: su literal para *"¿tú qué me harías?"*, que es la pregunta del nicho.
- **G2 sin contestar**: palabras que nunca usan por estilo.
- **Tuteo o usted**: G1 solo dice "cordialidad". El bloque va con tuteo cuidado y espeja el usted.

**Bloquean datos operativos:**
- **C1 vacío**: el catálogo de tratamientos.
- **Dirección y teléfono de Alicante**: su web da tres combinaciones incompatibles, y en /contacto/
  aparecen como dos clínicas con nombres distintos (Esteber y Esteve-Bernabéu). El bloque tiene un
  trigger para no improvisarlos.
- **Horarios por sede**, y si la doctora pasa consulta en las tres.
- **Si el precio lleva impuestos.** La carilla puramente estética no es prestación sanitaria exenta,
  así que la cifra que se dice tiene que ser la final.
- **El ejemplo representativo de la financiera**, si quieren que el setter dé cuotas. Sin él, la
  financiación va en cualitativo (art. 9 de la Ley 16/2011).

**Pendiente de decisión de la clínica:**
- Los **cinco claims de su propio marketing** que el bloque le retira: "número uno de España"
  (descripción de su canal de YouTube), "preserva al 100 % la estructura dental", "resultados
  garantizados" (páginas de sede), "la mejor especialista en estética dental" (landing de Alicante)
  y los nombres de pacientes conocidos. Los tres primeros por el art. 4.4 del RD 1907/1996; el de
  especialista por el art. 56.1 del Código Deontológico (en España no existen especialidades
  odontológicas oficiales); el de famosos por el art. 4.7, que es infracción grave.
- **La ortopantomografía no se puede prometer** como parte fija de la visita (RD 601/2019): el
  bloque la redacta como "las pruebas que considere necesarias".
- **Quién es el responsable sanitario** de cada sede. Es quien responde deontológicamente de lo que
  diga el setter, así que es quien tiene que firmar el bloque antes de producción.

## Lo que hay que medir cuando salga

El KPI **no es la cita, es la asistencia**: visita gratuita y sin señal significa que agendar no le
cuesta nada al lead y que todo el compromiso lo sostiene la conversación. Hace falta la línea base
de la clínica (leads/mes, tasa de agendado, tasa de asistencia, cierre en consulta) o no se podrá
saber si el setter mejora o empeora.
