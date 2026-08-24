import { describe, it, expect } from 'vitest';
import {
  containsZwsp,
  GhlParseError,
  parseAttachmentsRaw,
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

describe('parseAttachmentsRaw', () => {
  it('returns empty array for null/undefined', () => {
    expect(parseAttachmentsRaw(null)).toEqual([]);
    expect(parseAttachmentsRaw(undefined)).toEqual([]);
  });

  it('returns empty array for empty/special string forms', () => {
    expect(parseAttachmentsRaw('')).toEqual([]);
    expect(parseAttachmentsRaw('  ')).toEqual([]);
    expect(parseAttachmentsRaw('[]')).toEqual([]);
    expect(parseAttachmentsRaw('null')).toEqual([]);
    expect(parseAttachmentsRaw('false')).toEqual([]);
  });

  it('passes through array of strings deduping + trimming', () => {
    expect(parseAttachmentsRaw(['  https://a/1 ', 'https://a/1', 'https://a/2'])).toEqual([
      'https://a/1',
      'https://a/2',
    ]);
  });

  it('drops non-string elements from array', () => {
    expect(parseAttachmentsRaw(['https://a/1', 123, null, false, 'https://a/2'])).toEqual([
      'https://a/1',
      'https://a/2',
    ]);
  });

  it('parses JSON string array', () => {
    expect(parseAttachmentsRaw('["https://a/1","https://a/2"]')).toEqual([
      'https://a/1',
      'https://a/2',
    ]);
  });

  it('falls back to CSV when JSON parse fails', () => {
    expect(parseAttachmentsRaw('https://a/1, https://a/2')).toEqual(['https://a/1', 'https://a/2']);
  });

  it('returns empty for non-string non-array (numbers, objects)', () => {
    expect(parseAttachmentsRaw(42)).toEqual([]);
    expect(parseAttachmentsRaw({ url: 'x' })).toEqual([]);
  });
});

describe('parseGhlWebhookPayload — customData passthrough (legacy "clase" Workflow)', () => {
  it('uses customData.lead as contactId when present', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'fallback_contact',
      location: { id: 'L' },
      message: { type: 18, body: 'hola' },
      customData: { lead: 'cd_contact_id' },
    });
    expect(parsed.contactId).toBe('cd_contact_id');
  });

  it('uses customData.message as body when present (overrides message.body)', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'unused' },
      customData: { message: 'Quiero clase' },
    });
    expect(parsed.body).toBe('Quiero clase');
  });

  it('extracts customData.conversation_source as conversationSource (bienvenida)', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'Hola amigo' },
      customData: { conversation_source: 'bienvenida' },
    });
    expect(parsed.conversationSource).toBe('bienvenida');
  });

  it('extracts conversation_source top-level when customData missing', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'Aqui va el lead magnet' },
      conversation_source: 'lm',
    });
    expect(parsed.conversationSource).toBe('lm');
  });

  it('respects customData.direction = outbound', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'msg' },
      customData: { direction: 'outbound' },
    });
    expect(parsed.type).toBe('OutboundMessage');
    expect(parsed.direction).toBe('outbound');
  });

  it('uses customData.messageType when message.type missing', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { body: 'hi' },
      customData: { messageType: 'FB Messenger' },
    });
    expect(parsed.messageType).toBe('FB Messenger');
  });

  it('ignores invalid conversation_source values (typos / unknown)', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'hi' },
      customData: { conversation_source: 'unknown_value' },
    });
    expect(parsed.conversationSource).toBeUndefined();
  });

  it('normalizes conversation_source case + whitespace', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'hi' },
      customData: { conversation_source: '  Bienvenida  ' },
    });
    expect(parsed.conversationSource).toBe('bienvenida');
  });

  it('extracts customData.attachments as array of URLs', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'mira esta foto' },
      customData: { attachments: ['https://media.gohighlevel.com/a.jpg', 'https://media.gohighlevel.com/b.mp3'] },
    });
    expect(parsed.attachments).toEqual([
      'https://media.gohighlevel.com/a.jpg',
      'https://media.gohighlevel.com/b.mp3',
    ]);
  });

  it('extracts customData.attachments from JSON string', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'audio' },
      customData: { attachments: '["https://media.gohighlevel.com/a.mp3"]' },
    });
    expect(parsed.attachments).toEqual(['https://media.gohighlevel.com/a.mp3']);
  });

  it('extracts customData.attachments from CSV string', () => {
    const parsed = parseGhlWebhookPayload({
      contact_id: 'c',
      location: { id: 'L' },
      message: { type: 18, body: 'fotos' },
      customData: { attachments: 'https://x.com/1.jpg,https://x.com/2.jpg' },
    });
    expect(parsed.attachments).toEqual(['https://x.com/1.jpg', 'https://x.com/2.jpg']);
  });

  it('treats empty/null/false attachments as no attachments', () => {
    for (const empty of [null, '', '[]', 'null', 'false', false]) {
      const parsed = parseGhlWebhookPayload({
        contact_id: 'c',
        location: { id: 'L' },
        message: { type: 18, body: 'hola' },
        customData: { attachments: empty },
      });
      expect(parsed.attachments).toBeUndefined();
    }
  });

  it('parses real legacy "clase" workflow payload (customData lead+message+conv_source)', () => {
    const payload = parseGhlWebhookPayload({
      contact_id: 'fallback_contact',
      location: { id: 'FOxJtkxqNKJjGSuYMEk0' },
      message: { type: 18, body: 'unused' },
      first_name: 'Ivan',
      customData: {
        lead: 'oCFmoWfCEUv6SbeGk8TE',
        message: 'Quiero entrar en una clase',
        conversation_source: 'bienvenida',
      },
    });
    expect(payload.contactId).toBe('oCFmoWfCEUv6SbeGk8TE');
    expect(payload.body).toBe('Quiero entrar en una clase');
    expect(payload.conversationSource).toBe('bienvenida');

    const inbound = parseGhlInboundMessage(payload, 3);
    expect(inbound.ghlContactId).toBe('oCFmoWfCEUv6SbeGk8TE');
    expect(inbound.message).toBe('Quiero entrar en una clase');
    expect(inbound.conversationSource).toBe('bienvenida');
    expect(inbound.channel).toBe('instagram');
  });
});

