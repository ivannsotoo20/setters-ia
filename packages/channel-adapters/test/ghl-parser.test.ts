import { describe, it, expect } from 'vitest';
import {
  containsZwsp,
  GhlParseError,
  parseGhlInboundMessage,
  parseGhlOutboundMessage,
  parseGhlWebhookPayload,
  ZWSP,
} from '../src/ghl/parser.js';

describe('parseGhlWebhookPayload', () => {
  it('parses real InboundMessage IG payload from pinData', () => {
    const payload = {
      type: 'InboundMessage',
      locationId: 'vF0BGGVFZTYEzYRll5ch',
      body: 'Y perde un poco de grasa',
      contactId: 'TIOzIzIuJ92LVspmeKZC',
      conversationId: 'FHoCMMoy8Zdt7J87ANqQ',
      direction: 'inbound',
      messageType: 'IG',
      messageId: 'wTNAgSWb568EQwlnTKDA',
      timestamp: '2026-05-06T20:45:01.669Z',
    };
    const parsed = parseGhlWebhookPayload(payload);
    expect(parsed.type).toBe('InboundMessage');
    expect(parsed.locationId).toBe('vF0BGGVFZTYEzYRll5ch');
    expect(parsed.contactId).toBe('TIOzIzIuJ92LVspmeKZC');
    expect(parsed.body).toBe('Y perde un poco de grasa');
    expect(parsed.messageType).toBe('IG');
  });

  it('rejects payload without required locationId', () => {
    expect(() =>
      parseGhlWebhookPayload({
        type: 'InboundMessage',
        body: 'hi',
        contactId: 'c',
        direction: 'inbound',
        messageType: 'IG',
      }),
    ).toThrow(GhlParseError);
  });

  it('rejects unknown messageType', () => {
    expect(() =>
      parseGhlWebhookPayload({
        type: 'InboundMessage',
        locationId: 'L',
        body: 'hi',
        contactId: 'c',
        direction: 'inbound',
        messageType: 'TikTokDM',
      }),
    ).toThrow(GhlParseError);
  });
});

describe('parseGhlInboundMessage', () => {
  it('maps IG to instagram channel', () => {
    const payload = parseGhlWebhookPayload({
      type: 'InboundMessage',
      locationId: 'L',
      body: 'hola',
      contactId: 'c',
      direction: 'inbound',
      messageType: 'IG',
    });
    const inbound = parseGhlInboundMessage(payload, 3);
    expect(inbound.tenantId).toBe(3);
    expect(inbound.channel).toBe('instagram');
    expect(inbound.ghlContactId).toBe('c');
    expect(inbound.ghlConversationId).toBeNull();
    expect(inbound.attachments).toEqual([]);
  });

  it('maps FB Messenger to facebook', () => {
    const payload = parseGhlWebhookPayload({
      type: 'InboundMessage',
      locationId: 'L',
      body: 'hi',
      contactId: 'c',
      direction: 'inbound',
      messageType: 'FB Messenger',
    });
    const inbound = parseGhlInboundMessage(payload, 3);
    expect(inbound.channel).toBe('facebook');
  });

  it('throws when called with OutboundMessage payload', () => {
    const payload = parseGhlWebhookPayload({
      type: 'OutboundMessage',
      locationId: 'L',
      body: 'hi',
      contactId: 'c',
      direction: 'outbound',
      messageType: 'IG',
    });
    expect(() => parseGhlInboundMessage(payload, 3)).toThrow(GhlParseError);
  });
});

describe('parseGhlOutboundMessage + ZWSP detection', () => {
  it('isAiSelfEcho=true when body contains ZWSP', () => {
    const payload = parseGhlWebhookPayload({
      type: 'OutboundMessage',
      locationId: 'L',
      body: `Te dejo el enlace${ZWSP}`,
      contactId: 'c',
      direction: 'outbound',
      messageType: 'IG',
    });
    const outbound = parseGhlOutboundMessage(payload, 3);
    expect(outbound.isAiSelfEcho).toBe(true);
    expect(outbound.message).toContain(ZWSP);
  });

  it('isAiSelfEcho=false when body has no ZWSP (human reply)', () => {
    const payload = parseGhlWebhookPayload({
      type: 'OutboundMessage',
      locationId: 'L',
      body: 'Hola José Luis Albal aquí.',
      contactId: 'c',
      direction: 'outbound',
      messageType: 'IG',
    });
    const outbound = parseGhlOutboundMessage(payload, 3);
    expect(outbound.isAiSelfEcho).toBe(false);
  });
});

describe('containsZwsp', () => {
  it('detects ZWSP at end', () => {
    expect(containsZwsp(`hola${ZWSP}`)).toBe(true);
  });
  it('detects ZWSP in middle', () => {
    expect(containsZwsp(`ho${ZWSP}la`)).toBe(true);
  });
  it('returns false on plain text', () => {
    expect(containsZwsp('hola mundo')).toBe(false);
  });
  it('returns false on empty string', () => {
    expect(containsZwsp('')).toBe(false);
  });
});
