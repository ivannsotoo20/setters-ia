'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Save,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronDown,
  Check,
  Circle,
} from 'lucide-react';
import {
  saveDraft,
  discardDraft,
  applyDraft,
  previewComposed,
  loadVersionContent,
  listVersions,
  type PreviewResult,
  type VersionRow,
} from '@/lib/actions/prompts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

export interface TenantOption {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
}

export interface PromptBlockEditorProps {
  blockKey: string;
  /** null = bloque global (Cerebro). number = scoped al tenant (Coach, Admin Overrides). */
  tenantId: number | null;
  activeContent: string;
  activeVersion: number;
  draftContent: string | null;
  draftBaseVersion: number | null;
  /** Lista para selector del preview cuando tenantId es null. Cuando tenantId está fijado, se usa solo para resolver nombres. */
  tenants: TenantOption[];
  initialVersions: VersionRow[];
  /**
   * Texto del título del Dialog "Guardar cambios". Default "Guardar nueva versión".
   * Personalizable según contexto: ej. "Aplicar al Coach del tenant".
   */
  dialogTitle?: string;
  /**
   * Texto descriptivo del impacto del Apply, mostrado en el Dialog. Si no se
   * pasa, se calcula automáticamente según scope (global vs tenant).
   */
  affectedDescription?: string;
  /**
   * Si true, el preview no muestra selector de tenant — usa siempre el tenant
   * del bloque. Default true cuando tenantId !== null. Útil para Coach/Overrides
   * donde no tiene sentido componer el prompt para OTRO tenant.
   */
  lockPreviewToTenant?: boolean;
}

const AUTOSAVE_DEBOUNCE_MS = 1500;

