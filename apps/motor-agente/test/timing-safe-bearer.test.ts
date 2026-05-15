import { describe, expect, it } from 'vitest';
import { extractBearer, isValidBearer } from '../src/lib/timing-safe-bearer.js';

describe('isValidBearer', () => {
  it('returns true for exact match', () => {
    expect(isValidBearer('secret-token-12345', 'secret-token-12345')).toBe(true);
  });

  it('returns false for different content same length', () => {
    expect(isValidBearer('secret-token-12345', 'secret-token-XXXXX')).toBe(false);
  });

  it('returns false for different length', () => {
    expect(isValidBearer('short', 'much-longer-token')).toBe(false);
    expect(isValidBearer('much-longer-token', 'short')).toBe(false);
  });

  it('returns false for empty inputs', () => {
    expect(isValidBearer('', '')).toBe(false);
    expect(isValidBearer('abc', '')).toBe(false);
    expect(isValidBearer('', 'abc')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    // @ts-expect-error testing runtime safety
    expect(isValidBearer(null, 'abc')).toBe(false);
    // @ts-expect-error testing runtime safety
    expect(isValidBearer('abc', undefined)).toBe(false);
  });

  it('handles unicode tokens (UTF-8 safe)', () => {
    expect(isValidBearer('tøken-ñ', 'tøken-ñ')).toBe(true);
    expect(isValidBearer('tøken-ñ', 'tøken-x')).toBe(false);
  });
});

describe('extractBearer', () => {
  it('extracts token after Bearer prefix', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123');
  });

  it('trims whitespace from extracted token', () => {
    expect(extractBearer('Bearer   abc123   ')).toBe('abc123');
  });

  it('returns null if no Bearer prefix', () => {
    expect(extractBearer('abc123')).toBe(null);
    expect(extractBearer('Basic abc123')).toBe(null);
  });

  it('returns null for undefined / array', () => {
    expect(extractBearer(undefined)).toBe(null);
    expect(extractBearer(['Bearer abc'])).toBe(null);
  });

  it('returns null for empty Bearer', () => {
    expect(extractBearer('Bearer ')).toBe(null);
    expect(extractBearer('Bearer    ')).toBe(null);
  });
});
