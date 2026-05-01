import { describe, it, expect } from 'vitest';
import {
  calculateCostUsd,
  resolvePriceForModel,
  DEFAULT_PRICE_TABLE,
} from '../src/cost.js';

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
});
