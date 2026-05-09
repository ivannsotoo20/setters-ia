import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente service_role para Server Actions admin (bypasea RLS).
 *
 * NUNCA importar desde Client Components ni exponer al browser. Solo
 * `'use server'` o Route Handlers server-only.
 */
export function getServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY missing — required for admin Server Actions',
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
