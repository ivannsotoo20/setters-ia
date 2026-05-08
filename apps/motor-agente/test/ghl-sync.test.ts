import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ensureGhlContactAndOpportunity,
  loadGhlContext,
  moveStageForPhase,
  syncInboundToGhl,
  syncOutboundToGhl,
} from '../src/services/ghl-sync.js';

// ---------------------------------------------------------------------------
// Helpers para mockear el query builder de Supabase (mínimo viable: sólo los
// métodos que `ghl-sync.ts` invoca).
// ---------------------------------------------------------------------------

function makeSupabaseMock(handlers: {
  integrationAccount?: { data: unknown; error?: { message: string } | null };
  conversation?: { data: unknown; error?: { message: string } | null };
  conversationUpdate?: { error?: { message: string } | null };
}) {
  const updateCalls: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      if (table === 'integration_accounts') {
        return chain(handlers.integrationAccount ?? { data: null });
      }
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => handlers.conversation ?? { data: null },
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updateCalls.push(payload);
            return {
              eq: async () => handlers.conversationUpdate ?? { error: null },
            };
          },
        };
      }
      throw new Error(`Unexpected supabase.from('${table}')`);
    },
  };
  return { supabase, updateCalls };
}

function chain(result: { data: unknown; error?: { message: string } | null }) {
  // Encadena .select().eq().eq().eq().order().limit().maybeSingle() devolviendo result.
  const proxy: Record<string, () => unknown> = {} as Record<string, () => unknown>;
  const passthrough = () => proxy;
  proxy.select = passthrough;
  proxy.eq = passthrough;
  proxy.order = passthrough;
  proxy.limit = passthrough;
  proxy.maybeSingle = async () => result;
  return proxy;
}

// ---------------------------------------------------------------------------
// loadGhlContext — null cuando no hay GHL configurado
// ---------------------------------------------------------------------------

