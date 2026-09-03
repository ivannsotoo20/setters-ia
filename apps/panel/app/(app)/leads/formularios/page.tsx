import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listLeadFormSubmissions,
  type LeadFormSubmissionRow,
} from '@/lib/actions/lead-form-submissions';
import {
  LEAD_FORM_DECISIONS,
  LEAD_FORM_DECISION_LABELS,
  LEAD_FORM_EVALUATOR_LABELS,
  parseLeadFormDecision,
  type LeadFormDecision,
} from '@/lib/lead-form-submissions-query';

export const dynamic = 'force-dynamic';

/**
 * /leads/formularios — qué formularios han llegado y qué hizo el filtro con
 * cada uno (2026-09-03). Lee `lead_form_submissions`, que escribe el motor en
 * POST /automations/lead-form. Filtro por decisión vía `?decision=`.
 */

interface PageProps {
  searchParams: Promise<{ decision?: string }>;
}

const DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // El servidor (Vercel) corre en UTC; la entrenadora está en España.
  timeZone: 'Europe/Madrid',
});

const DECISION_BADGE_VARIANT: Record<LeadFormDecision, 'success' | 'destructive' | 'outline'> = {
  aprobado: 'success',
  rechazado: 'destructive',
  sin_filtro: 'outline',
};

export default async function LeadFormSubmissionsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const decision = parseLeadFormDecision(sp.decision);
  const result = await listLeadFormSubmissions({ decision });

  const rows = result.ok ? result.data : [];
  const counts = result.ok ? result.counts : { aprobado: 0, rechazado: 0, sin_filtro: 0 };
  const total = counts.aprobado + counts.rechazado + counts.sin_filtro;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Leads</p>
          <h1 className="text-2xl font-semibold tracking-tight">Formularios recibidos</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cada persona que rellena tu formulario aparece aquí con lo que decidió el filtro:
            si se aprobó, recibió tu bienvenida por WhatsApp; si se rechazó, verás el motivo.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip href="/leads/formularios" active={decision === null} label="Todos" count={total} />
        {LEAD_FORM_DECISIONS.map((d) => (
          <FilterChip
            key={d}
            href={`/leads/formularios?decision=${d}`}
            active={decision === d}
            label={LEAD_FORM_DECISION_LABELS[d]}
            count={counts[d]}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {decision ? LEAD_FORM_DECISION_LABELS[decision] : 'Todos'} ({rows.length})
          </CardTitle>
          <CardDescription>
            Los 200 más recientes. El teléfono se muestra solo por sus últimos dígitos; el
            completo está en la ficha de contacto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">
              No se han podido cargar los formularios: {result.error}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {decision
                ? `Ningún formulario con decisión «${LEAD_FORM_DECISION_LABELS[decision]}».`
                : 'Todavía no ha llegado ningún formulario.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Fecha</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="whitespace-nowrap">Teléfono</TableHead>
                  <TableHead>Decisión</TableHead>
                  <TableHead className="min-w-64">Motivo</TableHead>
                  <TableHead className="whitespace-nowrap">Decidió</TableHead>
                  <TableHead className="whitespace-nowrap">Bienvenida</TableHead>
                  <TableHead className="text-right">Conversación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <SubmissionRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Button asChild variant={active ? 'default' : 'outline'} size="sm">
      <Link href={href} aria-current={active ? 'page' : undefined}>
        {label}
        <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
      </Link>
    </Button>
  );
}

function SubmissionRow({ row }: { row: LeadFormSubmissionRow }) {
  const answerEntries = Object.entries(row.answers);
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {DATE_FMT.format(new Date(row.receivedAt))}
      </TableCell>
      <TableCell>
        <div className="font-medium">{row.firstName ?? <span className="text-muted-foreground">Sin nombre</span>}</div>
        {answerEntries.length > 0 ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Ver respuestas ({answerEntries.length})
            </summary>
            <dl className="mt-2 space-y-1.5 max-w-md">
              {answerEntries.map(([label, value]) => (
                <div key={label}>
                  <dt className="font-medium text-foreground/80">{label}</dt>
                  <dd className="whitespace-pre-wrap break-words">{formatAnswer(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {row.phoneMasked ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <Badge variant={DECISION_BADGE_VARIANT[row.decision]}>
          {LEAD_FORM_DECISION_LABELS[row.decision]}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground max-w-md">
        {row.motivo ?? '—'}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">
        {LEAD_FORM_EVALUATOR_LABELS[row.evaluadoPor]}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <WelcomeCell row={row} />
      </TableCell>
      <TableCell className="text-right">
        {row.conversationId != null ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/conversations?selected=${row.conversationId}`}>
              Abrir
              <ExternalLink className="ml-1 size-3.5" />
            </Link>
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function WelcomeCell({ row }: { row: LeadFormSubmissionRow }) {
  if (row.welcomeSent) return <Badge variant="success">Enviada</Badge>;
  if (row.decision === 'rechazado') {
    return <span className="text-sm text-muted-foreground">No procede</span>;
  }
  if (row.error) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="warning">No enviada</Badge>
        <span className="text-[11px] text-muted-foreground max-w-48 truncate" title={row.error}>
          {row.error}
        </span>
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground">No enviada</span>;
}

function formatAnswer(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatAnswer).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
