import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, '../../.env.local'),
  resolve(here, '../../../../.env.local'),
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '../../.env.local'),
];
for (const path of candidates) {
  if (existsSync(path)) {
    loadEnv({ path, override: true });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MANYCHAT_API_BASE: z.string().url().default('https://api.manychat.com'),
  YCLOUD_API_BASE: z.string().url().default('https://api.ycloud.com'),
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 32 bytes hex (64 chars)')
    .optional(),
  // Hardening 1.2 — modo de verificación HMAC del webhook YCloud.
  //   disabled → no se verifica firma (compat).
  //   warn     → se verifica si el header llega; si falla, log warn y continúa (default transición).
  //   enforce  → si la firma falta o es inválida → 401.
  YCLOUD_WEBHOOK_VERIFY_MODE: z.enum(['disabled', 'warn', 'enforce']).default('warn'),
  // Hardening 1.3 — bearer token para GET /internal/stats. Opcional en dev,
  // pero el endpoint devuelve 503 si no está configurado. Generar con
  // openssl rand -hex 32.
  INTERNAL_STATS_TOKEN: z.string().min(16).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