describe('loadGhlContext', () => {
  it('returns null when no integration_account ghl exists', async () => {
    const { supabase } = makeSupabaseMock({
      integrationAccount: { data: null },
    });
    const ctx = await loadGhlContext(supabase as never, 99);
    expect(ctx).toBeNull();
  });

  it('returns null when connection_config.pipelineId missing', async () => {
    const { supabase } = makeSupabaseMock({
      integrationAccount: {
        data: {
          id: 10,
          credentials: { locationId: 'loc_1', apiToken: 'tok' },
          credentials_encrypted: null,
          connection_config: {},
        },
      },
    });
    const ctx = await loadGhlContext(supabase as never, 3);
    expect(ctx).toBeNull();
  });

  it('returns context when credentials + pipelineId present', async () => {
    const { supabase } = makeSupabaseMock({
      integrationAccount: {
        data: {
          id: 10,
          credentials: { locationId: 'loc_1', apiToken: 'tok' },
          credentials_encrypted: null,
          connection_config: {
            pipelineId: 'pip_1',
            stageMap: { F1: 'stg_f1' },
          },
        },
      },
    });
    const ctx = await loadGhlContext(supabase as never, 3);
    expect(ctx).not.toBeNull();
    expect(ctx?.config.pipelineId).toBe('pip_1');
    expect(ctx?.integrationAccountId).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// ensureGhlContactAndOpportunity — idempotencia y best-effort
// ---------------------------------------------------------------------------

describe('ensureGhlContactAndOpportunity', () => {
  function makeCtx(overrides: { upsertImpl?: unknown; createOppImpl?: unknown } = {}) {
    const upsertContact = vi.fn().mockResolvedValue({
      contact: { id: 'cnt_xyz' },
      isNew: true,
    });
    const createOpportunity = vi.fn().mockResolvedValue({
      id: 'opp_xyz',
      pipelineId: 'pip_1',
      pipelineStageId: 'stg_f1',
      contactId: 'cnt_xyz',
      name: 'Lead',
      status: 'open',
    });
    if (overrides.upsertImpl) (upsertContact as unknown as Record<string, unknown>).mockImplementation = overrides.upsertImpl;
    if (overrides.createOppImpl) (createOpportunity as unknown as Record<string, unknown>).mockImplementation = overrides.createOppImpl;
    return {
      ctx: {
        client: { upsertContact, createOpportunity } as never,
        config: { pipelineId: 'pip_1', stageMap: { F1: 'stg_f1' } },
        integrationAccountId: 10,
      },
      upsertContact,
      createOpportunity,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts contact and creates opportunity at F1 on first turn', async () => {
    const { ctx, upsertContact, createOpportunity } = makeCtx();
    const { supabase, updateCalls } = makeSupabaseMock({
      conversation: {
        data: { ghl_contact_id: null, ghl_opportunity_id: null },
      },
    });

    const result = await ensureGhlContactAndOpportunity(supabase as never, ctx, {
      conversationId: 5,
      currentPhase: 0,
      lead: {
        id: 1,
        externalId: '34639541043',
        phone: '+34639541043',
        firstName: 'Juan',
      },
    });

    expect(result.ghlContactId).toBe('cnt_xyz');
    expect(result.ghlOpportunityId).toBe('opp_xyz');

    expect(upsertContact).toHaveBeenCalledOnce();
    expect(upsertContact.mock.calls[0]![0]).toMatchObject({
      phone: '+34639541043',
      firstName: 'Juan',
      source: 'fyzon-setter',
    });
    expect(createOpportunity).toHaveBeenCalledOnce();
    expect(createOpportunity.mock.calls[0]![0].pipelineStageId).toBe('stg_f1');

    // Persiste ambos IDs en conversations
    expect(updateCalls[0]).toMatchObject({
      ghl_contact_id: 'cnt_xyz',
      ghl_opportunity_id: 'opp_xyz',
    });
  });

  it('is idempotent: skips upsert and create when both IDs already present', async () => {
    const { ctx, upsertContact, createOpportunity } = makeCtx();
    const { supabase, updateCalls } = makeSupabaseMock({
      conversation: {
        data: { ghl_contact_id: 'cnt_old', ghl_opportunity_id: 'opp_old' },
      },
    });

    const result = await ensureGhlContactAndOpportunity(supabase as never, ctx, {
      conversationId: 5,
      currentPhase: 2,
      lead: { id: 1, externalId: 'x', phone: '+1' },
    });

    expect(result.ghlContactId).toBe('cnt_old');
    expect(result.ghlOpportunityId).toBe('opp_old');
    expect(upsertContact).not.toHaveBeenCalled();
    expect(createOpportunity).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
  });

  it('returns nulls and does not throw when upsertContact fails', async () => {
    const upsertContact = vi.fn().mockRejectedValue(new Error('GHL 500'));
    const createOpportunity = vi.fn();
    const ctx = {
      client: { upsertContact, createOpportunity } as never,
      config: { pipelineId: 'pip_1', stageMap: { F1: 'stg_f1' } },
      integrationAccountId: 10,
    };
    const { supabase } = makeSupabaseMock({
      conversation: { data: { ghl_contact_id: null, ghl_opportunity_id: null } },
    });

    const result = await ensureGhlContactAndOpportunity(supabase as never, ctx, {
      conversationId: 5,
      currentPhase: 0,
      lead: { id: 1, externalId: 'x', phone: '+1' },
    });

    expect(result).toEqual({ ghlContactId: null, ghlOpportunityId: null });
    expect(createOpportunity).not.toHaveBeenCalled();
  });

  it('skips when lead has no phone and no email', async () => {
    const { ctx, upsertContact } = makeCtx();
    const { supabase } = makeSupabaseMock({
      conversation: { data: { ghl_contact_id: null, ghl_opportunity_id: null } },
    });

    const result = await ensureGhlContactAndOpportunity(supabase as never, ctx, {
      conversationId: 5,
      currentPhase: 0,
      lead: { id: 1, externalId: 'x' },
    });

    expect(result.ghlContactId).toBeNull();
    expect(upsertContact).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// moveStageForPhase — solo mueve si stageMap[F<n>] mapeado
// ---------------------------------------------------------------------------

describe('moveStageForPhase', () => {
  it('calls moveOpportunityStage with mapped stageId', async () => {
    const moveOpportunityStage = vi.fn().mockResolvedValue({
      id: 'opp_1',
      pipelineId: 'pip_1',
      pipelineStageId: 'stg_f3',
      contactId: 'c',
      name: 'L',
      status: 'open',
    });
    const ctx = {
      client: { moveOpportunityStage } as never,
      config: { pipelineId: 'pip_1', stageMap: { F1: 'stg_f1', F3: 'stg_f3' } },
      integrationAccountId: 10,
    };
    await moveStageForPhase(ctx, { ghlOpportunityId: 'opp_1', newPhaseNumber: 3 });
    expect(moveOpportunityStage).toHaveBeenCalledOnce();
    expect(moveOpportunityStage.mock.calls[0]![0]).toMatchObject({
      opportunityId: 'opp_1',
      pipelineStageId: 'stg_f3',
    });
  });

  it('no-op when stageMap[F<n>] missing', async () => {
    const moveOpportunityStage = vi.fn();
    const ctx = {
      client: { moveOpportunityStage } as never,
      config: { pipelineId: 'pip_1', stageMap: { F1: 'stg_f1' } },
      integrationAccountId: 10,
    };
    await moveStageForPhase(ctx, { ghlOpportunityId: 'opp_1', newPhaseNumber: 5 });
    expect(moveOpportunityStage).not.toHaveBeenCalled();
  });

  it('no-op when opportunityId is null', async () => {
    const moveOpportunityStage = vi.fn();
    const ctx = {
      client: { moveOpportunityStage } as never,
      config: { pipelineId: 'pip_1', stageMap: { F3: 'stg_f3' } },
      integrationAccountId: 10,
    };
    await moveStageForPhase(ctx, { ghlOpportunityId: null, newPhaseNumber: 3 });
    expect(moveOpportunityStage).not.toHaveBeenCalled();
  });

  it('best-effort: swallows errors from GHL', async () => {
    const moveOpportunityStage = vi.fn().mockRejectedValue(new Error('GHL down'));
    const ctx = {
      client: { moveOpportunityStage } as never,
      config: { pipelineId: 'pip_1', stageMap: { F2: 'stg_f2' } },
      integrationAccountId: 10,
    };
    await expect(
      moveStageForPhase(ctx, { ghlOpportunityId: 'opp_1', newPhaseNumber: 2 }),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// syncInboundToGhl / syncOutboundToGhl — best-effort
// ---------------------------------------------------------------------------

describe('syncInboundToGhl', () => {
  it('calls registerInbound and persists conversationId', async () => {
    const registerInbound = vi.fn().mockResolvedValue({
      messageId: 'msg_1',
      conversationId: 'ghl_conv_1',
    });
    const ctx = {
      client: { registerInbound } as never,
      config: { pipelineId: 'pip_1', stageMap: {}, conversationProviderId: 'cp_y' },
      integrationAccountId: 10,
    };
    const { supabase, updateCalls } = makeSupabaseMock({
      conversation: { data: { ghl_conversation_id: null } },
    });

    await syncInboundToGhl(supabase as never, ctx, {
      conversationId: 5,
      ghlContactId: 'cnt_xyz',
      message: 'Hola, vengo del lead magnet',
    });

    expect(registerInbound).toHaveBeenCalledOnce();
    expect(registerInbound.mock.calls[0]![0]).toMatchObject({
      type: 'Custom',
      contactId: 'cnt_xyz',
      conversationProviderId: 'cp_y',
    });
    expect(updateCalls[0]).toEqual({ ghl_conversation_id: 'ghl_conv_1' });
  });

  it('best-effort: swallows registerInbound errors', async () => {
    const registerInbound = vi.fn().mockRejectedValue(new Error('GHL 500'));
    const ctx = {
      client: { registerInbound } as never,
      config: { pipelineId: 'pip_1', stageMap: {} },
      integrationAccountId: 10,
    };
    const { supabase } = makeSupabaseMock({
      conversation: { data: { ghl_conversation_id: null } },
    });
    await expect(
      syncInboundToGhl(supabase as never, ctx, {
        conversationId: 5,
        ghlContactId: 'c',
        message: 'hi',
      }),
    ).resolves.not.toThrow();
  });
});

describe('syncOutboundToGhl', () => {
  it('calls registerOutbound', async () => {
    const registerOutbound = vi.fn().mockResolvedValue({
      messageId: 'msg_out',
      conversationId: 'ghl_conv_1',
    });
    const ctx = {
      client: { registerOutbound } as never,
      config: { pipelineId: 'pip_1', stageMap: {} },
      integrationAccountId: 10,
    };
    const { supabase } = makeSupabaseMock({
      conversation: { data: { ghl_conversation_id: 'ghl_conv_1' } },
    });

    await syncOutboundToGhl(supabase as never, ctx, {
      conversationId: 5,
      ghlContactId: 'cnt_xyz',
      message: 'Te dejo el enlace para reservar.',
    });

    expect(registerOutbound).toHaveBeenCalledOnce();
    expect(registerOutbound.mock.calls[0]![0]).toMatchObject({
      type: 'Custom',
      contactId: 'cnt_xyz',
    });
  });
});
