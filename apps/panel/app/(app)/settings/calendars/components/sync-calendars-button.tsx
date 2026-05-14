'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  linkCalendar,
  syncCalendarsFromGhl,
  type GhlCalendarRemote,
} from '@/lib/actions/calendars';

/**
 * Limpia HTML/markup del campo description del calendar GHL (suelen venir como
 * `<p style="...">texto</p>...`). Deja solo el texto plano, colapsa espacios.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function SyncCalendarsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, startSync] = useTransition();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [remote, setRemote] = useState<GhlCalendarRemote[]>([]);
  const [customFieldId, setCustomFieldId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  function handleClick() {
    startSync(async () => {
      const result = await syncCalendarsFromGhl();
      if (!result.ok) {
        setSyncError(result.error);
        toast.error(`Sync falló: ${result.error}`);
        setOpen(true);
        return;
      }
      setSyncError(null);
      setRemote(result.data?.calendars ?? []);
      setCustomFieldId(result.data?.customFieldId ?? null);
      setOpen(true);
    });
  }

  async function handleLink(cal: GhlCalendarRemote) {
    setLinkingId(cal.externalCalendarId);
    try {
      const result = await linkCalendar({
        externalCalendarId: cal.externalCalendarId,
        name: cal.name,
        description: cal.description,
        slug: cal.slug,
        widgetBaseUrl: cal.widgetBaseUrl,
      });
      if (!result.ok) {
        toast.error(`No se pudo vincular: ${result.error}`);
        return;
      }
      toast.success(`Vinculado: ${cal.name}`);
      router.refresh();
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <>
      <Button onClick={handleClick} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Sincronizando…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" /> Sincronizar desde GHL
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Calendarios encontrados en tu GHL</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                {syncError ? (
                  <span className="text-destructive">{syncError}</span>
                ) : (
                  <span>
                    Click en &quot;Vincular&quot; para añadir cada calendario al
                    SaaS. Después designa uno como default desde la tabla
                    principal.
                  </span>
                )}
                {!syncError && customFieldId && (
                  <span className="block text-xs">
                    Custom field GHL <code>fyzon_lead_uuid</code> listo (ID:{' '}
                    <code>{customFieldId.slice(0, 10)}…</code>).
                  </span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {!syncError && remote.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No se encontraron calendarios en tu GHL. Crea uno desde GHL y
              vuelve aquí.
            </p>
          ) : (
            <div className="flex flex-col divide-y border rounded-md max-h-[55vh] overflow-y-auto">
              {remote.map((cal) => (
                <div
                  key={cal.externalCalendarId}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-sm font-medium truncate">{cal.name}</p>
                    {cal.description && (
                      <p
                        className="text-xs text-muted-foreground line-clamp-2"
                        title={stripHtml(cal.description)}
                      >
                        {stripHtml(cal.description)}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
                      {cal.externalCalendarId}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLink(cal)}
                    disabled={linkingId === cal.externalCalendarId}
                    className="shrink-0"
                  >
                    {linkingId === cal.externalCalendarId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-3 w-3 mr-1" /> Vincular
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
