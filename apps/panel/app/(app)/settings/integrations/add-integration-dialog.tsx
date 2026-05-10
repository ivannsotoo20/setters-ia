'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createOrUpdateIntegration,
  type IntegrationProvider,
} from '@/lib/actions/integrations';

const PROVIDERS: { value: IntegrationProvider; label: string; description: string }[] = [
  {
    value: 'ghl',
    label: 'GoHighLevel',
    description: 'CRM + canales IG/FB/WhatsApp via PIT (Private Integration Token).',
  },
  {
    value: 'meta_cloud',
    label: 'Meta API directa',
    description: 'Instagram + Facebook Messenger sin intermediario. Requiere App Review Meta.',
  },
  {
    value: 'ycloud',
    label: 'YCloud (WhatsApp BSP)',
    description: 'WhatsApp Business Cloud via YCloud. API key + business phone.',
  },
  {
    value: 'manychat',
    label: 'ManyChat',
    description: 'Legacy. IG/FB/WhatsApp via ManyChat. Sin firma webhook.',
  },
];

const CHANNEL_TYPES: { value: 'whatsapp' | 'instagram_dm' | 'facebook_messenger'; label: string }[] = [
  { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'facebook_messenger', label: 'Facebook Messenger' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export function AddIntegrationDialog() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<IntegrationProvider>('ghl');
  const [channelType, setChannelType] = useState<'whatsapp' | 'instagram_dm' | 'facebook_messenger'>(
    'instagram_dm',
  );
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setProvider('ghl');
    setChannelType('instagram_dm');
  };

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      const credentials: Record<string, string> = {};
      const connectionConfig: Record<string, string> = {};

      // Recoger campos según provider
      if (provider === 'ghl') {
        const apiToken = String(formData.get('apiToken') ?? '').trim();
        const locationId = String(formData.get('locationId') ?? '').trim();
        if (!apiToken || !locationId) {
          toast.error('apiToken y locationId son obligatorios');
          return;
        }
        credentials.apiToken = apiToken;
        credentials.locationId = locationId;
        connectionConfig.locationId = locationId;
      } else if (provider === 'meta_cloud') {
        const accessToken = String(formData.get('accessToken') ?? '').trim();
        const pageId = String(formData.get('pageId') ?? '').trim();
        const igBusinessAccountId = String(formData.get('igBusinessAccountId') ?? '').trim();
        if (!accessToken || !pageId) {
          toast.error('accessToken y pageId son obligatorios');
          return;
        }
        credentials.accessToken = accessToken;
        connectionConfig.pageId = pageId;
        if (igBusinessAccountId) connectionConfig.igBusinessAccountId = igBusinessAccountId;
      } else if (provider === 'ycloud') {
        const apiKey = String(formData.get('apiKey') ?? '').trim();
        const businessPhone = String(formData.get('businessPhone') ?? '').trim();
        const wabaId = String(formData.get('wabaId') ?? '').trim();
        if (!apiKey) {
          toast.error('apiKey es obligatorio');
          return;
        }
        credentials.apiKey = apiKey;
        if (businessPhone) connectionConfig.business_phone = businessPhone;
        if (wabaId) connectionConfig.wabaId = wabaId;
      } else if (provider === 'manychat') {
        const apiKey = String(formData.get('apiKey') ?? '').trim();
        if (!apiKey) {
          toast.error('apiKey es obligatorio');
          return;
        }
        credentials.apiKey = apiKey;
      }

      const result = await createOrUpdateIntegration({
        provider,
        credentials,
        connectionConfig,
        channelType,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const derived = result.data?.derived;
      const derivedMsg = derived?.locationName ? ` · "${derived.locationName}"` : '';
      toast.success(`Integración guardada (#${result.data?.id})${derivedMsg}`);
      setOpen(false);
      reset();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Añadir integración
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar proveedor</DialogTitle>
          <DialogDescription>
            Pega las credenciales del proveedor. Se validan vía API antes de guardar
            y se cifran AES-256-GCM.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="provider">Proveedor</Label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {PROVIDERS.find((p) => p.value === provider)?.description}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="channelType">Canal</Label>
            <select
              id="channelType"
              value={channelType}
              onChange={(e) =>
                setChannelType(e.target.value as 'whatsapp' | 'instagram_dm' | 'facebook_messenger')
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CHANNEL_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <ProviderFields provider={provider} />

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
                'Validar y guardar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProviderFields({ provider }: { provider: IntegrationProvider }) {
  if (provider === 'ghl') {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiToken">Private Integration Token</Label>
          <Input
            id="apiToken"
            name="apiToken"
            type="password"
            placeholder="pit-..."
            required
          />
          <p className="text-xs text-muted-foreground">
            Settings → Private Integrations → Generate.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="locationId">Location ID</Label>
          <Input id="locationId" name="locationId" placeholder="FOxJtkxqNKJjGSuYMEk0" required />
          <p className="text-xs text-muted-foreground">
            Settings → Business Profile → Location ID.
          </p>
        </div>
      </div>
    );
  }

  if (provider === 'meta_cloud') {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="accessToken">Page Access Token</Label>
          <Input
            id="accessToken"
            name="accessToken"
            type="password"
            placeholder="EAAxxxxxxx..."
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pageId">Page ID</Label>
          <Input id="pageId" name="pageId" placeholder="1234567890" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="igBusinessAccountId">Instagram Business Account ID (opcional)</Label>
          <Input id="igBusinessAccountId" name="igBusinessAccountId" placeholder="17841..." />
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
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessPhone">Business Phone (E.164, opcional)</Label>
          <Input id="businessPhone" name="businessPhone" placeholder="+34684703803" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wabaId">WABA ID (opcional)</Label>
          <Input id="wabaId" name="wabaId" placeholder="auto-detectado si tu cuenta tiene WABA conectada" />
          <p className="text-xs text-muted-foreground">
            WhatsApp Business Account ID. Si no se detecta automáticamente al
            validar, pégalo a mano (YCloud panel → WhatsApp Business Accounts → ID).
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

  return null;
}
