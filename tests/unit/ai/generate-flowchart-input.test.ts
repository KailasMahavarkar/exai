import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFlowchartInput } from '../../../src/ai/openrouter.js';

function mockFetchOk(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe('generateFlowchartInput (DSL rebuild)', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('rebuilds DSL from JSON plan output', async () => {
    const plan = JSON.stringify({
      nodes: [
        { id: 'start', type: 'ellipse', label: 'Start' },
        { id: 'auth', type: 'rectangle', label: 'Auth Service' },
        { id: 'db', type: 'database', label: 'Users DB' },
        { id: 'end', type: 'ellipse', label: 'End' },
      ],
      edges: [
        { from: 'start', to: 'auth' },
        { from: 'auth', to: 'db', label: 'writes' },
        { from: 'auth', to: 'end', label: 'done', dashed: true },
      ],
      options: { direction: 'LR', spacing: 70 },
    });

    global.fetch = mockFetchOk(plan) as typeof fetch;

    const result = await generateFlowchartInput('show login flow', 'dsl', { useCache: false });

    expect(result).toContain('@direction LR');
    expect(result).toContain('@spacing 70');
    expect(result).toContain('@node start ellipse "Start"');
    expect(result).toContain('@node auth rectangle "Auth Service"');
    expect(result).toContain('@node db database "Users DB"');
    expect(result).toContain('@edge start auth');
    expect(result).toContain('@edge auth db "writes"');
    expect(result).toContain('@edge auth end "done" dashed');
  });

  it('throws when plan parsing fails (no legacy fallback)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not valid json' } }] }),
    });

    global.fetch = fetchMock as typeof fetch;

    await expect(
      generateFlowchartInput('invalid plan case', 'dsl', {
        useCache: false,
        verbose: true,
      })
    ).rejects.toThrow('Failed to build DSL from AI plan');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('auto-creates chain edges when nodes exist but edges are missing', async () => {
    const plan = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'ellipse', label: 'Start' },
        { id: 'n2', type: 'rectangle', label: 'Analyze Context' },
        { id: 'n3', type: 'rectangle', label: 'Generate DSL' },
      ],
    });

    global.fetch = mockFetchOk(plan) as typeof fetch;

    const result = await generateFlowchartInput('create from scratch', 'dsl', { useCache: false });

    expect(result).toContain('@node n1 ellipse "Start"');
    expect(result).toContain('@node n2 rectangle "Analyze Context"');
    expect(result).toContain('@node n3 rectangle "Generate DSL"');
    expect(result).toContain('@edge n1 n2');
    expect(result).toContain('@edge n2 n3');
  });
});
