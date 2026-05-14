/**
 * Appointment matcher (Hito 10).
 *
 * Dado un AppointmentCreate/Update payload GHL, determina qué `lead` (y su conv) del SaaS
 * disparó la reserva. Orden:
 *   1. fyzon_lead_uuid en payload.appointment.customFields → leads.tracking_uuid (confidence 100)
 *   2. fyzon_lead_uuid en el contacto GHL (fetch via getContactInfo) → leads.tracking_uuid (confidence 100)
 *   3. phone normalizado del contacto GHL → leads.phone (confidence 80)
 *   4. Nada matchea → unmatched (confidence 0, lead_id NULL)
 *
 * Match por phone: si hay múltiples leads con mismo phone (canales distintos), tomar el
 * que tenga conversación más reciente (last_message_at). Si todos en mismo timestamp
 * ±5min, preferir el de phase_number más alto.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlClient } from '@fyzon/ghl-client';
import { FYZON_LEAD_UUID_FIELD_KEY } from '@fyzon/ghl-client';
import type { GhlAppointment } from '@fyzon/ghl-client';

export type MatchMethod = 'fyzon_uuid' | 'phone' | 'unmatched';

export interface MatchResult {
  leadId: number | null;
  conversationId: number | null;
  method: MatchMethod;
  confidence: number;
}

export interface MatchInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient | null;
  tenantId: number;
  appointment: GhlAppointment;
}

export async function matchLeadFromAppointment(input: MatchInput): Promise<MatchResult> {
  const { supabase, ghlClient, tenantId, appointment } = input;

  // 1. Custom field directo en el payload del appointment
  const payloadUuid = extractFyzonUuidFromAppointment(appointment);
  if (payloadUuid) {
    const found = await findLeadByTrackingUuid(supabase, tenantId, payloadUuid);
    if (found) return { ...found, method: 'fyzon_uuid', confidence: 100 };
  }

  // 2. Custom field via getContactInfo
  if (ghlClient && appointment.contactId) {
    try {
      const contact = await ghlClient.getContactInfo(appointment.contactId);
      const contactUuid = extractFyzonUuidFromContact(contact);
      if (contactUuid) {
        const found = await findLeadByTrackingUuid(supabase, tenantId, contactUuid);
        if (found) return { ...found, method: 'fyzon_uuid', confidence: 100 };
      }
      // 3. Fallback phone
      if (contact?.phone) {
        const normalized = normalizeE164(contact.phone);
        if (normalized) {
          const found = await findLeadByPhone(supabase, tenantId, normalized);
          if (found) return { ...found, method: 'phone', confidence: 80 };
        }
      }
    } catch {
      // contact fetch fallido — seguimos al unmatched
    }
  }

  return { leadId: null, conversationId: null, method: 'unmatched', confidence: 0 };
}

function extractFyzonUuidFromAppointment(appointment: GhlAppointment): string | null {
  if (!appointment.customFields || appointment.customFields.length === 0) return null;
  for (const f of appointment.customFields) {
    const key = f.key ?? '';
    const id = f.id ?? '';
    if (
      key === FYZON_LEAD_UUID_FIELD_KEY ||
      key === `contact.${FYZON_LEAD_UUID_FIELD_KEY}` ||
      id === FYZON_LEAD_UUID_FIELD_KEY
    ) {
      return f.value || null;
    }
  }
  return null;
}

interface MinimalGhlContact {
  customFields?: Array<{ id?: string; key?: string; value?: string }> | unknown;
  phone?: string | null;
}

function extractFyzonUuidFromContact(contact: MinimalGhlContact | null): string | null {
  if (!contact?.customFields) return null;
  const cf = contact.customFields as Array<{ id?: string; key?: string; value?: string }>;
  if (!Array.isArray(cf)) return null;
  for (const f of cf) {
    const key = f.key ?? '';
    const id = f.id ?? '';
    if (
      key === FYZON_LEAD_UUID_FIELD_KEY ||
      key === `contact.${FYZON_LEAD_UUID_FIELD_KEY}` ||
      id === FYZON_LEAD_UUID_FIELD_KEY
    ) {
      return f.value || null;
    }
  }
  return null;
}

async function findLeadByTrackingUuid(
  supabase: SupabaseClient,
  tenantId: number,
  trackingUuid: string,
): Promise<{ leadId: number; conversationId: number | null } | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('id, conversations:conversations(id, last_message_at, phase_number)')
    .eq('tenant_id', tenantId)
    .eq('tracking_uuid', trackingUuid)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const conv = pickLatestConversation(data.conversations as MinimalConv[] | null);
  return { leadId: Number(data.id), conversationId: conv?.id ?? null };
}

async function findLeadByPhone(
  supabase: SupabaseClient,
  tenantId: number,
  phone: string,
): Promise<{ leadId: number; conversationId: number | null } | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('id, conversations:conversations(id, last_message_at, phase_number)')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .order('id', { ascending: false })
    .limit(5);
  if (error || !data || data.length === 0) return null;
  // De entre los leads con mismo phone, escoger el de conv más reciente.
  let best: { leadId: number; conversationId: number | null; ts: number; phase: number } | null = null;
  for (const row of data) {
    const conv = pickLatestConversation(row.conversations as MinimalConv[] | null);
    const ts = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
    const phase = conv?.phase_number ?? 0;
    const candidate = { leadId: Number(row.id), conversationId: conv?.id ?? null, ts, phase };
    if (!best) best = candidate;
    else if (candidate.ts > best.ts + 5 * 60_000) best = candidate;
    else if (Math.abs(candidate.ts - best.ts) <= 5 * 60_000 && candidate.phase > best.phase) best = candidate;
  }
  return best ? { leadId: best.leadId, conversationId: best.conversationId } : null;
}

interface MinimalConv {
  id: number;
  last_message_at: string | null;
  phase_number: number | null;
}

function pickLatestConversation(convs: MinimalConv[] | null): MinimalConv | null {
  if (!convs || convs.length === 0) return null;
  return convs
    .slice()
    .sort((a, b) => {
      const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tb - ta;
    })[0]!;
}

/**
 * Normaliza un phone a E.164 (`+CCNNNNNN`). Acepta entradas con espacios/guiones/paréntesis.
 * Devuelve null si no encaja en el patrón básico.
 */
export function normalizeE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  // Heurística: si arranca con 00, sustituir por +
  if (/^00[1-9]\d{6,13}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  return null;
}
