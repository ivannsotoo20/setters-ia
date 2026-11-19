import { describe, expect, it, vi } from 'vitest';

// 2026-11-19 — Confirmación de reserva solo con la cita real. Ver
// services/booking-confirmation.ts.

const loadLqMock = vi.fn();
vi.mock('../src/lib/zone-policy.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/zone-policy.js')>();
  return { ...actual, loadLeadQualification: (...a: unknown[]) => loadLqMock(...a) };
});

const {
  bookingLinkAlreadySent,
  claimsBookingConfirmed,
  DEFAULT_BOOKING_CONFIRMATION_TEXT,
  formatAppointmentForLead,
  parseBookingConfirmationConfig,
  renderBookingConfirmation,
  sendBookingConfirmation,
  signalsBooked,
} = await import('../src/services/booking-confirmation.js');

describe('parseBookingConfirmationConfig', () => {
  it('solo con enabled: true', () => {
    expect(parseBookingConfirmationConfig(null)).toBeNull();
    expect(parseBookingConfirmationConfig({ booking_confirmation: { text: 'x' } })).toBeNull();
    const cfg = parseBookingConfirmationConfig({ booking_confirmation: { enabled: true } })!;
    expect(cfg.text).toBe(DEFAULT_BOOKING_CONFIRMATION_TEXT);
  });
});

describe('formatAppointmentForLead / renderBookingConfirmation', () => {
  // Cita real de la conv. 15147: 16-nov 16:00 UTC, lead de México.
  it('fecha, hora y zona en la zona de la persona', () => {
    expect(formatAppointmentForLead('2026-11-16T16:00:00Z', 'America/Mexico_City')).toEqual({
      fecha: 'lunes 16 de noviembre',
      hora: '10:00',
      zona: 'hora de México',
    });
    expect(formatAppointmentForLead('2026-11-16T16:00:00Z', 'Europe/Madrid').hora).toBe('17:00');
  });

  it('la plantilla de la entrenadora con sus datos, una burbuja por párrafo', () => {
    const cfg = parseBookingConfirmationConfig({ booking_confirmation: { enabled: true } })!;
    const parts = renderBookingConfirmation(cfg, '2026-11-16T16:00:00Z', 'Europe/Madrid');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('Pues ya está reservada 🙌 Te espero el lunes 16 de noviembre a las 17:00 (hora de España).');
  });
});

describe('signalsBooked', () => {
  it.each(['Listo', 'Listo, mañana 3 noviembre a las 11y30, me llegó un correo', 'Ya está', 'ya reservé', 'Ya lo tengo 😊', 'Hecho', 'reservado!', 'me ha llegado el correo', 'done'])(
    '«%s» da la reserva por hecha',
    (m) => expect(signalsBooked(m)).toBe(true),
  );
  it.each(['Por la tarde', 'Vale, ahora lo miro', 'Me duele mucho', 'Gracias', 'He hecho fisio, osteopatía y de todo un poco', 'Estoy lista para empezar con lo que haga falta de verdad'])('«%s» no', (m) =>
    expect(signalsBooked(m)).toBe(false),
  );
});

describe('claimsBookingConfirmed', () => {
  it.each([
    'Pues ya está reservada 🙌 El enlace de la videollamada te llega automáticamente al correo.',
    'Perfecto, tu cita queda reservada para el miércoles',
    'Genial, la videollamada está confirmada',
    'Ya tienes tu cita, nos vemos!',
    "Great, you're booked!",
  ])('«%s» la da por hecha', (t) => expect(claimsBookingConfirmed(t)).toBe(true));
  it.each([
    'Te paso la agenda para que veas los huecos disponibles',
    'Cuando lo tengas dime y compruebo que haya quedado correctamente reservado 😊',
    'Genial! En cuanto me aparezca la reserva en la agenda te la confirmo por aquí con el día y la hora 😊',
  ])('«%s» no', (t) => expect(claimsBookingConfirmed(t)).toBe(false));
});

describe('bookingLinkAlreadySent', () => {
  it('detecta el enlace del widget en lo que dijo el setter', () => {
    expect(
      bookingLinkAlreadySent([
        { role: 'assistant', content: 'https://api.leadconnectorhq.com/widget/booking/Ur6y2sCkndEVLLQJ8n05?fyzon_lead_uuid=svc' },
      ]),
    ).toBe(true);
    expect(bookingLinkAlreadySent([{ role: 'user', content: 'hola' }])).toBe(false);
  });
});

function fakeSupabase(rows: Record<string, unknown>) {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  return {
    inserts,
    client: {
      from(table: string) {
        let isWrite = false;
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          insert: (payload: unknown) => {
            isWrite = true;
            inserts.push({ table, payload });
            return builder;
          },
          maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: isWrite ? (inserts.at(-1)!.payload as unknown[]).map((_, i) => ({ id: 100 + i })) : rows[table] ?? null,
              error: null,
            }).then(resolve),
        };
        return builder;
      },
    } as any,
  };
}

describe('sendBookingConfirmation', () => {
  const NOW = new Date('2026-11-10T03:07:15Z');
  const rows = {
    conversations: { id: 15147, lead_id: 14894, channel_id: 8 },
    leads: { timezone: 'America/Mexico_City' },
    integration_accounts: { id: 6 },
    tenant_configs: { active_conversation_delay: '00:00:30' },
  };

  it('cita nueva y futura: programa la confirmación con fecha, hora y zona', async () => {
    loadLqMock.mockResolvedValue({ booking_confirmation: { enabled: true } });
    const { client, inserts } = fakeSupabase(rows);
    const out = await sendBookingConfirmation({
      supabase: client,
      tenantId: 7,
      conversationId: 15147,
      startIso: '2026-11-16T16:00:00Z',
      bookedAtIso: '2026-11-10T03:05:43Z',
      now: NOW,
    });
    expect(out.sent).toBe(true);
    const schedule = inserts.find((i) => i.table === 'message_schedules')!.payload as Array<{ message: string; triggered_by: string }>;
    expect(schedule[0]!.message).toContain('lunes 16 de noviembre a las 10:00 (hora de México)');
    // Pasa el gate de salida aunque el applier haya pausado la IA.
    expect(schedule[0]!.triggered_by).toBe('ai_turn');
  });

  it('sin la config activa, no manda nada', async () => {
    loadLqMock.mockResolvedValue({});
    const { client, inserts } = fakeSupabase(rows);
    const out = await sendBookingConfirmation({ supabase: client, tenantId: 7, conversationId: 1, startIso: '2026-11-16T16:00:00Z', now: NOW });
    expect(out).toEqual({ sent: false, reason: 'disabled' });
    expect(inserts).toHaveLength(0);
  });

  it('un volcado de citas antiguas no le escribe a nadie', async () => {
    loadLqMock.mockResolvedValue({ booking_confirmation: { enabled: true } });
    const { client, inserts } = fakeSupabase(rows);
    const past = await sendBookingConfirmation({ supabase: client, tenantId: 7, conversationId: 1, startIso: '2026-11-01T16:00:00Z', now: NOW });
    expect(past.reason).toBe('past');
    const old = await sendBookingConfirmation({
      supabase: client,
      tenantId: 7,
      conversationId: 1,
      startIso: '2026-11-16T16:00:00Z',
      bookedAtIso: '2026-11-05T10:00:00Z',
      now: NOW,
    });
    expect(old.reason).toBe('old_booking');
    expect(inserts).toHaveLength(0);
  });
});
