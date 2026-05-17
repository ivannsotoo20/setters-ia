import { describe, it, expect, vi } from 'vitest';
import {
  createAppointment,
  flattenFreeSlots,
  getFreeSlots,
  GhlSlotConflictError,
} from '../src/calendars.js';
import type { GhlFreeSlotsResponse } from '../src/types-calendar.js';

/**
 * Tests del API Booking (Hito 10.6).
 *  - getFreeSlots: URL/query, parsing del response GHL.
 *  - flattenFreeSlots: aplana keys de fecha + ordena + descarta metadata.
 *  - createAppointment: body shape, GhlSlotConflictError en 409/422.
 */

function makeFetchMock(response: { ok: boolean; status: number; text: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.text),
  });
}

describe('getFreeSlots', () => {
  it('hits GET /calendars/{id}/free-slots con startDate/endDate/timezone en query', async () => {
    const response: GhlFreeSlotsResponse = {
      '2026-05-19': { slots: ['2026-05-19T15:00:00+02:00', '2026-05-19T15:30:00+02:00'] },
      '2026-05-20': { slots: ['2026-05-20T10:00:00+02:00'] },
      traceId: 'abc-123',
    };
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify(response),
    });

    const startDate = new Date('2026-05-19T00:00:00Z');
    const endDate = new Date('2026-05-26T00:00:00Z');

    const result = await getFreeSlots(
      'tok',
      'cal_abc',
      { startDate, endDate, timezone: 'Europe/Madrid' },
      fetchImpl,
    );

    expect(result['2026-05-19']).toEqual({ slots: ['2026-05-19T15:00:00+02:00', '2026-05-19T15:30:00+02:00'] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/calendars/cal_abc/free-slots');
    expect(url).toContain(`startDate=${startDate.getTime()}`);
    expect(url).toContain(`endDate=${endDate.getTime()}`);
    expect(url).toContain('timezone=Europe%2FMadrid');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('default range = ahora a +14 días si no se pasa', async () => {
    const fetchImpl = makeFetchMock({ ok: true, status: 200, text: '{}' });
    const before = Date.now();
    await getFreeSlots('tok', 'cal_x', undefined, fetchImpl);
    const after = Date.now();

    const [url] = fetchImpl.mock.calls[0]!;
    const urlObj = new URL(url as string);
    const startMs = Number(urlObj.searchParams.get('startDate'));
    const endMs = Number(urlObj.searchParams.get('endDate'));
    expect(startMs).toBeGreaterThanOrEqual(before);
    expect(startMs).toBeLessThanOrEqual(after);
    expect(endMs - startMs).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('rechaza si calendarId vacío', async () => {
    await expect(getFreeSlots('tok', '')).rejects.toThrow(/calendarId requerido/);
  });

  it('rechaza si startDate >= endDate', async () => {
    const now = new Date();
    await expect(
      getFreeSlots('tok', 'cal_x', { startDate: now, endDate: now }, makeFetchMock({ ok: true, status: 200, text: '{}' })),
    ).rejects.toThrow(/startDate debe ser anterior/);
  });
});

describe('flattenFreeSlots', () => {
  it('aplana keys YYYY-MM-DD a array cronológico con date/time/iso', () => {
    const response: GhlFreeSlotsResponse = {
      '2026-05-20': { slots: ['2026-05-20T10:00:00+02:00'] },
      '2026-05-19': { slots: ['2026-05-19T17:00:00+02:00', '2026-05-19T15:00:00+02:00'] },
      traceId: 'xxx',
      _meta: { foo: 'bar' },
    };
    const flat = flattenFreeSlots(response);
    expect(flat).toEqual([
      { iso: '2026-05-19T15:00:00+02:00', date: '2026-05-19', time: '15:00' },
      { iso: '2026-05-19T17:00:00+02:00', date: '2026-05-19', time: '17:00' },
      { iso: '2026-05-20T10:00:00+02:00', date: '2026-05-20', time: '10:00' },
    ]);
  });

  it('recorta a maxSlots si se pasa', () => {
    const response: GhlFreeSlotsResponse = {
      '2026-05-19': {
        slots: [
          '2026-05-19T10:00:00+02:00',
          '2026-05-19T11:00:00+02:00',
          '2026-05-19T12:00:00+02:00',
          '2026-05-19T13:00:00+02:00',
        ],
      },
    };
    const flat = flattenFreeSlots(response, 2);
    expect(flat).toHaveLength(2);
    expect(flat[0]!.time).toBe('10:00');
    expect(flat[1]!.time).toBe('11:00');
  });

  it('descarta keys no-fecha (traceId, etc.) sin errorear', () => {
    const response = {
      traceId: 'no-es-fecha',
      'no-iso': 'tampoco',
      '2026-05-19': { slots: ['2026-05-19T10:00:00+02:00'] },
    } as unknown as GhlFreeSlotsResponse;
    const flat = flattenFreeSlots(response);
    expect(flat).toHaveLength(1);
  });

  it('devuelve [] si response vacío', () => {
    expect(flattenFreeSlots({})).toEqual([]);
  });

  it('ignora slots vacíos o no-string', () => {
    const response: GhlFreeSlotsResponse = {
      '2026-05-19': {
        // @ts-expect-error — intencionalmente mixto para test robustez
        slots: ['2026-05-19T10:00:00+02:00', '', null, 123, '   '],
      },
    };
    const flat = flattenFreeSlots(response);
    expect(flat).toHaveLength(1);
    expect(flat[0]!.iso).toBe('2026-05-19T10:00:00+02:00');
  });
});

describe('createAppointment', () => {
  it('POST /calendars/events/appointments con body completo', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 201,
      text: JSON.stringify({
        appointment: {
          id: 'appt_xyz',
          calendarId: 'cal_abc',
          contactId: 'cnt_real',
          startTime: '2026-05-19T17:00:00+02:00',
          endTime: '2026-05-19T17:45:00+02:00',
          appointmentStatus: 'confirmed',
        },
      }),
    });

    const result = await createAppointment(
      'tok',
      {
        calendarId: 'cal_abc',
        locationId: 'loc_1',
        contactId: 'cnt_real',
        startTime: '2026-05-19T17:00:00+02:00',
        endTime: '2026-05-19T17:45:00+02:00',
        title: 'Setters IA — Lead',
        appointmentStatus: 'confirmed',
      },
      fetchImpl,
    );

    expect(result.id).toBe('appt_xyz');
    expect(result.contactId).toBe('cnt_real');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/calendars/events/appointments');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.calendarId).toBe('cal_abc');
    expect(body.locationId).toBe('loc_1');
    expect(body.contactId).toBe('cnt_real');
    expect(body.startTime).toBe('2026-05-19T17:00:00+02:00');
    expect(body.endTime).toBe('2026-05-19T17:45:00+02:00');
    expect(body.title).toBe('Setters IA — Lead');
    expect(body.appointmentStatus).toBe('confirmed');
  });

  it('acepta response sin wrapper {appointment} (devuelve obj directo)', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({
        id: 'appt_flat',
        calendarId: 'cal_1',
        contactId: 'cnt_1',
        startTime: 'x',
        endTime: 'y',
        appointmentStatus: 'confirmed',
      }),
    });

    const result = await createAppointment(
      'tok',
      { calendarId: 'cal_1', locationId: 'loc_1', contactId: 'cnt_1', startTime: 'x' },
      fetchImpl,
    );
    expect(result.id).toBe('appt_flat');
  });

  it('lanza GhlSlotConflictError en 409', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 409,
      text: JSON.stringify({ message: 'Slot ya reservado' }),
    });

    await expect(
      createAppointment(
        'tok',
        { calendarId: 'cal_1', locationId: 'loc_1', contactId: 'cnt_1', startTime: 'x' },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(GhlSlotConflictError);
  });

  it('lanza GhlSlotConflictError en 422', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 422,
      text: JSON.stringify({ message: 'Slot fuera de horario' }),
    });

    await expect(
      createAppointment(
        'tok',
        { calendarId: 'cal_1', locationId: 'loc_1', contactId: 'cnt_1', startTime: 'x' },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(GhlSlotConflictError);
  });

  it('propaga otros errores HTTP (401/500) sin envolver en SlotConflictError', async () => {
    const fetchImpl = makeFetchMock({
      ok: false,
      status: 401,
      text: JSON.stringify({ message: 'Bad token' }),
    });

    await expect(
      createAppointment(
        'tok',
        { calendarId: 'cal_1', locationId: 'loc_1', contactId: 'cnt_1', startTime: 'x' },
        fetchImpl,
      ),
    ).rejects.not.toBeInstanceOf(GhlSlotConflictError);
  });

  it.each([
    ['calendarId', { calendarId: '', locationId: 'loc', contactId: 'cnt', startTime: 't' }],
    ['locationId', { calendarId: 'cal', locationId: '', contactId: 'cnt', startTime: 't' }],
    ['contactId', { calendarId: 'cal', locationId: 'loc', contactId: '', startTime: 't' }],
    ['startTime', { calendarId: 'cal', locationId: 'loc', contactId: 'cnt', startTime: '' }],
  ])('rechaza si %s vacío', async (_field, input) => {
    await expect(createAppointment('tok', input)).rejects.toThrow();
  });
});
