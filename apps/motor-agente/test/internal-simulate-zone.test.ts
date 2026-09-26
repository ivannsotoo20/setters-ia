import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// =============================================================================
// /internal/simulate con zona (2026-09-26).
//
// El simulador no podía reproducir el fallo que más se ha repetido con Tania: un
// teléfono de un país al que no lleva (+51, +57, +502) llevado a llamada. Ahora
// acepta `phone` (E.164) y evalúa la zona como producción: directiva, focal de
// cierre, V20 y V21. Sin `phone`, las menciones del chat, también como producción.
// =============================================================================

const TOKEN = 'test-internal-token-0123456789abcdef';
const runPipelineMock = vi.fn();

vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/env.js')>();
  return { ...actual, env: { ...actual.env, INTERNAL_STATS_TOKEN: TOKEN } };
});

vi.mock('../src/lib/supabase.js', () => ({ getSupabase: () => ({}) }));

vi.mock('../src/lib/anthropic.js', () => ({
  getAnthropicForTenant: async () => ({}),
  getAnthropic: () => ({}),
}));

vi.mock('../src/services/process-debounced.js', () => ({
  loadSchedulingConfig: async () => ({
    schedulingMode: 'link',
    trainerTimezone: 'Europe/Madrid',
    useApiBookingLegacy: false,
    aiMessagesPerTurnMax: 3,
    forbiddenPhrases: [],
    addressingMode: 'tu',
  }),
}));

vi.mock('../src/services/tracked-calendar-url.js', () => ({
  getSimulatedCalendarUrl: async () => ({
    url: 'https://example.test/booking?fyzon_lead_uuid=simulacion',
    reason: 'ok',
    calendarName: 'Valoración',
  }),
  SIMULATION_TRACKING_SLUG: 'simulacion',
}));

vi.mock('@fyzon/agent-pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fyzon/agent-pipeline')>();
  return { ...actual, runPipeline: (...args: unknown[]) => runPipelineMock(...args) };
});

// Política de lista negra (el comportamiento que no cambia sin `zone_allowlist`):
// la evaluación es la real, solo se evita ir a la base de datos.
vi.mock('../src/lib/zone-policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/zone-policy.js')>();
  return {
    ...actual,
    loadZonePolicy: async () =>
      actual.parseZonePolicy({
        no_contact_countries: ['PE', 'CO'],
        country_reject_terms: ['venezuela'],
      }),
  };
});

const { internalSimulateRoutes } = await import('../src/routes/internal-simulate.js');
const { ZoneCloseError } = await import('@fyzon/agent-pipeline');

const PIPELINE_OK = {
  parts: ['En mi perfil tienes mucho contenido para ir avanzando con tu espalda'],
  generator: {
    setterOutput: {
      message_raw: 'En mi perfil tienes mucho contenido para ir avanzando con tu espalda',
      conversation_status: 'disqualified',
      phase_decision: 1,
    },
  },
  totals: { costUsd: 0.01 },
};

let app: FastifyInstance;

beforeEach(async () => {
  runPipelineMock.mockReset().mockResolvedValue(PIPELINE_OK);
  app = Fastify({ logger: false });
  await app.register(internalSimulateRoutes);
  await app.ready();
});

function simulate(body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/internal/simulate',
    headers: { authorization: `Bearer ${TOKEN}` },
    payload: { tenant_id: 7, channel: 'whatsapp', message: 'Hola, me duele la espalda', ...body },
  });
}

describe('/internal/simulate — zona', () => {
  it('con un teléfono fuera de zona: focal de cierre, zoneRejected y zona en la respuesta', async () => {
    const res = await simulate({ phone: '+51987654321' });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.ok).toBe(true);
    expect(json.zone).toEqual({ kind: 'reject_by_prefix', country: 'PE' });
    expect(JSON.stringify(json)).not.toContain('987654321');

    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.composeOverrides.currentPhaseFocus).toContain('ESTE TURNO CIERRA POR RESIDENCIA');
    expect(input.validationContext.zoneRejected).toBe(true);
    expect(input.composeOverrides.extraSystemSuffix).toContain('Zona geográfica');
    // El enlace no se anula: un null caería al respaldo SIN_CALENDARIO del coach.
    expect(input.composeOverrides.trackedCalendarUrl).toContain('https://');
  });

  it('con un teléfono en zona: focal de la fase y sin zoneRejected', async () => {
    const res = await simulate({ phone: '+34600111222' });

    expect(res.json().zone).toEqual({ kind: 'in_zone_by_prefix', country: 'ES' });
    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.composeOverrides.currentPhaseFocus).toContain('AHORA ESTÁS EN FASE 1');
    expect(input.validationContext.zoneRejected).toBe(false);
  });

  it('sin teléfono evalúa las menciones del chat, historial incluido, como producción', async () => {
    const res = await simulate({
      history: [
        { role: 'user', content: 'Soy de Venezuela' },
        { role: 'assistant', content: 'Qué bien que me escribas' },
      ],
      message: 'Me duele la lumbar desde hace años',
    });

    expect(res.json().zone).toEqual({ kind: 'mention', term: 'venezuela' });
    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.validationContext.zoneRejected).toBe(false);
    expect(input.composeOverrides.currentPhaseFocus).toContain('AHORA ESTÁS EN FASE 1');
  });

  it('sin teléfono, "te escribo desde Venezuela" es residencia declarada: cierra como el prefijo', async () => {
    const res = await simulate({
      history: [
        { role: 'user', content: 'Te escribo desde Venezuela' },
        { role: 'assistant', content: 'Qué bien que me escribas' },
      ],
      message: 'Me duele la lumbar desde hace años',
    });

    expect(res.json().zone).toEqual({ kind: 'reject_by_declaration', term: 'venezuela' });
    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.validationContext.zoneRejected).toBe(true);
    expect(input.zone).toMatchObject({ mode: 'close' });
    expect(input.composeOverrides.currentPhaseFocus).toContain('CIERRA POR RESIDENCIA');
  });

  it('sin teléfono ni menciones, igual que antes: zona clear y focal de la fase', async () => {
    const res = await simulate({});

    expect(res.json().zone).toEqual({ kind: 'clear' });
    const input = runPipelineMock.mock.calls[0]![1];
    expect(input.validationContext.zoneRejected).toBe(false);
    expect(input.composeOverrides.currentPhaseFocus).toContain('AHORA ESTÁS EN FASE 1');
  });

  it('si V21 tumba el turno, lo devuelve como rechazado con la zona', async () => {
    runPipelineMock.mockRejectedValue(new ZoneCloseError({ conversation_status: 'active' }));

    const res = await simulate({ phone: '+573001234567' });

    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.rejected).toBe(true);
    expect(json.reason).toMatch(/^V21: zona rechazada sin cierre/);
    expect(json.zone).toEqual({ kind: 'reject_by_prefix', country: 'CO' });
  });

  it('un teléfono que no va en E.164 es un 400', async () => {
    const res = await simulate({ phone: '51 987 654 321' });
    expect(res.statusCode).toBe(400);
    expect(runPipelineMock).not.toHaveBeenCalled();
  });
});
