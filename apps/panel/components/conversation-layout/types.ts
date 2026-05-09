/**
 * Tipos compartidos del shell `<ConversationLayout>`. Se mantienen separados
 * del helper `lib/conversation-list-query.ts` para evitar dependencias
 * circulares cuando el layout componga ambos.
 */
import type {
  ConversationListLead,
  ConversationListChannel,
  ConversationListRow,
} from '@/lib/conversation-list-query';

/** Datos del usuario actual derivados de `getEffectiveTenant`. */
export interface ConversationViewer {
  userId: string;
  tenantId: number;
  role: 'owner' | 'admin' | 'viewer';
  isAgencyAdmin: boolean;
  email: string | null;
}

/** Miembro del tenant — se usa en el dropdown de asignación. */
export interface TenantMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: 'owner' | 'admin' | 'viewer';
  isActive: boolean;
}

/** Detalle del conversation seleccionado (panel central + derecho). */
export interface ConversationLabelRef {
  id: number;
  name: string;
  color: string;
  destinationBucket: 'chats' | 'hot' | 'done' | 'bought' | null;
}

export interface SelectedConversationDetail {
  id: number;
  tenantId: number;
  leadId: number;
  channelId: number;
  phaseNumber: number;
  phaseMessageCount: number;
  state: string;
  conversationSource: string | null;
  aiPausedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  isQualified: boolean | null;
  isHandoffToHuman: boolean;
  isUnread: boolean;
  isBlocked: boolean;
  assignedUserId: string | null;
  handoffCause: string | null;
  handoffReason: string | null;
  handoffAt: string | null;
  // Generator output denormalizado
  currentContext: string | null;
  emotion: string | null;
  problem: string | null;
  goal: string | null;
  urgency: string | null;
  nextAction: string | null;
  generalContext: string | null;
  generalMotivation: string | null;
  priority: string | null;
  // Sprint Eta — labels aplicadas
  labels: ConversationLabelRef[];
  // Lead/channel embed
  lead: ConversationListLead & { phone: string | null; email: string | null };
  channel: ConversationListChannel;
}

export interface ConversationNote {
  id: number;
  authorEmail: string | null;
  content: string;
  createdAt: string;
}

export interface TimelineMessage {
  id: number;
  source: string;
  content_type: string;
  content: string | null;
  transcription: string | null;
  media_url: string | null;
  sent_at: string;
}

export type { ConversationListRow, ConversationListLead, ConversationListChannel };
