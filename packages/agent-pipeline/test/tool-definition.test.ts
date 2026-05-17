import { describe, it, expect } from 'vitest';
import {
  respondAsSetterTool,
  RESPOND_AS_SETTER_TOOL_NAME,
} from '../src/tool-definition.js';
import { validateSetterOutput } from '../src/generator.js';

describe('respondAsSetterTool schema', () => {
  it('exposes the expected name', () => {
    expect(respondAsSetterTool.name).toBe('respond_as_setter');
    expect(RESPOND_AS_SETTER_TOOL_NAME).toBe('respond_as_setter');
  });

  it('declares required fields', () => {
    const schema = respondAsSetterTool.input_schema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual([
      'message_raw',
      'conversation_status',
      'phase_decision',
    ]);
    expect(schema.properties).toHaveProperty('user_summary');
    expect(schema.properties).toHaveProperty('resources_to_send');
    expect(schema.properties).toHaveProperty('handoff_cause');
  });
});

describe('validateSetterOutput', () => {
  it('accepts a minimal valid payload', () => {
    const out = validateSetterOutput({
      message_raw: 'Hola pana, ¿cómo va la chamba?',
      conversation_status: 'active',
      phase_decision: 1,
    });
    expect(out.message_raw).toContain('chamba');
    expect(out.conversation_status).toBe('active');
    expect(out.phase_decision).toBe(1);
  });

  it('preserves optional fields', () => {
    const out = validateSetterOutput({
      message_raw: 'Genial 💪 Te dejo el enlace.',
      conversation_status: 'qualified',
      phase_decision: 6,
      user_summary: 'Lead con 3 hijos, 35 años, busca eficiencia.',
      resources_to_send: ['drive_lead_magnet'],
      reasoning: 'Resultados claros, freno claro, listo para puente.',
    });
    expect(out.user_summary).toContain('hijos');
    expect(out.resources_to_send).toEqual(['drive_lead_magnet']);
    expect(out.reasoning).toBeTruthy();
  });

  it('rejects empty message_raw', () => {
    expect(() =>
      validateSetterOutput({
        message_raw: '',
        conversation_status: 'active',
        phase_decision: 1,
      }),
    ).toThrow(/empty `message_raw`/);
  });

  it('rejects invalid conversation_status', () => {
    expect(() =>
      validateSetterOutput({
        message_raw: 'hi',
        conversation_status: 'unknown',
        phase_decision: 1,
      }),
    ).toThrow(/invalid conversation_status/);
  });

  it('rejects out-of-range phase_decision', () => {
    expect(() =>
      validateSetterOutput({
        message_raw: 'hi',
        conversation_status: 'active',
        phase_decision: 0,
      }),
    ).toThrow(/invalid phase_decision/);
    expect(() =>
      validateSetterOutput({
        message_raw: 'hi',
        conversation_status: 'active',
        phase_decision: 8,
      }),
    ).toThrow(/invalid phase_decision/);
  });

  it('rejects non-object input', () => {
    expect(() => validateSetterOutput('not an object')).toThrow();
    expect(() => validateSetterOutput(null)).toThrow();
  });

  it('drops invalid handoff_cause silently (only valid enum kept)', () => {
    const out = validateSetterOutput({
      message_raw: 'hi',
      conversation_status: 'handoff',
      phase_decision: 7,
      handoff_cause: 'NOT_VALID',
    });
    expect(out.handoff_cause).toBeUndefined();
  });

  // Hito 10.6 — proposed_booking_slot (API booking)
  it('preserva proposed_booking_slot cuando es string ISO 8601 no vacío', () => {
    const out = validateSetterOutput({
      message_raw: 'Listo, te apunto para el lunes 17h.',
      conversation_status: 'qualified',
      phase_decision: 6,
      proposed_booking_slot: '2026-05-19T17:00:00+02:00',
    });
    expect(out.proposed_booking_slot).toBe('2026-05-19T17:00:00+02:00');
  });

  it('trim whitespace en proposed_booking_slot', () => {
    const out = validateSetterOutput({
      message_raw: 'ok',
      conversation_status: 'qualified',
      phase_decision: 6,
      proposed_booking_slot: '  2026-05-19T17:00:00+02:00  ',
    });
    expect(out.proposed_booking_slot).toBe('2026-05-19T17:00:00+02:00');
  });

  it('descarta proposed_booking_slot si es string vacío o no-string', () => {
    const out1 = validateSetterOutput({
      message_raw: 'ok',
      conversation_status: 'active',
      phase_decision: 6,
      proposed_booking_slot: '',
    });
    expect(out1.proposed_booking_slot).toBeUndefined();

    const out2 = validateSetterOutput({
      message_raw: 'ok',
      conversation_status: 'active',
      phase_decision: 6,
      proposed_booking_slot: '   ',
    });
    expect(out2.proposed_booking_slot).toBeUndefined();

    const out3 = validateSetterOutput({
      message_raw: 'ok',
      conversation_status: 'active',
      phase_decision: 6,
      proposed_booking_slot: 12345,
    });
    expect(out3.proposed_booking_slot).toBeUndefined();
  });
});
