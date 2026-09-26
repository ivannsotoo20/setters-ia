import { describe, it, expect, vi } from 'vitest';
import { qualifyFormLead } from '../src/services/lead-qualifier.js';
import { EUROPE_ISO } from '../src/lib/zone-config.js';

/**
 * Cualificación de leads de formulario (2026-08-25) — puerto del workflow n8n
 * "Formulario Tally" de Tania. Los casos reproducen los cortes del original:
 * dolor reciente rechaza en seco, país Tier A aprueba en seco, el resto lo
 * decide el evaluador IA, y un evaluador caído NO pierde el lead (fail-open).
 *
 * Desde 2026-09-26 (lista blanca de zona, al final del fichero): el campo de
 * residencia ya no es el WhatsApp, los países se comparan por palabra
 * completa, la IA razona antes de decidir y su aprobado pasa por una red de
 * zona que solo veta, y sin evaluador decide el prefijo.
 */

const CONFIG = {
  enabled: true,
  pain_reject_values: ['Menos de 3 meses'],
  country_label_regex: 'vives|pais|país',
  ai_criteria: 'Eres un evaluador. Devuelve la decisión.',
};

function makeSupabase(config: unknown) {
  const inserted: unknown[] = [];
  return {
    inserted,
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: { lead_qualification: config }, error: null }),
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
      if (table === 'tenant_configs' || table === 'llm_calls') return builder;
      throw new Error(`tabla inesperada: ${table}`);
    },
  } as any;
}

function makeAnthropic(decision: unknown) {
  const create = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        name: 'qualify_lead',
        input: { decision, razonamiento: 'motivo de prueba' },
      },
    ],
    usage: { input_tokens: 900, output_tokens: 80 },
  });
  return { anthropic: { messages: { create } } as any, create };
}

// Las respuestas reales del payload de ejemplo del formulario de Tania
// (pinData del workflow): mexicana, ama de casa, dolor crónico.
const KRISTEL = {
  '¿Desde cuándo tienes dolor de espalda?': 'Mas de 1 y 3 años',
  '¿Qué diagnóstico o qué te han dicho hasta ahora?': 'Hernia lumbar grande',
  '¿Como afecto esto a tu vida diaria?': 'MUI mal en todo',
  '¿Qué has probado hasta ahora y qué resultados tuviste?': 'Pastillas',
  '¿Hasta qué punto estás comprometid@ en invertir en ti mism@ para dejar atrás tus molestias y empezar a vivir como deseas?':
    'Muy comprometid@ → quiero solucionarlo',
  'Nombre y apellidos': 'Kristel Sanchez',
  Edad: 43,
  '¿Donde vives actualmente?': 'MTY NL Mexico',
  Ocupación: 'Hogar',
};

describe('qualifyFormLead — reglas deterministas', () => {
  it('dolor reciente rechaza en seco, sin gastar IA', async () => {
    const { anthropic, create } = makeAnthropic('aprobado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CONFIG),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Desde cuándo tienes dolor de espalda?': 'Menos de 3 meses' },
      phone: '+34600123456',
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(create).not.toHaveBeenCalled();
  });

  it('país Tier A aprueba en seco, sin gastar IA', async () => {
    // Igual de permisivo que el n8n original a propósito: una española sin
    // ingresos también entraba por reglas. Cambiarlo sería cambiar el negocio.
    const { anthropic, create } = makeAnthropic('rechazado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CONFIG),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Sevilla, España' },
      phone: '+34600123456',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(create).not.toHaveBeenCalled();
  });

  it('sin config (o disabled) no filtra nada', async () => {
    const { anthropic } = makeAnthropic('rechazado');
    for (const cfg of [null, { ...CONFIG, enabled: false }]) {
      const out = await qualifyFormLead({
        supabase: makeSupabase(cfg),
        anthropic,
        tenantId: 7,
        answers: KRISTEL,
        phone: '+52811654281',
      });
      expect(out.decision).toBe('sin_filtro');
    }
  });
});

