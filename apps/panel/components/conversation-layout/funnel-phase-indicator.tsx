'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Activity,
  HandHeart,
  Loader2,
  Sparkles,
  RefreshCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isAiPaused } from './format-helpers';
import {
  analyzeConversationOnDemand,
  type ConversationAnalysis,
} from '@/lib/actions/analyze-conversation';
import type { SelectedConversationDetail, TimelineMessage } from './types';

interface Props {
  detail: SelectedConversationDetail;
  messages: TimelineMessage[];
}

const PHASE_LABELS: Record<number, string> = {
  1: 'Apertura',
  2: 'Profundizar',
  3: 'Cualificación',
  4: 'Puente',
  5: 'Propuesta',
  6: 'Link agenda',
  7: 'Cita agendada',
};

const HANDOFF_CAUSE_LABELS: Record<string, string> = {
  A_agenda: 'Cita agendada',
  B_delicada: 'Situación delicada',
  C_descualificado: 'Descualificado',
  D_setter_imposible: 'Setter imposible',
};

interface Insight {
  label: string;
  value: string | null;
  muted?: boolean;
}

// Cache de 2 niveles para minimizar llamadas a Claude:
//   - L1: module-scope LRU (hit dentro de la sesión, sin tocar localStorage).
//   - L2: localStorage (persiste entre refreshes y reinicios del browser).
//
// Clave: `${conversationId}:${lastMessageId}`. La clave cambia cuando llega un
// mensaje nuevo → invalidación automática. Si la conv lleva mucho sin
// actividad nueva, el análisis se reutiliza indefinidamente (coste 0).
//
// Por qué localStorage y no Supabase: para uso single-trainer single-browser es
// suficiente y evita una nueva tabla + migración. Si necesitas compartir
// análisis entre dispositivos o trainers, ver opción 4 del análisis de costes.
const ANALYSIS_CACHE = new Map<string, ConversationAnalysis>();
const CACHE_LIMIT_MEMORY = 30;
const CACHE_LIMIT_LOCAL_STORAGE = 80;
const CACHE_LOCAL_STORAGE_PREFIX = 'fyzon:analysis:v1:';
const CACHE_LOCAL_STORAGE_INDEX_KEY = 'fyzon:analysis:v1:index';

function cacheKey(conversationId: number, lastMessageId: number | null): string {
  return `${conversationId}:${lastMessageId ?? 'none'}`;
}

function getCached(key: string): ConversationAnalysis | null {
  // L1: memoria
  const inMem = ANALYSIS_CACHE.get(key);
  if (inMem) return inMem;
  // L2: localStorage
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_LOCAL_STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConversationAnalysis;
    // Re-hidratar a L1 para próximas lecturas en esta sesión
    ANALYSIS_CACHE.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function rememberAnalysis(key: string, analysis: ConversationAnalysis) {
  // L1
  if (ANALYSIS_CACHE.has(key)) ANALYSIS_CACHE.delete(key);
  ANALYSIS_CACHE.set(key, analysis);
  while (ANALYSIS_CACHE.size > CACHE_LIMIT_MEMORY) {
    const oldest = ANALYSIS_CACHE.keys().next().value;
    if (oldest == null) break;
    ANALYSIS_CACHE.delete(oldest);
  }
  // L2
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_LOCAL_STORAGE_PREFIX + key, JSON.stringify(analysis));
    // Mantener índice LRU para purgar viejos sin escanear todo localStorage
    const indexRaw = window.localStorage.getItem(CACHE_LOCAL_STORAGE_INDEX_KEY);
    const index: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
    const filtered = index.filter((k) => k !== key);
    filtered.push(key);
    while (filtered.length > CACHE_LIMIT_LOCAL_STORAGE) {
      const oldest = filtered.shift();
      if (oldest) window.localStorage.removeItem(CACHE_LOCAL_STORAGE_PREFIX + oldest);
    }
    window.localStorage.setItem(CACHE_LOCAL_STORAGE_INDEX_KEY, JSON.stringify(filtered));
  } catch {
    // localStorage lleno o deshabilitado: degradar silenciosamente a solo L1.
  }
}

