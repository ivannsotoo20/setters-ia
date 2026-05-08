/**
 * GHL sync — replica inbound + outbound + opportunity stage moves al CRM del trainer.
 *
 * Diseño: TODAS las funciones son best-effort. Capturan errores internamente,
 * loggean estructurado, y NUNCA lanzan al caller. Si GHL API cae, el motor
 * sigue respondiendo a leads (D33: criterio cierre Bloque B).
 *
 * Flujo:
 *   1. loadGhlContext(supabase, tenantId) → carga credenciales + connection_config.
 *      null si tenant no tiene GHL configurado → callers hacen skip.
 *   2. ensureGhlContactAndOpportunity → al primer turno, upsertContact + createOpportunity
 *      en F1; idempotente: salta si conversations.ghl_contact_id|opportunity_id ya pobladas.
 *   3. syncInbound / syncOutbound → registra mensajes en GHL con type='Custom' o 'WhatsApp'
 *      según provider externo.
 *   4. moveStageForPhase → mueve opportunity a stageMap[F<n>] si phase cambió.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  GhlApiError,
  GhlClient,
  type GhlConnectionConfig,
  type GhlMessageType,
} from '@fyzon/ghl-client';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';
import { logger } from '../lib/logger.js';

export interface GhlSyncContext {
  client: GhlClient;
  config: GhlConnectionConfig;
  /** ID del integration_account ghl para auditoría en logs. */
  integrationAccountId: number;
}

/**
 * Carga el GhlClient + config para un tenant. Devuelve null si:
 *  - No hay integration_account provider='ghl' is_active=true.
 *  - Las credenciales no se pueden decodificar (encrypted+plain ambos vacíos).
 *  - connection_config.pipelineId está ausente (config incompleta).
 */
