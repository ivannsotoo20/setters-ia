import { describe, expect, it } from 'vitest';
import { asksForCountry } from '@fyzon/agent-pipeline';
import {
  countryAnswersOf,
  evaluateZone,
  parseZonePolicy,
  zoneExploreTurnsLeft,
  type ZonePolicy,
} from '../src/lib/zone-policy.js';
import { renderZoneBlock } from '../src/lib/lead-origin.js';
import { buildPhaseFocusInstruction } from '../src/lib/phase-focus.js';

/**
 * Margen antes del cierre de zona (2026-10-21, Tania): "cuando el país no
 * cualifica, el corte sigue siendo muy brusco; puede continuar un poco para
 * entender lo que necesita y ofrecerle el recurso que encaje". Con
 * `zone_explore_turns`, quien DICE que vive fuera recibe hasta N turnos para
 * eso; al agotarse, el cierre. El prefijo de WhatsApp sigue cerrando directo.
 */

const CIERRE = ['En mi perfil tienes mucho contenido para ir avanzando con tu espalda'];
const BASE = {
  zone_allowlist: { always: ['ES'], filtered: [] },
  country_reject_terms: ['Perú', 'Lima', 'Cuba'],
  zone_close_message: CIERRE,
};
const POLICY = parseZonePolicy({ ...BASE, zone_explore_turns: 2 })!;

type Msg = { role: 'user' | 'assistant'; content: string };

function left(history: Msg[], policy: ZonePolicy | null = POLICY, phone: string | null = null): number {
  const verdictAt = (h: ReadonlyArray<{ role: string; content: string }>) =>
    evaluateZone({
      phone,
      leadMessages: h.filter((m) => m.role === 'user').map((m) => m.content),
      countryAnswers: countryAnswersOf(h, asksForCountry),
      policy,
    });
  return zoneExploreTurnsLeft({ policy, verdict: verdictAt(history), history, verdictAt });
}

describe('parseZonePolicy — zone_explore_turns', () => {
  it('se lee como número entero de 1 a 3', () => {
    expect(POLICY.exploreTurns).toBe(2);
    expect(parseZonePolicy({ ...BASE, zone_explore_turns: 5 })!.exploreTurns).toBe(3);
  });

  it('sin la clave, con valores raros o sin cierre literal, no hay margen', () => {
    expect(parseZonePolicy(BASE)!.exploreTurns).toBeUndefined();
    for (const bad of [0, -1, 1.5, '2', null]) {
      expect(parseZonePolicy({ ...BASE, zone_explore_turns: bad })!.exploreTurns).toBeUndefined();
    }
    const { zone_close_message: _, ...sinCierre } = BASE;
    expect(parseZonePolicy({ ...sinCierre, zone_explore_turns: 2 })!.exploreTurns).toBeUndefined();
  });
});

describe('zoneExploreTurnsLeft', () => {
  const pregunta: Msg = { role: 'assistant', content: 'Por cierto, ¿desde dónde me escribes?' };

  it('en el turno en que contesta el país, quedan los 2', () => {
    expect(
      left([
        { role: 'user', content: 'Me duele la espalda' },
        pregunta,
        { role: 'user', content: 'De Perú' },
      ]),
    ).toBe(2);
  });

  it('cada tanda de mensajes nuestros después gasta uno, y no baja de 0', () => {
    const base: Msg[] = [
      { role: 'user', content: 'Me duele la espalda' },
      pregunta,
      { role: 'user', content: 'De Perú' },
      { role: 'assistant', content: 'Vaya, y qué es lo que más te molesta?' },
      { role: 'assistant', content: 'Cuéntame un poco' },
      { role: 'user', content: 'Al levantarme' },
    ];
    expect(left(base)).toBe(1);
    expect(
      left([
        ...base,
        { role: 'assistant', content: 'Y desde cuándo te pasa?' },
        { role: 'user', content: 'Hace años' },
      ]),
    ).toBe(0);
    expect(
      left([
        ...base,
        { role: 'assistant', content: 'Y desde cuándo?' },
        { role: 'user', content: 'Años' },
        { role: 'assistant', content: 'Y has probado algo?' },
        { role: 'user', content: 'No' },
      ]),
    ).toBe(0);
  });

  it('cuenta desde el mensaje en que lo dijo, no desde el principio', () => {
    expect(
      left([
        { role: 'assistant', content: 'Hola, por aquí Tânia 😊' },
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Qué te pasa con la espalda?' },
        { role: 'user', content: 'Rigidez' },
        { role: 'assistant', content: 'Desde cuándo?' },
        { role: 'user', content: 'Años. Vivo en Lima' },
      ]),
    ).toBe(2);
  });

  it('sin margen configurado, en zona o por prefijo de fuera, 0', () => {
    const peru: Msg[] = [{ role: 'user', content: 'Vivo en Lima' }];
    expect(left(peru, parseZonePolicy(BASE))).toBe(0);
    expect(left([{ role: 'user', content: 'Vivo en Madrid' }])).toBe(0);
    expect(left([{ role: 'user', content: 'Me duele la espalda' }], POLICY, '+51987654321')).toBe(0);
  });
});

describe('directivas con margen', () => {
  const DECLARADA = { kind: 'reject_by_declaration' as const, term: 'lima', excerpt: 'vivo en Lima' };

  it('la sección de zona deja una pregunta sobre lo suyo y cuenta los turnos', () => {
    const block = renderZoneBlock(DECLARADA, { closeWithResource: true, exploreTurnsLeft: 2 })!;
    expect(block).toContain('una pregunta sobre lo que le pasa');
    expect(block).toContain('lo que cualifica, como el tiempo, ya no se pregunta');
    expect(block).toContain('Te quedan 2 turnos');
    expect(block).toContain('sin enlace de agenda');
    expect(renderZoneBlock(DECLARADA, { closeWithResource: true, exploreTurnsLeft: 1 })!).toContain('Te queda 1 turno');
  });

  it('sin margen, la de siempre: el cierre en este turno', () => {
    const block = renderZoneBlock(DECLARADA, { closeWithResource: true, exploreTurnsLeft: 0 })!;
    expect(block).toContain('En este turno, tu mensaje es el cierre');
  });

  it('el prefijo no tiene margen aunque se lo pasen', () => {
    const prefijo = { kind: 'reject_by_prefix' as const, country: { iso: 'PE', name: 'Perú', prefix: '51' } };
    expect(renderZoneBlock(prefijo as any, { exploreTurnsLeft: 2 })!).toContain('tu mensaje es el cierre');
  });

  it('la focal: con margen, pregunta o cierre; sin margen, cierre', () => {
    const conMargen = buildPhaseFocusInstruction(2, false, {
      zoneClose: true,
      zoneCloseWithResource: true,
      zoneExploreTurnsLeft: 2,
    });
    expect(conMargen).toContain('UNA pregunta sobre lo suyo');
    expect(conMargen).toContain('quedan 2 turnos');
    expect(conMargen).toContain('conversation_status="disqualified"');
    const sinMargen = buildPhaseFocusInstruction(2, false, { zoneClose: true, zoneExploreTurnsLeft: 0 });
    expect(sinMargen).toContain('ESTE TURNO CIERRA POR RESIDENCIA');
  });
});
