/**
 * Confirmación de reserva solo con la cita REAL (2026-11-19, Tania: "El asistente
 * solo puede decir que una cita está confirmada cuando el calendario haya
 * registrado realmente la reserva. Que la persona escriba «listo» no es
 * suficiente. La confirmación debe incluir fecha, hora y zona horaria").
 *
 * Hasta hoy el «Pues ya está reservada 🙌» lo escribía el modelo en cuanto la
 * persona decía que había reservado (conv. 15147: «Listo» → confirmación, sin
 * mirar el calendario; la cita existía por 26 s de suerte, y sin fecha ni hora).
 *
 * Con `lead_qualification.booking_confirmation` (opt-in por tenant):
 *  1. La confirmación la manda el MOTOR cuando el calendario registra la cita
 *     (calendar-sync o webhook AppointmentCreate), con fecha, hora y zona horaria
 *     de la persona (o la de la entrenadora si no se conoce, dicha explícitamente).
 *  2. Si la persona dice que ya ha reservado y aún no consta, el motor consulta el
 *     calendario en ese momento (`syncCalendarAppointments` del tenant). Si
 *     aparece, sale la confirmación del punto 1 y la IA no contesta aparte.
 *  3. Si sigue sin constar, el modelo recibe el dato («no hay ninguna cita
 *     registrada») y, si aun así escribe que está reservada o confirmada, ese
 *     turno se sustituye por el texto de «en cuanto me aparezca te lo confirmo».
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { timezoneToLabel } from '../lib/timezone-label.js';
import { loadLeadQualification } from '../lib/zone-policy.js';
import { scheduleLiteralTurn } from './literal-turn.js';

export const DEFAULT_BOOKING_CONFIRMATION_TEXT =
  'Pues ya está reservada 🙌 Te espero el {fecha} a las {hora} ({zona}).\n\n' +
  'El enlace de la videollamada te llega automáticamente al correo. Yo te escribo antes para recordarte la cita. Nos vemos!';

export const DEFAULT_BOOKING_PENDING_TEXT =
  'Genial! En cuanto me aparezca la reserva en la agenda te la confirmo por aquí con el día y la hora 😊';

export interface BookingConfirmationConfig {
  /** Plantilla con {fecha}, {hora} y {zona}. Una burbuja por párrafo. */
  text: string;
  /** Lo que se dice si la persona da la reserva por hecha y el calendario aún no la tiene. */
  pendingText: string;
}

const MAX_TEXT_CHARS = 600;

/** Lee `lead_qualification.booking_confirmation`. null si no está activa. */
export function parseBookingConfirmationConfig(leadQualification: unknown): BookingConfirmationConfig | null {
  if (!leadQualification || typeof leadQualification !== 'object') return null;
  const raw = (leadQualification as Record<string, unknown>).booking_confirmation;
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw as Record<string, unknown>;
  if (cfg.enabled !== true) return null;
  const text =
    typeof cfg.text === 'string' && cfg.text.trim() ? cfg.text.trim().slice(0, MAX_TEXT_CHARS) : DEFAULT_BOOKING_CONFIRMATION_TEXT;
  const pendingText =
    typeof cfg.pending_text === 'string' && cfg.pending_text.trim()
      ? cfg.pending_text.trim().slice(0, MAX_TEXT_CHARS)
      : DEFAULT_BOOKING_PENDING_TEXT;
  return { text, pendingText };
}

/** Fecha, hora y zona de una cita en la zona horaria dada. */
export function formatAppointmentForLead(
  startIso: string,
  timezone: string,
): { fecha: string; hora: string; zona: string } {
  const date = new Date(startIso);
  const fecha = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  })
    .format(date)
    .replace(',', '');
  const hora = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date);
  const label = timezoneToLabel(timezone) ?? timezone;
  // «hora España» → «hora de España»; las etiquetas con paréntesis ("hora Este (US)") se quedan.
  const zona = /^hora [^(]+$/.test(label) ? label.replace(/^hora /, 'hora de ') : label;
  return { fecha, hora, zona };
}

