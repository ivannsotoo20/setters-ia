'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X, Loader2, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  createCustomInstruction,
  updateCustomInstruction,
  deleteCustomInstruction,
  type CustomInstructionRow,
} from '@/lib/actions/custom-instructions';

interface Props {
  tenantId: number;
  initial: CustomInstructionRow[];
}

const MAX_INSTRUCTION_CHARS = 500;

const PLACEHOLDER_EXAMPLES = [
  'Usa siempre tono formal con leads del nicho corporativo',
  'Si pregunta por la dirección de la academia, di Calle Mayor 42, Madrid',
  'Menciona el caso de éxito de Juan cuando hablen de resultados',
  'Si me menciona en el saludo, responde con un emoji 👋',
];

export function CustomInstructionsList({ tenantId, initial }: Props) {
  const router = useRouter();
  const [list, setList] = useState<CustomInstructionRow[]>(initial);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [busy, startBusy] = useTransition();

  // Placeholder rota para mostrar variedad de ejemplos
  const placeholder =
    PLACEHOLDER_EXAMPLES[Math.floor(Date.now() / 60000) % PLACEHOLDER_EXAMPLES.length];

  function handleAdd() {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_INSTRUCTION_CHARS) {
      toast.error(`Máximo ${MAX_INSTRUCTION_CHARS} caracteres por instrucción.`);
      return;
    }
    startBusy(async () => {
      const r = await createCustomInstruction({ tenantId, content: trimmed });
      if (r.ok) {
        setNewContent('');
        toast.success('Instrucción añadida');
        // Refresh para que el server component recargue la lista
        router.refresh();
        // Optimistic UI: añade al estado local mientras llega refresh
        setList((prev) => [
          ...prev,
          {
            id: r.instructionId,
            content: trimmed,
            isActive: true,
            sortOrder: prev.length === 0 ? 10 : prev[prev.length - 1]!.sortOrder + 10,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  function handleStartEdit(item: CustomInstructionRow) {
    setEditingId(item.id);
    setEditContent(item.content);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditContent('');
  }

  function handleSaveEdit(id: number) {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_INSTRUCTION_CHARS) {
      toast.error(`Máximo ${MAX_INSTRUCTION_CHARS} caracteres.`);
      return;
    }
    startBusy(async () => {
      const r = await updateCustomInstruction({ tenantId, id, content: trimmed });
      if (r.ok) {
        setList((prev) => prev.map((it) => (it.id === id ? { ...it, content: trimmed } : it)));
        setEditingId(null);
        setEditContent('');
        toast.success('Instrucción actualizada');
        router.refresh();
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  function handleToggle(id: number, current: boolean) {
    startBusy(async () => {
      const r = await updateCustomInstruction({ tenantId, id, isActive: !current });
      if (r.ok) {
        setList((prev) => prev.map((it) => (it.id === id ? { ...it, isActive: !current } : it)));
        toast.success(!current ? 'Instrucción activada' : 'Instrucción pausada');
        router.refresh();
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta instrucción? No se puede deshacer.')) return;
    startBusy(async () => {
      const r = await deleteCustomInstruction({ tenantId, id });
      if (r.ok) {
        setList((prev) => prev.filter((it) => it.id !== id));
        toast.success('Instrucción eliminada');
        router.refresh();
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  function handleNewKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }

  const activeCount = list.filter((it) => it.isActive).length;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="size-4" />
          Instrucciones libres para el setter
        </CardTitle>
        <CardDescription>
          Añade instrucciones puntuales en lenguaje natural. Cada una se guarda por separado y
          puedes editarla, pausarla o eliminarla. El setter las respeta siempre que no contradigan
          al Cerebro o al Coach (gestionados por la agencia).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Input para añadir nueva */}
        <div className="flex gap-2">
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={handleNewKeyDown}
            placeholder={`Ej: ${placeholder}`}
            maxLength={MAX_INSTRUCTION_CHARS}
            disabled={busy}
            className="flex-1"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAdd}
            disabled={busy || newContent.trim() === ''}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Añadir
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {newContent.length} / {MAX_INSTRUCTION_CHARS} chars · pulsa <kbd>Enter</kbd> para añadir
        </p>

        {/* Lista */}
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
            Sin instrucciones todavía. Añade la primera arriba.
            <br />
            <span className="text-xs italic">
              Las instrucciones se inyectan al final del prompt y aplican desde el siguiente turno
              del motor.
            </span>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {activeCount} de {list.length} activas
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((it) => {
                const isEditing = editingId === it.id;
                return (
                  <li
                    key={it.id}
                    className={`flex items-start gap-2 p-3 border rounded-md ${
                      it.isActive ? 'bg-muted/30 border-border' : 'bg-muted/10 border-border/40 opacity-60'
                    }`}
                  >
                    <Switch
                      checked={it.isActive}
                      onCheckedChange={() => handleToggle(it.id, it.isActive)}
                      disabled={busy || isEditing}
                      className="mt-0.5 shrink-0"
                    />
                    {isEditing ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <Input
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          maxLength={MAX_INSTRUCTION_CHARS}
                          autoFocus
                        />
                        <div className="flex gap-1.5 justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                            disabled={busy}
                          >
                            <X className="size-3.5" />
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleSaveEdit(it.id)}
                            disabled={busy || editContent.trim() === ''}
                          >
                            <Check className="size-3.5" />
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="flex-1 text-sm leading-relaxed break-words">{it.content}</p>
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(it)}
                            disabled={busy}
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(it.id)}
                            disabled={busy}
                            title="Eliminar"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
