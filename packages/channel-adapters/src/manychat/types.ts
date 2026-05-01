import { z } from 'zod';

/**
 * Payload que envia ManyChat desde el bloque "Solicitud externa" (External Request).
 * Basado en la estructura estandar de ManyChat External Request Actions.
 *
 * Referencia:
 *  https://manychat.com/help/en/articles/external-request
 *
 * Campos variables: ManyChat permite mapear cualquier campo del subscriber + last_input_text
 * en un JSON arbitrario. Aqui definimos la plantilla que esperamos recibir del flow
 * configurado segun la convencion Fyzon. Si el trainer edita el flow y cambia nombres,
 * hay que ajustar este schema.
 */

export const manyChatChannelEnum = z.enum(['whatsapp', 'instagram', 'facebook']);
export type ManyChatChannel = z.infer<typeof manyChatChannelEnum>;

export const manyChatInputTypeEnum = z.enum(['text', 'audio', 'image', 'video', 'file']);
export type ManyChatInputType = z.infer<typeof manyChatInputTypeEnum>;

/**
 * ManyChat no siempre puede interpolar todas las variables. En IG DM, por ejemplo,
 * `{{phone}}` queda como string literal "{{phone}}" porque el subscriber no tiene teléfono.
 * Este helper detecta placeholders sin resolver y devuelve null para mantener la DB limpia.
 */
const unresolvedPlaceholderPattern = /^\s*\{\{[^}]+\}\}\s*$/;

const stripUnresolvedPlaceholder = z.preprocess((val) => {
  if (typeof val === 'string' && unresolvedPlaceholderPattern.test(val)) return null;
  return val;
}, z.string().optional().nullable());

export const manyChatSubscriberSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  first_name: stripUnresolvedPlaceholder,
  last_name: stripUnresolvedPlaceholder,
  phone: stripUnresolvedPlaceholder,
  email: stripUnresolvedPlaceholder,
  username: stripUnresolvedPlaceholder,
  channel: manyChatChannelEnum,
  locale: stripUnresolvedPlaceholder,
  gender: stripUnresolvedPlaceholder,
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
});
export type ManyChatSubscriber = z.infer<typeof manyChatSubscriberSchema>;

export const manyChatInboundPayloadSchema = z.object({
  subscriber: manyChatSubscriberSchema,
  last_input_text: z.string().default(''),
  last_input_type: manyChatInputTypeEnum.default('text'),
  media_url: z.string().url().optional().nullable(),
  timestamp: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === 'string' ? Number(v) : v;
      if (!Number.isFinite(n)) {
        throw new Error('timestamp must be a number of milliseconds since epoch');
      }
      return n;
    })
    .optional(),
  origin_trigger: z.string().optional().nullable(), // por ejemplo 'bienvenida' vs 'dm_espontaneo'
  extra: z.record(z.string(), z.unknown()).optional().default({}),
});
export type ManyChatInboundPayload = z.infer<typeof manyChatInboundPayloadSchema>;
