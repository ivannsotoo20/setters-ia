/**
 * Endpoint POST /internal/simulate — simulador de conversación.
 *
 * Deja que el entrenador pruebe a su setter antes de exponerlo a leads reales:
 * elige de dónde viene la persona y por qué canal, escribe como si fuera ella, y
 * ve la respuesta. Nació de la migración de Tania, que venía de otra herramienta
 * y no quería lanzar sin ver antes cómo se comporta.
 *
 * Auth: Bearer `INTERNAL_STATS_TOKEN` (tráfico panel→motor, nunca del browser).
 *
 * ============================================================================
 * QUÉ VALIDA ESTE SIMULADOR Y QUÉ NO. Leer antes de fiarse de él.
 * ============================================================================
 *
 * SÍ valida: lo que el setter DICE. Voz, criterios de cualificación, manejo de
 * objeciones, cuándo propone la llamada, cómo cierra. Compone el prompt con el
 * MISMO código que producción (mismo composer, mismo coach, mismas preferencias
 * del entrenador, misma directiva de procedencia) y corre las tres etapas reales
 * contra Anthropic.
 *
 * También el ENLACE de agenda: se resuelve el mismo calendario que resolvería
 * producción para ese canal y se construye con el mismo builder. Lo único que
 * cambia es el slug de tracking, que no puede existir porque no hay lead. Ojo:
 * el enlace es REAL y reservar desde él crea una cita de verdad en el
 * calendario, que entrará como `unmatched` por ese slug.
 *
 * Y la ZONA (2026-09-26): con `phone` en el body, el prefijo se evalúa contra la
 * política del tenant igual que en producción (directiva, focal de cierre, V20 y
 * V21). Sin `phone`, solo las menciones del chat. Diferencia a conocer: si V20 o
 * V21 tumban el turno, aquí se devuelve `rejected`; en producción la IA se pausa
 * y se avisa a la entrenadora.
 *
 * NO valida la fontanería: webhooks, GHL, el debounce que agrupa mensajes
 * seguidos, los tiempos de envío, el troceado real en burbujas separadas ni el
 * etiquetado. Nada de eso se ejecuta aquí.
 *
 * Confundir ambas cosas es peligroso: dar el visto bueno en el simulador y que
 * producción se comporte distinto quema la confianza del entrenador por segunda
 * vez. La fontanería se valida con un mensaje real desde una cuenta de prueba.
 *
 * ============================================================================
 * NO ESCRIBE NADA
 * ============================================================================
 * `runPipeline` y sus tres etapas no tocan la base de datos (verificado: cero
 * INSERT/UPDATE en pipeline/generator/judge/splitter). La única escritura es el
 * registro de llamadas al LLM, que va con `conversation_id = null` y marcado
 * como simulado, y que no alimenta ninguna métrica del panel.
 *
 * No se crea lead, ni conversación, ni mensaje, ni envío.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { runPipeline } from '@fyzon/agent-pipeline';
import { env } from '../config/env.js';
import { getAnthropicForTenant } from '../lib/anthropic.js';
import { getSupabase } from '../lib/supabase.js';
import { extractBearer, isValidBearer } from '../lib/timing-safe-bearer.js';
import { buildPhaseFocusInstruction } from '../lib/phase-focus.js';
import { detectAddressing, buildMirrorLeadDirective } from '../lib/detect-addressing.js';
import {
  buildLeadOriginDirective,
  combineSystemDirectives,
  mapConversationSourceToOrigin,
  type LeadChannel,
} from '../lib/lead-origin.js';
import {
  evaluateZone,
  isZoneRejectVerdict,
  loadZonePolicy,
  type ZoneVerdict,
} from '../lib/zone-policy.js';
import { pickResidenceAnswer } from '../services/lead-qualifier.js';
import { loadSchedulingConfig } from '../services/process-debounced.js';
import {
  getSimulatedCalendarUrl,
  SIMULATION_TRACKING_SLUG,
  type SimulatedCalendarUrlResult,
} from '../services/tracked-calendar-url.js';

const bodySchema = z.object({
  tenant_id: z.number().int().positive(),
  /** De dónde viene. Los mismos valores que `conversations.conversation_source`. */
  origin: z.enum(['bienvenida', 'lm', 'inbound', 'manual']).nullable().optional(),
  channel: z.enum(['instagram_dm', 'whatsapp', 'facebook_messenger']).default('instagram_dm'),
  phase: z.number().int().min(1).max(7).default(1),
  /** Lo que escribe la persona en este turno. */
  message: z.string().min(1).max(4000),
  /** Turnos anteriores. `user` = la persona, `assistant` = el setter. */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(60)
    .default([]),
  /** Respuestas de un formulario, para simular el caso de lead con contexto previo. */
  form_answers: z.record(z.string(), z.unknown()).nullable().optional(),
  /**
   * Teléfono de la persona simulada, en E.164 (+51987654321). Con él, la zona se
   * evalúa por prefijo igual que en producción: sin esto el simulador no podía
   * reproducir el caso que más ha fallado (un +51 o un +57 que el setter llevaba
   * a llamada). Sin teléfono se evalúan solo las menciones del chat.
   */
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'phone va en E.164: "+" y el número completo, sin espacios')
    .nullable()
    .optional(),
});

