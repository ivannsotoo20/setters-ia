'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Phone,
  Mail,
  AtSign,
  MapPin,
  Hash,
  Calendar,
  MessageSquare,
  ExternalLink,
  ChevronRight,
  Copy,
  Check,
  ArrowRightLeft,
  TimerReset,
  StickyNote,
  Pencil,
  X,
  Save,
  Loader2,
  PauseCircle,
  PlayCircle,
  UserCheck,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { LabelChip } from '@/components/labels/label-chip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  type LeadListRow,
  getUniqueLabels,
  getUniqueLabelIds,
  getLastMessageAt,
  getMaxPhase,
  isLeadAiPaused,
  isLeadBlocked,
  getAssignedSummary,
} from '@/lib/lead-list-query';
import {
  updateLead,
  applyLeadLabel,
  removeLeadLabel,
  assignLead,
  togglePauseLead,
  addContactNote,
  type ContactPipelineEvent,
  type ContactNote,
} from '@/lib/actions/contacts';
import { sendWelcomeFromPanel } from '@/lib/actions/welcome';
import type { LabelRow } from '@/lib/actions/labels';
import type { MemberRow } from '@/lib/actions/members';
import {
  formatLeadName,
  leadInitials,
  formatChannelLong,
  formatChannelShort,
  formatRelative,
  formatAbsoluteShort,
} from '@/components/conversation-layout/format-helpers';

interface Props {
  lead: LeadListRow;
  events: ContactPipelineEvent[];
  notes: ContactNote[];
  allLabels: LabelRow[];
  members: MemberRow[];
  viewerId: string;
  canWrite: boolean;
  showOpenInPage?: boolean;
}