describe('qualifyFormLead — evaluador IA', () => {
  it('México + ocupación Hogar va a la IA, y su rechazo manda', async () => {
    const { anthropic, create } = makeAnthropic('rechazado');
    const supabase = makeSupabase(CONFIG);
    const out = await qualifyFormLead({
      supabase,
      anthropic,
      tenantId: 7,
      answers: KRISTEL,
      phone: '+528116542813',
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('ia');
    expect(out.motivo).toBe('motivo de prueba');

    // El prompt del evaluador recibió el teléfono (desambigua país por prefijo)
    // y todas las respuestas.
    const req = create.mock.calls[0]![0];
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'qualify_lead' });
    const user = req.messages[0].content as string;
    expect(user).toContain('+528116542813');
    expect(user).toContain('MTY NL Mexico');
    expect(user).toContain('Hogar');

    // Y la llamada quedó registrada con su coste (clave del tenant).
    const row = supabase.inserted[0] as Record<string, unknown>;
    expect(row.role).toBe('qualifier');
    expect(row.tenant_id).toBe(7);
    expect(row.cost).toBeCloseTo((900 * 3 + 80 * 15) / 1_000_000, 8);
  });

  it('el evaluador caído NO pierde el lead: fail-open con aviso', async () => {
    // El n8n original moría en silencio y el lead se quedaba sin bienvenida ni
    // registro. Aquí un fallo del evaluador aprueba y deja el incidente logado.
    const create = vi.fn().mockRejectedValue(new Error('rate_limit_error'));
    const out = await qualifyFormLead({
      supabase: makeSupabase(CONFIG),
      anthropic: { messages: { create } } as any,
      tenantId: 7,
      answers: KRISTEL,
      phone: '+528116542813',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ninguno');
    expect(out.motivo).toContain('no disponible');
  });

  it('una decisión no reconocida tampoco pierde el lead', async () => {
    const { anthropic } = makeAnthropic('quizas');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CONFIG),
      anthropic,
      tenantId: 7,
      answers: KRISTEL,
      phone: '+528116542813',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ninguno');
  });
});

describe('qualifyFormLead — país de no contacto (2026-09-02)', () => {
  // Tania: "los países que menciono se rechazan sin importar que pasen el
  // filtro económico". La lista vive en la config del tenant; el código solo
  // compara palabra completa sobre el país declarado, normalizado.
  const CFG_C = {
    ...CONFIG,
    country_reject_terms: [
      'Venezuela', 'Colombia', 'colombiana', 'Bogotá', 'Argentina', 'Buenos Aires', 'Quito', 'Cuba',
    ],
  };

  it('Colombia con trabajo cualificado se rechaza en seco, sin gastar IA', async () => {
    const { anthropic, create } = makeAnthropic('aprobado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CFG_C),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Bogotá, Colombia', Ocupación: 'Directora de RRHH' },
      phone: '+573001234567',
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toContain('no contacto');
    expect(create).not.toHaveBeenCalled();
  });

  it('acentos y mayúsculas no importan: "BOGOTA" también', async () => {
    const { anthropic, create } = makeAnthropic('aprobado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CFG_C),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'BOGOTA' },
      phone: '+573001234567',
    });
    expect(out.decision).toBe('rechazado');
    expect(create).not.toHaveBeenCalled();
  });

  it('país Tier A + término de no contacto en el mismo texto: no decide ninguna regla, va a la IA', async () => {
    // Antes aprobaba por reglas: el Tier A comparaba por substring e iba primero.
    // Con las dos señales en el texto ("vivo en Madrid, España. Soy colombiana",
    // "Cañada de Gómez, Argentina") ninguna regla tiene certeza: la IA lee la
    // residencia y el prefijo. Manda la residencia, no el origen.
    const { anthropic, create } = makeAnthropic('aprobado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CFG_C),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Vivo en Madrid, España. Soy colombiana' },
      phone: '+573001234567',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ia');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('palabra completa: "Mosquito Bay" no es Quito, y va a la IA', async () => {
    const { anthropic, create } = makeAnthropic('aprobado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CFG_C),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Mosquito Bay' },
      phone: '+528116542813',
    });
    expect(out.evaluadoPor).toBe('ia');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('una ciudad fuera de la lista (Bucaramanga) la decide la IA con los criterios', async () => {
    const { anthropic, create } = makeAnthropic('rechazado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CFG_C),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Bucaramanga' },
      phone: '+573001234567',
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('ia');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('sin lista configurada no rechaza por país: todo va a la IA como antes', async () => {
    const { anthropic, create } = makeAnthropic('aprobado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CONFIG),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Bogotá, Colombia' },
      phone: '+573001234567',
    });
    expect(out.evaluadoPor).toBe('ia');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Lista blanca de zona (2026-09-26) — Tania: se contacta Europa, EEUU, Canadá,
// Australia y Nueva Zelanda siempre; México y Chile con filtro de trabajo; el
// resto no. Caso que lo disparó: un abogado de Lima (+51, conv 12145) aprobado
// por el formulario y llevado al enlace de agenda.
// ============================================================================

/** Evaluador que devuelve la herramienta completa (país incluido). */
function makeAnthropicWith(toolInput: Record<string, unknown>) {
  const create = vi.fn().mockResolvedValue({
    content: [{ type: 'tool_use', name: 'qualify_lead', input: toolInput }],
    usage: { input_tokens: 900, output_tokens: 80 },
  });
  return { anthropic: { messages: { create } } as any, create };
}

const ZONE_ALLOWLIST = {
  always: [...EUROPE_ISO, 'US', 'CA', 'AU', 'NZ'],
  filtered: ['MX', 'CL'],
};

/** Config real de Tania, recortada: lista blanca + parte de su lista de no contacto. */
const CFG_ZONE = {
  ...CONFIG,
  zone_allowlist: ZONE_ALLOWLIST,
  country_reject_terms: [
    'Perú', 'peruano', 'peruana', 'Lima', 'Colombia', 'colombiana', 'Bogotá', 'Argentina',
    'Santo Domingo', 'Alajuela', 'Puerto Rico',
  ],
};

// El label real del WhatsApp en el Tally de Tania. Contiene "país", así que casa
// con country_label_regex ('vives|pais|país') igual que "¿Donde vives actualmente?".
const WHATSAPP_LABEL =
  'Para seguir viendo tu caso y hablar sobre tu situación, déjame aquí tu número de WhatsApp (incluye prefijo de tu país).Comprueba que el número esté completo y tenga WhatsApp asociado. De lo contrario, no podré ponerme en contacto contigo ni analizar tu caso con más detalle.';

/** Las 10 preguntas reales, en el ORDEN de Tally: el WhatsApp antes que la residencia. */
function tallyAnswers(o: { whatsapp: string; residence: string; occupation?: string }) {
  return {
    'Nombre y apellidos': 'Nombre Apellido',
    [WHATSAPP_LABEL]: o.whatsapp,
    Edad: 47,
    Ocupación: o.occupation ?? 'Abogado',
    '¿Donde vives actualmente?': o.residence,
    '¿Desde cuándo tienes dolor de espalda?': 'Más de 3 años',
    '¿Qué diagnóstico o qué te han dicho hasta ahora?': 'Hernia discal L5-S1',
    '¿Como afecto esto a tu vida diaria?': 'No puedo estar sentado mucho rato',
    '¿Qué has probado hasta ahora y qué resultados tuviste?': 'Fisioterapia, alivio temporal',
    '¿Hasta qué punto estás comprometid@ en invertir en ti mism@ para dejar atrás tus molestias y empezar a vivir como deseas?':
      'Muy comprometid@ → quiero solucionarlo',
  };
}

const AI_DEFAULT = { razonamiento: 'x', pais_detectado: 'indeterminado', pais_iso: 'XX', decision: 'rechazado' };

async function qualify(o: {
  config: unknown;
  answers: Record<string, unknown>;
  phone: string;
  ai?: Record<string, unknown> | Error;
  phoneLabel?: string | null;
}) {
  let anthropic: any;
  let create: ReturnType<typeof vi.fn>;
  if (o.ai instanceof Error) {
    create = vi.fn().mockRejectedValue(o.ai);
    anthropic = { messages: { create } };
  } else {
    ({ anthropic, create } = makeAnthropicWith(o.ai ?? AI_DEFAULT));
  }
  const supabase = makeSupabase(o.config);
  const out = await qualifyFormLead({
    supabase,
    anthropic,
    tenantId: 7,
    answers: o.answers,
    phone: o.phone,
    phoneLabel: o.phoneLabel,
  });
  return { out, create, supabase };
}

describe('Q1 — el campo de residencia no es el del WhatsApp', () => {
  it('con el orden real de Tally (WhatsApp antes), la regla lee la residencia: España +34 aprueba en seco', async () => {
    // Antes el "país" era "+34 600 12 34 56": ninguna regla de país casaba y
    // todo iba a la IA (126 formularios, 0 decididos por país).
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34 600 12 34 56', residence: 'España' }),
      phone: '+34600123456',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toContain('Regla de zona');
    expect(out.paisIso).toBe('ES');
    expect(create).not.toHaveBeenCalled();
  });

  it('Perú +51 abogado con el orden real: la regla de país por fin lo ve y lo rechaza sin IA', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+51 987 654 321', residence: 'Lima, Perú' }),
      phone: '+51987654321',
      ai: { razonamiento: 'Zona D, abogado', pais_detectado: 'Perú', pais_iso: 'PE', decision: 'aprobado' },
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toContain('Perú');
    expect(out.motivo).toContain('+51');
    expect(create).not.toHaveBeenCalled();
  });

  it('también sin lista blanca: el Tier A se lee en la residencia, no en el teléfono', async () => {
    const { out, create } = await qualify({
      config: CONFIG,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Sevilla, España' }),
      phone: '+34600123456',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(create).not.toHaveBeenCalled();
  });

  it('el label que el aplanador marca como teléfono nunca es residencia, aunque su valor no parezca un número', async () => {
    const phoneLabel = 'Tu contacto (con el prefijo de tu país)';
    const answers = {
      [phoneLabel]: '987 654 321 de España',
      '¿Donde vives actualmente?': 'Lima, Perú',
    };
    const { out } = await qualify({ config: CFG_ZONE, answers, phone: '+51987654321', phoneLabel });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
  });
});

describe('Q3 — país por palabra completa, no por substring', () => {
  it('sin lista blanca: "Pandi cundinamarca" ya no es Dinamarca ni "Usaquén" es USA — van a la IA', async () => {
    for (const residence of ['Pandi cundinamarca', 'Usaquén']) {
      const { out, create } = await qualify({
        config: CONFIG,
        answers: { ...KRISTEL, '¿Donde vives actualmente?': residence },
        phone: '+573001234567',
      });
      expect(out.evaluadoPor).toBe('ia');
      expect(create).toHaveBeenCalledTimes(1);
    }
  });

  it('sin lista blanca: "Cañada de Gómez, Argentina" no aprueba en seco por Canadá', async () => {
    const { out, create } = await qualify({
      config: { ...CONFIG, country_reject_terms: ['Argentina'] },
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Cañada de Gómez, Argentina' },
      phone: '+5493471123456',
    });
    expect(out.evaluadoPor).toBe('ia');
    expect(out.decision).toBe('rechazado');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('lista blanca: "Pandi cundinamarca" +57 no se aprueba en seco; la IA dice Colombia y queda rechazado', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+573001234567', residence: 'Pandi cundinamarca' }),
      phone: '+573001234567',
      ai: { razonamiento: 'Cundinamarca es Colombia.', pais_detectado: 'Colombia', pais_iso: 'CO', decision: 'rechazado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('rechazado');
  });

  it('lista blanca: "Cañada de Gómez, Argentina" +54 → aunque la IA aprobara, la red lo rechaza', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+5493471123456', residence: 'Cañada de Gómez, Argentina' }),
      phone: '+5493471123456',
      ai: { razonamiento: 'Ocupación cualificada.', pais_detectado: 'Argentina', pais_iso: 'AR', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toContain('(Argentina)');
  });

  it('lista blanca: "Grecia, Alajuela" +506 no aprueba por Grecia; la red veta el aprobado con CR', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+50688887777', residence: 'Grecia, Alajuela' }),
      phone: '+50688887777',
      ai: { razonamiento: 'Grecia (Grecia).', pais_detectado: 'Costa Rica', pais_iso: 'CR', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('rechazado');
  });
});

describe('lista blanca — reglas deterministas de zona', () => {
  it('término de no contacto sin país y prefijo fuera → rechazo por regla ("Bogotá" +57)', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+573001234567', residence: 'Bogotá' }),
      phone: '+573001234567',
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toContain('lista de no contacto');
    expect(create).not.toHaveBeenCalled();
  });

  it('manda la residencia, no el origen: "Barcelona, soy peruana" +34 va a la IA', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Barcelona, soy peruana' }),
      phone: '+34600123456',
      ai: { razonamiento: 'Reside en España.', pais_detectado: 'España', pais_iso: 'ES', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ia');
  });

  it('"Santo Domingo de la Calzada" +34 (La Rioja) no se rechaza en seco: va a la IA', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Santo Domingo de la Calzada' }),
      phone: '+34600123456',
      ai: { razonamiento: 'La Rioja, España.', pais_detectado: 'España', pais_iso: 'ES', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('aprobado');
  });

  // Revisión 2026-09-26: con el WhatsApp de su país de origen, quien reside en
  // zona es el caso D1 (se aprueba y el setter deriva). La regla en seco la
  // rechazaba solo por nombrar Perú o "peruana".
  it('D1 por el formulario: "Barcelona, soy peruana" con +51 no se rechaza en seco; la IA dice España → aprobado con aviso', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'Barcelona, soy peruana' }),
      phone: '+51987654321',
      ai: { razonamiento: 'Reside en España.', pais_detectado: 'España', pais_iso: 'ES', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('aprobado');
    expect(out.motivo).toContain('confirmar la residencia en el chat');
  });

  it('"Madrid, soy de Perú" con +51 tampoco se rechaza en seco: va a la IA', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'Madrid, soy de Perú' }),
      phone: '+51987654321',
      ai: { razonamiento: 'Reside en Perú.', pais_detectado: 'Perú', pais_iso: 'PE', decision: 'rechazado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.evaluadoPor).toBe('ia');
    expect(out.decision).toBe('rechazado');
  });

  it('solo señales de fuera sigue siendo rechazo en seco: "vivo en Lima", "Perú." y "Lima / Perú" con +51', async () => {
    for (const residence of ['vivo en Lima', 'Perú.', 'Lima / Perú']) {
      const { out, create } = await qualify({
        config: CFG_ZONE,
        answers: tallyAnswers({ whatsapp: '+51987654321', residence }),
        phone: '+51987654321',
      });
      expect(out.decision).toBe('rechazado');
      expect(out.evaluadoPor).toBe('reglas');
      expect(create).not.toHaveBeenCalled();
    }
  });

  it('México +52 (con filtro) nunca se aprueba en seco: el filtro de trabajo es de la IA', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+528116542813', residence: 'México', occupation: 'Hogar' }),
      phone: '+528116542813',
      ai: { razonamiento: 'México, sin trabajo.', pais_detectado: 'México', pais_iso: 'MX', decision: 'rechazado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('ia');
  });

  it('país en zona con prefijo no reconocido no se aprueba en seco, y la IA lo aprueba sin aviso', async () => {
    // +882 (redes internacionales) no está en la tabla de prefijos: el prefijo
    // no confirma la residencia, así que no hay aprobación en seco.
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+882161234567', residence: 'Suecia' }),
      phone: '+882161234567',
      ai: { razonamiento: 'Europa.', pais_detectado: 'Suecia', pais_iso: 'SE', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('aprobado');
    expect(out.motivo).toBe('Europa.');
  });
});

describe('lista blanca — red posterior a la IA (solo veto)', () => {
  it('la IA aprueba a un +51 como "Zona D" con PE → la red lo rechaza con motivo explícito', async () => {
    const { out, create } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'San Isidro' }),
      phone: '+51987654321',
      ai: { razonamiento: 'Zona D, abogado: corresponde aprobar.', pais_detectado: 'Perú', pais_iso: 'PE', decision: 'aprobado' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toBe(
      'La IA aprobó pero el país de residencia detectado (Perú) está fuera de la zona de contacto.',
    );
    expect(out.paisIso).toBe('PE');
  });

  it('D1: "En Canadá" +502 con la IA diciendo CA → aprobado, y el motivo avisa del prefijo', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+50258746350', residence: 'En Canadá' }),
      phone: '+50258746350',
      ai: { razonamiento: 'Reside en Canadá.', pais_detectado: 'Canadá', pais_iso: 'CA', decision: 'aprobado' },
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ia');
    expect(out.paisIso).toBe('CA');
    expect(out.motivo).toContain('Reside en Canadá.');
    expect(out.motivo).toContain('+502, Guatemala');
  });

  it('sin país de la IA, decide el prefijo: +34 se mantiene, desconocido se rechaza', async () => {
    const ai = { razonamiento: 'Aprobado.', pais_detectado: 'indeterminado', pais_iso: 'XX', decision: 'aprobado' };
    const es = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Trujillo' }),
      phone: '+34600123456',
      ai,
    });
    expect(es.out.decision).toBe('aprobado');

    const unknown = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+882161234567', residence: 'Lagos' }),
      phone: '+882161234567',
      ai,
    });
    expect(unknown.out.decision).toBe('rechazado');
    expect(unknown.out.evaluadoPor).toBe('reglas');
    expect(unknown.out.motivo).toContain('no se pudo determinar el país');
  });

  it('ISO y nombre contradictorios con uno fuera de zona → gana el veto', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Trujillo' }),
      phone: '+34600123456',
      ai: { razonamiento: 'x', pais_detectado: 'Perú', pais_iso: 'ES', decision: 'aprobado' },
    });
    expect(out.decision).toBe('rechazado');
    expect(out.motivo).toContain('(Perú)');
  });

  it('"UK" como ISO se entiende como Reino Unido (GB) y no se veta', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+447700900123', residence: 'Londres' }),
      phone: '+447700900123',
      ai: { razonamiento: 'Reino Unido.', pais_detectado: 'Reino Unido', pais_iso: 'UK', decision: 'aprobado' },
    });
    expect(out.decision).toBe('aprobado');
    expect(out.paisIso).toBe('GB');
  });

  it('la red nunca convierte un rechazo de la IA en aprobado', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Trujillo' }),
      phone: '+34600123456',
      ai: { razonamiento: 'Dolor de hace dos semanas.', pais_detectado: 'España', pais_iso: 'ES', decision: 'rechazado' },
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('ia');
  });

  it('sin lista blanca no hay red: el aprobado de la IA se respeta como siempre', async () => {
    const { out } = await qualify({
      config: CONFIG,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'San Isidro' }),
      phone: '+51987654321',
      ai: { razonamiento: 'Zona D.', pais_detectado: 'Perú', pais_iso: 'PE', decision: 'aprobado' },
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ia');
  });
});

