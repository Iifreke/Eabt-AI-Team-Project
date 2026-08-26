import OpenAI from 'openai';

let _openRouterClient = null;
let _openaiClient = null;

export function getOpenRouterClient() {
  if (!_openRouterClient) {
    _openRouterClient = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || 'dummy_openrouter_key',
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'https://eabt-ai-team-project.vercel.app',
        'X-Title': 'School RAG Support Agent',
      },
    });
  }
  return _openRouterClient;
}

export function getOpenAIClient() {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy_openai_key',
    });
  }
  return _openaiClient;
}

// Lazy proxies for backwards compatibility
export const openRouterClient = new Proxy({}, {
  get(target, prop) {
    const client = getOpenRouterClient();
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

export const openaiClient = new Proxy({}, {
  get(target, prop) {
    const client = getOpenAIClient();
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});
