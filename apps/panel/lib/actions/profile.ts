'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Server actions para gestión del perfil propio del usuario.
 * Hito 11.2.C — equivalente a "My Profile" de GHL.
 *
 *  - `getOwnProfile()`: devuelve el row de `profiles` del usuario auth actual.
 *  - `updateOwnProfileAction({fullName, phone, bio})`: edita campos editables.
 *  - `updateOwnAvatarUrlAction(url)`: tras subir el avatar a Storage, guarda la URL.
 *
 * Campos NO editables desde aquí (por diseño):
 *  - email: gestionado por Supabase Auth (flow change-email aparte).
 *  - tenant_id, role, is_agency_admin, is_active: gestionados por admin.
 */

export type ProfileSnapshot = {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  bio: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'viewer';
  isAgencyAdmin: boolean;
  tenantId: number;
};

export type ProfileActionResult =
  | { ok: true; profile: ProfileSnapshot }
  | { ok: false; error: string };

async function loadOwnProfile(): Promise<{
  userId: string;
  profile: ProfileSnapshot;
} | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'unauthenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, bio, avatar_url, role, is_agency_admin, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? 'profile not found' };

  return {
    userId: user.id,
    profile: {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      phone: data.phone,
      bio: data.bio,
      avatarUrl: data.avatar_url,
      role: data.role as 'owner' | 'admin' | 'viewer',
      isAgencyAdmin: data.is_agency_admin,
      tenantId: data.tenant_id,
    },
  };
}

export async function getOwnProfile(): Promise<ProfileActionResult> {
  const res = await loadOwnProfile();
  if ('error' in res) return { ok: false, error: res.error };
  return { ok: true, profile: res.profile };
}

const MAX_FULL_NAME = 120;
const MAX_PHONE = 32;
const MAX_BIO = 500;

export async function updateOwnProfileAction(input: {
  fullName: string;
  phone: string;
  bio: string;
}): Promise<ProfileActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const bio = input.bio.trim();

  if (fullName.length === 0) return { ok: false, error: 'El nombre no puede estar vacío.' };
  if (fullName.length > MAX_FULL_NAME) return { ok: false, error: `Nombre demasiado largo (máx ${MAX_FULL_NAME} caracteres).` };
  if (phone.length > MAX_PHONE) return { ok: false, error: `Teléfono demasiado largo (máx ${MAX_PHONE} caracteres).` };
  if (bio.length > MAX_BIO) return { ok: false, error: `Biografía demasiado larga (máx ${MAX_BIO} caracteres).` };

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: phone || null,
      bio: bio || null,
    })
    .eq('id', user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/profile');
  revalidatePath('/', 'layout'); // refresca sidebar (email/avatar)

  const reloaded = await loadOwnProfile();
  if ('error' in reloaded) return { ok: false, error: reloaded.error };
  return { ok: true, profile: reloaded.profile };
}

export async function updateOwnAvatarUrlAction(avatarUrl: string | null): Promise<ProfileActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // Validación básica: si no es null, debe ser URL de nuestro bucket avatars.
  if (avatarUrl != null) {
    const ok =
      avatarUrl.startsWith('https://') &&
      avatarUrl.includes('/storage/v1/object/public/avatars/');
    if (!ok) {
      return { ok: false, error: 'URL de avatar inválida.' };
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/profile');
  revalidatePath('/', 'layout');

  const reloaded = await loadOwnProfile();
  if ('error' in reloaded) return { ok: false, error: reloaded.error };
  return { ok: true, profile: reloaded.profile };
}
