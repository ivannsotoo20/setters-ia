'use client';

import { useState, useTransition } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createOrUpdateIntegration } from '@/lib/actions/integrations';

/**
 * Modal de re-pegar credenciales para una integration_account existente.
 *
 * NO mostramos las credenciales actuales (siguen cifradas at-rest, no se
 * descifran en el panel). El trainer pega las nuevas y el server action las
 * valida via API + re-encripta + UPDATEa la fila (UPSERT por
 * tenant+provider+channel).
 *
 * El connection_config existente (locationId, business_phone) se preserva si
 * el form lo deja vacío — pero el formulario sí permite editarlo opcionalmente.
 */
interface Props {
  integrationId: number;
  provider: string;
  channelType: string;
  connectionConfig: Record<string, unknown>;
}

export function EditIntegrationDialog({
  provider,
  channelType,
  connectionConfig,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      const credentials: Record<string, string> = {};
      const newConnectionConfig: Record<string, string> = {};

      // Re-construir según provider
      if (provider === 'ghl') {
        const apiToken = String(formData.get('apiToken') ?? '').trim();
        const locationId =
          String(formData.get('locationId') ?? '').trim() ||
          String(connectionConfig.locationId ?? '').trim();
        if (!apiToken) {
          toast.error('apiToken es obligatorio');
          return;
        }
        if (!locationId) {
          toast.error('locationId es obligatorio');
          return;
        }
        credentials.apiToken = apiToken;
        credentials.locationId = locationId;
        newConnectionConfig.locationId = locationId;
      } else if (provider === 'ycloud') {
        const apiKey = String(formData.get('apiKey') ?? '').trim();
        const businessPhone =
          String(formData.get('businessPhone') ?? '').trim() ||
          String(connectionConfig.business_phone ?? '').trim();
        if (!apiKey) {
          toast.error('apiKey es obligatorio');
          return;
        }
        credentials.apiKey = apiKey;
        if (businessPhone) newConnectionConfig.business_phone = businessPhone;
      } else if (provider === 'manychat') {
        const apiKey = String(formData.get('apiKey') ?? '').trim();
        if (!apiKey) {
          toast.error('apiKey es obligatorio');
          return;
        }
        credentials.apiKey = apiKey;
      } else if (provider === 'meta_cloud') {
        const accessToken = String(formData.get('accessToken') ?? '').trim();
        const pageId =
          String(formData.get('pageId') ?? '').trim() ||
          String(connectionConfig.pageId ?? '').trim();
        if (!accessToken || !pageId) {
          toast.error('accessToken y pageId son obligatorios');
          return;
        }
        credentials.accessToken = accessToken;
        newConnectionConfig.pageId = pageId;
        const igBusinessAccountId = String(formData.get('igBusinessAccountId') ?? '').trim();
        if (igBusinessAccountId) newConnectionConfig.igBusinessAccountId = igBusinessAccountId;
      }

      const result = await createOrUpdateIntegration({
        provider: provider as 'ghl' | 'ycloud' | 'manychat' | 'meta_cloud',
        credentials,
        connectionConfig: newConnectionConfig,
        channelType: channelType as 'whatsapp' | 'instagram_dm' | 'facebook_messenger',
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Credenciales actualizadas');
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        title="Editar credenciales"
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Editar credenciales — {formatProviderName(provider)} ·{' '}
            {formatChannelName(channelType)}
          </DialogTitle>
          <DialogDescription>
            Pega las nuevas credenciales. Se validan vía API antes de guardar y
            se re-cifran AES-256-GCM. Las credenciales actuales NO se muestran
            (siguen cifradas at-rest).
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="flex flex-col gap-4">
          <ProviderEditFields provider={provider} connectionConfig={connectionConfig} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Validando…
                </>
              ) : (
                'Validar y actualizar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProviderEditFields({
  provider,
  connectionConfig,
}: {
  provider: string;
  connectionConfig: Record<string, unknown>;
}) {
  if (provider === 'ghl') {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiToken">Private Integration Token (PIT)</Label>
          <Input
            id="apiToken"
            name="apiToken"
            type="password"
            placeholder="pit-..."
            required
          />
          <p className="text-xs text-muted-foreground">
            Settings → Private Integrations → Generate (en GHL).
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationId">Location ID</Label>
          <Input
            id="locationId"
            name="locationId"
            placeholder={String(connectionConfig.locationId ?? '')}
            defaultValue={String(connectionConfig.locationId ?? '')}
          />
          <p className="text-xs text-muted-foreground">
            Actual: <code>{String(connectionConfig.locationId ?? '—')}</code>
          </p>
        </div>
      </div>
    );
  }

  if (provider === 'ycloud') {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiKey">API Key</Label>
          <Input id="apiKey" name="apiKey" type="password" required />
          <p className="text-xs text-muted-foreground">
            YCloud panel → Settings → API Keys → Generate.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessPhone">Business Phone (E.164)</Label>
          <Input
            id="businessPhone"
            name="businessPhone"
            placeholder={String(connectionConfig.business_phone ?? '+34...')}
            defaultValue={String(connectionConfig.business_phone ?? '')}
          />
          <p className="text-xs text-muted-foreground">
            Actual: <code>{String(connectionConfig.business_phone ?? '—')}</code>
          </p>
        </div>
      </div>
    );
  }

  if (provider === 'manychat') {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiKey">API Key</Label>
          <Input id="apiKey" name="apiKey" type="password" required />
        </div>
      </div>
    );
  }

  if (provider === 'meta_cloud') {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="accessToken">Page Access Token</Label>
          <Input id="accessToken" name="accessToken" type="password" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pageId">Page ID</Label>
          <Input
            id="pageId"
            name="pageId"
            defaultValue={String(connectionConfig.pageId ?? '')}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="igBusinessAccountId">IG Business Account ID (opcional)</Label>
          <Input
            id="igBusinessAccountId"
            name="igBusinessAccountId"
            defaultValue={String(connectionConfig.igBusinessAccountId ?? '')}
          />
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground py-2">
      Este provider no soporta edición desde panel todavía.
    </p>
  );
}

function formatProviderName(p: string): string {
  switch (p) {
    case 'ghl':
      return 'GoHighLevel';
    case 'ycloud':
      return 'YCloud';
    case 'manychat':
      return 'ManyChat';
    case 'meta_cloud':
      return 'Meta Cloud';
    default:
      return p;
  }
}
function formatChannelName(c: string): string {
  if (c === 'whatsapp') return 'WhatsApp';
  if (c === 'instagram_dm') return 'Instagram';
  if (c === 'facebook_messenger') return 'Facebook';
  return c;
}
