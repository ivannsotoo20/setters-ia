import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto de /conversations mientras `ConversationLayout` consulta
 * (2026-11-04). Sin `loading.tsx`, abrir un chat dejaba la pantalla anterior
 * congelada hasta que llegaban la lista, los mensajes y el panel; con él,
 * Next.js pinta al instante los tres paneles vacíos y Tania ve que la página
 * ha reaccionado. Misma rejilla que `ConversationShell` (lista · hilo · panel).
 */
export default function ConversationsLoading() {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 bg-background md:grid md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)_380px]"
      aria-busy="true"
      aria-label="Cargando conversaciones"
    >
      <aside className="hidden md:flex flex-col h-full min-h-0 bg-card/40 border-r border-border">
        <div className="border-b border-border px-3 py-2.5 flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex gap-1.5 px-3 py-2 border-b border-border">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
        <ul className="flex flex-col">
          {Array.from({ length: 9 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-3 border-b border-border/60">
              <Skeleton className="size-9 rounded-full shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex flex-col h-full min-h-0 bg-background">
        <div className="border-b border-border px-4 py-3 flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 justify-end overflow-hidden">
          {[56, 72, 48, 64, 80, 52].map((w, i) => (
            <Skeleton
              key={i}
              className={`h-10 rounded-2xl ${i % 2 ? 'self-end' : 'self-start'}`}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        <div className="border-t border-border p-3">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </section>
      <aside className="hidden lg:flex flex-col h-full min-h-0 border-l border-border bg-card/40 p-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </aside>
    </div>
  );
}
