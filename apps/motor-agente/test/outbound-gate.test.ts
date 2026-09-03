import { describe, it, expect } from 'vitest';
import { outboundGateSkipReason, type ConvState } from '../src/services/outbound-sender.js';

// =============================================================================
// Sprint Iota.3 hotfix CRÍTICO (2026-05-12) — outbound gate.
//
// Bug previo confirmado en prod: el cron outbound-sender enviaba schedules
// pending (follow_up) SIN comprobar el estado de la conv. Resultado:
//   - 3 leads de Instagram con ai_paused_until='9999-12-31' recibieron FU
//     pese a tener la IA pausada por el trainer.
//
// Estos tests cubren la doctrina nueva: "IA pausada/bloqueada/cerrada =
// motor NO envía outbound". El helper se invoca por cada candidate del batch
// antes de procesarlo.
// =============================================================================

function cv(overrides: Partial<ConvState>): ConvState {
  return {
    id: 1,
    state: 'active',
    is_blocked: false,
    ai_paused_until: null,
    ...overrides,
  };
}

describe('outboundGateSkipReason', () => {
  it('conv activa + IA activa + no bloqueada → null (envía)', () => {
    expect(outboundGateSkipReason(cv({}))).toBeNull();
  });

  it('conv no encontrada → "conv not found"', () => {
    expect(outboundGateSkipReason(undefined)).toBe('conv not found');
  });

  it('state=closed → "conv state=closed" (no envía)', () => {
    expect(outboundGateSkipReason(cv({ state: 'closed' }))).toBe('conv state=closed');
  });

  it('is_blocked=true → "conv is_blocked" (no envía)', () => {
    expect(outboundGateSkipReason(cv({ is_blocked: true }))).toBe('conv is_blocked');
  });

  it('ai_paused_until=infinity → "ai paused" (no envía)', () => {
    expect(outboundGateSkipReason(cv({ ai_paused_until: 'infinity' }))).toBe('ai paused');
  });

  it('ai_paused_until=9999-12-31 (timestamp futuro lejano) → "ai paused"', () => {
    // Caso real del bug: trainer pausó IA y BD guardó '9999-12-31 23:59:59+00'.
    expect(outboundGateSkipReason(cv({ ai_paused_until: '9999-12-31T23:59:59.000Z' }))).toBe(
      'ai paused',
    );
  });

  it('ai_paused_until=ISO futuro próximo → "ai paused"', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(outboundGateSkipReason(cv({ ai_paused_until: future }))).toBe('ai paused');
  });

  it('ai_paused_until=ISO pasado → null (pausa expirada, IA activa)', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(outboundGateSkipReason(cv({ ai_paused_until: past }))).toBeNull();
  });

  it('orden de precedencia: is_blocked antes que closed y antes que pause', () => {
    // Si conv está bloqueada Y cerrada Y pausada, devolver razón de "is_blocked":
    // es la única que se aplica también a las partes del turno del bot.
    const all = cv({
      state: 'closed',
      is_blocked: true,
      ai_paused_until: 'infinity',
    });
    expect(outboundGateSkipReason(all)).toBe('conv is_blocked');
  });

  it('orden: is_blocked antes que pause si state=active', () => {
    const both = cv({ is_blocked: true, ai_paused_until: 'infinity' });
    expect(outboundGateSkipReason(both)).toBe('conv is_blocked');
  });

  it('fail-safe: ai_paused_until con valor no parseable → "ai paused"', () => {
    // isAiPausedFromDb es fail-safe: si no entiende el valor, asume pausa.
    expect(outboundGateSkipReason(cv({ ai_paused_until: 'not-a-date' }))).toBe('ai paused');
  });
});

// =============================================================================
// 2026-09-03 — las partes del propio turno del bot (triggered_by='ai_turn') y
// las manuales del trainer salen aunque la conversación acabe de cerrarse.
//
// Bug confirmado en prod (tenant 7, una semana): el turno que hace handoff o
// confirma la cita pone state='closed' y el gate cancelaba sus propias partes:
// "Pues ya está reservada 🙌" (x3), el enlace de contacto que la persona pidió,
// y "Soy la asistente virtual de Tania. Le paso tu caso" (la persona preguntó
// si hablaba con una IA y se quedó sin respuesta 6 días).
// =============================================================================
describe('outboundGateSkipReason — partes del turno actual (skipPauseCheck)', () => {
  const own = { skipPauseCheck: true };

  it('state=closed → sale: es el mensaje de cierre del propio turno', () => {
    expect(outboundGateSkipReason(cv({ state: 'closed' }), own)).toBeNull();
  });

  it('closed + IA pausada infinity (handoff) → sale igualmente', () => {
    expect(outboundGateSkipReason(cv({ state: 'closed', ai_paused_until: 'infinity' }), own)).toBeNull();
  });

  it('is_blocked manda siempre, también para el turno actual', () => {
    expect(outboundGateSkipReason(cv({ state: 'closed', is_blocked: true }), own)).toBe('conv is_blocked');
  });

  it('un follow-up programado (sin skipPauseCheck) sobre una conv cerrada se sigue cancelando', () => {
    expect(outboundGateSkipReason(cv({ state: 'closed' }), { skipPauseCheck: false })).toBe('conv state=closed');
  });
});
