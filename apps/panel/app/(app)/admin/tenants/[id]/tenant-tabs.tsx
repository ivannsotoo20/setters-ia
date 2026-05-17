'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, Sparkles, FileText, Settings, Loader2, Plus, Eye, EyeOff } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  PromptBlockEditor,
  type TenantOption,
} from '@/components/admin/prompt-block-editor';
import {
  createAdminOverridesBlock,
  previewComposed,
  type PreviewResult,
  type VersionRow,
} from '@/lib/actions/prompts';
import type { TrainerPreferences } from '@/lib/trainer-prefs-serializer';

interface BlockSlice {
  blockKey: string;
  tenantId: number;
  activeContent: string;
  activeVersion: number;
  draftContent: string | null;
  draftBaseVersion: number | null;
  tenants: TenantOption[];
  initialVersions: VersionRow[];
}

interface IntegrationRow {
  id: number;
  provider: string;
  isActive: boolean;
  channelLabel: string | null;
  channelType: string | null;
  connectionConfig: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  tenant: { id: number; slug: string; name: string; isActive: boolean };
  /** null si el coach del tenant no existe (caso edge: nunca debería). */
  coach: BlockSlice | null;
  /** null si admin_overrides_v1 no existe aún para este tenant. */
  overrides: BlockSlice | null;
  /** null si trainer_preferences no existe; defaults aplican. */
  trainerPrefs: TrainerPreferences | null;
  integrations: IntegrationRow[];
}

