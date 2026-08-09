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
import { getAnthropic } from '../lib/anthropic.js';
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
});

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
      const anthropic = getAnthropic();

      // Mismas preferencias que usaría producción para este tenant: tope de
      // burbujas, palabras prohibidas y tratamiento. Si el simulador usara otras,
      // estaría enseñando un setter que no existe.
      const schedulingConfig = await loadSchedulingConfig(supabase, body.tenant_id);

      const currentPhaseFocus = buildPhaseFocusInstruction(body.phase, false);

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

      const leadOriginDirective = buildLeadOriginDirective({
        origin: mapConversationSourceToOrigin(body.origin ?? null),
        channel: body.channel as LeadChannel,
        formAnswers: body.form_answers ?? null,
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
            },
            composeOverrides: {
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
          latency_ms: Date.now() - startedAt,
          simulated: true,
        });
      }
    },
  );
}
