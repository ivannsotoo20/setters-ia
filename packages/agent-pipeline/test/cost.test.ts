import { describe, it, expect } from 'vitest';
import {
  calculateCostUsd,
  resolvePriceForModel,
  DEFAULT_PRICE_TABLE,
} from '../src/cost.js';
import { DEFAULT_GENERATOR_MODEL } from '../src/generator.js';

describe('resolvePriceForModel', () => {
  it('matches direct keys from default table', () => {
    expect(resolvePriceForModel('claude-sonnet-4-5')).toBeTruthy();
    expect(resolvePriceForModel('claude-haiku-4-5')).toBeTruthy();
  });

  it('matches snapshot id via prefix heuristic', () => {
    expect(resolvePriceForModel('claude-sonnet-4-5-20250929')?.inputUncached).toBe(3);
    expect(resolvePriceForModel('claude-haiku-4-5-20250929')?.inputUncached).toBe(1);
  });

  it('returns null for unknown models', () => {
    expect(resolvePriceForModel('claude-3-opus-20240229')).toBeNull();
    expect(resolvePriceForModel('gpt-4o')).toBeNull();
  });

  // El modelo del Generator SIEMPRE tiene que resolver precio. Si no, el coste
  // se registra como 0 en `llm_calls` sin error ni aviso, y las métricas mienten.
  it('prices the current Generator model', () => {
    expect(resolvePriceForModel(DEFAULT_GENERATOR_MODEL)).toBeTruthy();
  });

  it('does not confuse sonnet-5 with sonnet-4-5', () => {
    expect(resolvePriceForModel('claude-sonnet-5')?.output).toBe(15);
    expect(resolvePriceForModel('claude-sonnet-5-20260101')?.inputUncached).toBe(3);
    // La heurística de sonnet-5 no debe tragarse los ids de sonnet-4-5.
    expect(resolvePriceForModel('claude-sonnet-4-5')).toBe(
      DEFAULT_PRICE_TABLE['claude-sonnet-4-5'],
    );
  });
});

describe('calculateCostUsd', () => {
  it('returns 0 for unknown models (avoid fake numbers)', () => {
    const cost = calculateCostUsd({
      model: 'unknown-model',
      tokensInUncached: 1000,
      tokensInCacheRead: 0,
      tokensInCacheWrite: 0,
      tokensOut: 100,
    });
    expect(cost).toBe(0);
  });

  it('computes Sonnet 4.5 cost from a real-ish call', () => {
    // 15k tokens write (cache priming), 0 read, 50 input fresh, 200 output
    const cost = calculateCostUsd({
      model: 'claude-sonnet-4-5',
      tokensInUncached: 50,
      tokensInCacheRead: 0,
      tokensInCacheWrite: 15_000,
      tokensOut: 200,
    });
    // 50 * 3 / 1M + 0 * 0.3 + 15000 * 3.75/1M + 200 * 15/1M
    // = 0.00015 + 0 + 0.05625 + 0.003 = 0.0594
    expect(cost).toBeCloseTo(0.0594, 5);
  });

  it('computes Sonnet 4.5 cost on cache-warm turn (huge savings)', () => {
    // Turno 2: 15k cache_read, 30 fresh input, 180 output
    const cost = calculateCostUsd({
      model: 'claude-sonnet-4-5',
      tokensInUncached: 30,
      tokensInCacheRead: 15_000,
      tokensInCacheWrite: 0,
      tokensOut: 180,
    });
    // 30 * 3/1M + 15000 * 0.3/1M + 180 * 15/1M
    // = 0.00009 + 0.0045 + 0.0027 = 0.00729
    expect(cost).toBeCloseTo(0.00729, 5);
  });

  it('uses custom price table when provided', () => {
    const customTable = {
      'claude-sonnet-4-5': {
        inputUncached: 1,
        cacheRead: 0,
        cacheWrite: 1,
        output: 1,
      },
    };
    const cost = calculateCostUsd({
      model: 'claude-sonnet-4-5',
      tokensInUncached: 1_000_000,
      tokensInCacheRead: 0,
      tokensInCacheWrite: 0,
      tokensOut: 0,
      priceTable: customTable,
    });
    expect(cost).toBe(1);
  });

  it('default price table has expected Sonnet 4.5 rates', () => {
    expect(DEFAULT_PRICE_TABLE['claude-sonnet-4-5']?.inputUncached).toBe(3);
    expect(DEFAULT_PRICE_TABLE['claude-sonnet-4-5']?.cacheRead).toBe(0.3);
    expect(DEFAULT_PRICE_TABLE['claude-sonnet-4-5']?.output).toBe(15);
  });

  it('uses cacheWrite1h tariff when cacheTtl="1h" (Sonnet)', () => {
    // Sonnet 4.5: cacheWrite 5m = 3.75, cacheWrite 1h = 7.50 (~2x)
    const cost = calculateCostUsd({
      model: 'claude-sonnet-4-5',
      tokensInUncached: 0,
      tokensInCacheRead: 0,
      tokensInCacheWrite: 10_000,
      tokensOut: 0,
      cacheTtl: '1h',
    });
    // 10k * 7.50 / 1M = 0.075
    expect(cost).toBeCloseTo(0.075, 5);
  });

  it('uses cacheWrite1h tariff when cacheTtl="1h" (Haiku)', () => {
    // Haiku 4.5: cacheWrite 5m = 1.25, cacheWrite 1h = 2.50 (~2x)
    const cost = calculateCostUsd({
      model: 'claude-haiku-4-5',
      tokensInUncached: 0,
      tokensInCacheRead: 0,
      tokensInCacheWrite: 10_000,
      tokensOut: 0,
      cacheTtl: '1h',
    });
    // 10k * 2.50 / 1M = 0.025
    expect(cost).toBeCloseTo(0.025, 5);
  });

  it('falls back to 2× cacheWrite when cacheWrite1h is missing in custom table', () => {
    const customTable = {
      'claude-sonnet-4-5': {
        inputUncached: 1,
        cacheRead: 0.1,
        cacheWrite: 1, // sin cacheWrite1h explicit
        output: 1,
      },
    };
    const cost = calculateCostUsd({
      model: 'claude-sonnet-4-5',
      tokensInUncached: 0,
      tokensInCacheRead: 0,
      tokensInCacheWrite: 1_000_000,
      tokensOut: 0,
      cacheTtl: '1h',
      priceTable: customTable,
    });
    // 1M * (2 * 1) / 1M = 2
    expect(cost).toBe(2);
  });

  it('Haiku 4.5 cost on warm turn matches expected value (~0.43c per message scale)', () => {
    // Turno warm: 11k cache_read, 0 write, 50 fresh input, 250 output
    const cost = calculateCostUsd({
      model: 'claude-haiku-4-5',
      tokensInUncached: 50,
      tokensInCacheRead: 11_000,
      tokensInCacheWrite: 0,
      tokensOut: 250,
      cacheTtl: '1h',
    });
    // 50*1 + 11000*0.1 + 250*5 = 50 + 1100 + 1250 = 2400 micro-USD = 0.0024
    expect(cost).toBeCloseTo(0.0024, 5);
  });
});
