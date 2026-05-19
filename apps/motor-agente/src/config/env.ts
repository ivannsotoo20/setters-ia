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
  // Hito 9 sub-fase 3 — modo de verificación shared-secret del endpoint
  // POST /automations/lead-form/:tenant_token. El secret se reusa de
  // integration_accounts.webhook_secret de la cuenta ycloud activa del tenant.
  //   disabled → skip verificación (dev local).
  //   warn     → log si header missing/mismatch + continúa (transición).
  //   enforce  → header missing/mismatch → 401.
  LEAD_FORM_VERIFY_MODE: z.enum(['disabled', 'warn', 'enforce']).default('warn'),
  // Hardening 1.3 — bearer token para GET /internal/stats. Opcional en dev,
  // pero el endpoint devuelve 503 si no está configurado. Generar con
  // openssl rand -hex 32.
  INTERNAL_STATS_TOKEN: z.string().min(16).optional(),
  // Bloque C.2 — modo de verificación firma GHL Marketplace webhook.
  //   disabled → skip verificación (dev sin pubkey).
  //   warn     → verifica si hay header + pubkey; si falla, log warn y continúa.
  //   enforce  → falta firma o falla → 401.
  GHL_WEBHOOK_VERIFY_MODE: z.enum(['disabled', 'warn', 'enforce']).default('warn'),
  // Clave pública RSA distribuida por GHL Marketplace (formato PEM completo
  // con BEGIN/END PUBLIC KEY). Si no está configurada y verify_mode != disabled
  // → toda firma se trata como signature_mismatch. En dev local se puede dejar
  // vacía con verify_mode=disabled.
  GHL_WEBHOOK_PUBLIC_KEY_PEM: z.string().optional(),
  // Bloque C.E — App Marketplace GHL propia con OAuth + webhooks firmados.
  // Sub-Account distribution: cada trainer instala la app en su sub-cuenta.
  // El motor mapea install → tenant_id via state param (Redis TTL 600s).
  GHL_OAUTH_CLIENT_ID: z.string().optional(),
  GHL_OAUTH_CLIENT_SECRET: z.string().optional(),
  /** Shared secret de la app — para HMAC verification de webhooks app emite. */
  GHL_OAUTH_SHARED_SECRET: z.string().optional(),
  /** URL pública del OAuth callback. Debe coincidir con la registrada en
   *  developer portal de la app. Default apunta al dominio de producción
   *  `setter.fyzon.es`; para desarrollo override en `.env.local` con
   *  `setter-dev.fyzon.es`. */
  GHL_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default('https://setter.fyzon.es/integrations/oauth/callback'),
  /** Scopes solicitados al instalar — separados por espacio. */
  GHL_OAUTH_SCOPES: z
    .string()
    .default(
      'contacts.write contacts.readonly conversations.readonly conversations.write conversations/message.readonly conversations/message.write locations.readonly',
    ),
  /** Base URL de GHL services API v2 — leadconnectorhq.com. */
  GHL_API_BASE: z.string().url().default('https://services.leadconnectorhq.com'),
  /** Base URL de Marketplace OAuth — para chooselocation redirect. */
  GHL_MARKETPLACE_BASE: z.string().url().default('https://marketplace.gohighlevel.com'),
  /**
   * `version_id` de la app GHL Marketplace. GHL exige este parámetro en la
   * URL de chooselocation; sin él devuelve `error.noAppVersionIdFound`. Se
   * encuentra en developer portal → tu app → "Install link" (botón Show)
   * — la URL incluye `&version_id=<X>`. También aparece en la sección de
   * Versions de la app.
   */
  GHL_OAUTH_VERSION_ID: z.string().optional(),
  // Bloque D — Multimodal IA. Groq Whisper para transcripción de audios
  // inbound; Claude Sonnet (vision) ya integrada via ANTHROPIC_API_KEY para
  // descripción de imágenes. Sin GROQ_API_KEY el motor saltea audio (con
  // fallback log + content placeholder).
  GROQ_API_KEY: z.string().optional(),
  GROQ_API_BASE: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_AUDIO_MODEL: z.string().default('whisper-large-v3-turbo'),
  // Sprint Gamma 2.4 — Notificaciones email al trainer via Resend.
  // Sin RESEND_API_KEY el motor saltea envíos (logs warn + status='failed').
  // FROM debe ser email de un dominio verificado en panel Resend (ej fyzon.es
  // con SPF/DKIM correctos).
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('alertas@fyzon.es'),
  RESEND_FROM_NAME: z.string().default('Fyzon Setters'),
  RESEND_API_BASE: z.string().url().default('https://api.resend.com'),
  /** URL pública del panel para enlaces dentro de los emails (CTA "Ver conversación"). */
  PANEL_PUBLIC_URL: z.string().url().default('https://panel.fyzon.es'),
  /**
   * SPIKE Trigger.dev (2026-05-19) — si `true`, el cron-scheduler interno
   * saltea su `tickOutbound` y deja el envío de mensajes en manos de la task
   * scheduled `outboundBatchTick` (gestionada por Trigger). Default `false`
   * (motor sigue idéntico a hoy). Ver docs/trigger-dev-spike.md.
   */
  TRIGGER_OUTBOUND_ENABLED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
  /** Project ref de Trigger.dev (formato proj_xxxxx). Solo necesario si TRIGGER_OUTBOUND_ENABLED=true. */
  TRIGGER_PROJECT_REF: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
