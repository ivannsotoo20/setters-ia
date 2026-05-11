/**
 * Cliente mínimo Resend para el panel (Hito 10 — invites + password reset).
 *
 * Adaptado del helper de motor-agente (`apps/motor-agente/src/lib/email.ts`).
 * NO tira excepciones — devuelve { ok, ... } para que el caller decida.
 *
 * Sin RESEND_API_KEY configurada → devuelve { ok: false } y log warn.
 * Server-only — NUNCA importar desde Client Components.
 */

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status?: number; bodySnippet?: string };

const RESEND_API_BASE = 'https://api.resend.com';

function getFromHeader(): string {
  const name = process.env.RESEND_FROM_NAME ?? 'Fyzon Setters';
  const email = process.env.RESEND_FROM_EMAIL ?? 'alertas@fyzon.es';
  return `${name} <${email}>`;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  if (!args.to || !args.subject || !args.html) {
    return { ok: false, error: 'missing required fields (to/subject/html)' };
  }

  const fetchFn = args.fetchImpl ?? fetch;
  const url = `${RESEND_API_BASE}/emails`;

  const body: Record<string, unknown> = {
    from: getFromHeader(),
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
