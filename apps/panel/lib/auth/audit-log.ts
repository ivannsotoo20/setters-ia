import { getServiceRoleClient } from '@/lib/supabase/service-role';

export type AuditAction =
  | 'member.invited'
  | 'member.password_reset'
  | 'member.role_changed'
  | 'member.removed'
  | 'member.reactivated'
  | 'tenant.impersonated';

export interface LogAuditEventArgs {
  tenantId: number;
  actorUserId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  targetUserId?: string | null;
  targetEmail?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Inserta un evento en `tenant_audit_log` usando service_role (bypasea RLS).
 *
 * Best-effort: si el insert falla (red, schema), loguea pero NO tira la action
 * caller. La auditoría no debe bloquear flows funcionales.
 */
export async function logAuditEvent(args: LogAuditEventArgs): Promise<void> {
  try {
    const supabase = getServiceRoleClient();
    const { error } = await supabase.from('tenant_audit_log').insert({
      tenant_id: args.tenantId,
      actor_user_id: args.actorUserId,
      actor_email: args.actorEmail,
      action: args.action,
      target_user_id: args.targetUserId ?? null,
      target_email: args.targetEmail ?? null,
      metadata: args.metadata ?? {},
    });
    if (error) {
      console.error('[audit-log] insert failed', { action: args.action, error: error.message });
    }
  } catch (err) {
    console.error('[audit-log] unexpected error', { action: args.action, err });
  }
}
