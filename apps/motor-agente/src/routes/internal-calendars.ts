/**
 * Endpoint POST /internal/calendars/sync (Hito 10).
 *
 * Disparado por server action del panel `/settings/calendars` cuando el trainer
 * pulsa "Sincronizar desde GHL". Hace:
 *   1. Carga OAuth access_token GHL del tenant (auto-refresh si expira en <5min).
 *   2. `ensureCustomField('fyzon_lead_uuid')` en la location GHL. Cachea el
 *      `customFieldId` en `tenant_configs.ghl_fyzon_uuid_field_id`.
 *   3. `listCalendars(locationId)` → devuelve los calendars al panel.
 *   4. NO inserta en `calendar_accounts` — eso lo hace el panel cuando el trainer
 *      explícitamente "vincula" uno (sub-acción `linkCalendar`).
 *
 * Auth: Bearer `INTERNAL_STATS_TOKEN`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { GhlClient } from '@fyzon/ghl-client';
import { env } from '../config/env.js';
import { getValidAccessToken } from '../lib/ghl-oauth.js';
import { decodeCredentialsRow } from '../lib/integration-credentials.js';
import { getSupabase } from '../lib/supabase.js';
import { backfillCalendarAppointments } from '../services/backfill-appointments.js';

const bodySchema = z.object({
  tenant_id: z.number().int().positive(),
});

const backfillBodySchema = z.object({
  tenant_id: z.number().int().positive(),
  calendar_account_id: z.number().int().positive().optional(),
  days_back: z.number().int().min(0).max(365).default(90),
  days_forward: z.number().int().min(0).max(365).default(90),
});

interface GhlCalendarSummary {
  externalCalendarId: string;
  name: string;
  description: string | null;
  slug: string | null;
  widgetBaseUrl: string;
  isActiveInGhl: boolean;
}

export async function internalCalendarsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/internal/calendars/sync',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const expected = env.INTERNAL_STATS_TOKEN;
      if (!expected) {
        return reply.code(503).send({ error: 'INTERNAL_STATS_TOKEN not configured' });
      }
      const auth = request.headers['authorization'];
      if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'missing Bearer token' });
      }
      const provided = auth.slice('Bearer '.length).trim();
      if (provided.length !== expected.length || provided !== expected) {
        return reply.code(401).send({ error: 'invalid token' });
      }

      let parsed;
      try {
        parsed = bodySchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'invalid_payload', issues: err.flatten() });
        }
        throw err;
      }
      const { tenant_id: tenantId } = parsed;
      const supabase = getSupabase();

      // 1. Resolver credenciales GHL: primero OAuth (con auto-refresh), si falla
      //    fallback a API Key estática (legacy `apiToken` + `locationId` en
      //    credentials). Esto soporta tenants que aún no han completado OAuth
      //    Marketplace pero ya tienen una sub-account API key configurada.
      let accessToken = '';
      let locationId = '';
      let credSource: 'oauth' | 'api_key' = 'oauth';
      try {
        const tokens = await getValidAccessToken(supabase, tenantId);
        accessToken = tokens.accessToken;
        locationId = tokens.locationId ?? '';
      } catch (oauthErr) {
        request.log.warn(
          { tenantId, err: oauthErr instanceof Error ? oauthErr.message : String(oauthErr) },
          'internal-calendars/sync: OAuth path unavailable, trying static API Key fallback',
        );
        // Fallback: cargar `apiToken` + `locationId` legacy
        const { data: ia, error: iaErr } = await supabase
          .from('integration_accounts')
          .select('id, credentials, credentials_encrypted, connection_config')
          .eq('tenant_id', tenantId)
          .eq('provider', 'ghl')
          .eq('is_active', true)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (iaErr || !ia) {
          return reply.code(409).send({
            error: 'ghl_unavailable',
            message: 'No hay integración GHL activa para este tenant.',
          });
        }
        try {
          const decoded = decodeCredentialsRow(ia, Number(ia.id));
          const at = typeof decoded.apiToken === 'string' ? decoded.apiToken : '';
          const lid =
            typeof decoded.locationId === 'string'
              ? decoded.locationId
              : typeof (ia.connection_config as Record<string, unknown> | null)?.locationId === 'string'
                ? String((ia.connection_config as Record<string, unknown>).locationId)
                : '';
          if (!at || !lid) {
            return reply.code(409).send({
              error: 'ghl_credentials_incomplete',
              message:
                'integration_accounts no tiene OAuth válido NI apiToken+locationId. Reconfigura la integración GHL desde /settings/integrations.',
            });
          }
          accessToken = at;
          locationId = lid;
          credSource = 'api_key';
        } catch (decodeErr) {
          return reply.code(409).send({
            error: 'ghl_credentials_decode_failed',
            message: decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
          });
        }
      }
      request.log.info(
        { tenantId, credSource, locationId: locationId.slice(0, 8) + '…' },
        'internal-calendars/sync: credentials resolved',
      );

      const ghl = new GhlClient({ apiToken: accessToken, locationId });

      // 2. ensureCustomField fyzon_lead_uuid
      let customFieldId: string | null = null;
      try {
        const field = await ghl.ensureCustomField();
        customFieldId = field.id ?? null;
        if (customFieldId) {
          await supabase
            .from('tenant_configs')
            .update({ ghl_fyzon_uuid_field_id: customFieldId })
            .eq('tenant_id', tenantId);
        }
      } catch (err) {
        request.log.warn(
          { tenantId, err: err instanceof Error ? err.message : String(err) },
          'internal-calendars/sync: ensureCustomField failed (continuing without)',
        );
      }

      // 3. listCalendars
      let calendars: GhlCalendarSummary[] = [];
      try {
        const raw = await ghl.listCalendars();
        calendars = raw.map((c) => ({
          externalCalendarId: c.id,
          name: c.name,
          description: c.description ?? null,
          slug: c.slug ?? c.widgetSlug ?? null,
          widgetBaseUrl: buildWidgetBaseUrl(c.id),
          isActiveInGhl: c.isActive !== false,
        }));
      } catch (err) {
        request.log.error(
          { tenantId, err: err instanceof Error ? err.message : String(err) },
          'internal-calendars/sync: listCalendars failed',
        );
        return reply.code(502).send({
          error: 'ghl_list_calendars_failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      return reply.code(200).send({
        ok: true,
        tenant_id: tenantId,
        custom_field_id: customFieldId,
        calendars,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /internal/calendars/backfill — importa citas existentes de GHL.
  // body: { tenant_id, calendar_account_id?, days_back=90, days_forward=90 }
  // Si calendar_account_id se omite, hace backfill de TODOS los calendars vinculados activos.
  // ---------------------------------------------------------------------------
  app.post(
    '/internal/calendars/backfill',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const expected = env.INTERNAL_STATS_TOKEN;
      if (!expected) return reply.code(503).send({ error: 'INTERNAL_STATS_TOKEN not configured' });
      const auth = request.headers['authorization'];
      if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'missing Bearer token' });
      }
      const provided = auth.slice('Bearer '.length).trim();
      if (provided.length !== expected.length || provided !== expected) {
        return reply.code(401).send({ error: 'invalid token' });
      }

      let parsed;
      try {
        parsed = backfillBodySchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'invalid_payload', issues: err.flatten() });
        }
        throw err;
      }
      const { tenant_id: tenantId, calendar_account_id: requestedCalendarId, days_back, days_forward } = parsed;
      const supabase = getSupabase();

      const cred = await resolveGhlClient(supabase, tenantId, request.log);
      if (!cred.ok) return reply.code(cred.status).send({ error: cred.error, message: cred.message });
      const ghl = cred.ghl;

      // Carga calendars vinculados activos del tenant
      let calQuery = supabase
        .from('calendar_accounts')
        .select('id, external_calendar_id, name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      if (requestedCalendarId) calQuery = calQuery.eq('id', requestedCalendarId);
      const { data: calRows, error: calErr } = await calQuery;
      if (calErr) {
        return reply.code(500).send({ error: 'calendars_query_failed', message: calErr.message });
      }
      if (!calRows || calRows.length === 0) {
        return reply.code(409).send({
          error: 'no_linked_calendars',
          message: 'Vincula al menos un calendario en /settings/calendars antes de hacer backfill.',
        });
      }

      const now = Date.now();
      const startTime = new Date(now - days_back * 24 * 60 * 60 * 1000).toISOString();
      const endTime = new Date(now + days_forward * 24 * 60 * 60 * 1000).toISOString();

      const summaries = [];
      let totalFetched = 0;
      let totalUpserted = 0;
      let totalMatched = 0;
      let totalUnmatched = 0;
      const allErrors: string[] = [];

      for (const cal of calRows) {
        const r = await backfillCalendarAppointments({
          supabase,
          ghlClient: ghl,
          tenantId,
          calendarAccountId: Number(cal.id),
          externalCalendarId: String(cal.external_calendar_id),
          startTime,
          endTime,
        });
        summaries.push({ calendar_id: Number(cal.id), calendar_name: String(cal.name), ...r });
        totalFetched += r.fetched;
        totalUpserted += r.upserted;
        totalMatched += r.matched;
        totalUnmatched += r.unmatched;
        allErrors.push(...r.errors);
      }

      return reply.code(200).send({
        ok: true,
        tenant_id: tenantId,
        range: { startTime, endTime, days_back, days_forward },
        total: { fetched: totalFetched, upserted: totalUpserted, matched: totalMatched, unmatched: totalUnmatched },
        calendars: summaries,
        errors: allErrors,
      });
    },
  );
}

function buildWidgetBaseUrl(calendarId: string): string {
  return `https://api.leadconnectorhq.com/widget/booking/${encodeURIComponent(calendarId)}`;
}

/**
 * Reuse credential resolution (OAuth o apiToken legacy) y devuelve un GhlClient
 * listo. Extraído para que `/internal/calendars/backfill` no duplique.
 */
