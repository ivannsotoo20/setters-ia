import { env } from '../config/env.js';

/**
 * Cliente mínimo para enviar emails via Resend (Sprint Gamma 2.4).
 *
 * NO tira excepciones — devuelve `{ok: false, error}` si algo falla. El caller
 * decide si reintentar (notify-trainer.ts gestiona retry policy).
 *
 * Sin RESEND_API_KEY configurada → skipea (devuelve `ok: false, error: 'no api key'`)
 * para que dev local sin clave no rompa el cron.
 */

export interface SendEmailArgs {
  to: string;
  subject: string;
  /** HTML del cuerpo. Para plain text envolver en <pre> o usar templates. */
  html: string;
  /** Email para el header Reply-To (opcional). */
  replyTo?: string;
  /** Override del fetch (tests). */
  fetchImpl?: typeof fetch;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status?: number; bodySnippet?: string };

export class EmailSendError extends Error {
  constructor(
    message: string,
    public status?: number,
    public bodySnippet?: string,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  // Lee process.env en runtime (NO env cacheado al import) para que los tests
  // puedan mutar la API key con beforeEach sin reiniciar el módulo.
  const apiKey = process.env.RESEND_API_KEY ?? env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  if (!args.to || !args.subject || !args.html) {
    return { ok: false, error: 'missing required fields (to/subject/html)' };
  }

  const fetchFn = args.fetchImpl ?? fetch;
  const url = `${env.RESEND_API_BASE}/emails`;

  const body: Record<string, unknown> = {
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to: [args.to],
    subject: args.subject,
    html: args.html,
  };
  if (args.replyTo) body.reply_to = args.replyTo;

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `resend ${res.status}: ${res.statusText}`,
        status: res.status,
        bodySnippet: text.slice(0, 500),
      };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    if (!data.id) {
      return { ok: false, error: 'resend response missing id', status: res.status };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: `fetch failed: ${(err as Error).message}`,
    };
  }
}
