import type { GhlContact, GhlCredentials, GhlMessagePayload } from './types.js';

export type { GhlContact, GhlCredentials, GhlMessagePayload } from './types.js';

export class GhlClient {
  constructor(private readonly credentials: GhlCredentials) {}

  async upsertContact(_contact: Partial<GhlContact>): Promise<GhlContact> {
    throw new Error('GhlClient.upsertContact not implemented in Hito 3 — Fase 1');
  }

  async sendMessage(_payload: GhlMessagePayload): Promise<{ messageId: string }> {
    throw new Error('GhlClient.sendMessage not implemented in Hito 3 — Fase 1');
  }

  async moveContactToStage(_contactId: string, _pipelineId: string, _stageId: string): Promise<void> {
    throw new Error('GhlClient.moveContactToStage not implemented in Hito 3 — Fase 1');
  }
}
