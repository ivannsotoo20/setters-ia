# Petición de material a Bea Espínola

Tres cosas que faltan para cerrar su bloque. Van ordenadas por lo que más mueve la aguja.
El mensaje de abajo está listo para copiar y pegar.

---

## Mensaje para Bea

> Hola Bea!
>
> Ya tenemos el setter funcionando y con el feedback vuestro y el de Rubén aplicado. Para dejarlo
> fino nos faltan tres cosas tuyas, y una de ellas es la que más va a notar la lead.
>
> **1. Veinte mensajes tuyos reales.**
> Es lo más importante de las tres. Ahora mismo el setter habla “como creemos que hablas”, sacado de
> cómo escribiste el formulario, pero un formulario no se parece a un DM. Con veinte mensajes tuyos
> de verdad deja de sonar aproximado y suena a ti.
>
> Lo ideal: coge conversaciones reales de Instagram o WhatsApp y pásanos capturas o copia-pega de
> **mensajes que escribiste tú**, sin filtrar ni corregir (con las faltas, los audios transcritos, los
> emojis y los "jaja" tal cual salieron). Nos interesan sobre todo de estos momentos:
> · cuando saludas y arrancas la conversación
> · cuando alguien te cuenta un miedo o una duda
> · cuando explicas algo que no le han explicado bien
> · cuando propones la entrevista
> · cuando te ponen una pega (precio, tiempo, "me lo tengo que pensar")
>
> **2. El precio y las formas de pago.**
> El setter no lo lleva y lo necesita: cuando una lead insiste mucho, lo correcto es dárselo en vez de
> escurrir el bulto (si no, se genera desconfianza). Nos hace falta la cifra tal cual se la dirías tú,
> y en qué se puede fraccionar.
>
> **3. Qué es honesto prometer en posparto.**
> En el formulario esta respuesta se quedó a medias. En preparación y embarazo sí lo tenemos claro
> (llegar con seguridad y confianza, con más preparación física y conocimiento del cuerpo), pero en
> posparto falta. ¿Qué consiguen de verdad tus clientas de posparto, sin prometer plazos ni resultados?
>
> Con esas tres lo cerramos. Gracias!

---

## Por qué cada una (contexto interno, no va en el mensaje)

| # | Qué falta | Qué bloquea | Riesgo si no llega |
|---|---|---|---|
| 1 | **20 mensajes suyos** | La voz entera del bloque | El bloque suena aproximado. Rubén ya dijo que el tono lo hace bien, pero está construido sobre cómo escribe en un formulario. Es lo único que lo hace indistinguible de ella |
| 2 | **Precio + formas de pago** | `coach_objections_price`, toque 3 | 🔴 Hoy el setter **para y avisa** al tercer toque (motivo `pide_precio_sin_dato`) en vez de responder. Funciona, pero es una conversación perdida cada vez |
| 3 | **C3 posparto** | `coach_program` (qué se promete) | El carril de posparto es donde más fácil se promete de más, y es su avatar principal. Sin esto el setter improvisa el beneficio |

**Nota sobre el precio:** Iván lo tiene en camino. Cuando llegue, se sustituye el placeholder
`[PRECIO — PENDIENTE DE BEA]` de `coach_objections_price` y se retira el motivo de parada
`pide_precio_sin_dato`. No hay que tocar nada más.