async function resolveGhlClient(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
  log: { warn: (o: object, msg: string) => void },
): Promise<
  | { ok: true; ghl: GhlClient; locationId: string; credSource: 'oauth' | 'api_key' }
  | { ok: false; status: number; error: string; message: string }
> {
  try {
    const tokens = await getValidAccessToken(supabase, tenantId);
    const lid = tokens.locationId ?? '';
    if (!lid) {
      return { ok: false, status: 409, error: 'missing_location_id', message: 'OAuth sin locationId.' };
    }
    return { ok: true, ghl: new GhlClient({ apiToken: tokens.accessToken, locationId: lid }), locationId: lid, credSource: 'oauth' };
  } catch (oauthErr) {
    log.warn(
      { tenantId, err: oauthErr instanceof Error ? oauthErr.message : String(oauthErr) },
      'resolveGhlClient: OAuth path unavailable, trying static API Key fallback',
    );
    const { data: ia, error: iaErr } = await supabase
      .from('integration_accounts')
      .select('id, credentials, credentials_encrypted, connection_config')
      .eq('tenant_id', tenantId)
      .eq('provider', 'ghl')
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (iaErr || !ia) {
      return { ok: false, status: 409, error: 'ghl_unavailable', message: 'No hay integración GHL activa para este tenant.' };
    }
    try {
      const decoded = decodeCredentialsRow(ia, Number(ia.id));
      const at = typeof decoded.apiToken === 'string' ? decoded.apiToken : '';
      const lid =
        typeof decoded.locationId === 'string'
          ? decoded.locationId
          : typeof (ia.connection_config as Record<string, unknown> | null)?.locationId === 'string'
            ? String((ia.connection_config as Record<string, unknown>).locationId)
            : '';
      if (!at || !lid) {
        return {
          ok: false,
          status: 409,
          error: 'ghl_credentials_incomplete',
          message:
            'integration_accounts no tiene OAuth válido NI apiToken+locationId. Reconfigura la integración GHL.',
        };
      }
      return { ok: true, ghl: new GhlClient({ apiToken: at, locationId: lid }), locationId: lid, credSource: 'api_key' };
    } catch (decodeErr) {
      return {
        ok: false,
        status: 409,
        error: 'ghl_credentials_decode_failed',
        message: decodeErr instanceof Error ? decodeErr.message : String(decodeErr),
      };
    }
  }
}