export async function loadGhlContext(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<GhlSyncContext | null> {
  const { data: ia, error } = await supabase
    .from('integration_accounts')
    .select('id, credentials, credentials_encrypted, connection_config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'ghl')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn({ tenantId, err: error.message }, 'ghl-sync: integration_accounts lookup error');
    return null;
  }
  if (!ia) return null;

  let creds: Record<string, unknown>;
  try {
    creds = decodeCredentialsRow(ia, Number(ia.id));
  } catch (err) {
    logger.warn(
      { tenantId, integrationAccountId: ia.id, err: errMsg(err) },
      'ghl-sync: credentials decode failed',
    );
    return null;
  }

  const locationId = typeof creds.locationId === 'string' ? creds.locationId : '';
  const apiToken = typeof creds.apiToken === 'string' ? creds.apiToken : '';
  if (!locationId || !apiToken) {
    logger.warn({ tenantId, integrationAccountId: ia.id }, 'ghl-sync: locationId/apiToken vacíos');
    return null;
  }

  const config = (ia.connection_config ?? {}) as GhlConnectionConfig;
  if (!config.pipelineId) {
    logger.warn({ tenantId, integrationAccountId: ia.id }, 'ghl-sync: connection_config.pipelineId ausente');
    return null;
  }

  const client = new GhlClient({ locationId, apiToken });
  return { client, config, integrationAccountId: Number(ia.id) };
}

export interface EnsureContactArgs {
  conversationId: number;
  /** phase_number actual de la conversación. Si 0|1 → opportunity en F1. */
  currentPhase: number;
  lead: {
    id: number;
    externalId: string;
    phone?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export interface EnsureContactResult {
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
}

/**
 * Idempotente: si conversations.ghl_contact_id ya existe lo devuelve sin upsert.
 * Igual con opportunity_id. Si fallan calls a GHL → log + devuelve nulls (no rompe).
 */
export async function ensureGhlContactAndOpportunity(
  supabase: SupabaseClient,
  ctx: GhlSyncContext,
  args: EnsureContactArgs,
): Promise<EnsureContactResult> {
  const correlationFields = {
    conversationId: args.conversationId,
    integrationAccountId: ctx.integrationAccountId,
  };

  // 1) Cargar el estado actual de conversations.ghl_*
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('ghl_contact_id, ghl_opportunity_id')
    .eq('id', args.conversationId)
    .maybeSingle();
  if (convErr) {
    logger.warn({ ...correlationFields, err: convErr.message }, 'ghl-sync: conv lookup failed');
    return { ghlContactId: null, ghlOpportunityId: null };
  }

  let ghlContactId = conv?.ghl_contact_id ?? null;
  let ghlOpportunityId = conv?.ghl_opportunity_id ?? null;

  // 2) Upsert contact si no existe
  if (!ghlContactId) {
    if (!args.lead.phone && !args.lead.email) {
      logger.warn(
        { ...correlationFields, externalId: args.lead.externalId },
        'ghl-sync: lead sin phone ni email — no se puede upsert contact',
      );
      return { ghlContactId: null, ghlOpportunityId: null };
    }

    const customFields = buildContactCustomFields(ctx.config, args.lead);
    try {
      const upsert = await ctx.client.upsertContact({
        phone: args.lead.phone ?? undefined,
        email: args.lead.email ?? undefined,
        firstName: args.lead.firstName ?? undefined,
        lastName: args.lead.lastName ?? undefined,
        source: 'fyzon-setter',
        customFields: customFields.length > 0 ? customFields : undefined,
      });
      ghlContactId = upsert.contact.id;
      logger.info(
        { ...correlationFields, ghlContactId, isNew: upsert.isNew },
        'ghl-sync: contact upserted',
      );
    } catch (err) {
      logErr('ghl-sync: upsertContact failed', err, correlationFields);
      return { ghlContactId: null, ghlOpportunityId: null };
    }
  }

  // 3) Crear opportunity si no existe
  if (!ghlOpportunityId && ghlContactId) {
    const initialStageId = pickInitialStageId(ctx.config, args.currentPhase);
    if (!initialStageId) {
      logger.warn(
        { ...correlationFields, currentPhase: args.currentPhase },
        'ghl-sync: stageMap sin F1/F<currentPhase> — no se crea opportunity',
      );
    } else {
      try {
        const opp = await ctx.client.createOpportunity({
          pipelineId: ctx.config.pipelineId,
          pipelineStageId: initialStageId,
          contactId: ghlContactId,
          name: opportunityName(args.lead),
          status: 'open',
        });
        ghlOpportunityId = opp.id;
        logger.info({ ...correlationFields, ghlOpportunityId }, 'ghl-sync: opportunity created');
      } catch (err) {
        logErr('ghl-sync: createOpportunity failed', err, correlationFields);
      }
    }
  }

  // 4) Persistir en conversations los IDs nuevos (si cambió algo)
  if (ghlContactId !== conv?.ghl_contact_id || ghlOpportunityId !== conv?.ghl_opportunity_id) {
    const update: Record<string, unknown> = {};
    if (ghlContactId !== conv?.ghl_contact_id) update.ghl_contact_id = ghlContactId;
    if (ghlOpportunityId !== conv?.ghl_opportunity_id) update.ghl_opportunity_id = ghlOpportunityId;
    const { error: updErr } = await supabase
      .from('conversations')
      .update(update)
      .eq('id', args.conversationId);
    if (updErr) {
      logger.warn(
        { ...correlationFields, err: updErr.message },
        'ghl-sync: conversations UPDATE failed (ids no persistidos)',
      );
    }
  }

  return { ghlContactId, ghlOpportunityId };
}

export interface SyncMessageArgs {
  conversationId: number;
  ghlContactId: string;
  message: string;
  /** Mapeado del provider de origen al tipo de mensaje GHL. Default 'Custom'. */
  messageType?: GhlMessageType;
  date?: string;
}

/** Replica un inbound del lead a GHL. Best-effort. */
export async function syncInboundToGhl(
  supabase: SupabaseClient,
  ctx: GhlSyncContext,
  args: SyncMessageArgs,
): Promise<void> {
  const correlationFields = {
    conversationId: args.conversationId,
    integrationAccountId: ctx.integrationAccountId,
  };
  try {
    const result = await ctx.client.registerInbound({
      type: args.messageType ?? 'Custom',
      contactId: args.ghlContactId,
      message: args.message,
      conversationProviderId: ctx.config.conversationProviderId,
      ...(args.date ? { date: args.date } : {}),
    });
    if (result.conversationId) {
      await persistGhlConversationId(supabase, args.conversationId, result.conversationId);
    }
    logger.info(
      { ...correlationFields, ghlMessageId: result.messageId, ghlConversationId: result.conversationId },
      'ghl-sync: inbound registered',
    );
  } catch (err) {
    logErr('ghl-sync: registerInbound failed', err, correlationFields);
  }
}

/** Replica un outbound enviado por motor a GHL. Best-effort. */
export async function syncOutboundToGhl(
  supabase: SupabaseClient,
  ctx: GhlSyncContext,
  args: SyncMessageArgs,
): Promise<void> {
  const correlationFields = {
    conversationId: args.conversationId,
    integrationAccountId: ctx.integrationAccountId,
  };
  try {
    const result = await ctx.client.registerOutbound({
      type: args.messageType ?? 'Custom',
      contactId: args.ghlContactId,
      message: args.message,
      conversationProviderId: ctx.config.conversationProviderId,
      ...(args.date ? { date: args.date } : {}),
    });
    if (result.conversationId) {
      await persistGhlConversationId(supabase, args.conversationId, result.conversationId);
    }
    logger.info(
      { ...correlationFields, ghlMessageId: result.messageId, ghlConversationId: result.conversationId },
      'ghl-sync: outbound registered',
    );
  } catch (err) {
    logErr('ghl-sync: registerOutbound failed', err, correlationFields);
  }
}

/**
 * Mueve la opportunity al stage correspondiente al `newPhaseNumber`.
 * Si stageMap[F<n>] no está mapeado o ghlOpportunityId es null → log y no-op.
 */
export async function moveStageForPhase(
  ctx: GhlSyncContext,
  args: { ghlOpportunityId: string | null; newPhaseNumber: number },
): Promise<void> {
  if (!args.ghlOpportunityId) return;

  const stageId = stageIdForPhase(ctx.config, args.newPhaseNumber);
  if (!stageId) return; // F sin mapeo, no hacemos nada

  const correlationFields = {
    ghlOpportunityId: args.ghlOpportunityId,
    integrationAccountId: ctx.integrationAccountId,
    newPhase: args.newPhaseNumber,
  };
  try {
    await ctx.client.moveOpportunityStage({
      opportunityId: args.ghlOpportunityId,
      pipelineStageId: stageId,
    });
    logger.info(correlationFields, 'ghl-sync: opportunity stage moved');
  } catch (err) {
    logErr('ghl-sync: moveOpportunityStage failed', err, correlationFields);
  }
}

// ----------------------------------------------------------------------------
// Helpers privados
// ----------------------------------------------------------------------------

function pickInitialStageId(config: GhlConnectionConfig, currentPhase: number): string | null {
  // Si la conversación ya viene en F2/F3/etc., respetamos esa fase como stage inicial.
  // En arranque normal currentPhase=0 → F1.
  const phaseKey = `F${Math.max(1, currentPhase)}` as keyof NonNullable<GhlConnectionConfig['stageMap']>;
  return config.stageMap?.[phaseKey] ?? config.stageMap?.F1 ?? null;
}

function stageIdForPhase(config: GhlConnectionConfig, phase: number): string | null {
  if (phase < 1 || phase > 12) return null;
  const phaseKey = `F${phase}` as keyof NonNullable<GhlConnectionConfig['stageMap']>;
  return config.stageMap?.[phaseKey] ?? null;
}

function buildContactCustomFields(
  config: GhlConnectionConfig,
  lead: EnsureContactArgs['lead'],
): Array<{ id: string; value: string }> {
  const ids = config.customFieldIds;
  if (!ids) return [];
  const out: Array<{ id: string; value: string }> = [];
  if (ids.externalId) out.push({ id: ids.externalId, value: lead.externalId });
  // username/email/phone se mapean por GHL nativo, no por custom field, salvo que el trainer
  // tenga un field específico. Hoy solo external_id.
  return out;
}

function opportunityName(lead: EnsureContactArgs['lead']): string {
  if (lead.firstName) return `Lead ${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}`;
  if (lead.phone) return `Lead ${lead.phone}`;
  if (lead.email) return `Lead ${lead.email}`;
  return `Lead ${lead.externalId}`;
}

async function persistGhlConversationId(
  supabase: SupabaseClient,
  conversationId: number,
  ghlConversationId: string,
): Promise<void> {
  // Solo escribimos si está vacía (no rotamos id de conversation GHL)
  const { data: conv } = await supabase
    .from('conversations')
    .select('ghl_conversation_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (conv?.ghl_conversation_id) return;
  await supabase
    .from('conversations')
    .update({ ghl_conversation_id: ghlConversationId })
    .eq('id', conversationId);
}

function logErr(msg: string, err: unknown, fields: Record<string, unknown>): void {
  if (err instanceof GhlApiError) {
    logger.warn({ ...fields, status: err.status, body: err.body }, msg);
  } else {
    logger.warn({ ...fields, err: errMsg(err) }, msg);
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
