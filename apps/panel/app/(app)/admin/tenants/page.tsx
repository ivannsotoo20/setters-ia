import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogIn, Settings2 } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  listAllTenants,
  startImpersonatingAndRedirect,
} from '@/lib/actions/admin';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminTenantsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_agency_admin')
    .eq('id', user!.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  const result = await listAllTenants();
  const tenants = result.ok ? result.data ?? [] : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Vista agencia · Fyzon
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sub-cuentas</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tenants.length} tenants</CardTitle>
          <CardDescription>
            Click en &quot;Entrar&quot; para ver el panel como ese trainer (modo
            impersonate). Verás un banner ámbar arriba mientras dure la sesión.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">Error: {result.error}</p>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin sub-cuentas todavía.</p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[60px]">ID</TableHead>
                    <TableHead>Sub-cuenta</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Conversaciones</TableHead>
                    <TableHead className="text-right">Activas</TableHead>
                    <TableHead className="text-right">Cualificadas</TableHead>
                    <TableHead className="text-right">Pausadas</TableHead>
                    <TableHead className="text-right">Coste 24h</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        #{t.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {t.slug}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {t.isActive ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
                          >
                            activa
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            inactiva
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.conversationsTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.conversationsActive}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.qualifiedTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.pausedTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${t.costLast24h.toFixed(4)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/tenants/${t.id}`}>
                              <Settings2 className="size-3.5" />
                              Editar prompts
                            </Link>
                          </Button>
                          <form action={startImpersonatingAndRedirect}>
                            <input type="hidden" name="tenant_id" value={t.id} />
                            <Button type="submit" size="sm" variant="outline">
                              <LogIn className="size-3.5" />
                              Entrar
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
