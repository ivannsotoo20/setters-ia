import { describe, it, expect } from 'vitest';
import {
  transcribeAudio,
  TranscribeAudioError,
  inferFilename,
} from '../src/lib/transcribe-audio.js';

interface FetchCallSpec {
  url: string;
  body: BodyInit | null | undefined;
  headers: Record<string, string>;
}

function makeFetch(handlers: {
  download?: (url: string) => Promise<Response> | Response;
  groq?: (call: FetchCallSpec) => Promise<Response> | Response;
}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (url.includes('/audio/transcriptions')) {
      if (!handlers.groq) {
        return new Response(JSON.stringify({ text: 'mock', duration: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handlers.groq({
        url,
        body: init?.body,
        headers: (init?.headers as Record<string, string>) ?? {},
      });
    }
    if (handlers.download) {
      return handlers.download(url);
    }
    return new Response(new ArrayBuffer(8), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('transcribeAudio', () => {
  it('throws missing_api_key when apiKey empty', async () => {
    await expect(
      transcribeAudio({ url: 'https://x/y.mp3', apiKey: '' }),
    ).rejects.toMatchObject({ reason: 'missing_api_key' });
  });

  it('downloads and parses verbose_json response', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: () =>
        new Response(
          JSON.stringify({
            text: 'Hola, qué tal',
            language: 'es',
            duration: 4.2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const r = await transcribeAudio({
      url: 'https://media/x.mp3',
      apiKey: 'gsk_xxx',
      fetchImpl,
    });
    expect(r.text).toBe('Hola, qué tal');
    expect(r.language).toBe('es');
    expect(r.durationSeconds).toBe(4.2);
    expect(r.costUsd).toBeCloseTo((4.2 / 3600) * 0.04, 8);
    expect(r.model).toBe('whisper-large-v3-turbo');
  });

  it('respects forced language es', async () => {
    let formLanguage: string | null = null;
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: async (call) => {
        const fd = call.body as FormData;
        formLanguage = (fd.get('language') as string | null) ?? null;
        return new Response(JSON.stringify({ text: 't', duration: 1, language: 'es' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await transcribeAudio({
      url: 'https://media/x.mp3',
      apiKey: 'k',
      language: 'es',
      fetchImpl,
    });
    expect(formLanguage).toBe('es');
  });

  it('omits language form field when language=auto', async () => {
    let formLanguage: string | null = null;
    let hasLanguage = true;
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: async (call) => {
        const fd = call.body as FormData;
        hasLanguage = fd.has('language');
        formLanguage = (fd.get('language') as string | null) ?? null;
        return new Response(JSON.stringify({ text: 't', duration: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await transcribeAudio({
      url: 'https://media/x.mp3',
      apiKey: 'k',
      language: 'auto',
      fetchImpl,
    });
    expect(hasLanguage).toBe(false);
    expect(formLanguage).toBeNull();
  });

  it('throws download_failed on 404', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(null, { status: 404 }),
    });
    await expect(
      transcribeAudio({ url: 'https://media/missing.mp3', apiKey: 'k', fetchImpl }),
    ).rejects.toMatchObject({ reason: 'download_failed' });
  });

  it('throws file_too_large when buffer exceeds maxBytes', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array(100), { status: 200 }),
    });
    await expect(
      transcribeAudio({
        url: 'https://media/x.mp3',
        apiKey: 'k',
        maxBytes: 50,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ reason: 'file_too_large' });
  });

  it('throws groq_http_error on Groq 4xx', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: () => new Response('rate limited', { status: 429 }),
    });
    await expect(
      transcribeAudio({ url: 'https://media/x.mp3', apiKey: 'k', fetchImpl }),
    ).rejects.toMatchObject({ reason: 'groq_http_error', status: 429 });
  });

  it('throws groq_invalid_response on non-JSON', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: () => new Response('<html>error</html>', { status: 200 }),
    });
    await expect(
      transcribeAudio({ url: 'https://media/x.mp3', apiKey: 'k', fetchImpl }),
    ).rejects.toMatchObject({ reason: 'groq_invalid_response' });
  });

  it('returns empty text safely when audio is silent', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: () =>
        new Response(JSON.stringify({ text: '', duration: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const r = await transcribeAudio({
      url: 'https://media/silent.mp3',
      apiKey: 'k',
      fetchImpl,
    });
    expect(r.text).toBe('');
    expect(r.durationSeconds).toBe(2);
  });
});

// 2026-09-03 — YCloud sirve las notas de voz de WhatsApp como
// /v2/whatsapp/media/download/<id>?sig=… (sin extensión, audio/ogg). Groq
// decide el formato por la extensión del nombre y con "audio.bin" devolvía
// HTTP 400: 12 de 12 audios de WhatsApp del tenant 7 sin transcribir.
describe('inferFilename', () => {
  it('conserva la extensión cuando la URL la trae', () => {
    expect(inferFilename('https://cdn/x/42db0de9.mp4')).toBe('42db0de9.mp4');
    expect(inferFilename('https://cdn/x/voice.ogg?sig=1', 'audio/mpeg')).toBe('voice.ogg');
  });

  it('sin extensión, la deduce del Content-Type de la descarga', () => {
    const u = 'https://api.ycloud.com/v2/whatsapp/media/download/2212766606249297?sig=t%3D1%2Cs%3Dabc';
    expect(inferFilename(u, 'audio/ogg; codecs=opus')).toBe('audio.ogg');
    expect(inferFilename(u, 'audio/mpeg')).toBe('audio.mp3');
    expect(inferFilename(u, 'audio/mp4')).toBe('audio.m4a');
    expect(inferFilename(u, 'audio/webm')).toBe('audio.webm');
  });

  it('sin extensión ni Content-Type conocido, asume nota de voz ogg (nunca .bin)', () => {
    expect(inferFilename('https://api.ycloud.com/v2/whatsapp/media/download/1', null)).toBe('audio.ogg');
    expect(inferFilename('https://api.ycloud.com/v2/whatsapp/media/download/1', 'application/octet-stream')).toBe('audio.ogg');
  });
});

describe('transcribeAudio — nombre del fichero en el multipart', () => {
  it('manda audio.ogg a Groq cuando el enlace firmado de YCloud no trae extensión', async () => {
    let sentName: string | null = null;
    const fetchImpl = makeFetch({
      download: () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg; codecs=opus' },
        }),
      groq: async (call) => {
        const fd = call.body as FormData;
        const file = fd.get('file');
        sentName = file instanceof File ? file.name : null;
        return new Response(JSON.stringify({ text: 'hola', duration: 3, language: 'es' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    const r = await transcribeAudio({
      url: 'https://api.ycloud.com/v2/whatsapp/media/download/2212766606249297?sig=t%3D1%2Cs%3Dabc',
      apiKey: 'k',
      fetchImpl,
    });
    expect(sentName).toBe('audio.ogg');
    expect(r.text).toBe('hola');
  });

  it('el error de Groq lleva el nombre enviado y el cuerpo de la respuesta', async () => {
    const fetchImpl = makeFetch({
      download: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      groq: () => new Response('{"error":{"message":"invalid file format"}}', { status: 400 }),
    });
    await expect(
      transcribeAudio({ url: 'https://api.ycloud.com/v2/whatsapp/media/download/1', apiKey: 'k', fetchImpl }),
    ).rejects.toThrow(/HTTP 400 \(audio\.ogg\): .*invalid file format/);
  });
});

describe('TranscribeAudioError', () => {
  it('preserves reason + status + body snippet', () => {
    const err = new TranscribeAudioError('groq_http_error', 'msg', {
      status: 429,
      bodySnippet: 'limited',
    });
    expect(err.name).toBe('TranscribeAudioError');
    expect(err.reason).toBe('groq_http_error');
    expect(err.status).toBe(429);
    expect(err.bodySnippet).toBe('limited');
  });
});
