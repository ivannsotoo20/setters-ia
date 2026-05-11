import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const COOKIE_DOMAIN = '.fyzon.es';

/**
 * Server-side Supabase client. Mantiene cookie domain consistente con el
 * middleware (`.fyzon.es` en producción) para que la sesión funcione en
 * admin.fyzon.es y panel.fyzon.es indistintamente.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const cookieStore = await cookies();
  const headerList = await headers();
  const hostHeader = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const useFyzonCookieDomain = hostHeader.endsWith('.fyzon.es');

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const enriched: CookieOptions = {
              ...options,
              ...(useFyzonCookieDomain ? { domain: COOKIE_DOMAIN } : {}),
            };
            cookieStore.set(name, value, enriched);
          });
        } catch {
          // Se ignora si se llama desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}
