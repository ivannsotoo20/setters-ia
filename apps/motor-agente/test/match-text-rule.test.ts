import { describe, it, expect } from 'vitest';
import {
  matchTextRule,
  normalizeForMatch,
  type MatchableRule,
} from '../src/services/labels/match-text-rule.js';

function makeRule(overrides: Partial<MatchableRule> = {}): MatchableRule {
  return {
    id: 1,
    triggerType: 'text_contains',
    triggerWho: 'lead',
    triggerValue: { text: 'precio' },
    isActive: true,
    ...overrides,
  };
}

describe('normalizeForMatch', () => {
  it('lowercase + trim + colapsa espacios múltiples', () => {
    expect(normalizeForMatch('  Hola   Mundo  ')).toBe('hola mundo');
  });

  it('idempotente', () => {
    const norm = normalizeForMatch('Foo Bar');
    expect(normalizeForMatch(norm)).toBe(norm);
  });
});

describe('matchTextRule — text_contains', () => {
  it('match si el body contiene la palabra', () => {
    expect(matchTextRule('¿Cuál es el precio del producto?', 'lead', makeRule())).toBe(true);
  });

  it('case insensitive', () => {
    expect(matchTextRule('Cuál es el PRECIO?', 'lead', makeRule())).toBe(true);
  });

  it('no match si la palabra no aparece', () => {
    expect(matchTextRule('hola, info?', 'lead', makeRule())).toBe(false);
  });

  it('rechaza si la regla está inactiva', () => {
    expect(matchTextRule('precio?', 'lead', makeRule({ isActive: false }))).toBe(false);
  });
});

describe('matchTextRule — text_exact', () => {
  it('match si el body es exactamente igual', () => {
    expect(
      matchTextRule(
        'stop',
        'lead',
        makeRule({ triggerType: 'text_exact', triggerValue: { text: 'stop' } }),
      ),
    ).toBe(true);
  });

  it('no match si tiene texto extra', () => {
    expect(
      matchTextRule(
        'stop por favor',
        'lead',
        makeRule({ triggerType: 'text_exact', triggerValue: { text: 'stop' } }),
      ),
    ).toBe(false);
  });
});

describe('matchTextRule — trigger_who', () => {
  it('lead message + trigger_who=lead → match', () => {
    expect(matchTextRule('precio', 'lead', makeRule({ triggerWho: 'lead' }))).toBe(true);
  });

  it('lead message + trigger_who=trainer → no match', () => {
    expect(matchTextRule('precio', 'lead', makeRule({ triggerWho: 'trainer' }))).toBe(false);
  });

  it('human message + trigger_who=trainer → match', () => {
    expect(matchTextRule('precio', 'human', makeRule({ triggerWho: 'trainer' }))).toBe(true);
  });

  it('human message + trigger_who=lead → no match', () => {
    expect(matchTextRule('precio', 'human', makeRule({ triggerWho: 'lead' }))).toBe(false);
  });

  it('trigger_who=any matchea ambas fuentes', () => {
    expect(matchTextRule('precio', 'lead', makeRule({ triggerWho: 'any' }))).toBe(true);
    expect(matchTextRule('precio', 'human', makeRule({ triggerWho: 'any' }))).toBe(true);
  });
});

describe('matchTextRule — edge cases', () => {
  it('triggerType inválido → no match (defensivo)', () => {
    expect(matchTextRule('precio', 'lead', makeRule({ triggerType: 'attachment' }))).toBe(false);
  });

  it('trigger_value.text vacío o no string → no match', () => {
    expect(
      matchTextRule(
        'precio',
        'lead',
        makeRule({ triggerValue: { text: '' } }),
      ),
    ).toBe(false);
    expect(
      matchTextRule(
        'precio',
        'lead',
        makeRule({ triggerValue: {} }),
      ),
    ).toBe(false);
  });
});
