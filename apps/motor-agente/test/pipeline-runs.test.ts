import { describe, it, expect } from 'vitest';
import { ZoneCloseError } from '@fyzon/agent-pipeline';
import { classifyPipelineError } from '../src/services/pipeline-runs.js';

describe('classifyPipelineError', () => {
  it('classifies Judge reject errors', () => {
    const err = new Error(
      'Judge rejected message: V01: tono no permitido. reasoning="el modelo derivó a un tema no permitido"',
    );
    expect(classifyPipelineError(err)).toBe('judge_reject');
  });

  it('classifies Validator unrecoverable errors', () => {
    const err = new Error(
      'Validator V0-V16 found unrecoverable errors after Judge: V05: medical_advice violation',
    );
    expect(classifyPipelineError(err)).toBe('validator_error');
  });

  it('classifies the current validator range (V0-V20) and V21 as validator_error', () => {
    // El pipeline lanza "V0-V20" desde 2026-09-12; antes se buscaba "V0-V16" exacto
    // y todos estos quedaban como pipeline_error.
    expect(
      classifyPipelineError(
        new Error('Validator V0-V20 found unrecoverable errors after Judge: V20: enlace a una persona fuera de zona'),
      ),
    ).toBe('validator_error');
    expect(
      classifyPipelineError(new ZoneCloseError({ conversation_status: 'active' })),
    ).toBe('validator_error');
  });

  it('falls back to pipeline_error for any other Error', () => {
    expect(classifyPipelineError(new Error('Anthropic 503: upstream busy'))).toBe('pipeline_error');
    expect(classifyPipelineError(new Error('postgres: connection refused'))).toBe('pipeline_error');
    expect(classifyPipelineError(new Error(''))).toBe('pipeline_error');
  });

  it('falls back to pipeline_error for non-Error values', () => {
    expect(classifyPipelineError('string error')).toBe('pipeline_error');
    expect(classifyPipelineError({ message: 'object' })).toBe('pipeline_error');
    expect(classifyPipelineError(null)).toBe('pipeline_error');
    expect(classifyPipelineError(undefined)).toBe('pipeline_error');
  });

  it('does NOT classify partial matches as judge_reject', () => {
    // El prefix tiene que ser exacto.
    const err = new Error('something else: Judge rejected message: nested');
    expect(classifyPipelineError(err)).toBe('pipeline_error');
  });
});
