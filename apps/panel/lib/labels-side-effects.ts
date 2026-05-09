/**
 * Side effects al aplicar un label a una conversación: pause IA, resume IA,
 * autoasignar usuario. Helper PURO (sin DB) que devuelve un patch a aplicar
 * sobre la conversation. Tests directos sin mocks.
 *
 * Reglas (Sprint Eta):
 *   - `pause_ai_on_apply=true`  → patch.ai_paused_until = 'infinity'.
 *   - `resume_ai_on_apply=true` → patch.ai_paused_until = null.
 *   - `auto_assign_to=<uuid>`   → patch.assigned_user_id = uuid SOLO SI la
 *     conversation no tiene asignación previa (`currentAssignedUserId == null`).
 *     No pisamos asignación manual existente.
 *   - Si pause y resume están ambas true → resume gana (defensivo, no debería
 *     ocurrir en UI pero la BD lo permite). Documentado.
 */

export interface LabelSideEffectInput {
  pauseAiOnApply: boolean;
  resumeAiOnApply: boolean;
  autoAssignTo: string | null;
  currentAssignedUserId: string | null;
}

export interface LabelSideEffectPatch {
  ai_paused_until?: string | null;
  assigned_user_id?: string | null;
}

export function computeLabelSideEffects(input: LabelSideEffectInput): LabelSideEffectPatch {
  const patch: LabelSideEffectPatch = {};

  // Resume gana sobre pause (case defensivo).
  if (input.resumeAiOnApply) {
    patch.ai_paused_until = null;
  } else if (input.pauseAiOnApply) {
    patch.ai_paused_until = 'infinity';
  }

  if (input.autoAssignTo && !input.currentAssignedUserId) {
    patch.assigned_user_id = input.autoAssignTo;
  }

  return patch;
}

export function hasSideEffects(patch: LabelSideEffectPatch): boolean {
  return Object.keys(patch).length > 0;
}
