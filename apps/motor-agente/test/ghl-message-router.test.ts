import { describe, it, expect } from 'vitest';
import {
  classifyByKeywords,
  inferContentTypeFromUrl,
} from '../src/services/ghl-message-router.js';

describe('classifyByKeywords', () => {
  const keywords = [
    { type: 'bienvenida' as const, pattern: 'Hola! 👋' },
    { type: 'bienvenida' as const, pattern: 'Muy buenas señor!' },
    { type: 'lm' as const, pattern: 'aquí tienes el lead magnet' },
    { type: 'inbound' as const, pattern: 'gracias por escribir' },
  ];

  it('matches bienvenida case-insensitive ignoring spaces', () => {
    const result = classifyByKeywords('hola!👋 cómo estás', keywords);
    expect(result).toBe('bienvenida');
  });

  it('matches bienvenida with mixed case + extra spaces', () => {
    const result = classifyByKeywords('  Muy   Buenas   SEÑOR!   te saludo', keywords);
    expect(result).toBe('bienvenida');
  });

  it('matches lm', () => {
    const result = classifyByKeywords('Aquí tienes el lead magnet que pediste', keywords);
    expect(result).toBe('lm');
  });

  it('matches inbound auto-response', () => {
    const result = classifyByKeywords('Gracias por escribir, en breve te contestamos', keywords);
    expect(result).toBe('inbound');
  });

  it('returns null when no pattern matches', () => {
    const result = classifyByKeywords('Mensaje totalmente humano sin keyword', keywords);
    expect(result).toBeNull();
  });

  it('returns null on empty body', () => {
    expect(classifyByKeywords('', keywords)).toBeNull();
  });

  it('returns null when no keywords configured', () => {
    expect(classifyByKeywords('hola', [])).toBeNull();
  });

  it('precedence: bienvenida > lm > inbound when multiple match', () => {
    const overlap = [
      { type: 'inbound' as const, pattern: 'hola' },
      { type: 'bienvenida' as const, pattern: 'hola' },
    ];
    const result = classifyByKeywords('hola amigo', overlap);
    expect(result).toBe('bienvenida');
  });

  it('skips empty patterns safely', () => {
    const withEmpty = [
      { type: 'bienvenida' as const, pattern: '' },
      { type: 'lm' as const, pattern: 'magnet' },
    ];
    const result = classifyByKeywords('aquí va el magnet', withEmpty);
    expect(result).toBe('lm');
  });
});

describe('inferContentTypeFromUrl', () => {
  it('detects audio extensions', () => {
    for (const ext of ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'opus']) {
      expect(inferContentTypeFromUrl(`https://media.gohighlevel.com/foo.${ext}`)).toBe('audio');
    }
  });

  it('detects image extensions', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']) {
      expect(inferContentTypeFromUrl(`https://x/y.${ext}`)).toBe('image');
    }
  });

  it('detects video extensions', () => {
    for (const ext of ['mp4', 'mov', 'webm', 'mkv', 'avi']) {
      expect(inferContentTypeFromUrl(`https://x/y.${ext}`)).toBe('video');
    }
  });

  it('falls back to file for unknown / no extension', () => {
    expect(inferContentTypeFromUrl('https://x/y.pdf')).toBe('file');
    expect(inferContentTypeFromUrl('https://x/y')).toBe('file');
    expect(inferContentTypeFromUrl('')).toBe('file');
  });

  it('strips query string and fragment before checking extension', () => {
    expect(inferContentTypeFromUrl('https://x/y.mp3?token=abc&v=2')).toBe('audio');
    expect(inferContentTypeFromUrl('https://x/y.jpg#fragment')).toBe('image');
  });

  it('is case-insensitive', () => {
    expect(inferContentTypeFromUrl('https://x/Y.MP3')).toBe('audio');
    expect(inferContentTypeFromUrl('https://x/Y.JPG')).toBe('image');
  });
});
