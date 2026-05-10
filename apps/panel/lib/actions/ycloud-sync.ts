'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { decodeCredentialsRow } from '@/lib/integration-credentials';
import {
  ycloudListTemplates,
  extractTemplateBody,
  extractTemplateVariables,
  type YCloudTemplateRow,
} from '@/lib/ycloud-templates-client';
import type { ActionResult } from './followups';

/**
 * Sprint Iota.1 — Sincronización manual de plantillas WhatsApp desde YCloud.
 *
 * Botón "Sincronizar plantillas YCloud" en /settings/followup-templates (tab WA).
 * Por cada plantilla aprobada en YCloud, hace upsert en followup_templates con
 * provider='ycloud', provider_template_id, language, category, status, variables.
 *
 * Auth: owner del tenant + agency admin (acceso a credentials YCloud).
 */

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface SyncYCloudResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function mapStatus(ycloudStatus: string): 'pending' | 'approved' | 'rejected' | 'disabled' {
  const s = ycloudStatus.toUpperCase();
  if (s === 'APPROVED') return 'approved';
  if (s === 'PENDING') return 'pending';
  if (s === 'REJECTED') return 'rejected';
  return 'disabled';
}

function mapCategory(
  ycloudCategory: string,
): 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | null {
  const c = ycloudCategory.toUpperCase();
  if (c === 'MARKETING' || c === 'UTILITY' || c === 'AUTHENTICATION') return c;
  return null;
}

export async function syncYCloudTemplates(): Promise<ActionResult<SyncYCloudResult>> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };
  if (!(eff.isAgencyAdmin || eff.role === 'owner')) {
    return { ok: false, error: 'forbidden — solo el owner puede sincronizar plantillas YCloud' };
  }

  const supabase = getServiceRoleClient();

  // 1. Encontrar integration_account YCloud activa del tenant
  const { data: iaRows } = await supabase
    .from('integration_accounts')
    .select('id, provider, credentials, credentials_encrypted, connection_config, channel_id')
    .eq('tenant_id', eff.tenantId)
    .eq('provider', 'ycloud')
    .eq('is_active', true);

  if (!iaRows || iaRows.length === 0) {
    return {
      ok: false,
      error:
        'no hay integration_account YCloud activa en este tenant. Configura YCloud primero en /settings/integrations.',
    };
  }

  const result: SyncYCloudResult = { added: 0, updated: 0, skipped: 0, errors: [] };

  for (const ia of iaRows) {
    let credentials: Record<string, unknown>;
    try {
      credentials = decodeCredentialsRow(
        {
          credentials: ia.credentials as Record<string, unknown> | null,
          credentials_encrypted: ia.credentials_encrypted as Record<string, unknown> | null,
        },
        Number(ia.id),
      );
    } catch (err) {
      result.errors.push(`integration ${ia.id}: decode credentials: ${(err as Error).message}`);
      continue;
    }
    const apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey : '';
    if (!apiKey) {
      result.errors.push(`integration ${ia.id}: falta apiKey en credentials`);
      continue;
    }
    const config = (ia.connection_config ?? {}) as Record<string, unknown>;
    const wabaId = typeof config.waba_id === 'string'
      ? config.waba_id
      : typeof config.wabaId === 'string'
        ? config.wabaId
        : '';
    if (!wabaId) {
      result.errors.push(
        `integration ${ia.id}: falta waba_id en connection_config (configurar en YCloud panel y guardar en /settings/integrations)`,
      );
      continue;
    }

    // 2. Llamar YCloud API
    let templates: YCloudTemplateRow[];
    try {
      templates = await ycloudListTemplates({ apiKey, wabaId });
    } catch (err) {
      result.errors.push(`integration ${ia.id}: YCloud API: ${(err as Error).message}`);
      continue;
    }

    // 3. Upsert en followup_templates por (tenant_id, name, channel_kind='whatsapp')
    for (const tpl of templates) {
      const name = String(tpl.name ?? '').trim();
      const language = String(tpl.language ?? '').trim();
      if (!name || !language) {
        result.errors.push(`template sin name/language: ${JSON.stringify(tpl).slice(0, 100)}`);
        continue;
      }

      const status = mapStatus(String(tpl.status ?? ''));
      const category = mapCategory(String(tpl.category ?? ''));
      const body = extractTemplateBody(tpl);
      const variables = extractTemplateVariables(tpl);
      const providerTemplateId = String(tpl.name); // YCloud usa name como id estable

      // Upsert manual: si existe (tenant, name, channel_kind=wa) → update; si no → insert
      const { data: existing } = await supabase
        .from('followup_templates')
        .select('id')
        .eq('tenant_id', eff.tenantId)
        .eq('channel_kind', 'whatsapp')
        .eq('name', `${name}.${language}`)
        .maybeSingle();

      const payload = {
        tenant_id: eff.tenantId,
        name: `${name}.${language}`, // único per (tenant, name+lang, channel_kind)
        channel_kind: 'whatsapp' as const,
        provider: 'ycloud' as const,
        provider_template_id: providerTemplateId,
        language,
        category,
        status,
        variables,
        provider_metadata: tpl as unknown as Record<string, unknown>,
        body,
        ai_personalize: false,
        ai_guide: null,
        created_by: eff.userId,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        const { error } = await supabase
          .from('followup_templates')
          .update(payload)
          .eq('id', existing.id);
        if (error) {
          result.errors.push(`update ${name}.${language}: ${error.message}`);
        } else {
          result.updated += 1;
        }
      } else {
        const { error } = await supabase.from('followup_templates').insert(payload);
        if (error) {
          if (error.code === '23505') {
            result.skipped += 1;
          } else {
            result.errors.push(`insert ${name}.${language}: ${error.message}`);
          }
        } else {
          result.added += 1;
        }
      }
    }
  }

  revalidatePath('/settings/followup-templates');
  return { ok: true, data: result };
}
