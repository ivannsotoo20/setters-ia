import { describe, it, expect, vi } from 'vitest';
import {
  createOpportunity,
  listPipelines,
  moveOpportunityStage,
} from '../src/opportunities.js';

function makeFetchMock(response: { ok: boolean; status: number; text: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.text),
  });
}

describe('listPipelines', () => {
  it('hits GET /opportunities/pipelines?locationId=X and returns pipelines[]', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({
        pipelines: [
          {
            id: 'pip_1',
            name: 'Gestión de Leads',
            locationId: 'loc_1',
            stages: [
              { id: 'stg_f1', name: 'F1 Conexión', position: 1 },
              { id: 'stg_f2', name: 'F2 Contexto', position: 2 },
            ],
          },
        ],
      }),
    });

    const pipelines = await listPipelines('tok', 'loc_1', fetchImpl);

    expect(pipelines).toHaveLength(1);
    expect(pipelines[0]!.id).toBe('pip_1');
    expect(pipelines[0]!.stages[0]!.id).toBe('stg_f1');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      'https://services.leadconnectorhq.com/opportunities/pipelines?locationId=loc_1',
    );
    expect(init.method).toBe('GET');
  });

  it('returns [] when GHL response has no pipelines field', async () => {
    const fetchImpl = makeFetchMock({ ok: true, status: 200, text: '{}' });
    const pipelines = await listPipelines('tok', 'loc_1', fetchImpl);
    expect(pipelines).toEqual([]);
  });

  it('rejects empty locationId', async () => {
    await expect(listPipelines('tok', '')).rejects.toThrow(/locationId/);
  });
});

describe('createOpportunity', () => {
  it('hits POST /opportunities/ with full body', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 201,
      text: JSON.stringify({
        opportunity: {
          id: 'opp_1',
          pipelineId: 'pip_1',
          pipelineStageId: 'stg_f1',
          contactId: 'cnt_1',
          name: 'Lead +34639541043',
          status: 'open',
        },
      }),
    });

    const opp = await createOpportunity(
      'tok',
      {
        locationId: 'loc_1',
        pipelineId: 'pip_1',
        pipelineStageId: 'stg_f1',
        contactId: 'cnt_1',
        name: 'Lead +34639541043',
        monetaryValue: 500,
      },
      fetchImpl,
    );

    expect(opp.id).toBe('opp_1');
    expect(opp.status).toBe('open');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/opportunities/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.pipelineId).toBe('pip_1');
    expect(body.pipelineStageId).toBe('stg_f1');
    expect(body.contactId).toBe('cnt_1');
    expect(body.status).toBe('open');
    expect(body.monetaryValue).toBe(500);
  });

  it('rejects on missing required fields', async () => {
    await expect(
      createOpportunity('tok', {
        locationId: 'loc',
        pipelineId: 'p',
        pipelineStageId: 's',
        contactId: '',
        name: 'x',
      }),
    ).rejects.toThrow(/contactId/);
  });
});

describe('moveOpportunityStage', () => {
  it('hits PUT /opportunities/{id} with pipelineStageId in body', async () => {
    const fetchImpl = makeFetchMock({
      ok: true,
      status: 200,
      text: JSON.stringify({
        opportunity: {
          id: 'opp_1',
          pipelineId: 'pip_1',
          pipelineStageId: 'stg_f3',
          contactId: 'cnt_1',
          name: 'Lead',
          status: 'open',
        },
      }),
    });

    const opp = await moveOpportunityStage(
      'tok',
      { opportunityId: 'opp_1', pipelineStageId: 'stg_f3', status: 'open' },
      fetchImpl,
    );

    expect(opp.pipelineStageId).toBe('stg_f3');

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://services.leadconnectorhq.com/opportunities/opp_1');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body.pipelineStageId).toBe('stg_f3');
    expect(body.status).toBe('open');
  });

  it('rejects on missing pipelineStageId', async () => {
    await expect(
      moveOpportunityStage('tok', { opportunityId: 'opp_1', pipelineStageId: '' }),
    ).rejects.toThrow(/pipelineStageId/);
  });
});
