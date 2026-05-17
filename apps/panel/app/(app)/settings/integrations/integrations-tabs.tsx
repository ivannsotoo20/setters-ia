'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plug, Activity, MessageCircle } from 'lucide-react';

interface Props {
  listSection: ReactNode;
  whatsappSection: ReactNode;
  healthSection: ReactNode;
}

type TabValue = 'list' | 'whatsapp' | 'health';

/**
 * Tabs wrapper para `/settings/integrations`. Fusiona tres páginas que antes
 * vivían separadas:
 *   - "Conectores" (la lista BYOK).
 *   - "WhatsApp" (config inbound + plantillas Meta — antes `/settings/whatsapp`
 *     y bloque "Plantillas WA" de seguimientos).
 *   - "Salud" (antes `/settings/integrations/health`).
 *
 * Lee `?tab=` en la URL al montar para soportar deep-links de las rutas viejas
 * (que redirigen aquí con su tab seleccionado).
 */
export function IntegrationsTabs({
  listSection,
  whatsappSection,
  healthSection,
}: Props) {
  const [value, setValue] = useState<TabValue>('list');

  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('tab');
    if (t === 'health') setValue('health');
    else if (t === 'whatsapp') setValue('whatsapp');
  }, []);

  const handleChange = (next: string) => {
    const v: TabValue =
      next === 'health' ? 'health' : next === 'whatsapp' ? 'whatsapp' : 'list';
    setValue(v);
    const url = new URL(window.location.href);
    if (v === 'list') url.searchParams.delete('tab');
    else url.searchParams.set('tab', v);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <Tabs value={value} onValueChange={handleChange} className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="list" className="gap-1.5">
          <Plug className="size-3.5" /> Conectores
        </TabsTrigger>
        <TabsTrigger value="whatsapp" className="gap-1.5">
          <MessageCircle className="size-3.5" /> WhatsApp
        </TabsTrigger>
        <TabsTrigger value="health" className="gap-1.5">
          <Activity className="size-3.5" /> Salud
        </TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="flex flex-col gap-6">
        {listSection}
      </TabsContent>
      <TabsContent value="whatsapp" className="flex flex-col gap-6">
        {whatsappSection}
      </TabsContent>
      <TabsContent value="health" className="flex flex-col gap-6">
        {healthSection}
      </TabsContent>
    </Tabs>
  );
}
