'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { Tag, Check, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { LabelChip } from './label-chip';
import { applyLabel, removeLabel, type LabelRow } from '@/lib/actions/labels';

interface AppliedLabel {
  id: number;
  name: string;
  color: string;
}

interface Props {
  conversationId: number;
  applied: AppliedLabel[];
  allLabels: LabelRow[];
  canWrite: boolean;
}

/**
 * Dropdown custom para aplicar/quitar etiquetas a una conversación. Sin
 * Popover/Command de shadcn (no instalados); implementación manual con
 * click-outside para mantener el bundle ligero.
 */
export function LabelMultiSelect({
  conversationId,
  applied,
  allLabels,
  canWrite,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const appliedIds = new Set(applied.map((l) => l.id));
  const norm = query.trim().toLowerCase();
  const visible = norm.length === 0
    ? allLabels
    : allLabels.filter((l) => l.name.toLowerCase().includes(norm));

  // Click outside cierra
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const onToggle = (label: LabelRow) => {
    if (!canWrite || pending) return;
    const isApplied = appliedIds.has(label.id);
    startTransition(async () => {
      const res = isApplied
        ? await removeLabel({ conversationId, labelId: label.id })
        : await applyLabel({ conversationId, labelId: label.id });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(isApplied ? `Quitada "${label.name}"` : `Aplicada "${label.name}"`);
      }
    });
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={!canWrite}
        className="gap-1.5 max-w-[220px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Tag className="size-3.5" />}
        <span className="truncate">
          {applied.length === 0 ? 'Etiquetas' : `Etiquetas · ${applied.length}`}
        </span>
      </Button>

      {open ? (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+4px)] z-30 w-72 rounded-md border border-border bg-popover shadow-lg"
        >
          <div className="p-2 border-b border-border">
            <Input
              autoFocus
              type="search"
              placeholder="Buscar etiqueta…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 text-sm"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-3 text-center">
                Sin coincidencias.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5 p-1">
                {visible.map((l) => {
                  const isApplied = appliedIds.has(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => onToggle(l)}
                        disabled={pending}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left',
                          'hover:bg-muted',
                        )}
                      >
                        <span
                          className="size-3 rounded-full shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="flex-1 truncate">{l.name}</span>
                        {isApplied ? (
                          <Check className="size-3.5 text-emerald-400 shrink-0" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-border p-1">
            <Link
              href="/labels"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Plus className="size-3" />
              Crear / gestionar etiquetas
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ChipsRowProps {
  applied: AppliedLabel[];
  conversationId: number;
  canWrite: boolean;
}

/**
 * Fila de chips aplicados a una conversación. Click en X quita la label.
 * Visible junto al LabelMultiSelect en el topbar cuando hay >0 aplicadas.
 */
export function AppliedLabelsRow({ applied, conversationId, canWrite }: ChipsRowProps) {
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null);

  const onRemove = (labelId: number, name: string) => {
    if (!canWrite) return;
    setPendingRemoveId(labelId);
    (async () => {
      const res = await removeLabel({ conversationId, labelId });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(`Quitada "${name}"`);
      }
      setPendingRemoveId(null);
    })();
  };

  if (applied.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {applied.map((l) => (
        <LabelChip
          key={l.id}
          size="sm"
          label={l}
          onRemove={
            canWrite && pendingRemoveId !== l.id
              ? () => onRemove(l.id, l.name)
              : undefined
          }
        />
      ))}
    </div>
  );
}
