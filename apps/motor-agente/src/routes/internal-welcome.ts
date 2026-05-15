/**
 * Endpoint POST /internal/welcome (Hito 9 sub-fase 4).
 *
 * Disparado por server actions del panel (botón "Enviar bienvenida" en ficha
 * contacto del Sprint Mu) para enviar manualmente una plantilla bienvenida WA
 * a un lead específico desde la UI Fyzon.
 *
 * Auth: Bearer `INTERNAL_STATS_TOKEN` (mismo token que /internal/stats — para
 * tráfico panel→motor que NUNCA debe exponerse al browser ni a clientes).
 *
 * Diferencia con /automations/lead-form:
 *   - lead-form: trigger externo (n8n/GHL/Tally), valida tenant_token URL +
 *     opcional X-Form-Secret, dedupea por phone, crea lead si no existe.
 *   - internal/welcome: trigger interno (panel admin/trainer), bearer auth,
 *     opera sobre lead que YA existe en BD, no dedupea (responsabilidad UI).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { env } from '../config/env.js';
import { getSupabase } from '../lib/supabase.js';
import { extractBearer, isValidBearer } from '../lib/timing-safe-bearer.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
} from '../services/lead-ingest.js';
import {
  sendWelcomeTemplate,
  WelcomeTemplateError,
} from '../services/send-welcome-template.js';

const bodySchema = z.object({
  tenant_id: z.number().int().positive(),
  lead_id: z.number().int().positive(),
});

export async function internalWelcomeRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/internal/welcome',
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply,
    ) => {
      const expected = env.INTERNAL_STATS_TOKEN;
      if (!expected) {
        return reply.code(503).send({
          error:
            'INTERNAL_STATS_TOKEN not configured. Generate with `openssl rand -hex 32` and set in .env.local.',
        });
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
      const { tenant_id: tenantId, lead_id: leadId } = parsed;
      const supabase = getSupabase();

      // 1) tenant_configs.welcome_template_id
      const { data: cfg, error: cfgErr } = await supabase
        .from('tenant_configs')
        .select('welcome_template_id')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (cfgErr) {
        request.log.error(
          { tenantId, err: cfgErr.message },
          'internal-welcome: tenant_configs read failed',
        );
        return reply.code(500).send({ error: 'tenant_configs_read_failed' });
      }
      const welcomeTemplateId =
        cfg?.welcome_template_id != null ? Number(cfg.welcome_template_id) : null;
      if (!welcomeTemplateId) {
        return reply.code(409).send({
          error: 'no_welcome_template_configured',
          message: 'tenant sin welcome_template_id en tenant_configs',
        });
      }

      // 2) Lead pertenece al tenant
      const { data: lead, error: leadErr } = await supabase
        .from('leads')
        .select('id, tenant_id, channel_id, external_id, phone')
        .eq('id', leadId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (leadErr || !lead) {
        return reply.code(404).send({ error: 'lead_not_found' });
      }

      // 3) Canal WA via ycloud — el lead puede haber llegado por otro canal,
      //    pero la bienvenida WA siempre se envía via canal WA del tenant.
      let channelId: number;
      try {
        const ch = await getOrCreateChannel({
          supabase,
          tenantId,
          channelType: 'whatsapp',
          viaProvider: 'ycloud',
        });
        channelId = ch.channelId;
      } catch (err) {
        request.log.error(
          { tenantId, err: err instanceof Error ? err.message : String(err) },
          'internal-welcome: channel resolution failed',
        );
        return reply.code(500).send({ error: 'channel_resolution_failed' });
      }

      // 4) Get/create conversation en ese canal
      const { conversationId } = await getOrCreateConversation({
        supabase,
        tenantId,
        leadId,
        channelId,
      });

      // 5) Send welcome
      try {
        const result = await sendWelcomeTemplate({
          supabase,
          tenantId,
          leadId,
          conversationId,
          templateId: welcomeTemplateId,
        });
        return reply.code(200).send({
          ok: true,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId,
          provider_message_id: result.providerMessageId,
        });
      } catch (err) {
        if (err instanceof WelcomeTemplateError) {
          request.log.warn(
            {
              tenantId,
              leadId,
              conversationId,
              reason: err.reason,
              err: err.message,
            },
            'internal-welcome: sendWelcomeTemplate failed',
          );
          return reply.code(err.httpStatus).send({
            error: err.reason,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
