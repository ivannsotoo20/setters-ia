import { describe, it, expect } from 'vitest';
import { validateMessage, type ValidationContext } from '../src/index.js';

const baseCtx: ValidationContext = {
  tenantId: 2,
  conversationId: 1,
  currentPhase: 2,
  channel: 'instagram',
  emojisWhitelist: ['💪', '😂', '😅', '🔥'],
  isFirstAssistantMessage: false,
  lastAssistantMessages: [],
  locale: 'es-VE',
};

describe('validator V00 empty', () => {
  it('reports error on empty', () => {
    const r = validateMessage('', baseCtx);
    expect(r.hasErrors).toBe(true);
    expect(r.violations[0]?.ruleId).toBe('V00');
  });
  it('reports error on whitespace only', () => {
    const r = validateMessage('   \n\t  ', baseCtx);
    expect(r.hasErrors).toBe(true);
  });
  it('passes on real text', () => {
    const r = validateMessage('Hola pana', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V00')).toBeUndefined();
  });
});

describe('validator V01 greeting repeat', () => {
  it('warns on repeated greeting after first message', () => {
    const r = validateMessage('Hola pana, ¿qué tal todo?', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V01' && v.severity === 'warn')).toBe(true);
  });
  it('allows greeting on first message', () => {
    const r = validateMessage('Hola pana, ¿qué tal?', { ...baseCtx, isFirstAssistantMessage: true });
    expect(r.violations.find((v) => v.ruleId === 'V01')).toBeUndefined();
  });
  it('does not flag non-greetings', () => {
    const r = validateMessage('Verga eso tiene que ser frustrante', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V01')).toBeUndefined();
  });
});

describe('validator V02 emoji whitelist', () => {
  it('warns on emojis outside whitelist', () => {
    const r = validateMessage('Te quiero ❤️ mucho', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V02')).toBe(true);
  });
  it('passes whitelisted emojis', () => {
    const r = validateMessage('Brutal 💪 vamos!', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V02')).toBeUndefined();
  });
  it('skips when whitelist is null/empty', () => {
    const r = validateMessage('Te quiero ❤️ mucho', { ...baseCtx, emojisWhitelist: null });
    expect(r.violations.find((v) => v.ruleId === 'V02')).toBeUndefined();
  });
});

describe('validator V03 length', () => {
  it('warns on >280 chars', () => {
    const r = validateMessage('a'.repeat(300), baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V03')).toBe(true);
  });
  it('passes ≤280 chars', () => {
    const r = validateMessage('a'.repeat(280), baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V03')).toBeUndefined();
  });
});

describe('validator V04 ai mention', () => {
  it('errors on "soy una IA"', () => {
    const r = validateMessage('La verdad es que soy una IA, perdona', baseCtx);
    expect(r.hasErrors).toBe(true);
    expect(r.violations.find((v) => v.ruleId === 'V04')?.severity).toBe('error');
  });
  it('errors on Claude mention', () => {
    const r = validateMessage('Hola, soy Claude', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V04')).toBe(true);
  });
  it('does not false-positive on similar Spanish words', () => {
    const r = validateMessage('Esto sería ideal porque es óptimo', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V04')).toBeUndefined();
  });
});

describe('validator V05 premature goodbye', () => {
  it('warns on goodbye before phase 5', () => {
    const r = validateMessage('Un placer haberte conocido. Hasta luego', { ...baseCtx, currentPhase: 2 });
    expect(r.violations.some((v) => v.ruleId === 'V05')).toBe(true);
  });
  it('allows goodbye in phase 5+', () => {
    const r = validateMessage('Un saludo y nos vemos en la llamada', { ...baseCtx, currentPhase: 5 });
    expect(r.violations.find((v) => v.ruleId === 'V05')).toBeUndefined();
  });
});

describe('validator V06 multi-question', () => {
  it('warns on 2+ questions', () => {
    const r = validateMessage('¿Cómo estás? ¿Y la chamba?', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V06')).toBe(true);
  });
  it('passes single question', () => {
    const r = validateMessage('¿Cómo va la chamba?', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V06')).toBeUndefined();
  });
  it('passes question with "X o Y" disjunctive', () => {
    const r = validateMessage('¿Prefieres entrenar en casa o en gym?', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V06')).toBeUndefined();
  });
});

describe('validator V07 link too early', () => {
  it('warns on URL in phase < 4', () => {
    const r = validateMessage('Mira https://drive.google.com/...', { ...baseCtx, currentPhase: 2 });
    expect(r.violations.some((v) => v.ruleId === 'V07')).toBe(true);
  });
  it('allows URL in phase ≥ 4', () => {
    const r = validateMessage('Te dejo el enlace https://cal.com/x', { ...baseCtx, currentPhase: 6 });
    expect(r.violations.find((v) => v.ruleId === 'V07')).toBeUndefined();
  });
});

describe('validator V08 excess punctuation', () => {
  it('warns on !!', () => {
    const r = validateMessage('Brutal!! Sigue así', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V08')).toBe(true);
  });
  it('warns on ....', () => {
    const r = validateMessage('Hmm....bueno', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V08')).toBe(true);
  });
  it('passes single punctuation', () => {
    const r = validateMessage('Brutal! Sigue así.', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V08')).toBeUndefined();
  });
});

describe('validator V11 price leak', () => {
  it('errors on price mention before phase 6', () => {
    const r = validateMessage('Cuesta 297€ al mes', { ...baseCtx, currentPhase: 3 });
    expect(r.violations.find((v) => v.ruleId === 'V11')?.severity).toBe('error');
  });
  it('allows price mention in phase 6+', () => {
    const r = validateMessage('Cuesta 297€', { ...baseCtx, currentPhase: 6 });
    expect(r.violations.find((v) => v.ruleId === 'V11')).toBeUndefined();
  });
  it('does not false-positive on numbers in years/percentages', () => {
    const r = validateMessage('Tengo 35 años y poco tiempo', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V11')).toBeUndefined();
  });
});

describe('validator V12 excess apology', () => {
  it('warns on 2+ apologies', () => {
    const r = validateMessage('Perdona, lo siento, disculpa', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V12')).toBe(true);
  });
  it('passes single apology', () => {
    const r = validateMessage('Perdona, ¿qué decías?', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V12')).toBeUndefined();
  });
});

describe('validator V15 phase ghost', () => {
  it('errors on phase 0', () => {
    const r = validateMessage('hola', { ...baseCtx, currentPhase: 0 });
    expect(r.violations.find((v) => v.ruleId === 'V15')?.severity).toBe('error');
  });
  it('errors on phase 8', () => {
    const r = validateMessage('hola', { ...baseCtx, currentPhase: 8 });
    expect(r.violations.find((v) => v.ruleId === 'V15')?.severity).toBe('error');
  });
});

describe('validator V16 memory contamination', () => {
  it('warns on "seguimos hablando otro día"', () => {
    const r = validateMessage('Vale, seguimos hablando otro día entonces', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V16')).toBe(true);
  });
  it('warns on "te respondo cuando pueda"', () => {
    const r = validateMessage('No te preocupes, te respondo cuando pueda', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V16')).toBe(true);
  });
});

describe('validator runner', () => {
  it('returns ok when no violations', () => {
    const r = validateMessage('¿Cómo va la chamba? 💪', baseCtx);
    expect(r.ok).toBe(true);
    expect(r.hasErrors).toBe(false);
    expect(r.violations).toHaveLength(0);
  });

  it('respects only/skip filters', () => {
    const text = 'Hola otra vez, soy Claude';
    const all = validateMessage(text, baseCtx);
    const onlyV04 = validateMessage(text, baseCtx, { only: ['V04'] });
    const skipV04 = validateMessage(text, baseCtx, { skip: ['V04'] });
    expect(all.violations.length).toBeGreaterThanOrEqual(onlyV04.violations.length);
    expect(onlyV04.violations.every((v) => v.ruleId === 'V04')).toBe(true);
    expect(skipV04.violations.every((v) => v.ruleId !== 'V04')).toBe(true);
  });

  it('does not throw if a rule throws — logs warning and continues', () => {
    const brokenRule = {
      id: 'BROKEN',
      description: 'always throws',
      check: () => {
        throw new Error('boom');
      },
    };
    const r = validateMessage('hola', baseCtx, { rules: [brokenRule] });
    expect(r.violations).toHaveLength(0);
    expect(r.ok).toBe(true);
  });
});

// =============================================================================
// Hito 12.1 — V17 forbidden phrases (trainer vocabulary)
// =============================================================================

describe('validator V17 forbidden phrases', () => {
  const ctxWithList = (list: string[] | undefined): ValidationContext => ({
    ...baseCtx,
    forbiddenPhrases: list,
  });

  it('skipea cuando forbiddenPhrases está undefined', () => {
    const r = validateMessage('Esto es genial!', { ...baseCtx });
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeUndefined();
  });

  it('skipea cuando forbiddenPhrases es array vacío', () => {
    const r = validateMessage('Esto es genial!', ctxWithList([]));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeUndefined();
  });

  it('matchea palabra exacta case-insensitive', () => {
    const r = validateMessage('Esto es Genial!', ctxWithList(['genial']));
    const v = r.violations.find((x) => x.ruleId === 'V17');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warn');
    expect(v?.description).toContain('genial');
  });

  it('NO matchea substring (extensión de la palabra)', () => {
    // "genial" NO debe matchear "genialmente" — word boundary lo evita.
    const r = validateMessage('Lo hiciste genialmente bien', ctxWithList(['genial']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeUndefined();
  });

  it('NO matchea palabra que CONTIENE la prohibida como prefijo', () => {
    // "tal" no matchea "talante".
    const r = validateMessage('Tu talante me convence', ctxWithList(['tal']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeUndefined();
  });

  it('matchea con puntuación adyacente (signo de admiración)', () => {
    const r = validateMessage('¡Genial!', ctxWithList(['genial']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeDefined();
  });

  it('matchea con acentos correctamente (Unicode-aware boundaries)', () => {
    const r = validateMessage('Eso fue súper bueno', ctxWithList(['súper']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeDefined();
  });

  it('matchea con ñ correctamente', () => {
    const r = validateMessage('Mi amigo el cariño', ctxWithList(['cariño']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeDefined();
  });

  it('matchea frases multi-palabra', () => {
    const r = validateMessage('Lo siento, qué tal andas?', ctxWithList(['qué tal andas']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeDefined();
  });

  it('detecta múltiples ofensores y los reporta todos', () => {
    const r = validateMessage('Genial, todo perfecto!', ctxWithList(['genial', 'perfecto']));
    const v = r.violations.find((x) => x.ruleId === 'V17');
    expect(v).toBeDefined();
    expect(v?.description).toContain('genial');
    expect(v?.description).toContain('perfecto');
  });

  it('match repetido en el mensaje cuenta una sola vez (dedup)', () => {
    const r = validateMessage('Genial genial genial!', ctxWithList(['genial']));
    const v = r.violations.find((x) => x.ruleId === 'V17');
    expect(v).toBeDefined();
    // El description menciona "genial" una sola vez (sin "genial, genial, genial")
    const occurrences = (v!.description.match(/genial/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('severidad warn (no error) — no bloquea hasErrors', () => {
    const r = validateMessage('Genial!', ctxWithList(['genial']));
    expect(r.hasErrors).toBe(false);
    expect(r.violations.find((v) => v.ruleId === 'V17')?.severity).toBe('warn');
  });

  it('NO falso positivo si la palabra prohibida solo es un substring interno', () => {
    // "claro" prohibida; "declarar" NO debe matchear.
    const r = validateMessage('Tengo que declarar impuestos', ctxWithList(['claro']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeUndefined();
  });

  it('ignora entradas vacías o whitespace en la lista', () => {
    const r = validateMessage('Genial!', ctxWithList(['', '  ', 'genial']));
    expect(r.violations.find((v) => v.ruleId === 'V17')).toBeDefined();
  });

  it('description contiene suggestion con palabras a reescribir', () => {
    const r = validateMessage('Genial!', ctxWithList(['genial']));
    const v = r.violations.find((x) => x.ruleId === 'V17');
    expect(v?.suggestion).toBeDefined();
    expect(v?.suggestion).toContain('Reescribe');
    expect(v?.suggestion).toContain('genial');
  });
});

// =============================================================================
// Hito 12.1 — V18 consistencia tú/usted
// =============================================================================

describe('validator V18 addressing consistency', () => {
  const ctxWithExpected = (
    expected: 'tu' | 'usted' | undefined,
  ): ValidationContext => ({
    ...baseCtx,
    expectedAddressing: expected,
  });

  it('skipea cuando expectedAddressing es undefined (caso mirror_lead)', () => {
    const r = validateMessage('Hola, ¿cómo está usted?', ctxWithExpected(undefined));
    expect(r.violations.find((v) => v.ruleId === 'V18')).toBeUndefined();
  });

  it('OK cuando expected=tu y output tutea', () => {
    const r = validateMessage('Hola, ¿qué tal estás tú?', ctxWithExpected('tu'));
    expect(r.violations.find((v) => v.ruleId === 'V18')).toBeUndefined();
  });

  it('OK cuando expected=usted y output ustedea', () => {
    const r = validateMessage('Hola, ¿cómo está usted?', ctxWithExpected('usted'));
    expect(r.violations.find((v) => v.ruleId === 'V18')).toBeUndefined();
  });

  it('FAIL cuando expected=tu pero output ustedea', () => {
    const r = validateMessage('Hola, ¿cómo está usted hoy?', ctxWithExpected('tu'));
    const v = r.violations.find((x) => x.ruleId === 'V18');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warn');
    expect(v?.description).toContain('"tu"');
    expect(v?.description).toContain('"usted"');
  });

  it('FAIL cuando expected=usted pero output tutea', () => {
    const r = validateMessage('Hola, ¿qué tal estás tú?', ctxWithExpected('usted'));
    const v = r.violations.find((x) => x.ruleId === 'V18');
    expect(v).toBeDefined();
    expect(v?.description).toContain('"usted"');
    expect(v?.description).toContain('"tu"');
  });

  it('OK cuando detector es ambiguous (no penalizamos texto neutral)', () => {
    const r = validateMessage('Ok, gracias', ctxWithExpected('tu'));
    expect(r.violations.find((v) => v.ruleId === 'V18')).toBeUndefined();
    const r2 = validateMessage('Ok, gracias', ctxWithExpected('usted'));
    expect(r2.violations.find((v) => v.ruleId === 'V18')).toBeUndefined();
  });

  it('severidad warn — no bloquea hasErrors', () => {
    const r = validateMessage('Cómo está usted', ctxWithExpected('tu'));
    expect(r.hasErrors).toBe(false);
  });

  it('suggestion contiene guía de reescritura coherente con expected', () => {
    const rTu = validateMessage('Cómo está usted', ctxWithExpected('tu'));
    const vTu = rTu.violations.find((x) => x.ruleId === 'V18');
    expect(vTu?.suggestion).toContain('2ª persona');

    const rUsted = validateMessage('Cómo estás tú', ctxWithExpected('usted'));
    const vUsted = rUsted.violations.find((x) => x.ruleId === 'V18');
    expect(vUsted?.suggestion).toContain('3ª persona');
  });
});

// =============================================================================
// 2026-08-25 — V19 marcador sin resolver
//
// Caso real (batería tenant 7): a un lead que llevaba cinco turnos pidiendo el
// enlace le llegó "Aquí está el link para que revises: [ENLACE]".
// =============================================================================

describe('validator V19 marcador sin resolver', () => {
  const ctxF6: ValidationContext = { ...baseCtx, currentPhase: 6 };
  const URL_REAL =
    'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123';

  it('caza el hueco de enlace literal que salió en producción', () => {
    const r = validateMessage(
      'Aquí está el link para que revises: [ENLACE]. ¿Voy bien o me dejo algo?',
      ctxF6,
    );
    const v = r.violations.find((x) => x.ruleId === 'V19');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(r.hasErrors).toBe(true);
  });

  it('caza las variantes del mismo hueco', () => {
    const variantes = [
      'Te paso el [LINK] para que reserves',
      'Aquí tienes tu enlace: [url]',
      'Reserva aquí <enlace>',
      'Te dejo el [enlace de agenda] cuando quieras',
      'Mira el [calendario] y dime',
      'Agenda en [insertar enlace]',
      // Los que se le escaparon a la primera versión de la regla, que enumeraba
      // prefijos: "AQUÍ" lleva tilde y el patrón buscaba "aqui".
      '[AQUÍ VA EL ENLACE DE AGENDA]',
      '[AQUI VA EL ENLACE]',
      'Reserva en [pon aquí tu enlace de calendario] cuando quieras',
      '[tu url de booking]',
      // Y el que se escapaba por los guiones bajos: `_` es carácter de palabra,
      // así que `\burl\b` no casaba aquí dentro. Salió en producción.
      '[INSERTAR_URL_AGENDA]',
      '[ENLACE_CALENDARIO]',
      '<LINK-AGENDA>',
    ];
    for (const t of variantes) {
      const r = validateMessage(t, ctxF6);
      expect(r.violations.find((x) => x.ruleId === 'V19'), t).toBeDefined();
    }
  });

  it('caza un placeholder del composer sin interpolar', () => {
    const r = validateMessage('Reserva aquí: {{tracked_calendar_url}}', ctxF6);
    expect(r.violations.find((x) => x.ruleId === 'V19')?.severity).toBe('error');
  });

  it('caza el token interno de fallback', () => {
    const r = validateMessage('Te paso el enlace: SIN_CALENDARIO', ctxF6);
    expect(r.violations.find((x) => x.ruleId === 'V19')?.severity).toBe('error');
  });

  it('deja pasar la URL de verdad, que es el caso bueno', () => {
    const r = validateMessage(
      'Genial, pues te dejo por aquí el enlace para que agendes cuando mejor te venga:\nhttps://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc123',
      ctxF6,
    );
    expect(r.violations.find((x) => x.ruleId === 'V19')).toBeUndefined();
  });

  it('no se dispara con mensajes normales de la conversación', () => {
    const normales = [
      'Años con dolor dorsal… ¿qué has probado hasta ahora para intentar mejorarlo?',
      '3 semanas fatal es duro. ¿Qué es lo que más te ha limitado esas semanas del brote?',
      'Te entiendo, y prefiero que eso lo veas con Tania directamente',
      'Un año así, con alivio de solo un par de días, tiene que desgastar',
    ];
    for (const t of normales) {
      const r = validateMessage(t, ctxF6);
      expect(r.violations.find((x) => x.ruleId === 'V19'), t).toBeUndefined();
    }
  });

  it('un corchete que no habla de enlaces no dispara la regla', () => {
    const r = validateMessage('Me dijo [textualmente] que no podía más', ctxF6);
    expect(r.violations.find((x) => x.ruleId === 'V19')).toBeUndefined();
  });

  it('caza el anuncio sin enlace, que es la forma silenciosa del mismo fallo', () => {
    // Salió en la batería de verificación, en el camino feliz: la lead ve una
    // promesa vacía justo cuando iba a reservar, y el mensaje parece impecable.
    const anuncios = [
      'Genial. Aquí va el enlace para que reserves tu hueco.',
      'Ahí tienes el link para que elijas hora',
      'Este es el enlace de la videollamada',
      'Te dejo el enlace:',
    ];
    for (const t of anuncios) {
      const v = validateMessage(t, ctxF6).violations.find((x) => x.ruleId === 'V19');
      expect(v, t).toBeDefined();
      expect(v?.severity).toBe('error');
    }
  });

  it('el mismo anuncio CON la URL detrás no se bloquea', () => {
    const r = validateMessage(`Genial, aquí va el enlace para que reserves:\n${URL_REAL}`, ctxF6);
    expect(r.violations.find((x) => x.ruleId === 'V19')).toBeUndefined();
  });

  it('una promesa condicional no es un anuncio', () => {
    // Caso real de la batería: es correcto sin URL, y con el patrón amplio la regla
    // lo tumbaba. La diferencia es deíctico ("aquí va") vs futuro ("y te paso").
    const promesas = [
      'Mándame tu correo y te paso el calendario para que veas los horarios disponibles.',
      'Antes de pasarte el enlace, dime una cosa: ¿qué te limita más ahora?',
      'En cuanto me confirmes, te lo paso',
      'Vamos a llegar, pero quiero que la llamada sea útil para ti',
    ];
    for (const t of promesas) {
      expect(
        validateMessage(t, ctxF6).violations.find((x) => x.ruleId === 'V19'),
        t,
      ).toBeUndefined();
    }
  });

  it('un markdown con la URL de verdad detrás no se bloquea', () => {
    // Se lee peor de lo que debería (WhatsApp e Instagram no renderizan markdown),
    // pero la URL está: tumbar el turno por esto sería tirar un mensaje utilizable.
    const r = validateMessage(`Reserva aquí: [tu enlace](${URL_REAL})`, ctxF6);
    expect(r.violations.find((x) => x.ruleId === 'V19')).toBeUndefined();
  });
});