export function FunnelPhaseIndicator({ detail, messages }: Props) {
  const [expanded, setExpanded] = useState(true);

  const phaseLabel = PHASE_LABELS[detail.phaseNumber] ?? '—';
  const paused = isAiPaused(detail.aiPausedUntil);
  const handoffActive = detail.isHandoffToHuman === true;

  // ---------------- Generator persistido (BD) -------------------------------
  const persistedAnalysis: ConversationAnalysis = {
    currentContext: detail.currentContext,
    emotion: detail.emotion,
    problem: detail.problem,
    goal: detail.goal,
    urgency: detail.urgency,
    nextAction: detail.nextAction,
    generalContext: detail.generalContext,
    generalMotivation: detail.generalMotivation,
  };
  const persistedFilledCount = countFilled(persistedAnalysis);
  const persistedHasData = persistedFilledCount > 0;

  // ---------------- Análisis on-demand (Claude Haiku) -----------------------
  // Se invoca cuando NO hay nada persistido del Generator, para que el panel
  // siempre tenga razonamiento aunque la conv esté en handoff/pausada/sin turnos.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]!.id : null;
  const cacheKeyValue = cacheKey(detail.id, lastMessageId);

  const [onDemand, setOnDemand] = useState<ConversationAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Re-sync cuando cambia la cache key (conv distinta o nuevo mensaje).
  // `getCached` consulta L1 (memoria) y L2 (localStorage). En L2 hit, también
  // re-hidrata L1 para próximas lecturas de la sesión.
  useEffect(() => {
    setOnDemand(getCached(cacheKeyValue));
    setError(null);
  }, [cacheKeyValue]);

  const shouldAutoLoad =
    !persistedHasData && messages.length > 0 && onDemand == null && !loading && !error;

  useEffect(() => {
    if (!shouldAutoLoad) return;
    void runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoLoad]);

  async function runAnalysis() {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const result = await analyzeConversationOnDemand({ conversationId: detail.id });
    if (reqId !== requestIdRef.current) return; // descartar si llegó otra req mientras tanto
    if (result.ok) {
      rememberAnalysis(cacheKeyValue, result.data);
      setOnDemand(result.data);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  // ---------------- Análisis efectivo a mostrar -----------------------------
  // Prioridad: Generator persistido (autoridad del motor) > on-demand (fallback).
  const effectiveAnalysis: ConversationAnalysis = persistedHasData ? persistedAnalysis : onDemand ?? EMPTY_ANALYSIS;
  const effectiveSource: 'persisted' | 'on_demand' | 'none' = persistedHasData
    ? 'persisted'
    : onDemand
      ? 'on_demand'
      : 'none';

  const turnInsights: Insight[] = [
    { label: 'Contexto actual', value: effectiveAnalysis.currentContext },
    { label: 'Emoción', value: effectiveAnalysis.emotion },
    { label: 'Problema', value: effectiveAnalysis.problem },
    { label: 'Objetivo', value: effectiveAnalysis.goal },
    { label: 'Urgencia', value: effectiveAnalysis.urgency },
    { label: 'Próximo paso', value: effectiveAnalysis.nextAction },
  ];
  const generalInsights: Insight[] = [
    { label: 'Contexto general', value: effectiveAnalysis.generalContext, muted: true },
    { label: 'Motivación general', value: effectiveAnalysis.generalMotivation, muted: true },
  ];
  const filledTurn = turnInsights.filter((it) => hasValue(it.value));
  const filledGeneral = generalInsights.filter((it) => hasValue(it.value));
  const effectiveFilled = filledTurn.length + filledGeneral.length;
  const effectiveTotal = turnInsights.length + generalInsights.length;

  // ---------------- Hechos (números clave) -----------------------------------
  const facts = useMemo(() => deriveFacts(messages, detail), [messages, detail]);

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Fase del funnel</CardTitle>
          <Badge variant="secondary" className="font-mono">
            F{detail.phaseNumber}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {phaseLabel}
          {detail.phaseMessageCount > 0 ? (
            <>
              {' '}
              · {detail.phaseMessageCount}{' '}
              {detail.phaseMessageCount === 1 ? 'mensaje' : 'mensajes'} en esta fase
            </>
          ) : null}
        </p>
        {/* Badges contextuales — informan del estado del setter sin bloquear el panel. */}
        {handoffActive || paused ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {handoffActive ? (
              <Badge
                variant="outline"
                className="border-warning/40 text-warning bg-warning/10 gap-1 h-5 text-[10px] font-medium"
              >
                <HandHeart className="size-2.5" />
                Handoff
                {detail.handoffCause
                  ? ` · ${HANDOFF_CAUSE_LABELS[detail.handoffCause] ?? detail.handoffCause}`
                  : ''}
              </Badge>
            ) : null}
            {paused && !handoffActive ? (
              <Badge
                variant="outline"
                className="border-warning/40 text-warning bg-warning/10 gap-1 h-5 text-[10px] font-medium"
              >
                <Pause className="size-2.5" />
                IA pausada
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* SECCIÓN 1 — HECHOS (números clave, no fechas).
            Solo lo esencial: totales y reparto lead/setter + count en la fase. */}
        <section className="flex flex-col gap-2">
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
            <Activity className="size-3" />
            Hechos
          </h4>
          {facts.totalMessages === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sin mensajes todavía.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <NumberCell label="Totales" value={facts.totalMessages} />
              <NumberCell
                label="Lead / Setter"
                value={`${facts.leadMessages} / ${facts.aiMessages}`}
                isString
              />
              <NumberCell label="En esta fase" value={detail.phaseMessageCount} />
            </div>
          )}
        </section>

        {/* SECCIÓN 2 — ANÁLISIS DEL SETTER. Siempre presente:
            - Si Generator persistió → muestra esos datos (autoridad del motor).
            - Si no → invoca Claude Haiku on-demand y muestra el resultado.
            - Mientras carga → skeleton.
            - Si falla → mensaje + botón reintentar. */}
        <section className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center justify-between gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={expanded}
          >
            <span className="flex items-center gap-1.5">
              {expanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              Análisis del setter
              {effectiveSource === 'on_demand' ? (
                <Sparkles className="size-3 text-primary" aria-label="Análisis generado on-demand" />
              ) : null}
            </span>
            {effectiveFilled > 0 ? (
              <span className="tabular-nums text-[10px] font-mono normal-case text-muted-foreground/70">
                {effectiveFilled}/{effectiveTotal}
              </span>
            ) : null}
          </button>

          {expanded ? (
            <AnalysisBody
              loading={loading}
              error={error}
              filledTurn={filledTurn}
              filledGeneral={filledGeneral}
              effectiveFilled={effectiveFilled}
              effectiveTotal={effectiveTotal}
              effectiveSource={effectiveSource}
              hasMessages={messages.length > 0}
              onRetry={runAnalysis}
            />
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Análisis body (loading / error / data / empty)
// =============================================================================

function AnalysisBody({
  loading,
  error,
  filledTurn,
  filledGeneral,
  effectiveFilled,
  effectiveTotal,
  effectiveSource,
  hasMessages,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  filledTurn: Insight[];
  filledGeneral: Insight[];
  effectiveFilled: number;
  effectiveTotal: number;
  effectiveSource: 'persisted' | 'on_demand' | 'none';
  hasMessages: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-full rounded bg-muted/60 animate-pulse" />
            <div className="h-3.5 w-4/5 rounded bg-muted/60 animate-pulse" />
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground/70 italic flex items-center gap-1.5 mt-1">
          <Loader2 className="size-3 animate-spin" />
          Analizando la conversación…
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-destructive">
          No pude generar el análisis: {error}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="self-start">
          <RefreshCcw className="size-3" />
          Reintentar
        </Button>
      </div>
    );
  }
  if (effectiveFilled === 0) {
    if (!hasMessages) {
      return (
        <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed">
          Aún sin mensajes para analizar.
        </p>
      );
    }
    return (
      <p className="text-[11px] text-muted-foreground/80 italic leading-relaxed">
        Sin datos disponibles.
      </p>
    );
  }
  return (
    // Scroll interno: el análisis puede ser largo (8 campos × ~50 chars cada).
    // En lugar de empujar el panel entero (forzando scroll del aside), lo
    // contenemos en max-h con su propio overflow-y. El aside sigue scrolleando
    // las OTRAS secciones (Hechos, Control IA, Followups) con normalidad.
    <dl className="flex flex-col gap-2.5 text-sm max-h-[420px] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/70">
      {filledTurn.map((it) => (
        <InsightRow key={it.label} label={it.label} value={it.value!} />
      ))}
      {filledGeneral.length > 0 ? (
        <div className="border-t border-border/60 pt-2.5 mt-1 flex flex-col gap-2.5">
          {filledGeneral.map((it) => (
            <InsightRow key={it.label} label={it.label} value={it.value!} muted />
          ))}
        </div>
      ) : null}
      {effectiveSource !== 'on_demand' && effectiveFilled < effectiveTotal ? (
        <p className="text-[10px] text-muted-foreground/70 italic mt-1">
          El setter rellena más campos a medida que procesa turnos del lead.
        </p>
      ) : null}
    </dl>
  );
}

// =============================================================================
// Sub-componentes
// =============================================================================

const EMPTY_ANALYSIS: ConversationAnalysis = {
  currentContext: null,
  emotion: null,
  problem: null,
  goal: null,
  urgency: null,
  nextAction: null,
  generalContext: null,
  generalMotivation: null,
};

function hasValue(value: string | null): boolean {
  return value != null && value.trim().length > 0;
}

function countFilled(a: ConversationAnalysis): number {
  return [
    a.currentContext,
    a.emotion,
    a.problem,
    a.goal,
    a.urgency,
    a.nextAction,
    a.generalContext,
    a.generalMotivation,
  ].filter(hasValue).length;
}

function InsightRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt
        className={cn(
          'text-[10px] uppercase tracking-wider',
          muted ? 'text-muted-foreground/60' : 'text-muted-foreground',
        )}
      >
        {label}
      </dt>
      <dd className="text-sm whitespace-pre-wrap break-words text-foreground">{value}</dd>
    </div>
  );
}

interface DerivedFacts {
  totalMessages: number;
  leadMessages: number;
  aiMessages: number;
  humanMessages: number;
}

function deriveFacts(
  messages: TimelineMessage[],
  _detail: SelectedConversationDetail,
): DerivedFacts {
  let leadCount = 0;
  let aiCount = 0;
  let humanCount = 0;
  for (const m of messages) {
    if (m.source === 'lead') leadCount++;
    else if (m.source === 'ai') aiCount++;
    else if (m.source === 'human') humanCount++;
  }
  return {
    totalMessages: messages.length,
    leadMessages: leadCount,
    aiMessages: aiCount,
    humanMessages: humanCount,
  };
}

function NumberCell({
  label,
  value,
  isString,
}: {
  label: string;
  value: number | string;
  isString?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0 rounded-md bg-muted/30 border border-border/40 p-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium truncate">
        {label}
      </dt>
      <dd
        className={cn(
          'font-bold text-foreground tabular-nums truncate',
          isString ? 'text-base' : 'text-lg',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
