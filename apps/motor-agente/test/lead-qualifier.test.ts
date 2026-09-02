import { describe, it, expect, vi } from 'vitest';
import { qualifyFormLead } from '../src/services/lead-qualifier.js';

/**
 * Cualificación de leads de formulario (2026-08-25) — puerto del workflow n8n
 * "Formulario Tally" de Tania. Los casos reproducen los cortes del original:
 * dolor reciente rechaza en seco, país Tier A aprueba en seco, el resto lo
 * decide el evaluador IA, y un evaluador caído NO pierde el lead (fail-open).
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

  it('el Tier A manda: "vivo en Madrid, soy colombiana" reside en España y se aprueba', async () => {
    const { anthropic, create } = makeAnthropic('rechazado');
    const out = await qualifyFormLead({
      supabase: makeSupabase(CFG_C),
      anthropic,
      tenantId: 7,
      answers: { ...KRISTEL, '¿Donde vives actualmente?': 'Vivo en Madrid, España. Soy colombiana' },
      phone: '+573001234567',
    });
    expect(out.decision).toBe('aprobado');
    expect(out.evaluadoPor).toBe('reglas');
    expect(create).not.toHaveBeenCalled();
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
