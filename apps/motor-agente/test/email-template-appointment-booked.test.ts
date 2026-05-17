import { describe, it, expect } from 'vitest';
import { renderEmailTemplate } from '../src/lib/email-templates.js';

/**
 * Tests del template renderAppointmentBooked (Hito 10.5).
 *
 * Verifica que el HTML del email contiene:
 *  - matched WA: nombre + canal "WhatsApp" + phone E.164 + calendar + CTA conversación.
 *  - matched IG: nombre + canal "Instagram" + @handle + calendar + CTA conversación.
 *  - matched FB: nombre + canal "Facebook" + @handle + calendar + CTA conversación.
 *  - unmatched: subject "sin matchear" + datos del contacto GHL + CTA a /calendars.
 *  - sin channel_kind: omite la fila Canal.
 *  - hora se formatea es-ES Europe/Madrid.
 */

const TENANT = 'Pablo Trainer';

describe('renderAppointmentBooked — matched', () => {
  it('WhatsApp lead: incluye canal + phone + calendar + CTA conversación', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      trainerName: 'Pablo',
      payload: {
        unmatched: false,
        conversation_id: 123,
        lead_id: 42,
        lead_first_name: 'María',
        lead_phone: '+34666123456',
        contact_email: null,
        channel_kind: 'whatsapp',
        channel_handle: '+34666123456',
        appointment_time: '2026-06-15T17:30:00.000Z',
        calendar_name: 'Discovery Call · Pablo',
        match_method: 'fyzon_uuid',
        match_confidence: 100,
      },
    });

    expect(r.subject).toBe('Cita agendada · María · WhatsApp');
    expect(r.html).toContain('Pablo'); // greeting
    expect(r.html).toContain('María');
    expect(r.html).toContain('Canal');
    expect(r.html).toContain('WhatsApp · +34666123456');
    expect(r.html).toContain('Discovery Call · Pablo');
    expect(r.html).toContain('/conversations/123');
    expect(r.html).toContain('Ver conversación');
    expect(r.html).not.toContain('sin matchear');
  });

  it('Instagram lead: incluye canal + @handle', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      trainerName: null,
      payload: {
        unmatched: false,
        conversation_id: 7,
        lead_first_name: 'Lucas',
        channel_kind: 'instagram_dm',
        channel_handle: '@lucas_lifts',
        appointment_time: '2026-06-15T17:30:00.000Z',
        calendar_name: 'Asesoría',
      },
    });

    expect(r.subject).toBe('Cita agendada · Lucas · Instagram');
    expect(r.html).toContain('Instagram · @lucas_lifts');
    expect(r.html).toContain('/conversations/7');
    // sin trainerName → no greeting
    expect(r.html).not.toMatch(/Hola\s+[A-Z]/);
  });

  it('Facebook lead: incluye canal + handle', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      payload: {
        unmatched: false,
        conversation_id: 9,
        lead_first_name: 'Ana',
        channel_kind: 'facebook_messenger',
        channel_handle: 'ana.fb',
        appointment_time: '2026-06-15T17:30:00.000Z',
        calendar_name: 'Coaching 1:1',
      },
    });

    expect(r.subject).toBe('Cita agendada · Ana · Facebook');
    expect(r.html).toContain('Facebook · ana.fb');
  });

  it('sin channel_kind: omite la fila Canal pero mantiene el lead', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      payload: {
        unmatched: false,
        conversation_id: 1,
        lead_first_name: 'Sin canal',
        channel_kind: null,
        channel_handle: null,
        appointment_time: '2026-06-15T17:30:00.000Z',
        calendar_name: 'Default',
      },
    });

    expect(r.subject).toBe('Cita agendada · Sin canal');
    expect(r.html).toContain('Sin canal');
    expect(r.html).not.toContain('WhatsApp · ');
    expect(r.html).not.toContain('Instagram · ');
    expect(r.html).not.toContain('Facebook · ');
  });
});

describe('renderAppointmentBooked — unmatched', () => {
  it('booking huérfano: subject + datos GHL + CTA a /calendars', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      trainerName: 'Pablo',
      payload: {
        unmatched: true,
        conversation_id: null,
        lead_id: null,
        lead_first_name: 'Carlos GHL',
        lead_phone: '+34999000111',
        contact_email: 'carlos@example.com',
        channel_kind: null,
        channel_handle: null,
        appointment_time: '2026-07-01T10:00:00.000Z',
        calendar_name: 'Discovery',
        match_method: 'unmatched',
        match_confidence: 0,
      },
    });

    expect(r.subject).toBe('Cita agendada (sin matchear) · revisar');
    expect(r.html).toContain('no hemos podido matchearlo');
    expect(r.html).toContain('+34999000111');
    expect(r.html).toContain('carlos@example.com');
    expect(r.html).toContain('Discovery');
    expect(r.html).toContain('/calendars');
    expect(r.html).toContain('Ver en Calendarios');
    expect(r.html).not.toContain('/conversations/');
  });
});

describe('renderAppointmentBooked — formato hora', () => {
  it('hora se formatea en español Europe/Madrid', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      payload: {
        unmatched: false,
        conversation_id: 1,
        lead_first_name: 'Test',
        channel_kind: 'whatsapp',
        channel_handle: '+34666',
        // 17:30 UTC = 19:30 Europe/Madrid (CEST verano)
        appointment_time: '2026-06-15T17:30:00.000Z',
        calendar_name: 'Test',
      },
    });

    // El DateTimeFormat en es-ES con dateStyle:full produce algo como
    // "lunes, 15 de junio de 2026, 19:30". Aceptamos múltiples variaciones
    // (separadores y formato de minutos pueden diferir entre runtimes Node).
    expect(r.html).toMatch(/junio/);
    expect(r.html).toMatch(/2026/);
    expect(r.html).toMatch(/19:30/);
  });

  it('hora ISO inválida: fallback al string crudo (no rompe el render)', () => {
    const r = renderEmailTemplate('appointment_booked', {
      tenantName: TENANT,
      payload: {
        unmatched: false,
        conversation_id: 1,
        lead_first_name: 'Test',
        channel_kind: null,
        appointment_time: 'no-es-iso',
        calendar_name: 'Test',
      },
    });

    expect(r.html).toContain('no-es-iso');
  });
});
