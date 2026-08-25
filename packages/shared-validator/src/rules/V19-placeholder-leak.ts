import type { ValidationRule } from '../types.js';

/**
 * Marcadores que el setter NUNCA debe llegar a escribir: se le escapó el hueco
 * en vez del contenido.
 *
 * Caso real (batería 2026-08-25, tenant 7): un lead que llevaba cinco turnos
 * exigiendo el enlace recibió
 *
 *   "Aquí está el link para que revises: [ENLACE]. ¿Voy bien o me dejo algo?"
 *
 * El modelo tenía la URL entera delante en el prompt y aun así escribió el
 * hueco. Para la persona al otro lado eso es peor que no recibir nada: parece
 * un sistema roto justo en el momento en el que iba a reservar.
 *
 * Tres familias:
 *
 * 1. Mustache sin resolver (`{{lo_que_sea}}`). Si esto sale, el composer no
 *    interpoló un placeholder o el modelo se lo inventó. En ambos casos es bug.
 * 2. Corchete o ángulo con una palabra de enlace dentro (`[ENLACE]`, `<link>`,
 *    `[tu calendario]`). El patrón se ancla a un vocabulario cerrado para no
 *    tocar un corchete legítimo, que en conversación es rarísimo pero posible.
 * 3. Tokens internos nuestros que solo existen como fallback y no significan
 *    nada para un lead (`SIN_CALENDARIO`).
 *
 * Severidad `error` a propósito: el orquestador reintenta una vez y, si el
 * segundo intento vuelve a traer el hueco, tumba el turno. Silencio + aviso al
 * entrenador es un mal resultado; mandar "[ENLACE]" es peor.
 */

/**
 * Corchete o ángulo que contiene, EN CUALQUIER POSICIÓN, una palabra de enlace.
 *
 * La primera versión de esta regla enumeraba los prefijos posibles
 * (`(?:aqui\s+)?(?:va\s+)?(?:el\s+)?enlace`) y duró exactamente una batería: se le
 * escapó `[AQUÍ VA EL ENLACE DE AGENDA]` porque "AQUÍ" lleva tilde. Enumerar cómo
 * empieza el hueco es perder siempre — el modelo tiene infinitas formas de
 * redactarlo. Lo que no cambia es que dentro de los corchetes aparece una palabra
 * de enlace, así que el ancla es esa.
 *
 * Las palabras del vocabulario no llevan tilde en ninguna de sus formas, así que no
 * hace falta normalizar el texto.
 *
 * Los límites NO son `\b`: el guion bajo es carácter de palabra para el motor de
 * regex, así que `\burl\b` no casa dentro de `[INSERTAR_URL_AGENDA]` — que es
 * exactamente una de las formas que el modelo produjo en producción. Se usan
 * lookarounds sobre letras y números para que `_`, `-` y los espacios separen.
 */
const HUECO_ENTRE_CORCHETES =
  /[[<][^\]>\n]{0,60}(?<![\p{L}\p{N}])(?:enlace|link|url|calendario|agenda|booking|insertar|pegar)(?![\p{L}\p{N}])[^\]>\n]{0,60}[\]>]/iu;

/**
 * Enlace en markdown con URL de verdad detrás: `[reserva aquí](https://…)`.
 *
 * WhatsApp e Instagram no renderizan markdown, así que se lee peor de lo que
 * debería — pero la URL ESTÁ, que es lo que esta regla protege. Bloquear el turno
 * por esto sería tumbar un mensaje utilizable.
 */
const MARKDOWN_CON_URL = /[[<][^\]>\n]{0,80}[\]>]\s*\(\s*https?:\/\//i;

/**
 * La tercera forma del mismo fallo, y la más silenciosa: anunciar la entrega del
 * enlace y no poner ninguno. Ni corchete ni llaves — nada.
 *
 *   "Aquí va el enlace para que reserves tu hueco."   (y ahí se acaba el mensaje)
 *
 * Salió en la batería de verificación del 2026-08-25, en el camino feliz. No deja
 * rastro: quien lo lea por encima ve un mensaje impecable, y la lead ve una promesa
 * vacía justo cuando iba a reservar.
 *
 * Solo cuentan las formas DEÍCTICAS — "aquí va", "ahí tienes", "este es el enlace" —
 * más el anuncio que se queda colgando de dos puntos. Un "te paso el enlace" a secas
 * NO cuenta, porque en español vale igual para el presente que para la promesa:
 *
 *   "Mándame tu correo y te paso el calendario para que veas los horarios"
 *
 * salió en la misma batería y es correcto sin URL. Medirlo contra el corpus real fue
 * lo que separó una cosa de la otra; con el patrón amplio, ese turno era un falso
 * positivo y habría tumbado un mensaje bueno.
 *
 * OJO — esta regla depende de que se valide el mensaje ENTERO, antes del Splitter.
 * El Splitter manda la URL en su propia burbuja, así que sobre las partes sueltas
 * la burbuja del anuncio parecería siempre una violación.
 */
const ANUNCIA_ENLACE_SIN_DARLO =
  /(?:aqu[ií]|ah[ií])\s+(?:va|van|tienes|te\s+(?:dejo|paso))[^.\n]{0,40}(?<![\p{L}\p{N}])(?:enlace|link|calendario)(?![\p{L}\p{N}])|este\s+es\s+(?:el|tu)\s+(?:enlace|link|calendario)|(?<![\p{L}\p{N}])(?:enlace|link|calendario)(?![\p{L}\p{N}])[^\S\n]*:[^\S\n]*$/imu;

const HAY_URL = /https?:\/\/\S+/i;

const PATTERNS: Array<{ re: RegExp; que: string }> = [
  {
    re: /\{\{[^}]{1,80}\}\}/,
    que: 'placeholder sin resolver',
  },
  {
    re: HUECO_ENTRE_CORCHETES,
    que: 'hueco de enlace sin rellenar',
  },
  {
    re: /\bSIN_CALENDARIO\b/,
    que: 'token interno de fallback',
  },
];

export const V19_placeholderLeak: ValidationRule = {
  id: 'V19',
  description: 'Marcador sin resolver en el mensaje (hueco de enlace, mustache o token interno)',
  check: (text) => {
    // Los huecos explícitos primero, para que el diagnóstico nombre el hueco y no
    // el anuncio que lo rodea.
    for (const { re, que } of PATTERNS) {
      const m = text.match(re);
      if (m) {
        if (re === HUECO_ENTRE_CORCHETES && MARKDOWN_CON_URL.test(text)) continue;
        return {
          ruleId: 'V19',
          description: `${que}: "${m[0]}" habría llegado tal cual al lead`,
          severity: 'error',
          match: m[0],
          suggestion:
            'O va la URL completa tal y como está en el bloque del coach, o no se menciona el enlace en este turno.',
        };
      }
    }

    // Y la forma sin rastro: promete el enlace y no hay ninguna URL en el turno.
    if (!HAY_URL.test(text)) {
      const m = text.match(ANUNCIA_ENLACE_SIN_DARLO);
      if (m) {
        return {
          ruleId: 'V19',
          description: `anuncia el enlace ("${m[0].trim()}") y el turno no lleva ninguna URL`,
          severity: 'error',
          match: m[0].trim(),
          suggestion:
            'O va la URL completa tal y como está en el bloque del coach, o no se anuncia el enlace en este turno.',
        };
      }
    }
    return null;
  },
};