describe('alias de messageType que manda GHL de verdad', () => {
  // Caso real (2026-08-24): GHL envio un webhook de Facebook con
  // messageType "FB" y el enum lo tiro con invalid_enum_value. El mensaje se
  // descartaba entero: ni lead, ni conversacion, ni registro.
  const base = {
    type: 'InboundMessage' as const,
    locationId: 'CjbWMHQEMKIAqt86ZAPt',
    contactId: 'c1',
    body: 'hola',
    direction: 'inbound' as const,
  };

  it('acepta "FB" y lo trata como Facebook Messenger', () => {
    const out = parseGhlWebhookPayload({ ...base, messageType: 'FB' });
    expect(out.messageType).toBe('FB Messenger');
  });

  it('acepta variantes sueltas de cada canal', () => {
    expect(parseGhlWebhookPayload({ ...base, messageType: 'facebook' }).messageType).toBe('FB Messenger');
    expect(parseGhlWebhookPayload({ ...base, messageType: 'instagram' }).messageType).toBe('IG');
    expect(parseGhlWebhookPayload({ ...base, messageType: 'ig' }).messageType).toBe('IG');
    expect(parseGhlWebhookPayload({ ...base, messageType: 'whatsapp' }).messageType).toBe('WhatsApp');
  });

  it('sigue aceptando los nombres canonicos sin tocarlos', () => {
    expect(parseGhlWebhookPayload({ ...base, messageType: 'IG' }).messageType).toBe('IG');
    expect(parseGhlWebhookPayload({ ...base, messageType: 'FB Messenger' }).messageType).toBe('FB Messenger');
  });

  it('sigue rechazando un canal que no existe', () => {
    expect(() => parseGhlWebhookPayload({ ...base, messageType: 'Telegram' })).toThrow();
  });

  it('el mensaje de Facebook acaba en el canal facebook, no en otro', () => {
    // Encadenado como en produccion: primero se valida (y ahi se normaliza),
    // luego se parsea el inbound.
    const payload = parseGhlWebhookPayload({ ...base, messageType: 'FB' });
    const parsed = parseGhlInboundMessage(payload, 7);
    expect(parsed.channel).toBe('facebook');
  });
});
