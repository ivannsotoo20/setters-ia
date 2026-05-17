import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Brain } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadActiveBlock, listVersions } from '@/lib/actions/prompts';
import { CerebroBlockEditor } from './editor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const VALID_GLOBAL_BLOCKS = new Set([
  'core_v4_base',
  'fase_1_v4',
  'fase_2_v4',
  'fase_3_v4',
  'fase_4_v4',
  'fase_5_v4',
  'fase_6_v4',
  'objeciones_v4',
  'descualificacion_v4',
  'handoff_v4',
  'output_contract_v4',
]);

interface Props {
  params: Promise<{ blockKey: string }>;
}

export default async function CerebroBlockPage({ params }: Props) {
  const { blockKey } = await params;
  if (!VALID_GLOBAL_BLOCKS.has(blockKey)) notFound();

  // Auth: agency admin gate (loadActiveBlock también valida).
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

  // Cargar block + draft
  const blockResult = await loadActiveBlock({ blockKey, tenantId: null });
  if (!blockResult.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/cerebro" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline w-fit">
          <ArrowLeft className="size-3.5" />
          Volver a Cerebro
        </Link>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-destructive">Error: {blockResult.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!blockResult.block) notFound();

  // Lista de tenants para el selector de preview
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, slug, name, is_active')
    .order('id');

  // Histórico inicial (últimas 20)
  const versionsResult = await listVersions({ blockKey, tenantId: null, limit: 20 });
  const versions = versionsResult.ok ? versionsResult.versions : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/cerebro" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline w-fit mb-3">
          <ArrowLeft className="size-3.5" />
          Volver a Cerebro
        </Link>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Brain className="size-3.5" />
              Cerebro · bloque global
            </p>
            <h1 className="text-2xl font-semibold tracking-tight font-mono">
              {blockResult.block.blockKey}
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="font-mono text-xs">
                v{blockResult.block.activeVersionNumber}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {blockResult.block.content.length.toLocaleString()} chars
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                sort={blockResult.block.sortOrder}
              </Badge>
              {blockResult.draft ? (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-warning bg-warning/5 text-xs"
                >
                  Borrador en curso
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <CerebroBlockEditor
        blockKey={blockResult.block.blockKey}
        tenantId={null}
        activeContent={blockResult.block.content}
        activeVersion={blockResult.block.activeVersionNumber}
        draftContent={blockResult.draft?.content ?? null}
        draftBaseVersion={blockResult.draft?.baseVersion ?? null}
        tenants={(tenants ?? []).map((t) => ({
          id: t.id as number,
          slug: t.slug as string,
          name: t.name as string,
          isActive: (t.is_active as boolean | null) ?? true,
        }))}
        initialVersions={versions}
      />
    </div>
  );
}
