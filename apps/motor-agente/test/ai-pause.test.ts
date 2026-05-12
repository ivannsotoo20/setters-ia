import { describe, it, expect } from 'vitest';
import { isAiPausedFromDb } from '../src/lib/ai-pause.js';

// =============================================================================
// Bug fix 2026-05-12 — Tests para isAiPausedFromDb.
//
// Cubre el bug previo donde `new Date('infinity')` daba Invalid Date (NaN)
// y la pausa se ignoraba silenciosamente. Toda conv con `ai_paused_until='infinity'`
// disparaba IA aunque debiera estar pausada.
// =============================================================================

describe('isAiPausedFromDb', () => {
  it('NULL → false (IA activa)', () => {
    expect(isAiPausedFromDb(null)).toBe(false);
  });

  it('undefined → false (IA activa)', () => {
    expect(isAiPausedFromDb(undefined)).toBe(false);
  });

  it('empty string → false (IA activa)', () => {
    expect(isAiPausedFromDb('')).toBe(false);
  });

  it('"infinity" → true (pausa permanente PostgreSQL)', () => {
    expect(isAiPausedFromDb('infinity')).toBe(true);
  });

  it('"-infinity" → false (timestamp pasado infinito = no pausada)', () => {
    expect(isAiPausedFromDb('-infinity')).toBe(false);
  });

  it('ISO timestamp futuro → true', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isAiPausedFromDb(future)).toBe(true);
  });

  it('ISO timestamp pasado → false', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isAiPausedFromDb(past)).toBe(false);
  });

  it('timestamp pasado lejano → false', () => {
    expect(isAiPausedFromDb('2020-01-01T00:00:00.000Z')).toBe(false);
  });

  it('timestamp futuro lejano → true', () => {
    expect(isAiPausedFromDb('2099-12-31T23:59:59.000Z')).toBe(true);
  });

  it('valor no parseable → true (fail-safe: asume pausada)', () => {
    expect(isAiPausedFromDb('not-a-date')).toBe(true);
    expect(isAiPausedFromDb('null')).toBe(true);
    expect(isAiPausedFromDb('xyz')).toBe(true);
  });

  it('timestamp con timezone offset → procesa correctamente', () => {
    const future = '2099-01-01T00:00:00+02:00';
    expect(isAiPausedFromDb(future)).toBe(true);
    const past = '2020-01-01T00:00:00+02:00';
    expect(isAiPausedFromDb(past)).toBe(false);
  });

  it('regression test: el caso del bug pre-fix — `infinity` ya no se silencia', () => {
    // Antes del fix:
    //   const ts = new Date('infinity'); // → Invalid Date
    //   Number.isFinite(ts.getTime()) // → false
    //   → la rama "if pausada" no se ejecutaba → IA disparaba.
    // Después del fix:
    expect(isAiPausedFromDb('infinity')).toBe(true); // ✅ correcto
  });
});