/** La confirmación en burbujas, con los datos de la cita. */
export function renderBookingConfirmation(
  cfg: BookingConfirmationConfig,
  startIso: string,
  timezone: string,
): string[] {
  const { fecha, hora, zona } = formatAppointmentForLead(startIso, timezone);
  return cfg.text
    .replace(/\{fecha\}/g, fecha)
    .replace(/\{hora\}/g, hora)
    .replace(/\{zona\}/g, zona)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * ¿La persona da la reserva por hecha? Dos niveles: las frases explícitas
 * («ya reservé», «reservado», «me llegó el correo», «booked») cuentan siempre;
 * las palabras sueltas («listo», «hecho», «ya está», «done») solo en un mensaje
 * corto, porque en una frase larga son otra cosa («he hecho fisio de todo»,
 * «estoy lista para empezar»).
 */
const BOOKED_STRONG_RE =
  /(?<![\p{L}])(?:ya\s+(?:lo\s+|la\s+)?(?:tengo|reserv[eé]|agend[eé]|hice|cog[ií]|eleg[ií]|apart[eé])|reservad[oa]|agendad[oa]|me\s+(?:ha\s+)?lleg(?:[oó]|ado)\s+(?:el\s+|un\s+)?(?:correo|mail|email)|booked|i\s+booked|j'ai\s+r[ée]serv[ée]|reservei|marquei)(?![\p{L}])/iu;
const BOOKED_WEAK_RE = /(?<![\p{L}])(?:list[oa]|ya\s+est[aá]|hecho|done|feito|pronto)(?![\p{L}])/iu;
const MAX_WEAK_SIGNAL_WORDS = 6;

export function signalsBooked(userMessage: string): boolean {
  if (typeof userMessage !== 'string') return false;
  if (BOOKED_STRONG_RE.test(userMessage)) return true;
  const words = userMessage.trim().split(/\s+/).filter((w) => w.length > 0);
  return words.length <= MAX_WEAK_SIGNAL_WORDS && BOOKED_WEAK_RE.test(userMessage);
}

/** ¿El texto del setter da la cita por reservada o confirmada? */
const BOOKING_CLAIM_RE =
  /(?:ya\s+est[aá]\s+reservad|queda(?:\s+\w+)?\s+reservad|est[aá]\s+(?:bien\s+|correctamente\s+)?reservad|(?:cita|reserva|videollamada)\s+(?:est[aá]\s+|queda\s+)?confirmad|ya\s+tienes\s+(?:tu\s+|la\s+)?(?:cita|reserva|plaza)|ya\s+est[aá]\s+agendad|queda\s+agendad|te\s+espero\s+el\s|you(?:'re|\s+are)\s+(?:all\s+)?booked|booking\s+is\s+confirmed|est[aá]\s+confirmad)/i;

export function claimsBookingConfirmed(text: string): boolean {
  return typeof text === 'string' && BOOKING_CLAIM_RE.test(text);
}

/** Cita viva registrada para esta conversación o su lead (empieza en el futuro o hace menos de 2 h). */
export async function findRegisteredAppointment(
  supabase: SupabaseClient,
  args: { tenantId: number; conversationId: number; leadId: number },
): Promise<{ id: number; startAt: string } | null> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('calendar_appointments')
    .select('id, start_at, appointment_status')
    .eq('tenant_id', args.tenantId)
    .or(`conversation_id.eq.${args.conversationId},lead_id.eq.${args.leadId}`)
    .in('appointment_status', ['new', 'confirmed'])
    .gte('start_at', since)
    .order('start_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: number; start_at: string };
  return { id: Number(row.id), startAt: String(row.start_at) };
}

/** ¿Ya se le ha mandado el enlace de agenda en esta conversación? */
export function bookingLinkAlreadySent(
  history: ReadonlyArray<{ role: string; content: string }>,
): boolean {
  return history.some(
    (m) => m.role === 'assistant' && /\/widget\/booking\/|fyzon_lead_uuid=/i.test(m.content),
  );
}

/** Directiva runtime cuando no hay cita registrada y el tema está en juego. */
export function buildNoAppointmentDirective(cfg: BookingConfirmationConfig): string {
  return (
    '## Reserva (dato del motor)\n\n' +
    'En el calendario NO hay ninguna cita registrada a su nombre todavía. No le digas que está ' +
    'reservada, confirmada ni agendada, ni le des día y hora como hechos: la confirmación con la ' +
    'fecha, la hora y su zona horaria la manda el sistema en cuanto el calendario la registra. Si ' +
    `te dice que ya ha reservado, contéstale con este sentido: «${cfg.pendingText}».`
  );
}

/**
 * Manda la confirmación de una cita recién registrada. La llaman calendar-sync y
 * el webhook de calendario SOLO cuando la cita es nueva y la conversación acaba
 * de pasar a F7 (`conversationMoved`). No manda nada si el tenant no lo tiene
 * activo, si la cita ya empezó, o si se reservó hace más de un día (un volcado
 * de citas antiguas no debe escribirle a nadie). Nunca lanza.
 */
export async function sendBookingConfirmation(args: {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  startIso: string;
  bookedAtIso?: string | null;
  now?: Date;
}): Promise<{ sent: boolean; reason?: string; parts?: string[] }> {
  const { supabase, tenantId, conversationId } = args;
  const now = args.now ?? new Date();
  try {
    const cfg = parseBookingConfirmationConfig(await loadLeadQualification(supabase, tenantId));
    if (!cfg) return { sent: false, reason: 'disabled' };
    const startMs = Date.parse(args.startIso);
    if (!Number.isFinite(startMs) || startMs <= now.getTime()) return { sent: false, reason: 'past' };
    if (args.bookedAtIso) {
      const bookedMs = Date.parse(args.bookedAtIso);
      if (Number.isFinite(bookedMs) && now.getTime() - bookedMs > 24 * 60 * 60 * 1000) {
        return { sent: false, reason: 'old_booking' };
      }
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id, lead_id, channel_id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!conv) return { sent: false, reason: 'conversation_not_found' };
    const { data: lead } = await supabase
      .from('leads')
      .select('timezone')
      .eq('id', Number(conv.lead_id))
      .maybeSingle();
    const { data: ia } = await supabase
      .from('integration_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('channel_id', Number(conv.channel_id))
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ia) return { sent: false, reason: 'no_integration_account' };

    let timezone = (lead?.timezone as string | null | undefined) ?? null;
    if (!timezone) {
      const { loadSchedulingConfig } = await import('./process-debounced.js');
      timezone = (await loadSchedulingConfig(supabase, tenantId)).trainerTimezone ?? 'Europe/Madrid';
    }
    const parts = renderBookingConfirmation(cfg, args.startIso, timezone);
    await scheduleLiteralTurn({
      supabase,
      tenantId,
      conversationId,
      integrationAccountId: Number(ia.id),
      parts,
    });
    console.log(
      `[booking-confirmation] conv=${conversationId} cita registrada: confirmación con fecha, hora y zona (${timezone})`,
    );
    return { sent: true, parts };
  } catch (err) {
    console.warn(
      `[booking-confirmation] conv=${conversationId} no se pudo mandar (no fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    return { sent: false, reason: 'error' };
  }
}