describe('lista blanca — sin evaluador decide el prefijo (Q5)', () => {
  it('IA caída con +51 → rechazado por prudencia', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'Trujillo' }),
      phone: '+51987654321',
      ai: new Error('rate_limit_error'),
    });
    expect(out.decision).toBe('rechazado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(out.motivo).toContain('no disponible');
    expect(out.motivo).toContain('prefijo fuera de zona (+51, Perú)');
  });

  it('IA caída con +34 → aprobado con aviso', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Trujillo' }),
      phone: '+34600123456',
      ai: new Error('rate_limit_error'),
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ninguno');
    expect(out.motivo).toContain('se aprueba con aviso');
  });

  it('decisión no reconocida con +51 → rechazado', async () => {
    const { out } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'Trujillo' }),
      phone: '+51987654321',
      ai: { razonamiento: 'x', pais_detectado: 'Perú', pais_iso: 'PE', decision: 'quizas' },
    });
    expect(out.decision).toBe('rechazado');
    expect(out.motivo).toContain('no reconocida');
  });

  it('sin ai_criteria: +51 rechazado, +52 (con filtro) aprobado con aviso', async () => {
    const cfg = { ...CFG_ZONE, ai_criteria: '' };
    const pe = await qualify({
      config: cfg,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'Trujillo' }),
      phone: '+51987654321',
    });
    expect(pe.out.decision).toBe('rechazado');
    expect(pe.create).not.toHaveBeenCalled();

    const mx = await qualify({
      config: cfg,
      answers: tallyAnswers({ whatsapp: '+528116542813', residence: 'Monterrey' }),
      phone: '+528116542813',
    });
    expect(mx.out.decision).toBe('aprobado');
  });

  it('sin lista blanca el fail-open no cambia: IA caída con +51 aprueba', async () => {
    const { out } = await qualify({
      config: CONFIG,
      answers: tallyAnswers({ whatsapp: '+51987654321', residence: 'Trujillo' }),
      phone: '+51987654321',
      ai: new Error('rate_limit_error'),
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('ninguno');
  });
});

describe('Q4 — la herramienta del evaluador razona antes de decidir', () => {
  it('propiedades en orden (razonamiento → país → decisión) y el país es obligatorio', async () => {
    const { create, supabase } = await qualify({
      config: CFG_ZONE,
      answers: tallyAnswers({ whatsapp: '+34600123456', residence: 'Trujillo' }),
      phone: '+34600123456',
      ai: { razonamiento: 'España.', pais_detectado: 'España', pais_iso: 'ES', decision: 'aprobado' },
    });
    const tool = create.mock.calls[0]![0].tools[0];
    expect(Object.keys(tool.input_schema.properties)).toEqual([
      'razonamiento',
      'pais_detectado',
      'pais_iso',
      'categoria_ocupacion',
      'decision',
    ]);
    expect(tool.input_schema.required).toEqual(
      expect.arrayContaining(['razonamiento', 'pais_detectado', 'pais_iso', 'decision']),
    );
    // El país detectado queda guardado junto a la decisión en llm_calls.
    const row = supabase.inserted[0] as Record<string, any>;
    expect(row.response_payload).toMatchObject({
      decision: 'aprobado',
      pais_detectado: 'España',
      pais_iso: 'ES',
    });
  });
});
