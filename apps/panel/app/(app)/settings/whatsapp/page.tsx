import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getWaInboundMode } from '@/lib/actions/wa-inbound-mode';
import { WaModeForm } from './wa-mode-form';

export const dynamic = 'force-dynamic';

export default async function WhatsappSettingsPage() {
  const result = await getWaInboundMode();

  if (!result.ok) {
    return (
      <div className="container max-w-4xl py-10">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp inbound</h1>
        <p className="mt-2 text-sm text-destructive">Error: {result.error}</p>
      </div>
    );
  }

  const { mode, waOpenKeywordCount } = result.data!;

  return (
    <div className="container max-w-4xl py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp inbound</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Decide cómo se abre la conversación cuando un lead te escribe a WhatsApp.
          Esta política solo aplica al canal WhatsApp vía YCloud.{' '}
          <span className="text-muted-foreground/70">
            Instagram y Facebook van por GHL y se gestionan en{' '}
            <Link href="/keywords" className="underline">
              /keywords
            </Link>
            .
          </span>
        </p>
      </header>

      <WaModeForm currentMode={mode} waOpenKeywordCount={waOpenKeywordCount} />

      {mode === 'keyword' && waOpenKeywordCount === 0 && (
        <div className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-300">⚠️ Sin keywords WA configuradas</p>
          <p className="mt-1 text-amber-200/80">
            Estás en modo <code className="font-mono">keyword</code> pero no tienes
            keywords <code className="font-mono">wa_open</code> activas. Todos los
            mensajes WA inbound de leads frescos quedarán silenciados.
          </p>
          <Link
            href="/keywords"
            className="mt-2 inline-flex items-center gap-1 text-amber-300 underline"
          >
            Configurar keywords
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