export function TenantPromptTabs(props: Props) {
  return (
    <Tabs defaultValue="coach" className="w-full">
      <TabsList className="grid w-full grid-cols-4 max-w-2xl">
        <TabsTrigger value="coach">
          <BookOpen className="size-3.5" />
          Coach
        </TabsTrigger>
        <TabsTrigger value="overrides">
          <Sparkles className="size-3.5" />
          Admin Overrides
        </TabsTrigger>
        <TabsTrigger value="resumen">
          <FileText className="size-3.5" />
          Resumen
        </TabsTrigger>
        <TabsTrigger value="config">
          <Settings className="size-3.5" />
          Configuración
        </TabsTrigger>
      </TabsList>

      {/* TAB COACH ------------------------------------------------------------ */}
      <TabsContent value="coach" className="mt-4">
        {props.coach ? (
          <PromptBlockEditor
            {...props.coach}
            dialogTitle={`Aplicar al Coach de ${props.tenant.name}`}
            affectedDescription={`Esto guardará el contenido actual como nueva versión activa del coach de este trainer. Solo afecta a este tenant en el siguiente turno del motor.`}
            lockPreviewToTenant
          />
        ) : (
          <EmptyCoach tenantName={props.tenant.name} />
        )}
      </TabsContent>

      {/* TAB ADMIN OVERRIDES -------------------------------------------------- */}
      <TabsContent value="overrides" className="mt-4">
        {props.overrides ? (
          <PromptBlockEditor
            {...props.overrides}
            dialogTitle={`Aplicar Admin Overrides de ${props.tenant.name}`}
            affectedDescription={`Esto guardará el contenido actual como nueva versión activa de la capa de overrides admin. Solo afecta a este tenant. El trainer NO ve este contenido.`}
            lockPreviewToTenant
          />
        ) : (
          <EmptyAdminOverrides tenantId={props.tenant.id} tenantName={props.tenant.name} />
        )}
      </TabsContent>

      {/* TAB RESUMEN ---------------------------------------------------------- */}
      <TabsContent value="resumen" className="mt-4">
        <ResumenTab tenant={props.tenant} />
      </TabsContent>

      {/* TAB CONFIGURACIÓN --------------------------------------------------- */}
      <TabsContent value="config" className="mt-4">
        <ConfiguracionTab
          tenant={props.tenant}
          trainerPrefs={props.trainerPrefs}
          integrations={props.integrations}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyCoach({ tenantName }: { tenantName: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground">
          {tenantName} no tiene coach_v3 cargado. Esto es inesperado — un tenant productivo siempre
          debe tener su coach activo. Revisa los seeds o carga uno via MCP.
        </p>
      </CardContent>
    </Card>
  );
}

function EmptyAdminOverrides({ tenantId, tenantName }: { tenantId: number; tenantName: string }) {
  const router = useRouter();
  const [creating, startCreate] = useTransition();

  function handleCreate() {
    startCreate(async () => {
      const r = await createAdminOverridesBlock({ tenantId });
      if (r.ok) {
        toast.success('Capa de overrides admin creada con plantilla inicial.');
        router.refresh();
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sin capa de overrides admin todavía</CardTitle>
        <CardDescription>
          La capa <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">admin_overrides_v1</code>{' '}
          se inyecta entre el Coach y la fase activa (sort=6) y solo la ves tú como agencia. El
          trainer dueño de {tenantName} no la ve ni puede editarla. Útil para notas operativas,
          restricciones específicas, contexto de la cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Creando…
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Crear capa de overrides
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab Resumen — prompt completo compuesto del tenant (read-only)
// ---------------------------------------------------------------------------

function ResumenTab({ tenant }: { tenant: { id: number; name: string } }) {
  const [phase, setPhase] = useState(1);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, startLoad] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    startLoad(async () => {
      const r = await previewComposed({ tenantId: tenant.id, currentPhase: phase });
      if (r.ok) setPreview(r);
      else toast.error(`Error: ${r.error}`);
    });
  }

  function handleCopy() {
    if (!preview) return;
    void navigator.clipboard.writeText(preview.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prompt compuesto para {tenant.name}</CardTitle>
        <CardDescription>
          Vista del prompt completo que el motor envía a Anthropic en la fase elegida, con todos
          los bloques activos del tenant + Cerebro genérico + protocolos universales.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1.5 w-[100px]">
            <Label htmlFor="resumenPhase" className="text-xs">
              Fase
            </Label>
            <select
              id="resumenPhase"
              value={phase}
              onChange={(e) => setPhase(Number(e.target.value))}
              className="h-9 px-3 rounded-md bg-muted/40 border text-sm"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  F{n}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <Eye className="size-3.5" />
                {preview ? 'Regenerar' : 'Generar'}
              </>
            )}
          </Button>
          {preview ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>
                <EyeOff className="size-3.5" />
                Ocultar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                {copied ? '✓ Copiado' : 'Copiar al portapapeles'}
              </Button>
            </>
          ) : null}
        </div>

        {preview ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {preview.blocks.map((b) => (
                <Badge
                  key={b.blockKey}
                  variant="outline"
                  className="font-mono text-xs"
                  title={`${b.chars.toLocaleString()} chars · ${b.scope}${b.cached ? ' · cached' : ''}`}
                >
                  {b.blockKey} ({b.chars.toLocaleString()})
                  {b.cached ? ' 💾' : ''}
                </Badge>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Total: <strong>{preview.totalChars.toLocaleString()} chars</strong> ·{' '}
              {preview.blockCount} bloques · {preview.cacheBreakpoints} breakpoints cache
            </div>
            <pre className="font-mono text-[11px] leading-relaxed bg-muted/40 border rounded-md p-3 max-h-[600px] overflow-auto whitespace-pre-wrap">
              {preview.prompt}
            </pre>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Elige una fase y click &quot;Generar&quot; para ver el prompt completo compuesto.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab Configuración — read-only: trainer prefs + integraciones
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<string, string> = {
  ghl: 'GoHighLevel',
  ycloud: 'YCloud',
  manychat: 'ManyChat',
  meta_cloud: 'Meta Cloud API',
  other: 'Otro',
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram DM',
  facebook_messenger: 'Facebook Messenger',
};

function ConfiguracionTab({
  tenant,
  trainerPrefs,
  integrations,
}: {
  tenant: { id: number; name: string };
  trainerPrefs: TrainerPreferences | null;
  integrations: IntegrationRow[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferencias del trainer</CardTitle>
          <CardDescription>
            Toggles que el trainer dueño de {tenant.name} puede ajustar desde su panel
            (/settings/preferences). Vista read-only desde admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {trainerPrefs ? (
            <>
              <PrefRow
                label="Emojis"
                value={
                  trainerPrefs.emojisEnabled
                    ? `cada ${trainerPrefs.emojiFrequencyPerMessages} msg, max ${trainerPrefs.emojiMaxPerConversation}/conv${trainerPrefs.customEmojis.length > 0 ? `, ${trainerPrefs.customEmojis.length} custom` : ''}`
                    : 'desactivados'
                }
                isDefault={
                  trainerPrefs.emojisEnabled &&
                  trainerPrefs.emojiFrequencyPerMessages === 2 &&
                  trainerPrefs.emojiMaxPerConversation === 5 &&
                  trainerPrefs.customEmojis.length === 0
                }
              />
              <PrefRow
                label="Preguntas extra antes de cita"
                value={
                  trainerPrefs.qualificationQuestionsEnabled
                    ? `+${trainerPrefs.extraQuestionsBeforeCall}`
                    : '(gestiona Coach)'
                }
                isDefault={!trainerPrefs.qualificationQuestionsEnabled}
              />
              <PrefRow
                label="Email para notificaciones"
                value={trainerPrefs.trainerEmail ?? '(no configurado)'}
                isDefault={trainerPrefs.trainerEmail == null}
              />
              <PrefRow
                label="Modo handoff (Causa B)"
                value={
                  trainerPrefs.handoffPersonalizationEnabled
                    ? trainerPrefs.handoffMode === 'custom_message'
                      ? `custom: ${trainerPrefs.handoffCustomTemplate}${trainerPrefs.handoffCustomTemplate === 'free' && trainerPrefs.handoffCustomMessage ? ` ("${trainerPrefs.handoffCustomMessage.slice(0, 30)}...")` : ''}`
                      : trainerPrefs.handoffMode
                    : '(default: comparte tel si lo hay)'
                }
                isDefault={!trainerPrefs.handoffPersonalizationEnabled}
              />
              <PrefRow
                label="Eventos suscritos"
                value={
                  trainerPrefs.notificationSubscriptions.length === 0
                    ? '(ninguno)'
                    : `${trainerPrefs.notificationSubscriptions.length} eventos`
                }
                isDefault={
                  trainerPrefs.notificationSubscriptions.length === 2 &&
                  trainerPrefs.notificationSubscriptions.includes('handoff') &&
                  trainerPrefs.notificationSubscriptions.includes('appointment_booked')
                }
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sin preferencias guardadas (usa defaults).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integraciones BYOK</CardTitle>
          <CardDescription>
            Providers conectados por el trainer en /settings/integrations. Read-only desde admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {integrations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin integraciones todavía. El trainer debe conectar al menos un provider para que el
              motor reciba/envíe mensajes.
            </p>
          ) : (
            integrations.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-1 border border-border rounded-md p-3 text-xs"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="font-mono">
                    {PROVIDER_LABELS[it.provider] ?? it.provider}
                  </Badge>
                  {it.channelType ? (
                    <Badge variant="outline" className="font-mono">
                      {CHANNEL_LABELS[it.channelType] ?? it.channelType}
                    </Badge>
                  ) : null}
                  {it.isActive ? (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success bg-success/5"
                    >
                      activa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      pausada
                    </Badge>
                  )}
                </div>
                {it.channelLabel ? (
                  <p className="text-muted-foreground">label: {it.channelLabel}</p>
                ) : null}
                {Object.entries(it.connectionConfig).length > 0 ? (
                  <pre className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto">
                    {JSON.stringify(it.connectionConfig, null, 2)}
                  </pre>
                ) : null}
                <p className="text-muted-foreground/60 tabular-nums">
                  conectado {new Date(it.createdAt).toLocaleString('es-ES')}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PrefRow({
  label,
  value,
  isDefault,
}: {
  label: string;
  value: string;
  isDefault: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{value}</span>
        {isDefault ? (
          <Badge
            variant="outline"
            className="text-[10px] py-0 px-1.5 text-muted-foreground/60"
            title="Valor por defecto, el trainer no lo ha cambiado"
          >
            default
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
