import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Brain, ChevronRight, FileText } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listGlobalBlocks } from '@/lib/actions/prompts';
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

export const dynamic = 'force-dynamic';

const BLOCK_DESCRIPTIONS: Record<string, string> = {
  core_v5_base:
    'Cerebro consolidado (v5): identidad, propósito, mental model, reglas críticas/condicionales, tono, las 6 fases inline con priority dinámico, protocolo de objeciones y protocolo de handoff. Reemplaza a los 11 bloques v4 anteriores.',
  output_contract_v5:
    'Schema técnico del output del Generator (tool respond_as_setter). Separado del CORE narrativo por decisión arquitectónica.',
};

export default async function CerebroPage() {
  // Auth: agency admin gate (defensa en profundidad — listGlobalBlocks también lo valida).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_agency_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_agency_admin) redirect('/dashboard');

  const result = await listGlobalBlocks();
  const blocks = result.ok ? result.blocks : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Brain className="size-3.5" />
            Cerebro · genérico para todas las sub-cuentas
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Bloques del prompt global</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Edita el conocimiento base que reciben TODOS los tenants. Cualquier cambio aplicado se
            propaga al siguiente turno del motor (sin cache de bloques en memoria). Para overrides
            por tenant (sin afectar al resto), usa la vista detalle de cada sub-cuenta.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{blocks.length} bloques activos</CardTitle>
          <CardDescription>
            Click en un bloque para abrir el editor. Verás el activo + tu borrador (si lo tienes
            guardado), preview del prompt compuesto para un tenant elegido, diff vs activo, y
            histórico de versiones aplicadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">Error: {result.error}</p>
          ) : blocks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin bloques globales activos.</p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[60px]">Sort</TableHead>
                    <TableHead>Block key</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Chars</TableHead>
                    <TableHead className="text-right">Versión</TableHead>
                    <TableHead className="text-right">Última edición</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {b.sortOrder}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                          {b.blockKey}
                        </code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md">
                        {BLOCK_DESCRIPTIONS[b.blockKey] ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.contentChars.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="font-mono text-xs">
                          v{b.lastVersionNumber}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {formatRelative(b.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/admin/cerebro/${b.blockKey}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <FileText className="size-3.5" />
                          Editar
                          <ChevronRight className="size-3.5" />
                        </Link>
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `hace ${day}d`;
  return new Date(iso).toLocaleDateString('es-ES');
}
