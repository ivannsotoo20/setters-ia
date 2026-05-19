'use client';

import { useState, useTransition } from 'react';
import { Loader2, Trash2, Power, PowerOff } from 'lucide-react';
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
  deleteIntegration,
  toggleIntegrationActive,
} from '@/lib/actions/integrations';
import { EditIntegrationDialog } from './edit-integration-dialog';

interface Integration {
  id: number;
  provider: string;
  channelType: string;
  isActive: boolean;
  connectionConfig: Record<string, unknown>;
  updatedAt: string;
}

interface Props {
  integrations: Integration[];
}

export function IntegrationsList({ integrations }: Props) {
  return (
    <div className="overflow-x-auto -mx-6">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[60px]">ID</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Config</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Actualizada</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {integrations.map((it) => (
            <IntegrationRow key={it.id} integration={it} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function IntegrationRow({ integration }: { integration: Integration }) {
  const [pendingToggle, startToggle] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onToggle = () => {
    startToggle(async () => {
      const result = await toggleIntegrationActive(integration.id, !integration.isActive);
      if (!result.ok) {
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success(integration.isActive ? 'Integración desactivada' : 'Integración activada');
      }
    });
  };

  const onDelete = () => {
    startDelete(async () => {
      const result = await deleteIntegration(integration.id);
      if (!result.ok) {
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success('Integración eliminada');
        setConfirmOpen(false);
      }
    });
  };

  const configKeys = Object.keys(integration.connectionConfig);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs text-muted-foreground">
        #{integration.id}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 items-start">
          <Badge variant="outline" className="font-medium uppercase">
            {integration.provider}
          </Badge>
          {integration.provider === 'ghl' && getAuthTypeLabel(integration.connectionConfig) && (
            <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
              {getAuthTypeLabel(integration.connectionConfig)}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-normal">
          {formatChannelType(integration.channelType)}
        </Badge>
      </TableCell>
      <TableCell className="max-w-xs">
        {configKeys.length > 0 ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              {configKeys.length} {configKeys.length === 1 ? 'campo' : 'campos'}
            </summary>
            <pre className="mt-1 bg-background/50 p-2 rounded text-[10px] overflow-x-auto">
              {JSON.stringify(integration.connectionConfig, null, 2)}
            </pre>
          </details>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        {integration.isActive ? (
          <Badge variant="outline" className="border-success/40 text-success bg-success/5">
            activa
          </Badge>
        ) : (
          <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
            inactiva
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        {new Date(integration.updatedAt).toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <EditIntegrationDialog
            integrationId={integration.id}
            provider={integration.provider}
            channelType={integration.channelType}
            connectionConfig={integration.connectionConfig}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onToggle}
            disabled={pendingToggle}
            title={integration.isActive ? 'Desactivar' : 'Activar'}
          >
            {pendingToggle ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : integration.isActive ? (
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
              <DialogTitle>Eliminar integración</DialogTitle>
              <DialogDescription>
                ¿Seguro? Las credenciales cifradas se borrarán y el motor dejará de
                procesar webhooks de este provider para tu tenant. Esta acción no
                se puede deshacer.
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

function formatChannelType(t: string): string {
  if (t === 'instagram_dm') return 'Instagram DM';
  if (t === 'facebook_messenger') return 'Facebook Messenger';
  if (t === 'whatsapp') return 'WhatsApp';
  return t;
}

/**
 * Sprint Iota.5 PR-B — devuelve el label del auth_type para integraciones GHL.
 * - 'pit' → "PIT v2.0" (BYOK, Private Integration Token)
 * - 'oauth' → "OAuth" (Marketplace install, refresh automático)
 * - sin auth_type → null (no muestra chip)
 */
function getAuthTypeLabel(connectionConfig: Record<string, unknown>): string | null {
  const t = connectionConfig.auth_type;
  if (t === 'pit') return 'PIT v2.0';
  if (t === 'oauth') return 'OAuth';
  return null;
}
