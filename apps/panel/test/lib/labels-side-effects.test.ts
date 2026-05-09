import { describe, it, expect } from 'vitest';
import {
  computeLabelSideEffects,
  hasSideEffects,
} from '../../lib/labels-side-effects';

describe('computeLabelSideEffects', () => {
  it('pause_ai_on_apply=true → ai_paused_until=infinity', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: true,
      resumeAiOnApply: false,
      autoAssignTo: null,
      currentAssignedUserId: null,
    });
    expect(patch.ai_paused_until).toBe('infinity');
    expect(patch.assigned_user_id).toBeUndefined();
  });

  it('resume_ai_on_apply=true → ai_paused_until=null', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: false,
      resumeAiOnApply: true,
      autoAssignTo: null,
      currentAssignedUserId: null,
    });
    expect(patch.ai_paused_until).toBeNull();
  });

  it('resume gana sobre pause cuando ambos true (defensivo)', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: true,
      resumeAiOnApply: true,
      autoAssignTo: null,
      currentAssignedUserId: null,
    });
    expect(patch.ai_paused_until).toBeNull();
  });

  it('auto_assign_to aplica si no hay asignación previa', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: false,
      resumeAiOnApply: false,
      autoAssignTo: 'user-uuid',
      currentAssignedUserId: null,
    });
    expect(patch.assigned_user_id).toBe('user-uuid');
  });

  it('auto_assign_to NO pisa asignación manual previa', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: false,
      resumeAiOnApply: false,
      autoAssignTo: 'user-uuid-from-label',
      currentAssignedUserId: 'user-uuid-manual',
    });
    expect(patch.assigned_user_id).toBeUndefined();
  });

  it('combinación pause + auto_assign aplica ambos', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: true,
      resumeAiOnApply: false,
      autoAssignTo: 'user-uuid',
      currentAssignedUserId: null,
    });
    expect(patch.ai_paused_until).toBe('infinity');
    expect(patch.assigned_user_id).toBe('user-uuid');
  });

  it('label sin side effects → patch vacío', () => {
    const patch = computeLabelSideEffects({
      pauseAiOnApply: false,
      resumeAiOnApply: false,
      autoAssignTo: null,
      currentAssignedUserId: null,
    });
    expect(hasSideEffects(patch)).toBe(false);
    expect(Object.keys(patch).length).toBe(0);
  });

  it('hasSideEffects true cuando hay al menos una key', () => {
    expect(hasSideEffects({ ai_paused_until: 'infinity' })).toBe(true);
    expect(hasSideEffects({ assigned_user_id: 'x' })).toBe(true);
    expect(hasSideEffects({})).toBe(false);
  });
});
