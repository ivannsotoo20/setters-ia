#!/usr/bin/env tsx
/**
 * Diagnóstico de bienvenidas que no se cuentan (2026-10-07, Tania). SOLO LECTURA.
 *
 * "Bienvenidas enviadas" cuenta conversaciones CREADAS en el periodo con
 * `conversation_source='bienvenida'`. Para que una bienvenida cuente tienen que
 * pasar tres cosas, y este script dice cuál falla:
 *
 *   1. GHL nos manda el mensaje (con PIT, solo si el Workflow de salida de la
 *      entrenadora lo reenvía al webhook; un mensaje escrito desde la app de
 *      Instagram puede no dispararlo).
 *   2. Llega como SALIENTE (direction=outbound en el webhook del Workflow). Si
 *      llega como entrante, se guarda como si lo hubiera escrito la persona.
 *   3. Casa con una palabra clave de bienvenida y no había conversación antes
 *      (si la había, cuenta el día en que se creó aquella).
 *
 * Qué hace: lee de GHL las conversaciones con actividad en los últimos N días,
 * busca los mensajes salientes que casan con una bienvenida (el mismo matcher
 * del motor) y, para cada uno, mira qué tenemos en la BD.
 *
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/diag-bienvenidas.ts --tenant 7 --days 3
 *
 * Opcional: --max-conversations 300 (por defecto 200).
 */

import { getSupabase } from '../src/lib/supabase.js';
import { resolveGhlCredentials } from '../src/lib/resolve-ghl-credentials.js';
import { logger } from '../src/lib/logger.js';
import { loadAutomationKeywords, matchKeyword } from '../src/services/ghl-message-router.js';

const GHL_BASE = 'https://services.leadconnectorhq.com';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const tenantId = Number(arg('tenant'));
const days = Number(arg('days') ?? 3);
const maxConversations = Number(arg('max-conversations') ?? 200);
if (!Number.isFinite(tenantId) || tenantId <= 0) {
  console.error('uso: tsx scripts/diag-bienvenidas.ts --tenant <id> [--days 3] [--max-conversations 200]');
  process.exit(2);
}
const sinceMs = Date.now() - days * 86_400_000;

type GhlConversation = {
  id: string;
  contactId?: string;
  lastMessageDate?: number | string;
  lastMessageType?: string;
  type?: string;
};
type GhlMessage = {
  id: string;
  direction?: string;
  body?: string;
  dateAdded?: string;
  messageType?: string;
  source?: string;
  contactId?: string;
};

async function ghlGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${res.status} ${path}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

function toMs(v: number | string | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Date.parse(v);
}

const preview = (s: string | null | undefined) =>
  String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 70);

