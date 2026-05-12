import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateTenantForm } from './create-tenant-form';

export const dynamic = 'force-dynamic';

export default async function NewTenantPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/tenants"
          className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline w-fit mb-3"
        >
          <ArrowLeft className="size-3.5" />
          Volver a Sub-cuentas
        </Link>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Vista agencia · Fyzon
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva sub-cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl">
          Crea el tenant, provisiona configuración base y manda invitación al
          owner en un solo paso. El coach v3 queda vacío como placeholder — lo
          pegas tú después en la tab Coach.
        </p>
      </div>

      <CreateTenantForm />
    </div>
  );
}
