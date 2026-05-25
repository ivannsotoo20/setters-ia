import { describe, it, expect } from 'vitest';
import { detectLeadNameHeuristic } from '../src/lib/detect-name.js';

describe('detectLeadNameHeuristic — casos usable', () => {
  it.each([
    [{ firstName: 'Andrea', lastName: 'Martínez' }, 'Andrea'],
    [{ firstName: 'andrea' }, 'Andrea'],
    [{ firstName: 'ANDREA' }, 'Andrea'],
    [{ firstName: 'María José', lastName: 'Pérez' }, 'María'],
    [{ fullName: 'Carlos Eduardo Pérez' }, 'Carlos'],
    [{ firstName: 'José' }, 'José'],
    [{ firstName: 'Mª Pilar' }, 'Mª'],
    [{ firstName: "O'Brien" }, "O'brien"],
    [{ firstName: 'Jean-Pierre' }, 'Jean-pierre'],
    [{ firstName: 'Ñoño' }, 'Ñoño'],
    [{ username: 'andrea_martinez' }, 'Andrea'],
    // firstName presente debe ganar sobre username garbage
    [{ firstName: 'Andrea', username: 'shark2381' }, 'Andrea'],
  ])('%j → %s', (input, expected) => {
    const r = detectLeadNameHeuristic(input);
    expect(r.status).toBe('usable');
    expect(r.name).toBe(expected);
  });
});

describe('detectLeadNameHeuristic — casos not_usable (hay input pero no es nombre humano)', () => {
  it.each([
    { username: 'andrea12345' },
    { username: 'user2381' },
    { username: 'xxxxname' }, // 4+ x consecutivas (handle gaming)
    { username: '🔥Andre🔥' }, // ratio chars válidos < 70%
    { firstName: '123456' },
    { firstName: 'a' }, // demasiado corto
    { username: 'foo.bar' }, // contiene .
    { username: 'foo@bar' }, // contiene @
    { username: 'kgfhdksjf' }, // sin vocales
    // GHL puede llenar firstName con tonterías; el setter NO debe usarlo
    { firstName: '...' },
    { firstName: 'CHICOFUERTE2025' }, // con números
  ])('%j → not_usable', (input) => {
    const r = detectLeadNameHeuristic(input);
    expect(r.status).toBe('not_usable');
    expect(r.name).toBeNull();
  });
});

describe('detectLeadNameHeuristic — casos unknown (sin input alguno)', () => {
  it.each([
    {},
    { firstName: null },
    { firstName: '', lastName: '', username: '' },
    { firstName: '   ', lastName: '   ' },
  ])('%j → unknown', (input) => {
    const r = detectLeadNameHeuristic(input);
    expect(r.status).toBe('unknown');
    expect(r.name).toBeNull();
  });
});

describe('detectLeadNameHeuristic — prioridad de fuentes', () => {
  it('prefiere firstName+lastName combinado sobre username', () => {
    const r = detectLeadNameHeuristic({
      firstName: 'Andrea',
      lastName: 'Martínez',
      username: 'shark2025',
    });
    expect(r.status).toBe('usable');
    expect(r.name).toBe('Andrea');
  });

  it('si solo username es válido (no garbage), úsalo', () => {
    const r = detectLeadNameHeuristic({
      username: 'andrea_martinez',
    });
    expect(r.status).toBe('usable');
    // username "andrea_martinez" parte por _ → "andrea" primer token
    expect(r.name).toBe('Andrea');
  });

  it('username con números garbage → not_usable (incluso si firstName ausente)', () => {
    const r = detectLeadNameHeuristic({ username: 'user12345' });
    expect(r.status).toBe('not_usable');
  });

  it('source siempre heuristic en función sync', () => {
    const r = detectLeadNameHeuristic({ firstName: 'Andrea' });
    expect(r.source).toBe('heuristic');
  });
});
