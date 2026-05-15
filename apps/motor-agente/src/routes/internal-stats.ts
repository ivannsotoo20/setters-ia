import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { getSupabase } from '../lib/supabase.js';
import { loadPipelineStats } from '../services/pipeline-stats.js';
import { extractBearer, isValidBearer } from '../lib/timing-safe-bearer.js';

const querySchema = z.object({
  tenant_id: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .optional(),
  hours: z
    .string()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().positive().max(720)) // hasta 30 días
    .default('24'),
});

/**
 * GET /internal/stats — agrega métricas de pipeline_runs (Hardening 1.3).
 *
 * Auth: header `Authorization: Bearer <env.INTERNAL_STATS_TOKEN>`.
 * Si la env var no está configurada, devuelve 503 (feature off).
 *
 * Query params:
 *  - tenant_id (opt): si se omite, agrega cross-tenant.
 *  - hours (default 24, max 720): ventana temporal.
 *
 * Response: JSON con totalRuns, byOutcome, cost breakdown, latencyMs (p50/p95/avg),
 *           tokens, splitterParts.
 */
export async function internalStatsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/internal/stats',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const expected = env.INTERNAL_STATS_TOKEN;
      if (!expected) {
        return reply.code(503).send({
          error: 'INTERNAL_STATS_TOKEN not configured. Generate with `openssl rand -hex 32` and set in .env.local.',
        });
      }

      // Bearer auth — constant-time compare (Hardening 2026-05-15 audit HIGH H-1).
      const provided = extractBearer(request.headers['authorization']);
      if (!provided) {
        return reply.code(401).send({ error: 'missing Bearer token' });
      }
      if (!isValidBearer(provided, expected)) {
        return reply.code(401).send({ error: 'invalid token' });
      }

      // Parse query params
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'invalid query', issues: parsed.error.flatten() });
      }
      const { tenant_id: tenantId, hours } = parsed.data;

      try {
        const stats = await loadPipelineStats(getSupabase(), {
          tenantId: tenantId ?? undefined,
          hours,
        });
        return reply.send(stats);
      } catch (err) {
        request.log.error({ err }, 'internal-stats query failed');
        return reply.code(500).send({ error: 'query failed' });
      }
    },
  );
}
