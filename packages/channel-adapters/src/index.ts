export * from './types.js';
export { ManyChatWhatsAppAdapter } from './manychat/whatsapp.js';
export { ManyChatInstagramAdapter } from './manychat/instagram.js';
export { parseManyChatInbound } from './manychat/parser.js';
export {
  manyChatSendContent,
  ManyChatApiError,
  type ManyChatSendContentParams,
  type ManyChatSendContentResult,
} from './manychat/api-client.js';
export {
  manyChatInboundPayloadSchema,
  manyChatSubscriberSchema,
  manyChatChannelEnum,
  manyChatInputTypeEnum,
  type ManyChatInboundPayload,
  type ManyChatSubscriber,
  type ManyChatChannel,
  type ManyChatInputType,
} from './manychat/types.js';

// ---------- YCloud (WhatsApp BSP oficial Meta) ----------
export { YCloudWhatsAppAdapter } from './ycloud/whatsapp.js';
export { parseYCloudInbound, type YCloudParsedResult } from './ycloud/parser.js';
export {
  ycloudSendText,
  YCloudApiError,
  type YCloudSendTextParams,
  type YCloudSendTextResult,
} from './ycloud/api-client.js';
export {
  ycloudInboundPayloadSchema,
  type YCloudInboundPayload,
  type YCloudMessage,
  type YCloudContact,
  type YCloudStatus,
} from './ycloud/types.js';
