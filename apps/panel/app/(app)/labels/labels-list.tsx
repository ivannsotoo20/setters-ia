'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LabelChip } from '@/components/labels/label-chip';
import { SystemBadge } from '@/components/labels/system-badge';
import { EditLabelDialog } from './edit-label-dialog';
import { DeleteLabelDialog } from './delete-label-dialog';
import type { LabelRow } from '@/lib/actions/labels';

interface MemberOption {
  userId: string;
  email: string;
  fullName: string | null;
}

interface Props {
  labels: LabelRow[];
  members: MemberOption[];
}

const BUCKET_LABEL: Record<string, string> = {
  chats: 'Chats',
  hot: 'Hot Leads',
  done: 'Completados',
  bought: 'Comprados',
};

export function LabelsList({ labels, members }: Props) {
  const [editing, setEditing] = useState<LabelRow | null>(null);
  const [deleting, setDeleting] = useState<LabelRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[280px]">Etiqueta</TableHead>
            <TableHead>Bucket</TableHead>
            <TableHead className="text-right">Reglas</TableHead>
            <TableHead className="text-right">Conversaciones</TableHead>
            <TableHead>Acciones auto</TableHead>
            <TableHead className="text-right w-[120px]">&nbsp;</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {labels.map((l) => {
            const assignee = l.autoAssignTo
              ? members.find((m) => m.userId === l.autoAssignTo)
              : null;
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    <LabelChip size="md" label={{ id: l.id, name: l.name, color: l.color }} />
                    {l.isSystem ? <SystemBadge /> : null}
                  </div>
                  {l.description ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[260px]">
                      {l.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {l.destinationBucket ? (
                    <Badge variant="outline" className="font-normal">
                      {BUCKET_LABEL[l.destinationBucket]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.activeRuleCount}</TableCell>
                <TableCell className="text-right tabular-nums">{l.conversationCount}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {l.pauseAiOnApply ? (
                      <Badge variant="outline" className="font-normal text-[10px] border-warning/40 text-warning bg-warning/5">
                        Pausa IA
                      </Badge>
                    ) : null}
                    {l.resumeAiOnApply ? (
                      <Badge variant="outline" className="font-normal text-[10px] border-success/40 text-success bg-success/5">
                        Reactiva IA
                      </Badge>
                    ) : null}
                    {assignee ? (
                      <Badge variant="outline" className="font-normal text-[10px]">
                        @{assignee.fullName ?? assignee.email.split('@')[0]}
                      </Badge>
                    ) : null}
                    {!l.pauseAiOnApply && !l.resumeAiOnApply && !assignee ? (
                      <span className="text-[10px] text-muted-foreground italic">Sin acciones</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(l)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(l)}
                      disabled={l.isSystem}
                      title={l.isSystem ? 'Etiquetas del sistema no se pueden borrar' : undefined}
                      className="text-destructive disabled:text-muted-foreground"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {editing ? (
        <EditLabelDialog
          open={editing != null}
          onOpenChange={(o) => !o && setEditing(null)}
          label={editing}
          members={members}
        />
      ) : null}
      {deleting ? (
        <DeleteLabelDialog
          open={deleting != null}
          onOpenChange={(o) => !o && setDeleting(null)}
          label={deleting}
        />
      ) : null}
    </>
  );
}
