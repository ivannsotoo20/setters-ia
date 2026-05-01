import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { webhookManyChatRoutes } from './routes/webhook-manychat.js';
import { cronSchedulerPlugin } from './plugins/cron-scheduler.js';

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

  await app.register(healthRoutes);
  await app.register(webhookManyChatRoutes);
  await app.register(cronSchedulerPlugin);

  return app;
}
