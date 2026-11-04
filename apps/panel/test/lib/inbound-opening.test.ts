import { describe, it, expect } from 'vitest';
import { isBareKeywordOpening, normalizeOpening } from '../../lib/inbound-opening';
import { isInboundConv } from '../../lib/widget-catalog';
import type { ConvSnapshot } from '../../lib/dashboard-metrics';

/**
 * Inbound de verdad vs flujo de palabra clave (2026-10-21, Tania).
 *
 * Las funciones viven en `@fyzon/shared-validator` desde 2026-11-04 y sus
 * fixtures están en `packages/shared-validator/test/inbound-opening.test.ts`.
 * Aquí queda lo que es del panel: que el re-export resuelve y `isInboundConv`.
 */

describe('lib/inbound-opening (re-export de @fyzon/shared-validator)', () => {
  it('resuelve las funciones del package', () => {
    expect(normalizeOpening('Siii😊')).toBe('si');
    expect(isBareKeywordOpening('Hola, espalda', ['Espalda'])).toBe(true);
    expect(isBareKeywordOpening('Tengo una hernia y me gustaría saber cómo me puedes ayudar', ['Hernia'])).toBe(false);
  });
});

describe('isInboundConv', () => {
  const conv = (over: Partial<ConvSnapshot>): ConvSnapshot =>
    ({ id: 1, state: 'open', is_qualified: null, phase_number: 1, channel_id: 1, direction: 'inbound', last_message_at: null, created_at: '2026-10-20T00:00:00Z', ...over }) as ConvSnapshot;

  it('fuera el flujo de palabra clave; dentro lo que escribió ella', () => {
    expect(isInboundConv(conv({ inbound_keyword_flow: true }))).toBe(false);
    expect(isInboundConv(conv({ inbound_keyword_flow: false }))).toBe(true);
    expect(isInboundConv(conv({}))).toBe(true);
    expect(isInboundConv(conv({ direction: 'outbound' }))).toBe(false);
  });
});