/**
 * Lo que el simulador enseña de la zona: el veredicto y, si lo decidió el
 * prefijo, el país (ISO). Nunca el teléfono.
 */
function describeZone(zone: ZoneVerdict): {
  kind: ZoneVerdict['kind'];
  country?: string;
  term?: string;
  declared?: string;
} {
  switch (zone.kind) {
    case 'reject_by_prefix':
    case 'in_zone_by_prefix':
      return { kind: zone.kind, country: zone.country.iso };
    case 'prefix_out_residence_in':
      return { kind: zone.kind, country: zone.country.iso, declared: zone.declaredIso };
    case 'mention':
    case 'reject_by_declaration':
      return { kind: zone.kind, term: zone.term };
    case 'clear':
      return { kind: zone.kind };
  }
}

export async function internalSimulateRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: unknown }>(
    '/internal/simulate',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const expected = env.INTERNAL_STATS_TOKEN;
      if (!expected) {
        return reply.code(503).send({
          error: 'not_configured',
          message:
            'INTERNAL_STATS_TOKEN no configurado. Generar con `openssl rand -hex 32` y ponerlo en .env.local.',
        });
      }
      const provided = extractBearer(request.headers.authorization);
      if (!provided || !isValidBearer(provided, expected)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      let body: z.infer<typeof bodySchema>;
      try {
        body = bodySchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.code(400).send({ error: 'invalid_payload', issues: err.flatten() });
        }
        throw err;
      }

      const supabase = getSupabase();
      // Por tenant: el entrenador prueba con SU clave, igual que en produccion.
      const anthropic = await getAnthropicForTenant(supabase, body.tenant_id);

      // Mismas preferencias que usaría producción para este tenant: tope de
      // burbujas, palabras prohibidas y tratamiento. Si el simulador usara otras,
      // estaría enseñando un setter que no existe.
      const schedulingConfig = await loadSchedulingConfig(supabase, body.tenant_id);

      // Zona: la misma política y la misma evaluación que producción
      // (process-debounced). El prefijo, si llega teléfono; si no, las menciones
      // del chat: lo que la persona escribió en los turnos anteriores y en este.
      const zonePolicy = await loadZonePolicy(supabase, body.tenant_id);
      const zoneVerdict = evaluateZone({
        phone: body.phone ?? null,
        leadMessages: [
          ...body.history.filter((h) => h.role === 'user').map((h) => h.content),
          body.message,
        ],
        policy: zonePolicy,
        declaredResidence: body.form_answers
          ? pickResidenceAnswer(body.form_answers, /vives|pa[ií]s|residencia|resides/i, null)?.value ?? null
          : null,
      });
      const zoneHandoff = zoneVerdict.kind === 'prefix_out_residence_in';
      const zoneRejected = isZoneRejectVerdict(zoneVerdict) || zoneHandoff;

      // Con la zona rechazada, la focal es la del cierre por residencia (o la del
      // paso a la entrenadora) y no la de la fase, igual que en producción.
      const currentPhaseFocus = buildPhaseFocusInstruction(body.phase, false, {
        zoneClose: zoneRejected,
        zoneHandoff,
      });

      let expectedAddressing: 'tu' | 'usted' | undefined;
      let addressingDirective: string | null = null;
      if (
        schedulingConfig.addressingMode === 'tu' ||
        schedulingConfig.addressingMode === 'usted'
      ) {
        expectedAddressing = schedulingConfig.addressingMode;
      } else {
        addressingDirective = buildMirrorLeadDirective(detectAddressing(body.message));
      }

      // El enlace de agenda: mismo calendario y mismo builder que produccion,
      // con un slug de tracking de simulacion porque aqui no hay lead. Sin esto
      // el entrenador validaba la fase 6 viendo el respaldo del placeholder, que
      // no es lo que reciben sus leads.
      //
      // No fatal, igual que en produccion: si esto falla, el turno sigue y el
      // setter cae al respaldo de su bloque.
      let calendar: SimulatedCalendarUrlResult = { url: null, reason: 'no_calendar' };
      try {
        calendar = await getSimulatedCalendarUrl({
          supabase,
          tenantId: body.tenant_id,
          channelKind: body.channel,
        });
      } catch (err) {
        request.log.warn(
          { tenantId: body.tenant_id, err: err instanceof Error ? err.message : String(err) },
          'internal/simulate: getSimulatedCalendarUrl fallo (no fatal)',
        );
      }

      // En el simulador el origen dice quién abrió: 'inbound' es que escribió
      // ella; cualquier otro (bienvenida / lm / manual) es que abrimos nosotros.
      const leadOriginDirective = buildLeadOriginDirective({
        origin: mapConversationSourceToOrigin(body.origin ?? null, {
          direction: body.origin === 'inbound' ? 'inbound' : body.origin ? 'outbound' : null,
          hasFormAnswers: Boolean(body.form_answers && Object.keys(body.form_answers).length > 0),
        }),
        channel: body.channel as LeadChannel,
        formAnswers: body.form_answers ?? null,
        zone: zoneVerdict,
      });
      const systemDirectives = combineSystemDirectives(
        leadOriginDirective,
        addressingDirective,
      );

      const startedAt = Date.now();
      try {
        const out = await runPipeline(
          { supabase, anthropic },
          {
            tenantId: body.tenant_id,
            // null a propósito: no hay conversación real y no queremos que el
            // registro de llamadas apunte a ninguna.
            conversationId: null,
            userMessage: body.message,
            currentPhase: body.phase,
            history: body.history,
            aiMessagesPerTurnMax: schedulingConfig.aiMessagesPerTurnMax,
            validationContext: {
              channel:
                body.channel === 'instagram_dm'
                  ? 'instagram'
                  : body.channel === 'facebook_messenger'
                    ? 'facebook'
                    : 'whatsapp',
              emojisWhitelist: null,
              isFirstAssistantMessage: !body.history.some((h) => h.role === 'assistant'),
              forbiddenPhrases: schedulingConfig.forbiddenPhrases,
              expectedAddressing,
              // V20 (sin enlace) y V21 (el turno cierra), como en producción.
              zoneRejected,
            },
            // Modo del turno y literal del cierre de la entrenadora, como en producción.
            zone: zoneRejected
              ? { mode: zoneHandoff ? 'handoff' : 'close', closeParts: zonePolicy?.closeParts ?? null }
              : undefined,
            composeOverrides: {
              // Mismo enrutado por canal que produccion: el entrenador prueba
              // el coach que de verdad se usaria en ese canal.
              channel: body.channel,
              currentPhaseFocus,
              extraSystemSuffix: systemDirectives,
              trackedCalendarUrl: calendar.url,
            },
          },
        );

        const setterOut = out.generator.setterOutput;
        return reply.code(200).send({
          ok: true,
          // Las burbujas tal y como saldrían, en orden.
          parts: out.parts,
          decision: {
            phase: setterOut.phase_decision,
            status: setterOut.conversation_status,
            handoff_cause: setterOut.handoff_cause ?? null,
          },
          // El razonamiento interno del setter, que es justo lo que el entrenador
          // no podía ver en su herramienta anterior.
          reasoning: {
            user_summary: setterOut.user_summary ?? null,
            emotion: setterOut.emotion ?? null,
            problem: setterOut.problem ?? null,
            goal: setterOut.goal ?? null,
            urgency: setterOut.urgency ?? null,
            next_action: setterOut.next_action ?? null,
          },
          // Transparencia: qué se le inyectó por venir de donde viene. Es lo que
          // explica que el mismo mensaje se responda distinto según el origen.
          injected_directive: systemDirectives,
          // Veredicto de zona de este turno. Si es 'reject_by_prefix', la focal
          // fue la del cierre por residencia y el turno tenía que cerrar.
          zone: describeZone(zoneVerdict),
          // Qué enlace de agenda se le dio al setter en este turno, y si no se
          // le dio ninguno, por qué. Sin esto, un entrenador sin calendario
          // vinculado ve al setter derivar y no sabe si es un fallo o su
          // configuración.
          calendar: {
            url: calendar.url,
            reason: calendar.reason,
            name: calendar.calendarName ?? null,
            simulated_slug: SIMULATION_TRACKING_SLUG,
          },
          cost_usd: out.totals?.costUsd ?? null,
          latency_ms: Date.now() - startedAt,
          simulated: true,
        });
      } catch (err) {
        // El pipeline lanza cuando el Judge rechaza dos veces o el validador
        // detecta un error crítico. Para el entrenador eso NO es un fallo del
        // simulador: es información: significa que su bloque llevaría a un
        // mensaje que el sistema no dejaría salir.
        const message = err instanceof Error ? err.message : String(err);
        request.log.warn(
          { tenantId: body.tenant_id, err: message },
          'internal/simulate: pipeline rechazó el turno',
        );
        return reply.code(200).send({
          ok: false,
          rejected: true,
          reason: message,
          // Con la zona rechazada, un rechazo por V21 significa que en
          // producción este turno no saldría: la IA se pausaría y se avisaría a
          // la entrenadora.
          zone: describeZone(zoneVerdict),
          latency_ms: Date.now() - startedAt,
          simulated: true,
        });
      }
    },
  );
}
