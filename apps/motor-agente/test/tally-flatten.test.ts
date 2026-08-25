import { describe, it, expect } from 'vitest';
import { flattenTallyPayload } from '../src/routes/automation-lead-form.js';

/**
 * Aplanador del webhook nativo de Tally (2026-08-25).
 *
 * Antes lo hacía n8n; al apagarse (migración de Tania) el motor acepta el
 * FORM_RESPONSE directo. El payload de este test replica la forma real que
 * documenta Tally: fields con key/label/type/value, y las multiple-choice
 * con value = ids + options aparte.
 */

const TALLY_BODY = {
  eventId: 'e8d2c1a0-1111-2222-3333-444455556666',
  eventType: 'FORM_RESPONSE',
  createdAt: '2026-08-25T15:00:00.000Z',
  data: {
    responseId: 'r-abc123',
    submissionId: 'r-abc123',
    respondentId: 'resp-9',
    formId: 'KYBOW7',
    formName: 'Cuida tu Espalda — Quiz',
    createdAt: '2026-08-25T15:00:00.000Z',
    fields: [
      { key: 'question_1', label: 'Nombre', type: 'INPUT_TEXT', value: 'Marta' },
      {
        key: 'question_2',
        label: '¿Cuál es tu teléfono con WhatsApp?',
        type: 'INPUT_PHONE_NUMBER',
        value: '+34 600 12 34 56',
      },
      {
        key: 'question_3',
        label: '¿Dónde te duele?',
        type: 'MULTIPLE_CHOICE',
        value: ['opt-a'],
        options: [
          { id: 'opt-a', text: 'Zona lumbar' },
          { id: 'opt-b', text: 'Cervicales' },
        ],
      },
      {
        key: 'question_4',
        label: '¿Cuánto tiempo llevas así?',
        type: 'INPUT_TEXT',
        value: 'más de 2 años',
      },
      { key: 'question_5', label: 'Email', type: 'INPUT_EMAIL', value: 'marta@example.com' },
      { key: 'question_6', label: 'Comentarios', type: 'TEXTAREA', value: '' },
    ],
  },
};

describe('flattenTallyPayload', () => {
  it('aplana el FORM_RESPONSE real: phone por tipo, nombre y email por label', () => {
    const out = flattenTallyPayload(TALLY_BODY)!;
    expect(out).not.toBeNull();
    expect(out.phone).toBe('+34 600 12 34 56');
    expect(out.first_name).toBe('Marta');
    expect(out.email).toBe('marta@example.com');
    expect(out.source).toBe('tally');
    expect(out.external_id).toBe('r-abc123');
  });

  it('resuelve las opciones de choice a su TEXTO, no al id', () => {
    const out = flattenTallyPayload(TALLY_BODY)!;
    const answers = out.answers as Record<string, unknown>;
    expect(answers['¿Dónde te duele?']).toBe('Zona lumbar');
    // El id opaco no aparece por ningún lado — el setter leería "opt-a" y no
    // sabría qué hacer con ello.
    expect(JSON.stringify(answers)).not.toContain('opt-a');
  });

  it('las respuestas van completas y los campos vacíos se omiten', () => {
    const out = flattenTallyPayload(TALLY_BODY)!;
    const answers = out.answers as Record<string, unknown>;
    expect(answers['¿Cuánto tiempo llevas así?']).toBe('más de 2 años');
    expect('Comentarios' in answers).toBe(false);
  });

  it('sin campo de teléfono → null (no hay lead WA que crear)', () => {
    const sinTelefono = structuredClone(TALLY_BODY);
    sinTelefono.data.fields = sinTelefono.data.fields.filter(
      (f) => f.type !== 'INPUT_PHONE_NUMBER',
    );
    expect(flattenTallyPayload(sinTelefono)).toBeNull();
  });

  it('cae al label cuando el tipo de campo no es de teléfono', () => {
    const porLabel = structuredClone(TALLY_BODY);
    porLabel.data.fields = porLabel.data.fields.map((f) =>
      f.type === 'INPUT_PHONE_NUMBER' ? { ...f, type: 'INPUT_TEXT' } : f,
    );
    expect(flattenTallyPayload(porLabel)?.phone).toBe('+34 600 12 34 56');
  });

  it('los pseudo-campos booleanos de los CHECKBOXES de Tally no ensucian las answers', () => {
    // Tally manda cada checkbox por duplicado: el campo padre (value=[ids] +
    // options) y un pseudo-campo booleano por opción con label "Pregunta (Opción)".
    // Visto en el payload real del formulario de Tania.
    const conPseudo = structuredClone(TALLY_BODY);
    conPseudo.data.fields.push(
      {
        key: 'question_ZVKLJz_a',
        label: '¿Dónde te duele? (Zona lumbar)',
        type: 'CHECKBOXES',
        value: true,
      } as never,
      {
        key: 'question_ZVKLJz_b',
        label: '¿Dónde te duele? (Cervicales)',
        type: 'CHECKBOXES',
        value: false,
      } as never,
    );
    const answers = flattenTallyPayload(conPseudo)!.answers as Record<string, unknown>;
    expect('¿Dónde te duele? (Zona lumbar)' in answers).toBe(false);
    expect('¿Dónde te duele? (Cervicales)' in answers).toBe(false);
    // El texto elegido sigue estando, una sola vez, en el campo padre.
    expect(answers['¿Dónde te duele?']).toBe('Zona lumbar');
  });

  it('el nombre que sale es el primer nombre, no el nombre completo', () => {
    // La plantilla saluda "Hola {{nombre}}": con "Nombre y apellidos" completo
    // quedaría "Hola Kristel Sanchez". Mismo criterio que el nombre_corto del n8n.
    const completo = structuredClone(TALLY_BODY);
    completo.data.fields = completo.data.fields.map((f) =>
      f.label === 'Nombre' ? { ...f, label: 'Nombre y apellidos', value: 'Marta García López' } : f,
    );
    expect(flattenTallyPayload(completo)?.first_name).toBe('Marta');
  });

  it('un payload plano de siempre NO se toca (n8n / GHL Workflow siguen igual)', () => {
    expect(flattenTallyPayload({ phone: '+34600123456', first_name: 'Ana' })).toBeNull();
    expect(flattenTallyPayload(null)).toBeNull();
    expect(flattenTallyPayload({ eventType: 'FORM_RESPONSE' })).toBeNull();
  });
});
