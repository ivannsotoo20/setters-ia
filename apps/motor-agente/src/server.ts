import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { webhookManyChatRoutes } from './routes/webhook-manychat.js';
import { webhookYCloudRoutes } from './routes/webhook-ycloud.js';
import { webhookGhlRoutes } from './routes/webhook-ghl.js';
import { internalStatsRoutes } from './routes/internal-stats.js';
import { cronSchedulerPlugin } from './plugins/cron-scheduler.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Raw request body (Buffer) — preservado para HMAC verification. */
    rawBody?: Buffer;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    disableRequestLogging: env.NODE_ENV === 'production',
    trustProxy: true,
  });

  await app.register(helmet, { global: true });
  await app.register(cors, { origin: true });

  // Preservar raw body para HMAC verification (Hardening 1.2).
  // Sustituye el JSON parser default: parsea como Buffer, lo guarda en
  // request.rawBody, y devuelve el JSON parseado como body para el handler.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      const buf = body as Buffer;
      req.rawBody = buf;
      try {
        const json = buf.length === 0 ? {} : JSON.parse(buf.toString('utf8'));
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(healthRoutes);
  await app.register(webhookManyChatRoutes);
  await app.register(webhookYCloudRoutes);
  await app.register(webhookGhlRoutes);
  await app.register(internalStatsRoutes);
  await app.register(cronSchedulerPlugin);

  return app;
}
