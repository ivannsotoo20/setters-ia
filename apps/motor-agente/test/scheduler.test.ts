import { describe, it, expect } from 'vitest';
import {
  computeScheduledTimes,
  intervalToSeconds,
  nextRetryAt,
  MAX_RETRY_ATTEMPTS,
  RETRY_BACKOFFS_MS,
  DEFAULT_TYPING_DELAY,
} from '../src/services/scheduler.js';

describe('computeScheduledTimes', () => {
  it('returns empty array for 0 parts', () => {
    expect(computeScheduledTimes(0)).toEqual([]);
  });

  it('first part scheduled at now + activeDelay', () => {
    const now = 1_700_000_000_000;
    const out = computeScheduledTimes(1, DEFAULT_TYPING_DELAY, now);
    expect(out).toHaveLength(1);
    expect(out[0]!.getTime()).toBe(now + 30_000);
  });

  it('subsequent parts add betweenPartsSec gap each', () => {
    const now = 1_700_000_000_000;
    const out = computeScheduledTimes(3, DEFAULT_TYPING_DELAY, now);
    expect(out[0]!.getTime()).toBe(now + 30_000);
    expect(out[1]!.getTime()).toBe(now + 30_000 + 10_000);
    expect(out[2]!.getTime()).toBe(now + 30_000 + 20_000);
  });

  it('respects custom config', () => {
    const now = 1_700_000_000_000;
    const out = computeScheduledTimes(2, { activeDelaySec: 5, betweenPartsSec: 3 }, now);
    expect(out[0]!.getTime()).toBe(now + 5_000);
    expect(out[1]!.getTime()).toBe(now + 8_000);
  });
});

describe('intervalToSeconds', () => {
  it('parses HH:MM:SS', () => {
    expect(intervalToSeconds('00:00:30')).toBe(30);
    expect(intervalToSeconds('00:05:00')).toBe(300);
    expect(intervalToSeconds('01:30:00')).toBe(5_400);
  });
  it('parses ISO 8601 PT...', () => {
    expect(intervalToSeconds('PT30S')).toBe(30);
    expect(intervalToSeconds('PT5M')).toBe(300);
    expect(intervalToSeconds('PT1H30M')).toBe(5_400);
  });
  it('returns null for unrecognized formats', () => {
    expect(intervalToSeconds('30 segundos')).toBeNull();
    expect(intervalToSeconds(null)).toBeNull();
    expect(intervalToSeconds(123)).toBeNull();
  });
});

describe('nextRetryAt', () => {
  it('returns null when attempts >= MAX_RETRY_ATTEMPTS', () => {
    expect(nextRetryAt(MAX_RETRY_ATTEMPTS)).toBeNull();
    expect(nextRetryAt(MAX_RETRY_ATTEMPTS + 1)).toBeNull();
  });

  it('uses backoff table for first retries', () => {
    const now = 1_700_000_000_000;
    const r0 = nextRetryAt(0, now);
    expect(r0!.getTime()).toBe(now + RETRY_BACKOFFS_MS[0]!);
    const r1 = nextRetryAt(1, now);
    expect(r1!.getTime()).toBe(now + RETRY_BACKOFFS_MS[1]!);
    const r2 = nextRetryAt(2, now);
    expect(r2!.getTime()).toBe(now + RETRY_BACKOFFS_MS[2]!);
  });
});
