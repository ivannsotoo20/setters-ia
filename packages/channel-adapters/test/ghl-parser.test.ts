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

describe('parseGhlWebhookPayload — Workflow webhook format (real GHL payload)', () => {
  // Payload real capturado del primer smoke 2026-05-08 — Workflow "Customer Replied"
  // trigger sin custom data. GHL envía contact_id (snake), location.id (nested),
  // message.{type:int, body}, first_name, last_name, contact.attributionSource.medium.
  const realWorkflowPayload = {
    contact_id: 'oCFmoWfCEUv6SbeGk8TE',
    first_name: 'Ivan',
    last_name: 'Soto',
    full_name: 'Ivan Soto',
    tags: '',
    country: 'ES',
    contact_type: 'lead',
    location: {
      name: 'FYZON',
      id: 'FOxJtkxqNKJjGSuYMEk0',
    },
    message: {
      type: 18, // 18 = Instagram
      body: 'Me gustaría hacerte una pregunta',
    },
    workflow: { id: 'wf_id', name: 'Flujo IA 1' },
    contact: {
      attributionSource: { medium: 'instagram', sessionSource: 'Social media' },
      lastAttributionSource: { medium: 'instagram' },
    },
  };

  it('parses real Workflow Customer Replied payload', () => {
    const parsed = parseGhlWebhookPayload(realWorkflowPayload);
    expect(parsed.type).toBe('InboundMessage');
    expect(parsed.locationId).toBe('FOxJtkxqNKJjGSuYMEk0');
    expect(parsed.contactId).toBe('oCFmoWfCEUv6SbeGk8TE');
    expect(parsed.body).toBe('Me gustaría hacerte una pregunta');
    expect(parsed.messageType).toBe('IG');
    expect(parsed.direction).toBe('inbound');
  });

  it('extracts contactInfo first/last/full name', () => {
    const payload = parseGhlWebhookPayload(realWorkflowPayload);
    const inbound = parseGhlInboundMessage(payload, 3, realWorkflowPayload);
    expect(inbound.contactInfo?.firstName).toBe('Ivan');
    expect(inbound.contactInfo?.lastName).toBe('Soto');
    expect(inbound.contactInfo?.fullName).toBe('Ivan Soto');
    expect(inbound.channel).toBe('instagram');
  });

  it('maps message.type integer 18 → IG', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'hi' },
    });
    expect(parsed.messageType).toBe('IG');
  });

  it('maps message.type integer 5 → FB Messenger', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 5, body: 'hi' },
    });
    expect(parsed.messageType).toBe('FB Messenger');
  });

  it('maps message.type integer 7 → WhatsApp', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 7, body: 'hi' },
    });
    expect(parsed.messageType).toBe('WhatsApp');
  });

  it('falls back to attribution medium when message.type missing', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { body: 'hi' },
      contact: { attributionSource: { medium: 'instagram' } },
    });
    expect(parsed.messageType).toBe('IG');
  });

  it('respects custom direction=outbound from customData/Workflow input', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'Hola bonita' },
      direction: 'outbound',
    });
    expect(parsed.type).toBe('OutboundMessage');
    expect(parsed.direction).toBe('outbound');
  });

  it('rejects payload missing contact_id and type=InboundMessage', () => {
    expect(() =>
      parseGhlWebhookPayload({
        location: { id: 'L' },
        message: { body: 'hi' },
      }),
    ).toThrow(GhlParseError);
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
