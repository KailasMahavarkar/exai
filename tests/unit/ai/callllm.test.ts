import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callLLM } from '../../../src/ai/openrouter.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockFetchOk(content: string) {
    return vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content } }] }),
    });
}

function mockFetchError(status: number, body: string) {
    return vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: async () => body,
    });
}

function parseFetchBody(fetchMock: ReturnType<typeof vi.fn>) {
    const call = fetchMock.mock.calls[0];
    return JSON.parse(call[1].body);
}

function parseFetchHeaders(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls[0][1].headers;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('callLLM', () => {
    const originalFetch = global.fetch;
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Clean slate
        delete process.env.OPENROUTER_API_KEY;
        delete process.env.OPENROUTER_MODEL;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    // ── API key ─────────────────────────────────────────────────────────────

    it('throws if no API key is available', async () => {
        await expect(callLLM('test')).rejects.toThrow('API key is required');
    });

    it('uses API key from options over environment', async () => {
        process.env.OPENROUTER_API_KEY = 'env-key';
        global.fetch = mockFetchOk('response');

        await callLLM('test', undefined, { apiKey: 'option-key', useCache: false });

        const headers = parseFetchHeaders(global.fetch as any);
        expect(headers.Authorization).toBe('Bearer option-key');
    });

    it('falls back to env API key when options.apiKey is not set', async () => {
        process.env.OPENROUTER_API_KEY = 'env-key';
        global.fetch = mockFetchOk('response');

        await callLLM('test', undefined, { useCache: false });

        const headers = parseFetchHeaders(global.fetch as any);
        expect(headers.Authorization).toBe('Bearer env-key');
    });

    // ── System prompt ───────────────────────────────────────────────────────

    it('uses default system prompt when none provided', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', undefined, { useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.messages[0].content).toBe('You are a helpful assistant.');
    });

    it('uses custom system prompt when provided', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', 'You are a code expert.', { useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.messages[0].content).toBe('You are a code expert.');
    });

    // ── Model & temperature ─────────────────────────────────────────────────

    it('uses provided model', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', undefined, { model: 'gpt-4', useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.model).toBe('gpt-4');
    });

    it('uses OPENROUTER_MODEL env when no model in options', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        process.env.OPENROUTER_MODEL = 'env-model';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', undefined, { useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.model).toBe('env-model');
    });

    it('uses provided temperature', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', undefined, { temperature: 1.5, useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.temperature).toBe(1.5);
    });

    it('defaults temperature to 0', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', undefined, { useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.temperature).toBe(0);
    });

    // ── Request structure ───────────────────────────────────────────────────

    it('sends correct headers', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('test', undefined, { useCache: false });

        const headers = parseFetchHeaders(global.fetch as any);
        expect(headers['Content-Type']).toBe('application/json');
        expect(headers.Authorization).toBe('Bearer key');
        expect(headers['HTTP-Referer']).toContain('github.com');
        expect(headers['X-Title']).toBe('excal');
    });

    it('sends user prompt as the second message', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');

        await callLLM('analyze this tree', undefined, { useCache: false });

        const body = parseFetchBody(global.fetch as any);
        expect(body.messages[1].role).toBe('user');
        expect(body.messages[1].content).toBe('analyze this tree');
    });

    // ── Response handling ───────────────────────────────────────────────────

    it('returns raw LLM response without cleaning', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        const rawResponse = '```json\n["dist", "coverage"]\n```';
        global.fetch = mockFetchOk(rawResponse);

        const result = await callLLM('test', undefined, { useCache: false });

        // callLLM returns raw - no markdown stripping
        expect(result).toBe(rawResponse);
    });

    it('throws on API error response', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchError(401, 'Unauthorized');

        await expect(
            callLLM('test', undefined, { useCache: false })
        ).rejects.toThrow('OpenRouter API error (401)');
    });

    it('throws on empty response content', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [{ message: {} }] }),
        });

        await expect(
            callLLM('test', undefined, { useCache: false })
        ).rejects.toThrow('empty response');
    });

    it('throws when choices array is empty', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ choices: [] }),
        });

        await expect(
            callLLM('test', undefined, { useCache: false })
        ).rejects.toThrow('empty response');
    });

    // ── Verbose logging ─────────────────────────────────────────────────────

    it('logs when verbose=true', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await callLLM('test prompt', undefined, { verbose: true, useCache: false });

        const logs = spy.mock.calls.map(c => c[0]);
        expect(logs.some((l: string) => l.includes('Calling'))).toBe(true);
        expect(logs.some((l: string) => l.includes('Temperature'))).toBe(true);
        expect(logs.some((l: string) => l.includes('Prompt size'))).toBe(true);
        expect(logs.some((l: string) => l.includes('Response received'))).toBe(true);
    });

    it('does not log when verbose is false', async () => {
        process.env.OPENROUTER_API_KEY = 'key';
        global.fetch = mockFetchOk('hi');
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await callLLM('test', undefined, { verbose: false, useCache: false });

        expect(spy).not.toHaveBeenCalled();
    });
});
