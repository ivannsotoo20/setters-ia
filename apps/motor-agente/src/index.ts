import { env } from './config/env.js';
import { assertEncryptionKey } from './lib/crypto.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  // Hardening 2026-05-15 (audit security HIGH H-5): valida que la encryption
  // key existe y tiene formato correcto AL BOOT. Si falta, abortamos antes de
  // recibir webhooks (en lugar de fallar al primer decrypt en runtime).
  try {
    assertEncryptionKey();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[motor-agente] FATAL: CREDENTIALS_ENCRYPTION_KEY invalid:', (err as Error).message);
    process.exit(1);
  }

  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`motor-agente listening on :${env.PORT} (${env.NODE_ENV})`);
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
