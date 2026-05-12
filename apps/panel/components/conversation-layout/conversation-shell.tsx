'use client';

import { useState, useEffect } from 'react';
import { List, MessageSquare, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

interface Props {
  list: React.ReactNode;
  thread: React.ReactNode;
  panel: React.ReactNode;
  hasSelection: boolean;
}

type MobileView = 'list' | 'thread' | 'panel';

/**
 * Responsive shell de 3 paneles:
 *   - lg+ : 3 cols visibles (grid).
 *   - md  : list + thread, panel oculto (Sheet derecho on demand).
 *   - <md : single col, mobile tabs (lista / chat / panel).
 *
 * El estado mobile-tab se sincroniza con `hasSelection`: cuando el usuario
 * selecciona un chat (URL searchParam cambia), automáticamente movemos a
 * la pestaña 'thread' para que vea el chat sin tener que tocar tabs.
 */
export function ConversationShell({ list, thread, panel, hasSelection }: Props) {
  const [mobileView, setMobileView] = useState<MobileView>(
    hasSelection ? 'thread' : 'list',
  );

  useEffect(() => {
    if (hasSelection) {
      setMobileView('thread');
    }
  }, [hasSelection]);

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-h-0 bg-background',
        'md:grid md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-0',
        'lg:grid-cols-[320px_minmax(0,1fr)_380px]',
      )}
    >
      {/* List pane */}
      <div
        className={cn(
          'min-w-0 min-h-0 h-full overflow-hidden',
          'md:block',
          mobileView === 'list' ? 'block' : 'hidden md:block',
        )}
      >
        {list}
      </div>

      {/* Thread pane */}
      <div
        className={cn(
          'min-w-0 min-h-0 h-full overflow-hidden',
          'md:block',
          mobileView === 'thread' ? 'block' : 'hidden md:block',
        )}
      >
        {thread}
      </div>

      {/* Panel pane (lg+ only) — Sprint Iota.3: clamp explícito de altura
          (overflow-hidden + flex-col) para que el grid no expanda la celda al
          contenido natural del aside. Sin esto, en algunos viewports el wrapper
          relative del aside no encontraba altura concreta y `absolute inset-0
          overflow-y-auto` no activaba scroll. */}
      <div className="hidden lg:flex lg:flex-col min-w-0 min-h-0 h-full max-h-full overflow-hidden">
        {panel}
      </div>

      {/* Tablet (md only): Sheet derecho disparado por botón flotante */}
      <div className="hidden md:flex lg:hidden fixed right-4 bottom-4 z-20">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="default" size="sm" className="shadow-lg gap-2">
              <Settings2 className="size-4" />
              Detalle
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto">
            {panel}
          </SheetContent>
        </Sheet>
      </div>

      {/* Mobile: tabs visibles solo <md */}
      <nav
        className={cn(
          'md:hidden border-t border-border bg-background/95 backdrop-blur',
          'flex items-stretch shrink-0',
        )}
        role="tablist"
        aria-label="Navegación de la vista chat"
      >
        <MobileTab
          icon={List}
          label="Lista"
          active={mobileView === 'list'}
          onClick={() => setMobileView('list')}
        />
        <MobileTab
          icon={MessageSquare}
          label="Chat"
          active={mobileView === 'thread'}
          onClick={() => setMobileView('thread')}
          disabled={!hasSelection}
        />
        <MobileTab
          icon={Settings2}
          label="Panel"
          active={mobileView === 'panel'}
          onClick={() => setMobileView('panel')}
          disabled={!hasSelection}
        />
      </nav>

      {/* Mobile panel pane (renderizado solo cuando esa tab está activa).
          Sprint Iota.3 — añadido overflow-hidden + flex-col por simetría con el
          panel lg+ y consistencia de scroll en mobile. */}
      <div
        className={cn(
          'md:hidden min-w-0 min-h-0 h-full max-h-full overflow-hidden',
          mobileView === 'panel' ? 'flex flex-col' : 'hidden',
        )}
      >
        {panel}
      </div>
    </div>
  );
}

interface TabProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function MobileTab({ icon: Icon, label, active, onClick, disabled }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors',
        active
          ? 'text-primary border-t-2 border-primary -mt-px'
          : 'text-muted-foreground border-t-2 border-transparent -mt-px',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
