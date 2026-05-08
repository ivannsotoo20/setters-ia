import { ghlRequest } from './api-client.js';
import type {
  GhlCreateOpportunityInput,
  GhlMoveOpportunityInput,
  GhlOpportunity,
  GhlPipeline,
} from './types.js';

/**
 * Lista los pipelines (con stages) de una sub-cuenta.
 * Endpoint: GET /opportunities/pipelines?locationId=X
 */
export async function listPipelines(
  apiToken: string,
  locationId: string,
  fetchImpl?: typeof fetch,
): Promise<GhlPipeline[]> {
  if (!locationId) throw new Error('listPipelines: locationId requerido');

  const response = await ghlRequest<{ pipelines?: GhlPipeline[] }>({
    apiToken,
    method: 'GET',
    path: '/opportunities/pipelines',
    query: { locationId },
    fetchImpl,
  });

  return response.pipelines ?? [];
}

/**
 * Crea una opportunity en un pipeline+stage para un contacto.
 * Endpoint: POST /opportunities/
 */
export async function createOpportunity(
  apiToken: string,
  input: GhlCreateOpportunityInput,
  fetchImpl?: typeof fetch,
): Promise<GhlOpportunity> {
  if (!input.locationId) throw new Error('createOpportunity: locationId requerido');
  if (!input.pipelineId) throw new Error('createOpportunity: pipelineId requerido');
  if (!input.pipelineStageId) throw new Error('createOpportunity: pipelineStageId requerido');
  if (!input.contactId) throw new Error('createOpportunity: contactId requerido');
  if (!input.name) throw new Error('createOpportunity: name requerido');

  const body: Record<string, unknown> = {
    locationId: input.locationId,
    pipelineId: input.pipelineId,
    pipelineStageId: input.pipelineStageId,
    contactId: input.contactId,
    name: input.name,
    status: input.status ?? 'open',
  };
  if (input.monetaryValue !== undefined) body.monetaryValue = input.monetaryValue;

  const response = await ghlRequest<{ opportunity?: GhlOpportunity }>({
    apiToken,
    method: 'POST',
    path: '/opportunities/',
    body,
    fetchImpl,
  });

  if (!response.opportunity || !response.opportunity.id) {
    throw new Error('createOpportunity: respuesta GHL sin opportunity.id');
  }

  return response.opportunity;
}

/**
 * Mueve una opportunity a otro stage (y opcionalmente cambia status).
 * Endpoint: PUT /opportunities/{id}
 */
export async function moveOpportunityStage(
  apiToken: string,
  input: GhlMoveOpportunityInput,
  fetchImpl?: typeof fetch,
): Promise<GhlOpportunity> {
  if (!input.opportunityId) throw new Error('moveOpportunityStage: opportunityId requerido');
  if (!input.pipelineStageId) throw new Error('moveOpportunityStage: pipelineStageId requerido');

  const body: Record<string, unknown> = {
    pipelineStageId: input.pipelineStageId,
  };
  if (input.pipelineId) body.pipelineId = input.pipelineId;
  if (input.status) body.status = input.status;

  const response = await ghlRequest<{ opportunity?: GhlOpportunity }>({
    apiToken,
    method: 'PUT',
    path: `/opportunities/${encodeURIComponent(input.opportunityId)}`,
    body,
    fetchImpl,
  });

  if (!response.opportunity || !response.opportunity.id) {
    throw new Error('moveOpportunityStage: respuesta GHL sin opportunity.id');
  }

  return response.opportunity;
}