async function main(): Promise<void> {
  const supabase = getSupabase();
  console.log(`\n=== Bienvenidas, tenant ${tenantId}, últimos ${days} días (desde ${new Date(sinceMs).toISOString()}) ===\n`);

  // --- Lo que hay configurado ---------------------------------------------------
  const keywords = await loadAutomationKeywords(supabase, tenantId);
  const welcomes = keywords.filter((k) => k.type === 'bienvenida');
  console.log(`Palabras clave de bienvenida activas: ${welcomes.length}`);
  for (const k of welcomes) console.log(`  · «${preview(k.pattern)}»`);

  const { data: ia } = await supabase
    .from('integration_accounts')
    .select('provider, is_active, last_webhook_at')
    .eq('tenant_id', tenantId);
  for (const a of ia ?? []) {
    console.log(`Integración ${a.provider} (activa=${a.is_active}): último webhook ${a.last_webhook_at ?? 'nunca'}`);
  }

  // --- Lo que dice nuestra BD -----------------------------------------------------
  const sinceIso = new Date(sinceMs).toISOString();
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, direction, conversation_source, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso);
  const byKind = new Map<string, number>();
  for (const c of convs ?? []) {
    const k = `${c.direction ?? '?'} / ${c.conversation_source ?? '(sin origen)'}`;
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  console.log(`\nConversaciones creadas en el periodo (dirección / origen): ${convs?.length ?? 0}`);
  for (const [k, n] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);

  // Mensajes nuestros del periodo que casan con una bienvenida, y cómo se guardaron.
  const { data: msgs } = await supabase
    .from('conversation_messages')
    .select('conversation_id, source, content, sent_at')
    .eq('tenant_id', tenantId)
    .gte('sent_at', sinceIso)
    .not('content', 'is', null)
    .limit(5000);
  const storedWelcomes = (msgs ?? []).filter(
    (m) => typeof m.content === 'string' && matchKeyword(m.content, welcomes)?.type === 'bienvenida',
  );
  const bySource = new Map<string, number>();
  for (const m of storedWelcomes) bySource.set(m.source, (bySource.get(m.source) ?? 0) + 1);
  console.log(`\nMensajes guardados en la BD que casan con una bienvenida: ${storedWelcomes.length}`);
  for (const [s, n] of bySource) {
    const meaning =
      s === 'system'
        ? 'clasificada como bienvenida (correcto)'
        : s === 'lead'
          ? '¡guardada como si la hubiera escrito la persona! (el Workflow no manda direction=outbound)'
          : s === 'human'
            ? 'mensaje a mano en una conversación que ya existía (no cuenta como nueva)'
            : s;
    console.log(`  ${String(n).padStart(4)}  source=${s}: ${meaning}`);
  }

  // --- Lo que dice GHL ------------------------------------------------------------
  const cred = await resolveGhlCredentials(supabase, tenantId, {
    warn: (o, m) => logger.warn(o, m),
    info: (o, m) => logger.info(o, m),
  });
  if (!cred.ok) {
    console.log(`\nNo se pudo leer GHL (${cred.error}: ${cred.message}). Fin.`);
    return;
  }

  const conversations: GhlConversation[] = [];
  let startAfter: number | null = null;
  while (conversations.length < maxConversations) {
    const qs = new URLSearchParams({
      locationId: cred.locationId,
      limit: '100',
      sort: 'desc',
      sortBy: 'last_message_date',
    });
    if (startAfter != null) qs.set('startAfterDate', String(startAfter));
    const page = await ghlGet<{ conversations?: GhlConversation[] }>(
      cred.accessToken,
      `/conversations/search?${qs.toString()}`,
    );
    const list = page.conversations ?? [];
    if (list.length === 0) break;
    conversations.push(...list.filter((c) => toMs(c.lastMessageDate) >= sinceMs));
    const last = list[list.length - 1]!;
    if (toMs(last.lastMessageDate) < sinceMs) break;
    const next = toMs(last.lastMessageDate);
    if (next === startAfter) break;
    startAfter = next;
  }
  console.log(`\nGHL: ${conversations.length} conversaciones con actividad en el periodo (tope ${maxConversations})`);

  type Found = { contactId: string; msg: GhlMessage; ghlConv: string };
  const found: Found[] = [];
  const outboundSources = new Map<string, number>();
  for (const conv of conversations) {
    let res: { messages?: { messages?: GhlMessage[] } | GhlMessage[] };
    try {
      res = await ghlGet(cred.accessToken, `/conversations/${conv.id}/messages?limit=50`);
    } catch (err) {
      console.log(`  (no se pudieron leer los mensajes de ${conv.id}: ${err instanceof Error ? err.message : err})`);
      continue;
    }
    const list = Array.isArray(res.messages) ? res.messages : (res.messages?.messages ?? []);
    for (const m of list) {
      if (m.direction !== 'outbound' || toMs(m.dateAdded) < sinceMs) continue;
      if (!m.body || matchKeyword(m.body, welcomes)?.type !== 'bienvenida') continue;
      const src = `${m.source ?? '?'} · ${m.messageType ?? '?'}`;
      outboundSources.set(src, (outboundSources.get(src) ?? 0) + 1);
      found.push({ contactId: m.contactId ?? conv.contactId ?? '', msg: m, ghlConv: conv.id });
    }
  }
  console.log(`GHL: ${found.length} bienvenidas enviadas en el periodo. Desde dónde se mandaron (source · tipo):`);
  for (const [s, n] of outboundSources) console.log(`  ${String(n).padStart(4)}  ${s}`);

  // --- Cruce ----------------------------------------------------------------------
  const verdicts = new Map<string, number>();
  console.log('\nCada bienvenida de GHL y qué tenemos de ella:');
  for (const f of found) {
    // Un mismo contacto puede tener un lead por canal: se miran todos.
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('external_id', f.contactId)
      .limit(10);
    let verdict: string;
    let detail = '';
    if (!leads || leads.length === 0) {
      verdict = 'NO NOS LLEGÓ (ni lead ni conversación)';
    } else {
      const { data: lc } = await supabase
        .from('conversations')
        .select('id, direction, conversation_source, created_at')
        .eq('tenant_id', tenantId)
        .in(
          'lead_id',
          leads.map((l) => l.id),
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lc) {
        verdict = 'NO NOS LLEGÓ (lead sin conversación)';
      } else {
        const { data: cm } = await supabase
          .from('conversation_messages')
          .select('source, content')
          .eq('conversation_id', lc.id)
          .not('content', 'is', null)
          .limit(200);
        const head = preview(f.msg.body).slice(0, 25).toLowerCase();
        const stored = (cm ?? []).find((x) => preview(x.content).toLowerCase().includes(head));
        detail = `conv ${lc.id} (${lc.direction}/${lc.conversation_source ?? 'sin origen'}, creada ${String(lc.created_at).slice(0, 16)})`;
        if (!stored) verdict = 'NO NOS LLEGÓ (la conversación existe por otro mensaje)';
        else if (stored.source === 'lead') verdict = 'LLEGÓ COMO ENTRANTE (falta direction=outbound)';
        else if (lc.conversation_source === 'bienvenida' && Date.parse(lc.created_at) >= sinceMs)
          verdict = 'OK, CONTADA';
        else if (lc.conversation_source === 'bienvenida') verdict = 'BIENVENIDA, pero la conversación es anterior al periodo';
        else verdict = `LLEGÓ pero el origen quedó «${lc.conversation_source ?? 'sin origen'}»`;
      }
    }
    verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
    console.log(`  ${String(f.msg.dateAdded).slice(0, 16)}  ${f.msg.source ?? '?'}  «${preview(f.msg.body).slice(0, 45)}»  → ${verdict} ${detail}`);
  }

  console.log('\n=== Resumen ===');
  for (const [v, n] of [...verdicts.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${v}`);
  console.log('\nPega esta salida en la conversación con Claude.');
}

main().catch((err) => {
  console.error('diag-bienvenidas error:', err);
  process.exit(1);
});
