import { describe, it, expect } from 'vitest';
import {
  formatChannelShort,
  formatDirection,
  formatChannelDirectionShort,
} from '@/components/conversation-layout/format-helpers';

// =============================================================================
// Sprint A (2026-05-12) — Tests para badges direction (IN/OT) en UI.
// =============================================================================

describe('formatChannelShort', () => {
  it('devuelve WA / IG / FB según channel_type', () => {
    expect(formatChannelShort({ channel_type: 'whatsapp', via_provider: 'ycloud' })).toBe('WA');
    expect(formatChannelShort({ channel_type: 'instagram_dm', via_provider: 'ghl' })).toBe('IG');
    expect(
      formatChannelShort({ channel_type: 'facebook_messenger', via_provider: 'ghl' }),
    ).toBe('FB');
  });

  it('devuelve em dash cuando channel es null', () => {
    expect(formatChannelShort(null)).toBe('—');
    expect(formatChannelShort(undefined)).toBe('—');
  });
});

describe('formatDirection', () => {
  it('devuelve IN para inbound', () => {
    expect(formatDirection('inbound')).toBe('IN');
  });

  it('devuelve OT para outbound', () => {
    expect(formatDirection('outbound')).toBe('OT');
  });

  it('devuelve em dash para untagged / null / undefined', () => {
    expect(formatDirection('untagged')).toBe('—');
    expect(formatDirection(null)).toBe('—');
    expect(formatDirection(undefined)).toBe('—');
  });

  it('devuelve em dash para valores desconocidos', () => {
    expect(formatDirection('foo')).toBe('—');
    expect(formatDirection('')).toBe('—');
  });
});

describe('formatChannelDirectionShort', () => {
  it('combina canal + direction (IG-IN, IG-OT, WA-IN, WA-OT)', () => {
    const ig = { channel_type: 'instagram_dm', via_provider: 'ghl' };
    const wa = { channel_type: 'whatsapp', via_provider: 'ycloud' };
    expect(formatChannelDirectionShort(ig, 'inbound')).toBe('IG-IN');
    expect(formatChannelDirectionShort(ig, 'outbound')).toBe('IG-OT');
    expect(formatChannelDirectionShort(wa, 'inbound')).toBe('WA-IN');
    expect(formatChannelDirectionShort(wa, 'outbound')).toBe('WA-OT');
  });

  it('devuelve solo el canal si direction es untagged / null / undefined', () => {
    const ig = { channel_type: 'instagram_dm', via_provider: 'ghl' };
    expect(formatChannelDirectionShort(ig, 'untagged')).toBe('IG');
    expect(formatChannelDirectionShort(ig, null)).toBe('IG');
    expect(formatChannelDirectionShort(ig, undefined)).toBe('IG');
  });

  it('devuelve em dash si channel es null', () => {
    expect(formatChannelDirectionShort(null, 'inbound')).toBe('—');
    expect(formatChannelDirectionShort(undefined, 'outbound')).toBe('—');
  });

  it('FB con direction funciona igual', () => {
    const fb = { channel_type: 'facebook_messenger', via_provider: 'ghl' };
    expect(formatChannelDirectionShort(fb, 'inbound')).toBe('FB-IN');
    expect(formatChannelDirectionShort(fb, 'outbound')).toBe('FB-OT');
  });
});
