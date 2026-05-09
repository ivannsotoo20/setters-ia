'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Trash2, Power, PowerOff, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RuleBuilder } from '@/components/labels/rule-builder';
import {
  listRulesForLabel,
  createLabelRule,
  updateLabelRule,
  toggleRule,
  deleteRule,
  type RuleRow,
  type TriggerType,
  type TriggerWho,
} from '@/lib/actions/label-rules';

interface Props {
  labelId: number;
}

const TYPE_LABEL: Record<TriggerType, string> = {
  text_contains: 'Texto contiene',
  text_exact: 'Texto exacto',
  inactivity_hours: 'Inactividad',
  attachment: 'Adjunto',
  product: 'Producto',
  comment_keyword: 'Comentario',
};

const WHO_LABEL: Record<TriggerWho, string> = {
  lead: 'lead',
  trainer: 'trainer',
  any: 'cualquiera',
};

function describeRule(rule: RuleRow): string {
  if (rule.triggerType === 'text_contains' || rule.triggerType === 'text_exact') {
    const t = (rule.triggerValue.text as string | undefined) ?? '';
    return t.length > 40 ? t.slice(0, 40) + '…' : t;
  }
  if (rule.triggerType === 'inactivity_hours') {
    const h = (rule.triggerValue.hours as number | undefined) ?? 0;
    return `≥ ${h}h sin respuesta`;
  }
  return JSON.stringify(rule.triggerValue);
}

export function RulesForm({ labelId }: Props) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RuleRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RuleRow | null>(null);
  const [pendingMutation, startMutation] = useTransition();

  const refresh = async () => {
    setLoading(true);
    const res = await listRulesForLabel(labelId);
    if (res.ok) setRules(res.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelId]);

  const onCreate = (input: {
    triggerType: TriggerType;
    triggerWho: TriggerWho;
    triggerValue: Record<string, unknown>;
    isActive: boolean;
  }) => {
    startMutation(async () => {
      const res = await createLabelRule({ labelId, ...input });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Regla creada');
      setEditing(null);
      await refresh();
    });
  };

  const onUpdate = (
    rule: RuleRow,
    input: {
      triggerType: TriggerType;
      triggerWho: TriggerWho;
      triggerValue: Record<string, unknown>;
      isActive: boolean;
    },
  ) => {
    startMutation(async () => {
      const res = await updateLabelRule({
        ruleId: rule.id,
        patch: input,
      });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Regla actualizada');
      setEditing(null);
      await refresh();
    });
  };

  const onToggle = (rule: RuleRow) => {
    startMutation(async () => {
      const res = await toggleRule(rule.id, !rule.isActive);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      await refresh();
    });
  };

  const onDelete = () => {
    if (!deleting) return;
    startMutation(async () => {
      const res = await deleteRule(deleting.id);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Regla eliminada');
      setDeleting(null);
      await refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm">
          Reglas que aplican esta etiqueta automáticamente.
          {rules.length > 0 ? ` (${rules.length})` : ''}
        </p>
        {editing == null ? (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            Añadir regla
          </Button>
        ) : null}
      </div>

      {editing === 'new' ? (
        <RuleBuilder
          pending={pendingMutation}
          onSubmit={onCreate}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {loading ? (
        <p className="text-xs text-muted-foreground italic">Cargando reglas…</p>
      ) : rules.length === 0 && editing == null ? (
        <p className="text-xs text-muted-foreground italic">
          Sin reglas todavía. La etiqueta solo se aplicará manualmente desde el chat.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 border border-border rounded-md p-2.5 bg-card/40"
            >
              {editing != null && editing !== 'new' && editing.id === r.id ? (
                <RuleBuilder
                  initial={r}
                  pending={pendingMutation}
                  onSubmit={(input) => onUpdate(r, input)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {TYPE_LABEL[r.triggerType]}
                      </Badge>
                      {r.triggerType !== 'inactivity_hours' ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {WHO_LABEL[r.triggerWho]}
                        </Badge>
                      ) : null}
                      {!r.isActive ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal border-amber-500/40 text-amber-400 bg-amber-500/5"
                        >
                          Pausada
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {describeRule(r)}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => onToggle(r)}
                      disabled={pendingMutation}
                      title={r.isActive ? 'Pausar regla' : 'Reactivar regla'}
                    >
                      {r.isActive ? (
                        <Power className="size-3.5 text-emerald-400" />
                      ) : (
                        <PowerOff className="size-3.5 text-amber-400" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setEditing(r)}
                      disabled={pendingMutation}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => setDeleting(r)}
                      disabled={pendingMutation}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar regla</AlertDialogTitle>
            <AlertDialogDescription>
              Esta regla dejará de aplicar la etiqueta automáticamente. Las
              conversaciones que ya tienen la etiqueta aplicada no cambian. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingMutation}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={pendingMutation}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