export function PromptBlockEditor(props: PromptBlockEditorProps) {
  const router = useRouter();
  const initialContent = props.draftContent ?? props.activeContent;
  const [content, setContent] = useState(initialContent);
  const [hasDraft, setHasDraft] = useState(props.draftContent !== null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    props.draftContent !== null ? new Date() : null,
  );
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number>(
    props.activeVersion,
  );
  const [loadingVersion, startLoadVersion] = useTransition();

  // Default del preview tenant: si el bloque es scoped a tenant, fíjalo a ese
  // tenant; si es global, deja al usuario elegir entre los activos.
  const lockPreview = props.lockPreviewToTenant ?? props.tenantId !== null;
  const [previewTenantId, setPreviewTenantId] = useState<number | null>(
    lockPreview ? props.tenantId : (props.tenants.find((t) => t.isActive)?.id ?? null),
  );
  const [previewPhase, setPreviewPhase] = useState(1);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, startPreview] = useTransition();

  const [versions, setVersions] = useState<VersionRow[]>(props.initialVersions);

  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');
  const [applying, startApply] = useTransition();

  const isDirty = content !== props.activeContent;
  const tenantsAffected =
    props.tenantId == null ? props.tenants.filter((t) => t.isActive).length : 1;

  // Resync cuando el server actualiza props (tras Apply/Discard → router.refresh).
  const lastSyncedActiveVersion = useRef(props.activeVersion);
  useEffect(() => {
    if (props.activeVersion !== lastSyncedActiveVersion.current) {
      lastSyncedActiveVersion.current = props.activeVersion;
      const newInitial = props.draftContent ?? props.activeContent;
      setContent(newInitial);
      setHasDraft(props.draftContent !== null);
      setLastSavedAt(props.draftContent !== null ? new Date() : null);
      setSelectedVersionNumber(props.activeVersion);
      setPreview(null);
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      void (async () => {
        const v = await listVersions({
          blockKey: props.blockKey,
          tenantId: props.tenantId,
          limit: 50,
        });
        if (v.ok) setVersions(v.versions);
      })();
    }
  }, [
    props.activeVersion,
    props.activeContent,
    props.draftContent,
    props.blockKey,
    props.tenantId,
  ]);

  // Autosave debounced
  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setSavingDraft(true);
      const r = await saveDraft({
        blockKey: props.blockKey,
        tenantId: props.tenantId,
        content,
        baseVersion: props.activeVersion,
      });
      setSavingDraft(false);
      if (r.ok) {
        setHasDraft(true);
        setLastSavedAt(new Date());
      } else {
        toast.error(`Autosave falló: ${r.error}`);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [content, isDirty, props.activeVersion, props.blockKey, props.tenantId]);

  function handleSelectVersion(versionNumber: number) {
    if (versionNumber === selectedVersionNumber) return;
    if (
      isDirty &&
      !confirm(
        '¿Cambiar de versión y descartar tus cambios sin guardar? El contenido del textarea se perderá.',
      )
    ) {
      return;
    }
    if (versionNumber === props.activeVersion) {
      setContent(props.activeContent);
      setSelectedVersionNumber(versionNumber);
      return;
    }
    startLoadVersion(async () => {
      const r = await loadVersionContent({
        blockKey: props.blockKey,
        tenantId: props.tenantId,
        versionNumber,
      });
      if (r.ok) {
        setContent(r.content);
        setSelectedVersionNumber(versionNumber);
        toast.success(`Cargada v${versionNumber}`, {
          description: r.changeSummary ?? new Date(r.changedAt).toLocaleString('es-ES'),
        });
      } else {
        toast.error(`No se pudo cargar v${versionNumber}: ${r.error}`);
      }
    });
  }

  function handleDiscard() {
    if (!hasDraft && !isDirty) return;
    if (!confirm('¿Descartar borrador y volver a la versión activa?')) return;
    startApply(async () => {
      const r = await discardDraft({ blockKey: props.blockKey, tenantId: props.tenantId });
      if (r.ok) {
        setContent(props.activeContent);
        setSelectedVersionNumber(props.activeVersion);
        setHasDraft(false);
        setLastSavedAt(null);
        toast.success('Borrador descartado');
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  function handlePreview() {
    if (previewTenantId == null) {
      toast.error('Elige un tenant para el preview');
      return;
    }
    startPreview(async () => {
      const r = await previewComposed({
        tenantId: previewTenantId,
        currentPhase: previewPhase,
        draftOverrides: isDirty
          ? [
              {
                blockKey: props.blockKey,
                tenantIdScope: props.tenantId,
                content,
              },
            ]
          : [],
      });
      if (r.ok) {
        setPreview(r);
      } else {
        toast.error(`Preview falló: ${r.error}`);
      }
    });
  }

  function handleApply() {
    startApply(async () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      if (isDirty) {
        const sd = await saveDraft({
          blockKey: props.blockKey,
          tenantId: props.tenantId,
          content,
          baseVersion: props.activeVersion,
        });
        if (!sd.ok) {
          toast.error(`Pre-save falló: ${sd.error}`);
          return;
        }
      }
      const r = await applyDraft({
        blockKey: props.blockKey,
        tenantId: props.tenantId,
        changeSummary: changeSummary.trim() || undefined,
      });
      if (r.ok) {
        toast.success(
          `Guardado v${r.newVersionNumber}` + (r.mdSyncWarning ? ` · ⚠️ md no actualizado` : ''),
          { description: r.mdSyncWarning ? `Warning: ${r.mdSyncWarning}` : undefined },
        );
        setApplyDialogOpen(false);
        setChangeSummary('');
        router.refresh();
      } else {
        toast.error(`Guardar falló: ${r.error}`);
      }
    });
  }

  function handleHidePreview() {
    setPreview(null);
  }

  const dropdownLabel = isDirty
    ? `Modificado (basado en v${props.activeVersion})`
    : selectedVersionNumber === props.activeVersion
      ? `v${props.activeVersion} (activa)`
      : `v${selectedVersionNumber} (visualizando)`;

  // Texto del impacto en el Dialog Apply
  const dialogTitle = props.dialogTitle ?? 'Guardar nueva versión';
  const fallbackAffected =
    props.tenantId == null
      ? `${tenantsAffected} tenant(s) productivo(s)`
      : `el tenant #${props.tenantId}`;
  const affectedDescription =
    props.affectedDescription ??
    `Esto guardará el contenido actual del editor como la nueva versión activa. Afectará a ${fallbackAffected} en el siguiente turno del motor.`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Editor (izquierda) */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs gap-2"
                  disabled={loadingVersion || applying}
                >
                  {loadingVersion ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isDirty ? (
                    <AlertCircle className="size-3.5 text-amber-400" />
                  ) : selectedVersionNumber === props.activeVersion ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Eye className="size-3.5 text-blue-400" />
                  )}
                  {dropdownLabel}
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[280px] max-h-[400px] overflow-y-auto bg-background border border-border shadow-xl backdrop-blur-none"
                style={{ backgroundColor: '#161616' }}
              >
                <DropdownMenuLabel className="text-xs">
                  Histórico ({versions.length} versiones)
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {versions.length === 0 ? (
                  <DropdownMenuItem disabled className="text-xs">
                    Sin versiones aún.
                  </DropdownMenuItem>
                ) : (
                  versions.map((v) => {
                    const isActive = v.versionNumber === props.activeVersion;
                    const isSelected = v.versionNumber === selectedVersionNumber;
                    return (
                      <DropdownMenuItem
                        key={v.id}
                        onClick={() => handleSelectVersion(v.versionNumber)}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="mt-0.5 flex size-4 items-center justify-center">
                          {isSelected ? (
                            <Check className="size-3.5 text-emerald-400" />
                          ) : (
                            <Circle className="size-2 opacity-40" />
                          )}
                        </span>
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-medium">v{v.versionNumber}</span>
                            {isActive ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5 text-[10px] py-0 px-1.5"
                              >
                                activa
                              </Badge>
                            ) : null}
                            <span className="text-muted-foreground tabular-nums ml-auto">
                              {new Date(v.changedAt).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          {v.changeSummary ? (
                            <span className="text-muted-foreground line-clamp-2">
                              {v.changeSummary}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 italic">sin resumen</span>
                          )}
                          <span className="text-muted-foreground/60 tabular-nums">
                            {v.contentChars.toLocaleString()} chars
                          </span>
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Badge variant="outline" className="font-mono text-xs">
              {content.length.toLocaleString()} chars
            </Badge>

            {savingDraft ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                guardando…
              </span>
            ) : hasDraft && lastSavedAt ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="size-3 text-emerald-400" />
                {lastSavedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-[500px] font-mono text-xs leading-relaxed bg-muted/40 border rounded-md p-3 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={(!hasDraft && !isDirty) || applying}
            >
              <Trash2 className="size-3.5" />
              Descartar borrador
            </Button>
            <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" disabled={!isDirty || applying}>
                  <Save className="size-3.5" />
                  Guardar cambios
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{dialogTitle}</DialogTitle>
                  <DialogDescription>
                    {affectedDescription} Bloque:{' '}
                    <code className="text-xs font-mono">{props.blockKey}</code>.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="changeSummary">Resumen del cambio (opcional)</Label>
                    <Input
                      id="changeSummary"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      placeholder='ej: "Suavizo R5 sobre menores" o "Vuelvo a v3"'
                      maxLength={140}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setApplyDialogOpen(false)}
                    disabled={applying}
                  >
                    Cancelar
                  </Button>
                  <Button onClick={handleApply} disabled={applying}>
                    {applying ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      <>
                        <Save className="size-3.5" />
                        Confirmar
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Preview (derecha) */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Preview prompt compuesto</CardTitle>
          <CardDescription className="text-xs">
            {lockPreview
              ? `Compone el prompt final para este tenant + la fase elegida.`
              : `Compone el prompt final usando el contenido actual del editor para el tenant + fase elegidos.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3">
          <div className="flex items-end gap-2 flex-wrap">
            {!lockPreview ? (
              <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
                <Label htmlFor="previewTenant" className="text-xs">
                  Tenant
                </Label>
                <select
                  id="previewTenant"
                  value={previewTenantId ?? ''}
                  onChange={(e) => setPreviewTenantId(Number(e.target.value) || null)}
                  className="h-9 px-3 rounded-md bg-muted/40 border text-sm"
                >
                  <option value="">— elige —</option>
                  {props.tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} {t.name} ({t.slug}){t.isActive ? '' : ' [inactivo]'}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5 w-[100px]">
              <Label htmlFor="previewPhase" className="text-xs">
                Fase
              </Label>
              <select
                id="previewPhase"
                value={previewPhase}
                onChange={(e) => setPreviewPhase(Number(e.target.value))}
                className="h-9 px-3 rounded-md bg-muted/40 border text-sm"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    F{n}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" size="sm" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Generando…
                </>
              ) : (
                <>
                  <Eye className="size-3.5" />
                  {preview ? 'Regenerar' : 'Generar preview'}
                </>
              )}
            </Button>
            {preview ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleHidePreview}
                disabled={previewLoading}
              >
                <EyeOff className="size-3.5" />
                Ocultar
              </Button>
            ) : null}
          </div>

          {preview ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {preview.blocks.map((b) => (
                  <Badge
                    key={b.blockKey}
                    variant="outline"
                    className={`font-mono text-xs ${
                      b.source === 'draft'
                        ? 'border-amber-500/50 text-amber-400 bg-amber-500/5'
                        : ''
                    }`}
                    title={`${b.chars.toLocaleString()} chars · ${b.scope} · ${b.source}${b.cached ? ' · cached' : ''}`}
                  >
                    {b.blockKey} ({b.chars.toLocaleString()})
                    {b.cached ? ' 💾' : ''}
                    {b.source === 'draft' ? ' ✏️' : ''}
                  </Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                Total: <strong>{preview.totalChars.toLocaleString()} chars</strong> ·{' '}
                {preview.blockCount} bloques · {preview.cacheBreakpoints} breakpoints cache
              </div>
              <pre className="flex-1 min-h-[400px] font-mono text-[11px] leading-relaxed bg-muted/40 border rounded-md p-3 overflow-auto whitespace-pre-wrap">
                {preview.prompt}
              </pre>
            </>
          ) : (
            <div className="flex-1 min-h-[400px] flex items-center justify-center text-sm text-muted-foreground">
              Elige {lockPreview ? 'una fase' : 'tenant + fase'} y click &quot;Generar preview&quot;
              para ver el prompt completo.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
