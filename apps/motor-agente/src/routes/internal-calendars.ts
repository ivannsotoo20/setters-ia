/**
 * Endpoint POST /internal/calendars/sync (Hito 10, refactor Iota.5 PR-A).
 *
 * Disparado por server action del panel `/settings/calendars` cuando el trainer
 * pulsa "Sincronizar desde GHL". Hace:
 *   1. Resuelve credenciales GHL con prioridad **PIT → OAuth → legacy**
 *      (`resolveGhlCredentials`). El PIT v2.0 BYOK suele tener scopes más
 *      amplios (`calendars.*`, `opportunities.write`) que la OAuth Marketplace
 *      app, así que conviene preferirlo cuando esté disponible.
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
import { getSupabase } from '../lib/supabase.js';
import { extractBearer, isValidBearer } from '../lib/timing-safe-bearer.js';
import { resolveGhlCredentials, type ResolvedCreds } from '../lib/resolve-ghl-credentials.js';
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
      const provided = extractBearer(request.headers['authorization']);
      if (!provided) {
        return reply.code(401).send({ error: 'missing Bearer token' });
      }
      if (!isValidBearer(provided, expected)) {
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

      const cred = await resolveGhlCredentials(supabase, tenantId, request.log);
      if (!cred.ok) {
        return reply.code(cred.status).send({ error: cred.error, message: cred.message });
      }
      const { accessToken, locationId, credSource } = cred;
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
      const provided = extractBearer(request.headers['authorization']);
      if (!provided) {
        return reply.code(401).send({ error: 'missing Bearer token' });
      }
      if (!isValidBearer(provided, expected)) {
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
 * Wrapper compat: resuelve credenciales + construye GhlClient.
 * Mantiene la API previa de `resolveGhlClient` para el endpoint de backfill.
 */
async function resolveGhlClient(
  supabase: ReturnType<typeof getSupabase>,
  tenantId: number,
  log: { warn: (o: object, msg: string) => void; info?: (o: object, msg: string) => void },
): Promise<
  | { ok: true; ghl: GhlClient; locationId: string; credSource: 'pit' | 'oauth' | 'legacy' }
  | { ok: false; status: number; error: string; message: string }
> {
  const cred = await resolveGhlCredentials(supabase, tenantId, log);
  if (!cred.ok) return cred;
  return {
    ok: true,
    ghl: new GhlClient({ apiToken: cred.accessToken, locationId: cred.locationId }),
    locationId: cred.locationId,
    credSource: cred.credSource,
  };
}

// Re-export para que el test internal-calendars-pit-priority.test.ts siga
// importando desde routes/internal-calendars (compat backward).
export { resolveGhlCredentials };
export type { ResolvedCreds };
