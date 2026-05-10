'use client';

import { useState, useTransition } from 'react';
import { Loader2, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  deleteKeyword,
  toggleKeywordActive,
  type KeywordRow,
} from '@/lib/actions/keywords';

interface Props {
  keywords: KeywordRow[];
}

export function KeywordsList({ keywords }: Props) {
  return (
    <div className="overflow-x-auto -mx-6">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[60px]">ID</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Patrón</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creada</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keywords.map((k) => (
            <KeywordRowItem key={k.id} keyword={k} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KeywordRowItem({ keyword }: { keyword: KeywordRow }) {
  const [pendingToggle, startToggle] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onToggle = () => {
    startToggle(async () => {
      const result = await toggleKeywordActive(keyword.id, !keyword.isActive);
      if (!result.ok) toast.error(`Error: ${result.error}`);
      else toast.success(keyword.isActive ? 'Keyword desactivada' : 'Keyword activada');
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      const result = await deleteKeyword(keyword.id);
      if (!result.ok) toast.error(`Error: ${result.error}`);
      else {
        toast.success('Keyword eliminada');
        setConfirmOpen(false);
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        #{keyword.id}
      </TableCell>
      <TableCell>
        <TypeBadge type={keyword.type} />
      </TableCell>
      <TableCell className="max-w-md">
        <code className="text-xs bg-muted/50 px-2 py-1 rounded break-all">
          {keyword.pattern}
        </code>
      </TableCell>
      <TableCell>
        {keyword.isActive ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
            activa
          </Badge>
        ) : (
          <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
            inactiva
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        {new Date(keyword.createdAt).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            disabled={pendingToggle}
            title={keyword.isActive ? 'Desactivar' : 'Activar'}
          >
            {pendingToggle ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : keyword.isActive ? (
              <PowerOff className="size-3.5" />
            ) : (
              <Power className="size-3.5" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={pendingDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar keyword</DialogTitle>
              <DialogDescription>
                ¿Seguro? El motor dejará de clasificar mensajes outbound con este
                patrón. Si tu mensaje de bienvenida coincide con este patrón, las
                bienvenidas futuras quedarán sin clasificar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={onDelete} disabled={pendingDelete}>
                {pendingDelete ? <Loader2 className="size-3.5 animate-spin" /> : 'Eliminar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function TypeBadge({ type }: { type: 'bienvenida' | 'lm' | 'inbound' | 'wa_open' }) {
  const styles: Record<typeof type, string> = {
    bienvenida: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5',
    lm: 'border-violet-500/40 text-violet-400 bg-violet-500/5',
    inbound: 'border-sky-500/40 text-sky-400 bg-sky-500/5',
    wa_open: 'border-amber-500/40 text-amber-400 bg-amber-500/5',
  };
  return (
    <Badge variant="outline" className={`font-normal ${styles[type]}`}>
      {type}
    </Badge>
  );
}
