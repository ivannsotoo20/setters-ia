import { describe, it, expect } from 'vitest';
import { validateMessage, type ValidationContext } from '../src/index.js';

/**
 * V20 — con `zoneRejected` encendido, ningún turno puede llevar una URL.
 *
 * Caso real (tenant 7, 2026-09-11): +502 (Guatemala) recibió el enlace de agenda.
 */

const URL = 'https://api.leadconnectorhq.com/widget/booking/wC54o4jXWdev4UDKsOka?fyzon_lead_uuid=abc';

const base: ValidationContext = {
  tenantId: 7,
  conversationId: 11660,
  currentPhase: 6,
  channel: 'whatsapp',
};

describe('validator V20 enlace a persona fuera de zona', () => {
  it('con zoneRejected, una URL es error', () => {
    const r = validateMessage(`Genial, pues te dejo por aquí el enlace:\n\n${URL}`, {
      ...base,
      zoneRejected: true,
    });
    const v = r.violations.find((x) => x.ruleId === 'V20');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('error');
    expect(v?.match).toBe(URL);
    expect(r.hasErrors).toBe(true);
  });

  it('con zoneRejected, el cierre de fuera de zona sin URL pasa', () => {
    const r = validateMessage(
      'En mi perfil tienes mucho contenido para ir avanzando con tu espalda\n\nCualquier duda que te surja, escríbeme, aquí me tienes',
      { ...base, zoneRejected: true },
    );
    expect(r.violations.find((x) => x.ruleId === 'V20')).toBeUndefined();
  });

  it('sin zoneRejected, la misma URL no es asunto de V20', () => {
    for (const ctx of [base, { ...base, zoneRejected: false }]) {
      const r = validateMessage(`Te dejo el enlace:\n\n${URL}`, ctx);
      expect(r.violations.find((x) => x.ruleId === 'V20')).toBeUndefined();
    }
  });

  it('http a secas también cuenta como enlace', () => {
    const r = validateMessage('Mira http://ejemplo.com/agenda', { ...base, zoneRejected: true });
    expect(r.violations.find((x) => x.ruleId === 'V20')).toBeDefined();
  });
});
