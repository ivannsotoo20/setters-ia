'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  /** ID de la conversación activa. Cambio → scroll instantáneo al bottom. */
  conversationId: number;
  /** Número total de mensajes. Cambio incremental → smooth scroll si el user ya estaba abajo. */
  messageCount: number;
  children: ReactNode;
}

/** Margen (px) desde el bottom dentro del cual se considera que el usuario "está al final". */
const NEAR_BOTTOM_THRESHOLD = 220;

/**
 * Contenedor scrollable del thread. Patrón WhatsApp/Telegram:
 *
 *   - Al abrir una conversación → scroll instantáneo al bottom (ves los
 *     mensajes más recientes, no los primeros).
 *   - Al llegar un mensaje nuevo y el usuario ya estaba cerca del bottom →
 *     scroll suave al bottom (sigue la conversación).
 *   - Al llegar un mensaje nuevo pero el usuario está leyendo arriba → NO
 *     scrollea (no le quitas la lectura).
 *
 * Track explícito de `conversationId` (no solo de `messageCount`) porque al
 * cambiar de conv los mensajes son distintos pero `messageCount` puede ser
 * parecido — sin este distingo no se forzaría el jump al bottom al cambiar.
 */
export function ThreadScrollContainer({ conversationId, messageCount, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastConvIdRef = useRef<number | null>(null);
  const lastCountRef = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const convChanged = conversationId !== lastConvIdRef.current;

    if (convChanged) {
      // Salto duro al bottom al cambiar de conv. Hacemos doble pasada: una
      // sync (instantánea, evita ver el primer mensaje), otra en next frame
      // por si el contenido sigue layout-ing (imágenes/transcript expandible).
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight;
      });
      lastConvIdRef.current = conversationId;
      lastCountRef.current = messageCount;
      return;
    }

    if (messageCount > lastCountRef.current) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < NEAR_BOTTOM_THRESHOLD) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
      lastCountRef.current = messageCount;
    }
  }, [conversationId, messageCount]);

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto p-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/60"
    >
      {children}
    </div>
  );
}
