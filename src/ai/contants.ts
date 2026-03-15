// ── Provider Presets ──

export interface ProviderPreset {
    name: string;
    baseUrl: string;
    defaultModel: string;
    /** Extra headers to send (e.g. OpenRouter Referer) */
    headers?: Record<string, string>;
    /** Auth header format: 'bearer' (default) or 'none' (for local models) */
    authStyle: 'bearer' | 'none';
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
    openrouter: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        defaultModel: 'moonshotai/kimi-k2.5',
        headers: {
            'HTTP-Referer': 'https://github.com/KailasMahavarkar/exai',
            'X-Title': 'exai',
        },
        authStyle: 'bearer',
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini',
        authStyle: 'bearer',
    },
    anthropic: {
        name: 'Anthropic (via OpenAI compat)',
        baseUrl: 'https://api.anthropic.com/v1/chat/completions',
        defaultModel: 'claude-sonnet-4-6',
        authStyle: 'bearer',
    },
    ollama: {
        name: 'Ollama (local)',
        baseUrl: 'http://localhost:11434/v1/chat/completions',
        defaultModel: 'llama3.2',
        authStyle: 'none',
    },
    lmstudio: {
        name: 'LM Studio (local)',
        baseUrl: 'http://localhost:1234/v1/chat/completions',
        defaultModel: 'local-model',
        authStyle: 'none',
    },
    groq: {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        defaultModel: 'llama-3.3-70b-versatile',
        authStyle: 'bearer',
    },
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        defaultModel: 'deepseek-chat',
        authStyle: 'bearer',
    },
    together: {
        name: 'Together AI',
        baseUrl: 'https://api.together.xyz/v1/chat/completions',
        defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        authStyle: 'bearer',
    },
};

// ── Defaults (backward compat) ──

export const OPENROUTER_API_URL = PROVIDER_PRESETS.openrouter.baseUrl;
export const DEFAULT_MODEL = PROVIDER_PRESETS.openrouter.defaultModel;
export const DEFAULT_TEMPERATURE = 0;

// ── Helpers ──

/**
 * Resolve a provider by preset name or treat as a custom URL.
 */
export function resolveProvider(
    providerOrUrl?: string,
): ProviderPreset {
    if (!providerOrUrl) return PROVIDER_PRESETS.openrouter;

    // Check if it's a known preset
    const lower = providerOrUrl.toLowerCase();
    if (PROVIDER_PRESETS[lower]) return PROVIDER_PRESETS[lower];

    // Treat as a custom URL
    return {
        name: 'Custom',
        baseUrl: providerOrUrl,
        defaultModel: 'default',
        authStyle: 'bearer',
    };
}
