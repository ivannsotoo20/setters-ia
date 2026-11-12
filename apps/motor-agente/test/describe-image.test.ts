import { describe, it, expect } from 'vitest';
import {
  describeImage,
  DescribeImageError,
} from '../src/lib/describe-image.js';

interface MockAnthropicResponse {
  content: Array<{ type: 'text'; text: string } | { type: 'tool_use'; [k: string]: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function mockAnthropic(response: MockAnthropicResponse | (() => MockAnthropicResponse | Promise<MockAnthropicResponse>) | Error) {
  return {
    messages: {
      create: async () => {
        if (response instanceof Error) throw response;
        return typeof response === 'function' ? await response() : response;
      },
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

function makeDownloadFetch(opts: {
  body?: Uint8Array;
  status?: number;
  contentType?: string;
}): typeof fetch {
  return (async () => {
    const status = opts.status ?? 200;
    const headers: Record<string, string> = {};
    if (opts.contentType) headers['content-type'] = opts.contentType;
    if (status >= 400) {
      return new Response(null, { status });
    }
    const body = opts.body ?? new Uint8Array([0xff, 0xd8, 0xff]); // jpg magic
    return new Response(body, { status, headers });
  }) as unknown as typeof fetch;
}

describe('describeImage', () => {
  it('downloads image and returns Anthropic vision text + tokens + cost', async () => {
    const fetchImpl = makeDownloadFetch({ contentType: 'image/jpeg' });
    const anthropic = mockAnthropic({
      content: [{ type: 'text', text: 'Una foto de un gimnasio con pesas.' }],
      usage: { input_tokens: 1200, output_tokens: 30 },
    });
    const r = await describeImage({
      url: 'https://media/photo.jpg',
      anthropic,
      fetchImpl,
    });
    expect(r.text).toBe('Una foto de un gimnasio con pesas.');
    expect(r.inputTokens).toBe(1200);
    expect(r.outputTokens).toBe(30);
    expect(r.mediaType).toBe('image/jpeg');
    // Sonnet 4.5 se retira el 2026-11-30; desde 2026-11-12 va con Sonnet 5.
    expect(r.model).toBe('claude-sonnet-5');
    // Sonnet 5: input $2/M + output $10/M
    expect(r.costUsd).toBeCloseTo((1200 * 2 + 30 * 10) / 1_000_000, 8);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('sends the request with Sonnet 5 and thinking explicitly disabled', async () => {
    // En Sonnet 5 omitir `thinking` activa el pensamiento adaptativo: más
    // tokens y más latencia para describir una foto. Tiene que ir apagado.
    const calls: Array<Record<string, unknown>> = [];
    const anthropic = {
      messages: {
        create: async (req: Record<string, unknown>) => {
          calls.push(req);
          return { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 2 } };
        },
      },
    } as unknown as import('@anthropic-ai/sdk').default;
    await describeImage({
      url: 'https://media/photo.jpg',
      anthropic,
      fetchImpl: makeDownloadFetch({ contentType: 'image/jpeg' }),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('claude-sonnet-5');
    expect(calls[0]!.thinking).toEqual({ type: 'disabled' });
  });

  it('falls back to URL extension when content-type missing', async () => {
    const fetchImpl = makeDownloadFetch({ contentType: 'application/octet-stream' });
    const anthropic = mockAnthropic({
      content: [{ type: 'text', text: 'desc' }],
      usage: { input_tokens: 100, output_tokens: 5 },
    });
    const r = await describeImage({
      url: 'https://x.com/photo.png?token=abc',
      anthropic,
      fetchImpl,
    });
    expect(r.mediaType).toBe('image/png');
  });

  it('throws unsupported_media_type for non-image (e.g. application/pdf)', async () => {
    const fetchImpl = makeDownloadFetch({ contentType: 'application/pdf' });
    const anthropic = mockAnthropic({ content: [{ type: 'text', text: 'x' }] });
    await expect(
      describeImage({ url: 'https://x/doc.pdf', anthropic, fetchImpl }),
    ).rejects.toMatchObject({ reason: 'unsupported_media_type' });
  });

  it('throws download_failed on 404', async () => {
    const fetchImpl = makeDownloadFetch({ status: 404 });
    const anthropic = mockAnthropic({ content: [{ type: 'text', text: 'x' }] });
    await expect(
      describeImage({ url: 'https://x/missing.jpg', anthropic, fetchImpl }),
    ).rejects.toMatchObject({ reason: 'download_failed' });
  });

  it('throws file_too_large when buffer exceeds maxBytes', async () => {
    const big = new Uint8Array(100);
    big[0] = 0xff;
    big[1] = 0xd8; // jpg
    const fetchImpl = makeDownloadFetch({
      body: big,
      contentType: 'image/jpeg',
    });
    const anthropic = mockAnthropic({ content: [{ type: 'text', text: 'x' }] });
    await expect(
      describeImage({
        url: 'https://x/big.jpg',
        anthropic,
        fetchImpl,
        maxBytes: 50,
      }),
    ).rejects.toMatchObject({ reason: 'file_too_large' });
  });

  it('throws anthropic_error when SDK throws', async () => {
    const fetchImpl = makeDownloadFetch({ contentType: 'image/jpeg' });
    const anthropic = mockAnthropic(new Error('rate limited'));
    await expect(
      describeImage({ url: 'https://x/y.jpg', anthropic, fetchImpl }),
    ).rejects.toMatchObject({ reason: 'anthropic_error' });
  });

  it('throws empty_response when Anthropic returns no text content', async () => {
    const fetchImpl = makeDownloadFetch({ contentType: 'image/jpeg' });
    const anthropic = mockAnthropic({ content: [] });
    await expect(
      describeImage({ url: 'https://x/y.jpg', anthropic, fetchImpl }),
    ).rejects.toMatchObject({ reason: 'empty_response' });
  });

  it('empty_response carries the billed tokens so the caller can log them', async () => {
    const fetchImpl = makeDownloadFetch({ contentType: 'image/jpeg' });
    const anthropic = mockAnthropic({ content: [], usage: { input_tokens: 1500, output_tokens: 0 } });
    const err = await describeImage({ url: 'https://x/y.jpg', anthropic, fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DescribeImageError);
    const call = (err as DescribeImageError).call;
    expect(call?.model).toBe('claude-sonnet-5');
    expect(call?.inputTokens).toBe(1500);
    expect(call?.costUsd).toBeCloseTo((1500 * 2) / 1_000_000, 8);
  });

  it('download errors carry no call info (the model was never called)', async () => {
    const fetchImpl = makeDownloadFetch({ status: 404 });
    const anthropic = mockAnthropic({ content: [{ type: 'text', text: 'x' }] });
    const err = await describeImage({ url: 'https://x/missing.jpg', anthropic, fetchImpl }).catch(
      (e: unknown) => e,
    );
    expect((err as DescribeImageError).call).toBeUndefined();
  });
});

describe('DescribeImageError', () => {
  it('preserves reason', () => {
    const err = new DescribeImageError('download_failed', 'oops');
    expect(err.name).toBe('DescribeImageError');
    expect(err.reason).toBe('download_failed');
  });
});
