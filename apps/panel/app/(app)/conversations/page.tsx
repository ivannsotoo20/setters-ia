import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConversationsTable, type ConversationRow } from './conversations-table';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user!.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin tenant asignado</CardTitle>
          <CardDescription>
            Tu cuenta no tiene un tenant asociado. Contacta con un admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(
      `id, lead_id, channel_id, phase_number, state, conversation_source,
       ai_paused_until, last_message_at, created_at, updated_at,
       is_qualified, is_handoff_to_human,
       leads(first_name, last_name, username, external_id),
       channels(channel_type, via_provider)`,
    )
    .eq('tenant_id', profile.tenant_id)
    .order('updated_at', { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Operación
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Conversaciones</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {conversations?.length ?? 0} resultados
          </CardTitle>
          <CardDescription>
            Ordenadas por última actualización. Click en una fila para ver el detalle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">
              Error cargando conversaciones: {error.message}
            </p>
          ) : (conversations?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin conversaciones todavía. Cuando llegue el primer lead via IG /
              WhatsApp aparecerá aquí.
            </p>
          ) : (
            <ConversationsTable rows={(conversations ?? []) as unknown as ConversationRow[]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