export function ContactDetail({
  lead,
  events,
  notes,
  allLabels,
  members,
  viewerId,
  canWrite,
  showOpenInPage = false,
}: Props) {
  const router = useRouter();
  const labels = getUniqueLabels(lead);
  const appliedLabelIds = new Set(getUniqueLabelIds(lead));
  const lastMsgAt = getLastMessageAt(lead);
  const maxPhase = getMaxPhase(lead);
  const aiPaused = isLeadAiPaused(lead);
  const blocked = isLeadBlocked(lead);
  const assigned = getAssignedSummary(lead);
  const primaryChannel = lead.conversations[0];
  const hasWaChannel = lead.conversations.some((c) => c.channel_type === 'whatsapp');

  const leadFor = {
    first_name: lead.first_name,
    last_name: lead.last_name,
    username: lead.username,
    external_id: lead.external_id,
  };

  // ---- Acciones globales (header) ----
  const [pendingAi, startAiTransition] = useTransition();
  const onTogglePauseAi = () => {
    if (!canWrite || pendingAi) return;
    startAiTransition(async () => {
      const res = await togglePauseLead({ leadId: lead.id, paused: !aiPaused });
      if (!res.ok) toast.error(`Error: ${res.error}`);
      else {
        toast.success(aiPaused ? 'IA reanudada' : 'IA pausada');
        router.refresh();
      }
    });
  };

  const [pendingAssign, startAssignTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);
  const onAssign = (userId: string | null) => {
    if (!canWrite || pendingAssign) return;
    startAssignTransition(async () => {
      const res = await assignLead({ leadId: lead.id, userId });
      if (!res.ok) toast.error(`Error: ${res.error}`);
      else {
        toast.success(userId ? 'Contacto asignado' : 'Asignación quitada');
        router.refresh();
      }
      setAssignOpen(false);
    });
  };

  // ---- Enviar bienvenida WA (Hito 9 sub-fase 4) ----
  const [pendingWelcome, startWelcomeTransition] = useTransition();
  const onSendWelcome = () => {
    if (!canWrite || pendingWelcome) return;
    startWelcomeTransition(async () => {
      const res = await sendWelcomeFromPanel(lead.id);
      if (!res.ok) {
        if (res.code === 'no_welcome_template_configured') {
          toast.error('Designa una plantilla bienvenida en Configuración → Plantillas de seguimiento.');
        } else if (res.code === 'no_ycloud_account') {
          toast.error('YCloud no está conectado. Configúralo en Integraciones.');
        } else {
          toast.error(`Error: ${res.error}`);
        }
        return;
      }
      toast.success('Bienvenida enviada. La IA queda activa para este contacto.');
      router.refresh();
    });
  };

  // ---- Aplicar/quitar etiquetas ----
  const [pendingLabel, startLabelTransition] = useTransition();
  const onToggleLabel = (l: LabelRow) => {
    if (!canWrite || pendingLabel) return;
    const isApplied = appliedLabelIds.has(l.id);
    startLabelTransition(async () => {
      const res = isApplied
        ? await removeLeadLabel({ leadId: lead.id, labelId: l.id })
        : await applyLeadLabel({ leadId: lead.id, labelId: l.id });
      if (!res.ok) toast.error(`Error: ${res.error}`);
      else {
        toast.success(isApplied ? `Quitada "${l.name}"` : `Aplicada "${l.name}"`);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-0 h-full overflow-y-auto">
      {/* Header */}
      <header className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-start gap-3">
          <span
            className="size-12 rounded-full bg-muted text-foreground/90 flex items-center justify-center text-base font-semibold shrink-0"
            aria-hidden
          >
            {leadInitials(leadFor)}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-lg font-semibold leading-tight">
              {formatLeadName(leadFor)}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {primaryChannel
                ? formatChannelLong({
                    channel_type: primaryChannel.channel_type ?? 'unknown',
                    via_provider: primaryChannel.via_provider ?? 'unknown',
                  })
                : 'Sin canal'}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge>F{maxPhase}</Badge>
              {aiPaused ? (
                <Badge tone="amber">IA pausada</Badge>
              ) : (
                <Badge tone="emerald">IA activa</Badge>
              )}
              {blocked ? <Badge tone="rose">Bloqueado</Badge> : null}
              <Badge tone="muted">
                {lead.conversations.length} conv
                {lead.conversations.length === 1 ? '' : 's'}
              </Badge>
            </div>
          </div>
          {showOpenInPage ? (
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
              <Link href={`/contacts/${lead.id}`}>
                <ExternalLink className="size-3.5" />
                Página
              </Link>
            </Button>
          ) : null}
        </div>

        {/* Acciones globales */}
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={pendingAi}
              onClick={onTogglePauseAi}
              className="gap-1.5"
            >
              {pendingAi ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : aiPaused ? (
                <PlayCircle className="size-3.5" />
              ) : (
                <PauseCircle className="size-3.5" />
              )}
              {aiPaused ? 'Reanudar IA' : 'Pausar IA'}
            </Button>

            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                disabled={pendingAssign}
                onClick={() => setAssignOpen((v) => !v)}
                className="gap-1.5"
              >
                {pendingAssign ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserCheck className="size-3.5" />
                )}
                Asignar
              </Button>
              {assignOpen ? (
                <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-56 rounded-md border border-border bg-popover shadow-lg p-1 max-h-60 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => onAssign(null)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted"
                  >
                    <span className="italic">Sin asignar</span>
                  </button>
                  <div className="h-px bg-border my-1" />
                  {members.map((m) => {
                    const active = assigned.ids.includes(m.userId);
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => onAssign(m.userId)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted',
                          active && 'bg-muted',
                        )}
                      >
                        <span className="flex-1 truncate">
                          {m.fullName ?? m.email}
                          {m.userId === viewerId ? ' (yo)' : ''}
                        </span>
                        {active ? <Check className="size-3 text-success shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {hasWaChannel ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pendingWelcome}
                onClick={onSendWelcome}
                className="gap-1.5"
                title="Enviar plantilla de bienvenida WhatsApp via YCloud y activar IA"
              >
                {pendingWelcome ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Enviar bienvenida
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Datos del lead — editable */}
      <LeadDataSection lead={lead} canWrite={canWrite} />

      {/* Etiquetas */}
      <Section title="Etiquetas" icon={<ArrowRightLeft className="size-3.5" />}>
        {labels.length === 0 ? (
          <EmptyHint>Sin etiquetas aplicadas todavía.</EmptyHint>
        ) : (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {labels.map((l) => (
              <LabelChip
                key={l.id}
                label={l}
                size="sm"
                onRemove={canWrite ? () => onToggleLabel({
                  id: l.id,
                  name: l.name,
                  color: l.color,
                  description: null,
                  isSystem: false,
                  destinationBucket: null,
                  pauseAiOnApply: false,
                  resumeAiOnApply: false,
                  autoAssignTo: null,
                  conversationCount: 0,
                  activeRuleCount: 0,
                  createdAt: '',
                  updatedAt: '',
                } as LabelRow) : undefined}
              />
            ))}
          </div>
        )}
        {canWrite && allLabels.length > 0 ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-primary hover:underline">
              + Aplicar etiqueta…
            </summary>
            <ul className="mt-2 flex flex-col gap-0.5 max-h-48 overflow-y-auto rounded-md border border-border bg-card/50 p-1">
              {allLabels.map((l) => {
                const active = appliedLabelIds.has(l.id);
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => onToggleLabel(l)}
                      disabled={pendingLabel}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left',
                        active ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                      {active ? <Check className="size-3 text-success shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </Section>

      {/* Histórico conversaciones */}
      <Section
        title={`Histórico (${lead.conversations.length})`}
        icon={<MessageSquare className="size-3.5" />}
      >
        {lead.conversations.length === 0 ? (
          <EmptyHint>Este contacto aún no tiene conversaciones.</EmptyHint>
        ) : (
          <ul className="flex flex-col gap-2">
            {lead.conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/conversations?selected=${c.id}`}
                  className="block rounded-md border border-border bg-card hover:bg-muted/40 p-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground border border-border rounded px-1 py-px">
                          {formatChannelShort({
                            channel_type: c.channel_type ?? 'unknown',
                            via_provider: c.via_provider ?? 'unknown',
                          })}
                        </span>
                        <Badge>F{c.phase_number}</Badge>
                        <Badge tone="muted">{c.state}</Badge>
                        {c.is_handoff_to_human ? <Badge tone="amber">Handoff</Badge> : null}
                        {c.is_qualified === true ? (
                          <Badge tone="emerald">Cualificado</Badge>
                        ) : null}
                        {c.is_qualified === false ? (
                          <Badge tone="rose">No cualificado</Badge>
                        ) : null}
                      </div>
                      {c.labels.length > 0 ? (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {c.labels.map((l) => (
                            <LabelChip key={l.id} label={l} size="mini" />
                          ))}
                        </div>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Creada {formatAbsoluteShort(c.created_at)}
                        {c.last_message_at
                          ? ` · último ${formatRelative(c.last_message_at)}`
                          : ' · sin mensajes'}
                      </p>
                      {c.handoff_cause ? (
                        <p className="text-[11px] text-warning mt-0.5">
                          Handoff: {c.handoff_cause}
                          {c.handoff_reason ? ` — ${c.handoff_reason}` : ''}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Pipeline timeline */}
      <Section
        title={`Pipeline (${events.length})`}
        icon={<TimerReset className="size-3.5" />}
      >
        {events.length === 0 ? (
          <EmptyHint>Sin eventos registrados todavía.</EmptyHint>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[12px] leading-tight">
                <span
                  className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {describeEvent(e)}
                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                      · {e.source}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {formatAbsoluteShort(e.occurredAt)} · conv {e.conversationId}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Notas internas */}
      <NotesSection leadId={lead.id} notes={notes} canWrite={canWrite} />

      {/* Última fecha y datos timeline */}
      <Section title="Línea de tiempo" icon={<Calendar className="size-3.5" />}>
        <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
          <KV label="Creado" value={formatAbsoluteShort(lead.created_at)} />
          <KV
            label="Último mensaje"
            value={lastMsgAt ? formatAbsoluteShort(lastMsgAt) : 'Nunca'}
          />
          <KV
            label="Actualizado"
            value={formatAbsoluteShort(lead.updated_at)}
          />
        </dl>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeadDataSection — datos editables
// ---------------------------------------------------------------------------

function LeadDataSection({ lead, canWrite }: { lead: LeadListRow; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [firstName, setFirstName] = useState(lead.first_name ?? '');
  const [lastName, setLastName] = useState(lead.last_name ?? '');
  const [username, setUsername] = useState(lead.username ?? '');
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [location, setLocation] = useState(lead.location ?? '');
  const [notes, setNotes] = useState(lead.notes ?? '');

  const onCancel = () => {
    setFirstName(lead.first_name ?? '');
    setLastName(lead.last_name ?? '');
    setUsername(lead.username ?? '');
    setPhone(lead.phone ?? '');
    setEmail(lead.email ?? '');
    setLocation(lead.location ?? '');
    setNotes(lead.notes ?? '');
    setEditing(false);
  };

  const onSave = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await updateLead({
        leadId: lead.id,
        patch: {
          firstName,
          lastName,
          username,
          phone,
          email,
          location,
          notes,
        },
      });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Datos actualizados');
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <section className="px-5 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Hash className="size-3.5" />
          Datos del contacto
        </h3>
        {canWrite ? (
          editing ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={pending}
                className="h-7 gap-1 text-[11px]"
              >
                <X className="size-3" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={onSave}
                disabled={pending}
                className="h-7 gap-1 text-[11px]"
              >
                {pending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                Guardar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              className="h-7 gap-1 text-[11px]"
            >
              <Pencil className="size-3" />
              Editar
            </Button>
          )
        ) : null}
      </div>

      {editing ? (
        <div className="grid grid-cols-1 gap-2.5 text-sm">
          <FieldEdit label="Nombre" value={firstName} onChange={setFirstName} />
          <FieldEdit label="Apellidos" value={lastName} onChange={setLastName} />
          <FieldEdit label="Username" value={username} onChange={setUsername} />
          <FieldEdit label="Teléfono" value={phone} onChange={setPhone} type="tel" />
          <FieldEdit label="Email" value={email} onChange={setEmail} type="email" />
          <FieldEdit label="Ubicación" value={location} onChange={setLocation} />
          <FieldEdit label="Notas" value={notes} onChange={setNotes} multiline />
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-y-2 text-sm">
          <DataRow icon={<Phone className="size-3.5" />} label="Teléfono" value={lead.phone} />
          <DataRow icon={<Mail className="size-3.5" />} label="Email" value={lead.email} />
          <DataRow
            icon={<AtSign className="size-3.5" />}
            label="Username"
            value={lead.username ? `@${lead.username}` : null}
          />
          <DataRow
            icon={<MapPin className="size-3.5" />}
            label="Ubicación"
            value={lead.location}
          />
          <DataRow
            icon={<Hash className="size-3.5" />}
            label="External ID"
            value={lead.external_id}
            mono
          />
        </dl>
      )}
      {!editing && lead.notes ? (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Notas</p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// NotesSection — añadir nota
// ---------------------------------------------------------------------------

function NotesSection({
  leadId,
  notes,
  canWrite,
}: {
  leadId: number;
  notes: ContactNote[];
  canWrite: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onAdd = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    if (pending) return;
    startTransition(async () => {
      const res = await addContactNote({ leadId, content: trimmed });
      if (!res.ok) toast.error(`Error: ${res.error}`);
      else {
        toast.success('Nota añadida');
        setDraft('');
        router.refresh();
      }
    });
  };

  return (
    <Section title={`Notas (${notes.length})`} icon={<StickyNote className="size-3.5" />}>
      {canWrite ? (
        <div className="flex flex-col gap-1.5 mb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Añadir una nota interna…"
            className="w-full rounded-md border border-border bg-background text-sm p-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={onAdd}
              disabled={pending || draft.trim().length === 0}
              className="h-7 gap-1 text-[11px]"
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : null}
              Añadir nota
            </Button>
          </div>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <EmptyHint>Sin notas internas todavía.</EmptyHint>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border bg-card/50 p-2.5 text-sm">
              <p className="whitespace-pre-wrap leading-snug">{n.content}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums mt-1.5">
                {n.authorEmail ?? 'sin autor'} · {formatAbsoluteShort(n.createdAt)} · conv{' '}
                {n.conversationId}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-4 border-b border-border">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function FieldEdit({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-background text-sm p-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      )}
    </div>
  );
}

function DataRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="flex items-center gap-2 group">
      <span className="text-muted-foreground shrink-0" aria-hidden>
        {icon}
      </span>
      <dt className="text-xs text-muted-foreground w-20 shrink-0">{label}</dt>
      <dd className={cn('flex-1 min-w-0 truncate', mono && 'font-mono text-xs')}>
        {value ?? <span className="italic text-muted-foreground/70">—</span>}
      </dd>
      {value ? (
        <button
          type="button"
          onClick={onCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label={`Copiar ${label}`}
        >
          {copied ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-muted-foreground w-24 shrink-0">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'muted' | 'amber' | 'emerald' | 'rose';
}) {
  const cls =
    tone === 'amber'
      ? 'border-warning/40 bg-warning/10 text-warning'
      : tone === 'emerald'
        ? 'border-success/40 bg-success/10 text-success'
        : tone === 'rose'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : tone === 'muted'
            ? 'border-border bg-muted text-muted-foreground'
            : 'border-primary/40 bg-primary/10 text-primary';
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium border',
        cls,
      )}
    >
      {children}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground italic">{children}</p>;
}

function describeEvent(e: ContactPipelineEvent): string {
  if (e.eventType === 'phase_change') {
    return `Fase ${e.fromValue ?? '?'} → ${e.toValue}`;
  }
  if (e.eventType === 'outcome_applied') {
    return `Outcome aplicado: ${e.toValue}`;
  }
  return `Outcome quitado: ${e.toValue}`;
}
