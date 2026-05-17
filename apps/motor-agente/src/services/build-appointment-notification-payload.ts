/**
 * Build payload para notificación `appointment_booked` (Hito 10.5).
 *
 * Carga el contexto que el template renderAppointmentBooked necesita:
 *  - matched: lead + conversación + canal (kind + handle) + calendar name
 *  - unmatched: contacto GHL (firstName/phone/email) + calendar name
 *
 * Reglas para `channel_handle`:
 *  - whatsapp           → leads.phone   (E.164 o como esté guardado)
 *  - instagram_dm       → leads.username (handle @) con fallback a external_id
 *  - facebook_messenger → leads.username (handle) con fallback a external_id
 *  - otros / null       → null
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlAppointment, GhlClient } from '@fyzon/ghl-client';
import type { MatchResult } from './appointment-matcher.js';

export type ChannelKind = 'whatsapp' | 'instagram_dm' | 'facebook_messenger' | null;

export interface BuildPayloadInput {
  supabase: SupabaseClient;
  ghlClient: GhlClient | null;
  tenantId: number;
  calendarAccountId: number;
  appointment: GhlAppointment;
  match: MatchResult;
}

export interface AppointmentBookedPayload {
  unmatched: boolean;
  conversation_id: number | null;
  lead_id: number | null;
  lead_first_name: string | null;
  lead_phone: string | null;
  contact_email: string | null;
  channel_kind: ChannelKind;
  channel_handle: string | null;
  appointment_time: string | null;
  appointment_title: string | null;
  calendar_name: string | null;
  match_method: string;
  match_confidence: number;
}

interface LeadRow {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  email: string | null;
  external_id: string | null;
}

interface ConvRow {
  id: number;
  channel_id: number | null;
  channels: { channel_type: string } | { channel_type: string }[] | null;
}

export async function buildAppointmentBookedPayload(
  input: BuildPayloadInput,
): Promise<AppointmentBookedPayload> {
  const { supabase, ghlClient, tenantId, calendarAccountId, appointment, match } = input;

  const { data: cal } = await supabase
    .from('calendar_accounts')
    .select('name')
    .eq('id', calendarAccountId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const calendarName = (cal?.name as string | null) ?? null;

  if (match.leadId != null) {
    const { data: lead } = await supabase
      .from('leads')
      .select('first_name, last_name, username, phone, email, external_id')
      .eq('id', match.leadId)
      .eq('tenant_id', tenantId)
      .maybeSingle<LeadRow>();

    let channelKind: ChannelKind = null;
    if (match.conversationId != null) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, channel_id, channels:channel_id(channel_type)')
        .eq('id', match.conversationId)
        .eq('tenant_id', tenantId)
        .maybeSingle<ConvRow>();
      const rawCh = conv?.channels;
      const channelType = Array.isArray(rawCh) ? rawCh[0]?.channel_type : rawCh?.channel_type;
      if (
        channelType === 'whatsapp' ||
        channelType === 'instagram_dm' ||
        channelType === 'facebook_messenger'
      ) {
        channelKind = channelType;
      }
    }

    const channelHandle = pickHandle(channelKind, lead ?? null);

    return {
      unmatched: false,
      conversation_id: match.conversationId,
      lead_id: match.leadId,
      lead_first_name: lead?.first_name ?? null,
      lead_phone: lead?.phone ?? null,
      contact_email: lead?.email ?? null,
      channel_kind: channelKind,
      channel_handle: channelHandle,
      appointment_time: appointment.startTime ?? null,
      appointment_title: appointment.title ?? null,
      calendar_name: calendarName,
      match_method: match.method,
      match_confidence: match.confidence,
    };
  }

  // Unmatched — intentar enriquecer con datos del contacto GHL.
  let contactFirstName: string | null = null;
  let contactPhone: string | null = null;
  let contactEmail: string | null = null;
  if (ghlClient && appointment.contactId) {
    try {
      const c = await ghlClient.getContactInfo(appointment.contactId);
      contactFirstName = c?.firstName ?? null;
      contactPhone = c?.phone ?? null;
      contactEmail = c?.email ?? null;
    } catch {
      // best-effort
    }
  }

  return {
    unmatched: true,
    conversation_id: null,
    lead_id: null,
    lead_first_name: contactFirstName,
    lead_phone: contactPhone,
    contact_email: contactEmail,
    channel_kind: null,
    channel_handle: null,
    appointment_time: appointment.startTime ?? null,
    appointment_title: appointment.title ?? null,
    calendar_name: calendarName,
    match_method: match.method,
    match_confidence: match.confidence,
  };
}

function pickHandle(kind: ChannelKind, lead: LeadRow | null): string | null {
  if (!lead) return null;
  if (kind === 'whatsapp') return lead.phone ?? null;
  if (kind === 'instagram_dm' || kind === 'facebook_messenger') {
    return lead.username ?? lead.external_id ?? null;
  }
  return null;
}
